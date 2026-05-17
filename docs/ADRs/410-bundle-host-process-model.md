# Bundle host process model

**ID:** ADR-410
**Status:** Accepted
**Date:** 2026-05-13
**Supersedes:** —
**Superseded by:** —
**Related:** ADR-101, ADR-103, ADR-104, ADR-105, ADR-201, ADR-202, ADR-203

## Context

ADRs 103, 104, and 105 commit a contribution-and-capability model for bundles without pinning *where* bundle code runs. The implicit assumption — bundles execute inside the Renderer or inside Main — has now been challenged. The full reasoning lives in the [Bundle host process reasoning](../References/Bundle_Host_Process_Reasoning.md) reference: fault isolation, security boundary, lazy activation, and forced cleanliness of the capability contract all argue for a separate process.

This ADR commits the decision: bundle code runs in a dedicated Node.js process — the **Bundle Host** — spawned and managed by Main. Bundles never share a process with the Renderer; bundles never share a process with Main. The three-trust-zone model of ADR-101 gains a fourth zone — **third-party-trust** — that the Bundle Host sits in.

This is a process-model decision, not a UX or capability-shape decision. The Renderer's view of capability calls (ADR-103 `bindCapability`) is unchanged; the contribution model (ADR-104) is unchanged. What changes is the implementation side: where activation runs, who holds the disposable, and how Main routes a capability call when the implementation is provided by a bundle.

## Decision

### Bundles run in a separate Node process

Main spawns a Node.js process — the **Bundle Host** — to host bundle code. The Bundle Host:

- runs Node.js, not Chromium-renderer-Node — no DOM, no `BrowserWindow`, no Electron-renderer APIs.
- is spawned lazily, on the first bundle activation. A workbench with no active bundles has no Bundle Host process.
- communicates with Main over IPC (Electron `utilityProcess` channel, or `child_process.fork` with a typed wrapper — see Open Item O64).
- has no IPC channel to the Renderer. All bundle ↔ Renderer interaction is mediated by Main.
- has no privileged access to platform services. Every interaction with Main goes through a declared, typed contract.

The Renderer and Main are unchanged. The Bundle Host is the new third process in the model.

### Trust zone

ADR-101's trust model gains a fourth zone:

| Zone               | Process           | Authority                                                                                  |
| ------------------ | ----------------- | ------------------------------------------------------------------------------------------ |
| Untrusted          | Renderer          | UI / composition shell. No privileged services.                                            |
| Local-privileged   | Main              | OS access, keychain, DB, network broker. Authoritative for local enforcement.              |
| Cloud-trusted      | Cloud Backend     | Operational data, sync coordination, app-owned credentials.                                |
| **Third-party-trust** | **Bundle Host**   | **Bundle code. No DOM, no OS privilege; only declared capabilities, all mediated by Main.** |

Bundle Host is strictly less privileged than Main (no capabilities by default; must declare and have its declarations accepted) and structurally less reachable than Renderer (no DOM, no `window`, no user-input pathway).

ADR-101 will be amended to add the Bundle Host as a named fourth zone when this ADR moves from Draft to Accepted.

### Boot sequence

```
Main starts
  │
  ├─ reads installed bundle manifests
  │  (no bundle code runs; manifests are JSON)
  │
  ├─ populates contribution registry
  │
  ├─ sends contribution registry snapshot to Renderer over IPC
  │
Renderer paints
  │  (activity bar items / commands / menu entries visible
  │   from manifests; no bundle code loaded yet)
  │
User triggers activation event
  │
Main spawns Bundle Host (if not already running)
  │
  ├─ Main sends `activate(<bundleId>, <activationContext>)` over IPC
  │
Bundle Host loads bundle module, runs `activate(...)`
  │
Bundle's `activate(...)` returns a Disposable
  │
Main holds the Disposable handle (a remote reference into the Bundle Host)
```

A bundle's `activate(...)` function runs in the Bundle Host, not in Main and not in the Renderer. Its return value is held by Main as a remote disposable reference. When the bundle deactivates (workspace close, user disable, platform shutdown), Main calls `dispose()` over IPC and the Bundle Host runs the bundle's cleanup.

### Capability routing when the implementation is in a bundle

ADR-103 commits that the Renderer binds capabilities through `window.soam.bindCapability(...)`. The Renderer does not know whether the implementation lives in Main or in a Bundle Host. The routing:

