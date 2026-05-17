# Preload exposes narrow capability APIs only

**ID:** ADR-202
**Status:** Accepted
**Date:** 2026-05-12
**Supersedes:** —
**Superseded by:** —
**Related:** ADR-101, ADR-103, ADR-201

## Context

ADR-201 establishes that, with `contextIsolation` and `sandbox` on, preload scripts are the only sanctioned path between the main process and the renderer. ADR-103 establishes that renderer code reaches services via a capability registry whose proxies the renderer treats as opaque. The question this ADR resolves is: what does preload actually expose on the renderer's `window`?

The default Electron pattern, repeated in many tutorials, is a big bridge object — `window.api.network.fetch`, `window.api.fs.readFile`, `window.api.db.query`, and so on. Each method is a thin pass-through to an IPC channel. This shape is what ADR-103 and ADR-102 reject in principle; this ADR rejects it concretely at the preload boundary.

A bridge of that shape:

- gives the renderer ambient access to broad OS-flavoured surfaces (network, filesystem, db),
- spreads permission enforcement across every IPC handler instead of centralising it,
- couples the renderer to channel names and IPC payload shapes,
- grows monotonically as features are added — every new feature wants its own pass-through.

The renderer trust level (ADR-101) cannot carry that surface.

## Decision

Preload exposes a **single, narrow, typed surface**: an entry point to the capability registry.

### Name and shape

The platform exposes one named object on `window`: **`window.soam`**. The name reflects the product's own metaphor — `soam` is "bridge", and the preload boundary is exactly that bridge from renderer to main. The name is intentionally project-native rather than generic.

The illustrative shape:

```ts
interface Soam {
  /**
   * Request a capability by name and version. The returned proxy is
   * typed; the renderer never sees the underlying transport.
   */
  bindCapability<T>(name: string, version: string): Promise<Disposable & T>;

  /**
   * Subscribe to platform-emitted events (lifecycle, focus, etc.).
   * Not a generic bus — the event set is platform-defined.
   */
  events: PlatformEvents;
}
```

The committed-to property is the **narrowness**: the preload surface is "obtain capabilities and observe platform events", not a catalogue of OS-flavoured methods. The exact interface is illustrative — see Open Items.

### What preload does not do

- It does not expose IPC channels by name.
- It does not expose Node, Electron, or OS modules in any form.
- It does not expose `Function` objects or live references that could smuggle privileges across the context isolation boundary.
- It does not grow when a new feature lands. New features acquire capabilities through the existing `bindCapability` surface.

### Typing

The preload surface is typed end-to-end. The renderer's `window.soam` is declared by the platform's TypeScript types, not augmented ad hoc by bundles. Bundles depend on capability types, not on preload types.

### Permission enforcement

Permission scope (ADR-103) is enforced inside `bindCapability`, on the main side, before any proxy is returned to the renderer. The preload itself does not make trust decisions; it forwards the bind request to main, which evaluates the caller's scope and either returns a proxy or rejects.

### Multiple windows

If multiple BrowserWindows exist, each has its own preload binding into its own world. The `bindCapability` surface is identical per window. Permission scope is per-window: main may grant a capability to one window and refuse it to another. Window identity is established by main at window creation, not asserted by the renderer.

## Consequences

### Positive

- The renderer's IPC surface is one method (`bindCapability`) plus a small event channel. The attack surface from a compromised renderer is correspondingly small.
- Preload audit is small and stable. New features do not enlarge the preload.
- Permission enforcement is centralised on the main side at bind time, not scattered across IPC handlers.
- ADR-103's location-agnostic promise holds: the renderer sees a typed capability, never a channel name.
- The `window.soam` name reinforces the architecture — the bridge is named, not anonymous.

### Negative

- A capability must be declared before the renderer can call it. There is no "just expose this one function for now" shortcut. Mitigated by treating capability creation as the normal feature-development path (covered in the [feature development guide](../Guides/feature-development.md)).
- Cross-window distinctions (different scope per window) require explicit window-identity handling in main.

### Neutral

- The preload script becomes a thin bootstrapper. Most logic lives in the capability registry on the main side.

## Considered Options

- **Generic bridge (`window.api.network.fetch`, `window.api.fs.*`, …)** — _Rejected_: spreads OS-flavoured surface to the renderer, breaks ADR-101's trust model, scatters permission enforcement, grows monotonically with features.
- **No preload (renderer talks IPC directly)** — _Rejected_: requires `contextIsolation: false`, breaks ADR-201.
- **Per-capability preload exposure (one preload method per capability)** — _Rejected_: scales linearly with capability count, makes preload a feature-edit site, defeats the central-binding model of ADR-103.
- **Generic `window.platform` or `window.bridge`** — _Rejected_: works, but loses the project-native naming and the architectural cue. The bridge has a name; it should use it.
- **Single narrow `window.soam` surface with `bindCapability` + events** _(chosen)_ — One funnel, typed, stable across features, central permission enforcement, project-native naming.

## Open Items

- ~~O14 — `Soam` interface exact shape~~ **Resolved Phase 7** — `Soam = { bindCapability(name, version), events: { on(listener) } }`; see `apps/desktop/electron/preload/soam.ts`.
- **O15** — Preload module format under `sandbox: true` on the targeted Electron version (overlaps with O11). Confirm CJS vs ESM vs platform-specific bundling.
- **O16** — Event channel surface. Which platform events are part of the preload surface today vs. delivered through capabilities.
- **O17** — Revisit whether the events surface stays on `window.soam` or folds into a `platform.events` capability later. Keeping it on the bridge for now; reassess once the capability catalogue matures.
