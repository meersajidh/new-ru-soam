# Capability-based service model

**ID:** ADR-103
**Status:** Accepted
**Date:** 2026-05-12
**Supersedes:** —
**Superseded by:** —
**Related:** ADR-101, ADR-102, ADR-104 _(planned: contribution model)_

## Context

ADR-102 says the Renderer consumes data and behaviour through **capability contracts** held by services. It does not define what a capability is, how a consumer finds one, or how an implementation is supplied. Without that definition, "service" decays into ad-hoc shapes: a bare IPC channel here, a global singleton there, a hand-rolled function import somewhere else. VSCode hit this early and converged on a uniform service model — typed interfaces, dependency-injected, with proxies that hide whether the implementation is in-process, in another process, or remote. That uniformity is what later allowed extensions, remote development, and process splits to land without rewriting consumers.

The mental health workbench has the same future surface area at a smaller scale: PHI must live behind a Main-process capability, third-party provider calls must be brokered, and any later move of an implementation to a worker or a Cloud Backend service must not require touching every call site.

A capability model is needed that:

- gives consumers a single, typed way to ask for behaviour they do not own,
- hides the location of the implementation,
- enforces permission scope at the boundary, not inside every call site,
- defaults to async so process and network boundaries are admissible,
- keeps the Renderer ignorant of which calls leave the device.

## Decision

The platform adopts a **capability-based service model**.

### Terminology

- **Capability** — a typed, async interface published under a stable name. The contract.
- **Service** — an implementation of one or more capabilities. The runtime provider.
- **Feature** — a coarser composition unit that may consume multiple capabilities and may register views, commands, and other contributions. Features are the subject of ADR-104; this ADR establishes only the capability/service layer beneath them.

### Capability

A capability has:

- a **name** (e.g., `local.notes`, `secrets.providerKeys`, `net.brokered.fetch`),
- a **typed contract** (TypeScript interface; methods return `Promise` or stream),
- a **version**,
- a **permission scope** that declares which consumers may bind to it.

Capability names above are illustrative only. Concrete capability surfaces will be defined as the platform is built; this ADR does not commit to that catalogue.

Capabilities are the only sanctioned way to cross zone or module boundaries. Direct imports across zones are not permitted; direct IPC channels are not permitted at consumer sites.

### Service

A service registers itself with the capability registry under its declared capability names. A service may live in the Main process or in a utility process. A service in Main may, as an implementation detail, forward calls to the Cloud Backend; from the consumer's perspective the capability is still Main-hosted. Services are smaller-grained than features and typically expose one or a small number of related capabilities.

### Registry and binding — Renderer view

The Renderer sees a single registry, exposed by Main through the preload bridge (subject of ADR-202). All capabilities reachable from the Renderer resolve through Main. The Renderer does not know — and is not told — whether a given capability's implementation lives entirely in Main, in a utility process, or behind a Cloud Backend call that Main is brokering. Cloud Backend existence is not part of the Renderer's mental model.

A Renderer consumer requests a capability by name and receives a typed **proxy** to its implementation. The proxy:

- enforces the capability's permission scope on bind,
- serialises calls across the renderer/main boundary,
- surfaces errors and cancellation through the typed contract.

### Registry and binding — Main view

Main holds the authoritative registry. Main-resident services bind in-process. Main may itself act as a consumer of Cloud-Backend-hosted capabilities through a Main-internal bridge; that bridge is the only place where Cloud Backend addresses, credentials, and transport details exist. The Renderer never participates in that bridge.

### Async by construction

All capability methods are async (`Promise` or stream). Synchronous capability calls are not offered. This is the discipline ADR-102 anticipated; this ADR commits to it.

### Versioning

Capabilities are versioned. Breaking changes ship as a new version; consumers bind to a specific version. Versioning policy detail is deferred (see Open Items).

## Consequences

### Positive

- Call sites do not encode process topology. Implementations may move (in-Main → utility process → Cloud-Backend-via-Main-bridge) without changing consumers.
- The Renderer never learns whether a request leaves the device, which is the precondition for ADR-301 (PHI boundary) to hold structurally rather than by convention.
- Permission enforcement is centralised at bind time, not duplicated at each call site.
- Typed contracts replace string-typed IPC channels; capability misuse is a compile-time error.
- Capabilities are the natural unit of test double — fake implementations register against the same name.

### Negative

- Up-front contract design cost. Adding a feature means defining or selecting capabilities before writing UI. _Mitigated by the feature development guide and checklist._
- Registry indirection adds a small runtime cost on the hot path. Acceptable for desktop workloads; would warrant scrutiny in latency-critical inner loops.
- Versioning and backwards compatibility become explicit engineering work rather than something avoided by tight coupling.

### Neutral

- The capability registry is itself a piece of platform code that must be designed, owned, and reviewed carefully. It is the chokepoint for trust enforcement.

## Considered Options

- **Direct IPC channels (`ipcRenderer.invoke('channel-name', ...)`)** — _Rejected_: string-typed, no location independence, permission checks scattered, no test-double story.
- **Big bridge object on `window.api.*`** — _Rejected_: violates the narrow-preload principle (ADR-202, planned). A generic bridge is the maximal preload surface.
- **Direct module imports across zones** — _Rejected_: ignores process boundaries entirely; forecloses utility processes, Cloud Backend delegation, and most isolation gains.
- **Renderer binds directly to Cloud-Backend-hosted capabilities** — _Rejected_: would teach the Renderer that a Cloud Backend exists and would place transport/credential concerns at the Renderer boundary. Cloud-Backend-hosted implementations are reached only through a Main-internal bridge.
- **Capability registry with typed proxies, Renderer-via-Main only** _(chosen)_ — Uniform shape, location-agnostic, scope-enforcing, async by construction. Matches the model VSCode converged on, adapted so the Renderer never sees beyond Main.

## Open Items

- **O2** — Registry mechanism: native `Proxy` + structured-clone IPC, an existing RPC framework (Comlink, tRPC over IPC, gRPC-web), or custom dispatch. Trade-off: bundle size vs. ergonomics vs. type-safety across transport.
- **O3** — Versioning policy for capability contracts: semver-style on capability name, side-by-side major versions, or single-version-with-deprecation.
- **O4** — Permission scope model: static (per-capability scope literal) vs. dynamic (capability accepts a context object). Static is simpler; dynamic supports per-consent decisions.