- Renderer calls `bindCapability('foo.bar', '1.0')` → returns a proxy.
- A method call on the proxy serialises and crosses to Main.
- Main looks up the capability's implementation owner:
  - If owned by Main (platform built-in), Main executes and returns the result to Renderer.
  - If owned by a bundle, Main forwards the call to the Bundle Host via IPC.
- The Bundle Host runs the bundle's handler in the Bundle Host's Node process.
- The result returns through Main to the Renderer.

The Renderer sees one IPC hop. The Main process is the broker; it always sees the call. The Bundle Host is invisible from the Renderer's perspective.

This means capability calls sourced from the Renderer and resolved in a bundle cross **two process boundaries** (Renderer → Main → Bundle Host), not one. The performance cost is real but already absorbed by the async-everywhere stance of ADR-103. No new constraints on the capability contract are introduced.

### Bundle-to-bundle calls

A bundle can call another bundle's capability through the same machinery:

- Bundle A binds `b.cap` in its own code.
- The binding's proxy IPC-calls **Main**, not Bundle B directly.
- Main looks up the owner, forwards to Bundle B (in the same or a different Bundle Host process per O64).
- Result returns via Main.

Bundles never address each other directly. Main is always in the path. This keeps the platform's audit and policy gates (ADR-502, ADR-103) on every call regardless of source.

### Bundle Host hardening

The Bundle Host is a Node process running third-party code. It must be hardened:

- **No `BrowserWindow` / Electron renderer APIs.** Pure Node.
- **No `electron` module access.** Bundles cannot import `electron`; the Bundle Host runtime denies the module.
- **No file system access by default.** Filesystem operations go through a `storage` capability that Main mediates, scoped to the bundle's sandbox directory.
- **No network access by default.** Outbound calls go through the brokered networking capability (ADR-203), mediated by Main.
- **No `child_process` / native module access by default.** Future Open Item if a bundle legitimately needs native code (e.g., a media codec) — likely requires a separate, signed contribution.
- **Module loading is sandboxed.** Bundles ship their own dependencies as part of the bundle artefact; runtime module resolution does not reach outside the bundle's tree.
- **`process.exit`, `process.env` mutation, `process.kill` are no-ops or denied.**

The discipline mirrors the Renderer hardening in ADR-201, applied to Node instead of Chromium. Specific runtime mechanism (Electron `utilityProcess` with a curated globals shim, or a vm-sandboxed module loader, or a fork+seccomp / fork+restricted-env) is Open Item O64.

### Bundle Host crash semantics

A Bundle Host crash (uncaught exception bubbles, OOM, segfault) is detected by Main:

- Main marks all bundles hosted by that Bundle Host as inactive.
- The contribution registry retains the bundles' manifest contributions (menus, commands, etc.), but invocation routes return a "bundle crashed" error until restart.
- The Renderer shows a banner (ADR-401) naming the failed bundle(s) and offering a restart.
- Restart respawns the Bundle Host process and reactivates the bundles on next activation event.

A crashing bundle does **not** crash the workbench. A crashing Main process crashes the workbench (as before); the Bundle Host's crash does not bubble.

### Isolation granularity

The simplest model is **one Bundle Host process for all bundles**: a single Node process hosting every active bundle's module. A crash in one bundle then takes down every bundle in that process.

A stronger model is **one Bundle Host process per bundle**: each bundle has its own process; crashes are truly isolated. The cost is a Node process baseline (~30-50 MB) per active bundle, which adds up.

A middle model is **per trust-class grouping**: bundles signed by the same publisher share a process; cross-publisher bundles get their own.

This ADR commits the *direction* — separate Bundle Host process for bundles — without pinning the granularity. The starting point is one Bundle Host for all bundles, with the option to split later. Open Item O64.

### Devtools / debugging

Bundle authors need to attach a debugger to their bundle's running code. The Bundle Host process exposes a Node inspector port (gated, off in production, on in dev mode). The platform provides a "Inspect bundle" command that opens the inspector URL. Specifics in Open Item O66.

A bundle running in the Bundle Host has its own stdout / stderr stream; Main captures and routes them to a per-bundle Output channel (the same surface a future "Output" panel view will render — Panel content per ADR-408 / ADR-408 follow-ups).

### Bundle Host lifecycle

