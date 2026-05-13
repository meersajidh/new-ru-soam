# Bundle host process: why bundles run in their own Node process

Reference document for the process-model decision that will land as ADR-410. Captures the reasoning behind hosting bundle code in a separate Node process rather than in the Renderer or in Main. Read this when ADR-410 leaves you wondering "but why pay for the extra process?".

## The decision in one line

Bundle code runs in a dedicated Node.js process — the **Bundle Host** — separate from Main and Renderer. Bundles communicate with Main over IPC; the Renderer never reaches the Bundle Host directly.

## Where bundles could have lived

There were three places we could have put bundle code:

1. **In the Renderer.** Bundles run inside the workbench renderer process, sharing the DOM, the React tree, and the renderer's view of `window.soam`. This is the simplest model — a bundle is just a module the workbench imports.
2. **In Main.** Bundles run inside the Main process, alongside the platform's privileged services. A bundle becomes a server-side module loaded at activation time.
3. **In a separate process.** Bundles run in their own Node.js process spawned by Main, with no direct access to the Renderer or to Main's internals. All bundle interaction with the rest of the platform is over IPC, mediated by Main.

The platform chooses option 3. The reasoning has four threads.

## Thread 1: Fault isolation

A workbench for clinical work has a different failure cost than a hobbyist editor. A practitioner mid-session who loses their note editor because a third-party scheduling bundle dereferenced undefined is not having a minor inconvenience — they are losing trust in the platform during the worst possible moment.

If bundles run in the Renderer:

- An unhandled exception in a bundle's React tree can unmount the workbench root, depending on error boundaries.
- A bundle that leaks memory degrades the entire workbench's responsiveness.
- A bundle stuck in a synchronous loop blocks the UI thread for every other feature.
- A bundle's bad dependency (a broken WASM module, a corrupted asset) can crash the whole window.

If bundles run in Main:

- A bundle's crash is the platform's crash. There is no workbench without Main; the user loses the session and any unsaved local writes that hadn't flushed.

If bundles run in their own process:

- A bundle crash kills the Bundle Host process (or, with per-bundle isolation later, just that bundle's slice). Main detects the crash, marks the bundle inactive, surfaces the failure in the UI, and offers a restart. The workbench stays up. Other bundles stay up. The user's session is uninterrupted.

This is the load-bearing argument. Clinical context raises the cost of "one bad bundle ruined the platform" past where the IPC cost is worth paying.

## Thread 2: Security boundary

The PHI boundary (ADR-301) and the three-zone trust model (ADR-101) commit to structural — not procedural — enforcement. Capability calls, validation, and PHI access are gated by the process boundary between Renderer and Main, not by code-review discipline.

Bundles include third-party code. Eventually they will be installable from a marketplace, signed by independent authors, and audited by no one in particular. Letting that code run with the same authority as the platform's own renderer or main code is a non-starter for a clinical product. The question is *which boundary* the bundle sits behind.

In the Renderer-hosted model, a bundle has full DOM access: it can read every input, screenshot every view, hook into the React tree, redirect any user gesture. The ContentSecurityPolicy and the narrow preload (ADRs 201, 202) protect the *platform* from the outside world, but a bundle is *inside* the platform's renderer — those protections don't apply to it.

In the Main-hosted model, a bundle has the file system, the OS keychain, the database connection, the network stack — every capability Main has. A bundle that wants to exfiltrate PHI to its own server faces no structural barrier; it would simply use the same APIs the platform uses legitimately.

In the separate-process model:

- Bundles have **no DOM access**. They cannot screenshot or scrape the renderer.
- Bundles have **no Main capabilities by default**. They must declare which capabilities they need; Main resolves and routes calls; the bundle never holds a reference to a privileged service.
- Bundles communicate **only via the IPC contract** Main exposes to them. This is exactly the contract the contribution system already commits to — capability calls, contribution registration, events.
- Bundle's outbound network access goes through the same brokered networking (ADR-203) the Renderer uses, with the same policy gates.

The bundle has no zone of its own in the original three-zone model; it is, in effect, a *fourth* zone — **third-party-trust** — strictly less trusted than Renderer and strictly less privileged than Main. This is the same shape VSCode arrived at with its Extension Host. The reasoning is identical: third-party code, however well-intentioned, doesn't get to share a process with the host's privileged state.

## Thread 3: Lazy activation, naturally

The contribution model (ADR-104) commits to declarative registration — bundles publish a manifest at install time; code does not run until an activation trigger fires (ADR-105). That commitment is much easier to keep if bundle code lives in a process that doesn't even *exist* at boot.

Workbench startup, in the separate-process model:

1. Main starts.
2. Main reads all bundle manifests, populates the contribution registry, sends the registry to the Renderer.
3. Renderer paints the shell. Activity bar items, menu entries, status-bar items — all declared, all visible, no bundle code loaded.
4. The user does something that fires an activation trigger.
5. Main spawns the Bundle Host (if not already running) and routes the activation event.
6. The bundle's `activate()` runs. Disposable is returned. The bundle is now live.

If bundles ran in the Renderer, the same boot story would require loading and JIT-compiling every bundle's code on first paint — or running it in a webworker, which only partially helps. The separate process gives us a natural place to defer that work to.

Cold-start time, peak memory, and main-thread responsiveness all benefit from the deferral. The Bundle Host's first spawn is on-demand, not on the critical path.

## Thread 4: Forced cleanliness of the capability contract

The most subtle benefit. When two pieces of code share a process, leaky abstractions are nearly inevitable: someone reaches into a sibling's internals because it is *right there*. The capability contract becomes one of several ways to call across the boundary, not the only way.

When the boundary is a process boundary, leaks are impossible. A bundle that wants to call platform code has exactly one path: an IPC call into a registered capability. The contract is, structurally, the only API surface.

This means:

- Capabilities stay typed and async (ADR-103) because there is no shortcut.
- Validation at the boundary stays uniform because the boundary is a serialiser, not a function call.
- Contribution registration stays declarative because the registry is built from a manifest, not from imports.

The platform's design intent and the platform's runtime are forced to agree.

## Cost honesty

The separate-process model isn't free. The costs:

- **Every capability call sourced from a bundle crosses two process boundaries** (Renderer → Main, Main → Bundle Host, or BundleHost → Main → Renderer for events). Each crossing is serialisation + scheduler hop.
- **Debugging is harder.** A stack trace ends at the IPC boundary. The platform must provide devtools attachment for the Bundle Host so bundle authors can debug.
- **State sharing is harder.** A bundle cannot hold a JavaScript reference to a service; it can only call methods that return values. Services must be designed for this — no exposing live objects.
- **Memory cost.** A separate Node process has a non-trivial baseline cost (~30-50 MB). Mitigated by spawning the Bundle Host only when the first bundle activates.

These costs are real and they accumulate. The platform pays them because the alternative — losing fault isolation, losing the security boundary, losing the activation discipline — is worse for the product the platform is trying to be.

## What this means for ADR-103 and ADR-104

The earlier ADRs were intentionally vague about where bundle code runs. ADR-104 talks about "the bundle" registering contributions; ADR-105 talks about activation returning a disposable. Neither pinned a process.

ADR-410 will pin it. The amendments to ADR-103/104 are small but real:

- **Capability binding** still happens from the Renderer's perspective via `window.soam.bindCapability(...)`. Resolution still happens in Main. New: if the capability *implementation* is provided by a bundle, Main routes the call onward to the Bundle Host. The Renderer is unaware which capabilities are bundle-provided.
- **Contribution registration** is declarative (already true). New: the contribution manifest is read by Main at boot, not by the Renderer importing the bundle's package.
- **Bundle activation** runs in the Bundle Host. The disposable returned by `activate()` is held by Main; on bundle deactivation Main triggers `dispose()` over IPC.

The capability contract from the Renderer's point of view does not change. The change is on the implementation side — where the work physically runs.

## Why this lines up with VSCode's history

VSCode launched in 2015 with extensions running in the renderer. By 2016 they had moved to a separate Extension Host process, citing exactly the reasons above: a crashing language extension killing the entire editor was unacceptable; a typo in a third-party theme provider taking down the IDE was unacceptable; debugger startup latency from loading every extension at boot was unacceptable.

The mental-health workbench is launching with that lesson already absorbed. Bundles get their own process from day one. The retrofit cost VSCode paid — moving an ecosystem of in-renderer extensions to an out-of-renderer host — is a cost we don't have to incur, because we don't have an ecosystem yet to break.

## See also

- ADR-101 — Three-trust-zone model (Bundle Host adds a fourth, third-party-trust)
- ADR-103 — Capability-based service model (capability calls cross the bundle boundary uniformly)
- ADR-104 — Contribution model (manifest is the registration surface)
- ADR-105 — Bundle activation lifecycle (activation trigger fires in the Bundle Host)
- ADR-201 — Electron hardening (Renderer is locked down; the Bundle Host is locked down too, with a tighter API surface)
- ADR-410 — Bundle host process model (the decision record itself, when drafted)
- [VSCode Architecture Case Study](./VSCode_Architecture_Case_Study.md)