- **Spawn**: lazy, on first activation event for any bundle. The shell does not pre-spawn.
- **Hibernation**: if all bundles in a Bundle Host have been deactivated and the process has been idle for a configurable interval, Main can terminate the Bundle Host. Next activation respawns. Configurable; not in MVP.
- **Shutdown**: clean shutdown on workbench quit. Main calls `dispose()` on each active bundle's disposable, waits a bounded interval, then kills the Bundle Host.
- **Forced kill**: on user request ("force-quit this bundle") or detected hang. Main kills the Bundle Host, then the user can restart.

### Amendments to earlier ADRs

When this ADR moves to Accepted, the following amendments land:

- **ADR-101** — add Bundle Host as a fourth trust zone (third-party-trust).
- **ADR-103** — capability implementations may live in Main *or* in a Bundle Host; routing is invisible to the Renderer. The "Renderer-via-Main only" rule extends naturally: Renderer → Main always; Main → Bundle Host when implementation is bundle-owned.
- **ADR-104** — manifest is read by Main at boot, not by Renderer-side import. The Renderer receives the contribution registry as a data payload.
- **ADR-105** — activation runs in the Bundle Host. The disposable returned by `activate(...)` is held by Main; `dispose()` is an IPC call.

These amendments are mechanical; none of the user-facing or bundle-author-facing contracts change.

**Update (Phase 6):** the implementation chose `utilityProcess.fork`; remaining text retained for historical context.

## Consequences

### Positive

- Fault isolation: a bundle crash leaves the workbench running.
- Security boundary: bundles have no DOM access, no privileged Node access; they can only do what their manifest-declared capabilities allow.
- Lazy activation comes naturally: no bundle code loads until the first activation event fires.
- Capability contract stays the only path between layers — there is no shortcut to reach into a sibling.
- The Renderer's view of capability calls is unchanged. Adopting the model does not require touching renderer code.

### Negative

- Extra process. ~30-50 MB baseline overhead from the Node process once a bundle activates.
- Capability calls sourced in the Renderer and resolved in a bundle now cross two process boundaries (Renderer → Main → Bundle Host).
- Debugging is harder: a stack trace ends at the IPC boundary. Platform must provide bundle-author tooling.
- Bundle authors cannot hold live references to platform services; only typed proxies. Service authors must design for serialisable handles.
- Native modules / non-portable dependencies are awkward — must be loaded inside the Bundle Host's sandbox and may be denied by default.

### Neutral

- Renderer hardening (ADR-201) is unaffected; Bundle Host hardening parallels it on the Node side.
- The Cloud Backend is unaffected. The Bundle Host has no privileged access to it; outbound network is brokered through Main.

## Considered Options

- **Bundles run in the Renderer** — _Rejected_: shared process with the UI means a bundle bug can take down the workbench; bundles get unfettered DOM access; activation must happen at renderer boot.
- **Bundles run in Main** — _Rejected_: a bundle crash crashes the platform; bundles inherit Main's full privilege; the "capability contract" becomes a polite suggestion.
- **Bundles run in browser-side Web Workers** — _Rejected_: still inside the Renderer process from an OS perspective; bundles get no Node, which forecloses legitimate bundle needs (file watchers, system integrations); fault isolation is partial.
- **Bundles run in a separate Electron `BrowserWindow` (hidden)** — _Rejected_: hosts Chromium, which is the wrong runtime for backend-style bundle code; baseline memory cost is much higher than a Node process.
- **Bundle Host as a separate Node process, lazy-spawned, mediated by Main** _(chosen)_ — Matches VSCode's Extension Host pattern; aligns with the trust model; pays a real but bounded cost for the isolation and security properties.

## Open Items

- ~~O64 — Bundle Host implementation choice~~ **Resolved Phase 6** — Electron `utilityProcess.fork`; see `apps/desktop/electron/main/bundle-host/manager.ts`.
- **O65** — Bundle Host isolation granularity: single process for all bundles vs one per bundle vs per-publisher grouping. Start single; revisit when ecosystem grows.
- **O66** — Bundle debugging mechanism: Node inspector port + platform "Inspect bundle" command + Output channel for stdout/stderr. Concrete shape and security gates.
- **O67** — Native module / non-portable dependency policy. Default deny; explicit contribution declaration for legitimate needs (media codecs, etc.) with platform-team review.
- **O68** — Bundle Host hibernation policy. When all bundles are deactivated and idle, terminate the Bundle Host. Not in MVP; revisit when memory pressure observed.
