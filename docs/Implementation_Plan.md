# Implementation Plan

**Status:** Draft
**Date:** 2026-05-13
**Owner:** Architecture

This document slices the committed ADRs (100 / 200 / 300 / 400 / 500 ranges) into feature-sliced implementation phases. Each phase is a dogfoodable artifact, not just a code drop. Phases are sequential by default; cross-cutting workstreams run alongside.

## Principles

1. **Trust zones before features.** Main / Renderer / Bundle Host process boundaries exist before any product surface lands.
2. **Mechanism before product.** No first-party product bundle ships until the host, view hosting, capability spine, crypto, and audit are real.
3. **Each phase produces a visible dogfoodable artifact.** Not "library complete"; "you can open the app and see X work".
4. **PHI gated behind crypto.** No table that may hold PHI gets a writer before KEK + at-rest encryption land.
5. **Audit before data.** The audit log spine exists before the first capability writes anything worth auditing.

## Phase 0 — Baseline verification

**Status:** Complete. Landed in `main`.

**Goal:** confirm Electron + React SPA + TanStack scaffolding holds.

**Deliverable:** `pnpm dev` opens an empty Electron window; React mounts; TanStack Router + Query initialised; type-check + lint pass.

**ADRs:** ADR-101, ADR-201

**Open items:** none binding.

**Exit:** hot-reload Renderer; Main starts cleanly; CI runs the build.

## Phase 1 — Process skeleton + IPC contract

**Status:** Complete. Landed in `main`.

**Goal:** three processes alive. Main ↔ Renderer typed IPC. Bundle Host = Node process spawned on demand, no real work yet.

**Deliverable:** typed IPC channel with request/response + event semantics; Bundle Host spawn / teardown lifecycle; crash semantics (host crash logged, Renderer unaffected).

**ADRs:** ADR-101 (trust zones), ADR-102 (IPC), ADR-201 (no `<webview>`), ADR-410 (host process model).

**Open items:** O64 (host spawn timing), O66 (host crash UX), O67 (host log routing).

**Exit:** kill Bundle Host externally → Renderer survives; log shows clean teardown; IPC remains typed end-to-end.

## Phase 2 — Workbench shell + Parts + theming

**Status:** Complete.

**Goal:** workbench renders empty slots. No bundles, no editors. Theme tokens flow.

**Deliverable:** TitleBar / Banner / Middle (five slots) / StatusBar. LayoutService + ThemeService + ServiceRegistry + `useService` hook. Three-region StatusBar with six ADR-409 anchored entries as inert stubs. Custom frameless TitleBar (`frame: false`) with window controls routed through the `platform.window@1.0` capability — no new IPC channels (O57 resolved here).

**ADRs:** ADR-401, ADR-402, ADR-409, ADR-412, ADR-413.

**Open items resolved:** O57 (custom titlebar, frameless + renderer Part), O96 (ServiceId: branded string).

**Exit:** can toggle Primary Side Bar / Panel / Aux Side Bar via keyboard; theme swap is live with no flicker; ServiceRegistry resolves typed identifiers.

## Phase 2.5 — Tailwind v4 + multi-palette theming + font axis

**Status:** Complete.

**Goal:** replace `style.setProperty` theming with CSS class-based theming on `<html>`. Add Tailwind v4. Introduce three orthogonal axes (palette / luminance / font set). Land first three built-in palettes.

**Deliverable:**
- Tailwind v4 via `@tailwindcss/vite`; `@theme {}` block in `tokens.css` defines 17 color tokens + 2 font tokens → generates `bg-*` / `text-*` utilities.
- Three built-in palettes as CSS class files: **Bamboo** (warm green, OKLCH h≈95/130), **Stone** (warm amber, OKLCH h≈60/80), **Geist** (achromatic, zero chroma, blue accent h≈258).
- Each palette defines `.theme-<id>` (light) and `.theme-<id>.dark` variants — palette and luminance are orthogonal.
- `ThemeService` rewritten: `setTheme()` swaps `theme-*` class; `setDarkMode()` toggles `.dark`; `getTokenSnapshot()` reads via `getComputedStyle`. No more `setProperty` loops.
- `FontService` + `IFontService`: `font-set-*` class axis on `<html>`. Built-in: `system-sans`. `FontServiceId` added to service registry.
- `initial-theme.ts` applies all three classes synchronously before `createRoot.render` (no FOUC).
- `workbench.css` updated to new token names (`--color-*`, `--space-*`, `--font-*`).

**ADRs:** ADR-413 (theming), ADR-412 (services-in-renderer).

**Open items resolved:** O107 (theme token catalogue v1 — 17 color tokens, documented in `tokens.css`).

**Exit:** `setTheme('bamboo'|'stone'|'geist')` + `setDarkMode(true|false)` swap live with no flicker, no React remount; three palettes visually distinct; font axis independent of palette and luminance; type-check passes.

## Phase 3 — Command + context-key + keybinding spine

**Status:** Complete. Landed in `main`.

**Goal:** command-driven shell with palette, before any feature uses commands.

**Deliverable:** CommandService (Renderer mirror + Main registry), ContextKeyService with the VSCode-style expression evaluator, KeybindingService. Command Palette opens. About six platform commands wired (`workbench.toggle*Bar`, `workbench.openSettings`, `workbench.openCommandPalette`, etc.).

**ADRs:** ADR-406, ADR-407.

**Open items:** O86–O95.

**Exit:** `Ctrl+Shift+P` opens the palette; when-clauses gate visible commands; reserved-namespace check rejects bad registrations; PHI-adjacent context keys never appear in any persisted payload.

## Phase 4 — Workspace concept + lifecycle

**Status:** Complete. Landed in `main`.

**Goal:** Workspace = Entity. Open / close / lock lifecycle reaches services that care.

**Deliverable:** WorkspaceService, workspace open / close events, `workspace.entityId` context key, persisted-layout reload on workspace open, lock-state stub (real KEK lands in Phase 9).

**ADRs:** ADR-403; ADR-501 referenced but not implemented.

**Open items:** O53–O56, O98 (lifecycle reset matrix).

**Exit:** open a mock workspace → context keys emit; layout persists across reopen; close → all workspace-scoped services reset per the matrix.

## Phase 5 — Editor area + resource URIs

**Status:** Complete.

**Goal:** editor mechanism lands before any concrete editor type.

**Deliverable:** EditorService (recursive split-tree `EditorLayoutNode`: `group | split`; groups + tabs with `open / close / splitGroup / moveTab` lifecycle; auto-collapse of empty groups when >1 group exists); `EditorArea` walks the tree recursively, splits render as CSS flex with fixed 0.5 ratio; `EditorGroup` tab strip with HTML5 drag-and-drop, routes resource URI to a renderer; built-in `placeholder://` scheme + `PlaceholderEditor`; three commands wired (`editors.openPlaceholder`, `editors.splitRight` = `ctrl+\`, `editors.closeActive` = `ctrl+w`); `editor.activeResource` context key synced on every change. (Tab-cycle commands `editors.nextTab` / `editors.previousTab` land in Phase 5.5.)

**ADRs:** ADR-404.

**Open items:** O73–O77 (unchanged); O152–O154 + O111–O112 added — see Phase 5.5.

**Exit:** open two placeholder editors side-by-side via Command Palette + keybinding; drag tab between groups (HTML5 D&D); close last tab in a non-sole group → group auto-collapses; close all → editor area empty hint shows; `editor.activeResource` reflects focused tab in context-key snapshot. Verified live in Electron via Chrome DevTools Protocol on `localhost:9333` (agent-browser).

### React-19 re-render pattern (caveat captured)

Initial implementation used `[, tick] = useState(0)` + `tick(n => n + 1)` in `useEditorState` / `useEditorGroup` and read live data via `editor.getGroup(id)` during render. Tabs did not appear after `open()` despite `getGroups()` reflecting the new tab.

Fix: store the snapshot in state (`const [group, setGroup] = useState(() => editor.getGroup(groupId))`) and call `setGroup(editor.getGroup(groupId))` from the `onDidChange` listener — same pattern as every other hook in the codebase.

Caveat: the initial Phase-5 summary blamed React 18 concurrent mode for "silently dropping" `tick(n => n + 1)` updates. **That diagnosis is not load-bearing and should not be cited going forward** — `setState(n => n + 1)` does re-render under both React 18 and React 19. The actual root cause was probably mount-order / subscription-timing: the listener was set up after the first emit fired, or the live-read pattern depended on a Map ref that mutated in place. The new "snapshot in state" pattern is correct regardless, captures identity at subscription time, and is the canonical style — keep using it. Do not reintroduce the `[, tick]` pattern.

## Phase 5.5 — Editor UX parity polish (trimmed)

**Goal:** close the highest-value UX gaps between "Phase 5 functional" and "feels like VSCode" before Phase 6 mechanism layers on top. Deliberately narrow — anything that needs a new mechanism, new persistence path, or open-ended event surface is deferred to the Phase 13 polish pass (see below). 5.5 is paint + one tiny correctness fix + the two interactions that hurt most when missing (split-clones-active, keyboard tab cycle).

**Already landed during the Phase-5 review pass:**
- `.editor-group--focused` CSS rule (previously applied as a class with no matching selector → focused group was invisible). Active-tab styling sharpened: active tab matches editor surface, inactive tabs sit on darker strip bg, accent stripe uses `--color-accent` for focused-group / `--color-fg-muted` for unfocused-group.
- `EditorService._emit` snapshots `[...this._listeners]` before iterating, to keep synchronous re-subscription inside a listener from mutating the Set mid-iteration.
- `EditorService.setActiveTab(groupId, instanceId)` added — tab click handler now addresses by instance ID, not resource string. Fixes the bug where clicking a duplicate-resource tab activated the first match instead of the clicked one.
- `editors.openPlaceholder` command appends a per-session counter (`placeholder://new-tab-1`, `-2`, …) so repeated invocations create distinct tabs instead of tripping `open()`'s resource-dedup branch.
- Tab cursor + close-button cursor switched to `pointer`. Tabstrip pinned to `min-height: 30px` so close-last-tab does not cause layout jump.

**Remaining (trimmed scope):**
- **Split clones active editor.** `editors.splitRight` currently creates an empty group. Match VSCode: after `splitGroup`, if the source group had an active tab, `open(sameResource, { groupId: newGroupId })` so the split lands with the active editor mirrored side-by-side. If no active tab, the new group stays empty.
- **Dirty dot in tab.** `EditorInstance.isDirty` field already exists. Render a `•` in the close-button slot when `isDirty && !hover`; reveal `×` on hover. No new state, no new API — pure render-time + CSS hover swap.
- **Keyboard nav: Ctrl+Tab / Ctrl+Shift+Tab cycle within focused group.** Two new platform commands (`editors.nextTab`, `editors.previousTab`) + keybindings. Within-group only; cross-group nav deferred to Phase 13.
- **Refactor: extract `_removeTabFromGroup(groupId, instanceId)` private helper** — `close()` and `moveTab()` currently duplicate the collapse / focus-reassign logic. Mechanical, no behaviour change.

**ADRs:** ADR-404 (no normative change; UX-polish-only).

**Open items added (404-range):**
- **O152** — Editor service event granularity. Single `onDidChange` re-renders every consumer on every mutation. VSCode's editor service has per-axis events (`onDidAddGroup`, `onDidActiveEditorChange`, `onDidChangeGroupModel`). Decide between (a) split-emitter API now, (b) version-number selectors, (c) defer until Phase 13 when a real bundle dogfoods the editor.
- **O153** — `editor.activeResource` context-key scrubbing for ADR-407. Currently `''` for `placeholder://` URIs. Once real schemes land (`patient://abc-123`, `session://...`), the value will contain PHI-adjacent IDs and **must** appear on the Phase 10 audit-payload scrub list. Tracked alongside O95.
- **O154** — Tab dedup policy. `open(resource)` currently dedups by resource-string equality. The placeholder counter is a temporary workaround; decide if a `forceNew` option, a `pinned` flag, or a richer key (resource + view-state hash) is the right shape before any real editor opts in.
- **O111** — Split-ratio persistence. Phase 5 hard-codes `ratio: 0.5`. Once O152 ships per-axis events and split-divider drag lands (Phase 13 polish), persist ratio per workspace via the Phase 4 layout-persistence path.
- **O112** — Tab context menu surface. Right-click, middle-click-close, pin/unpin, "close others / close to the right / close all". Belongs to the command + context-key spine (ADR-406/407); waits on the command-menu mechanism scheduled with Phase 13 polish.

**Exit:** focused group visually distinct from unfocused (✓); active tab visually distinct from inactive (✓); split clones active editor into new group; dirty dot appears in tab when `isDirty`; Ctrl+Tab cycles forward within group, Ctrl+Shift+Tab cycles backward; `close()` and `moveTab()` route through the shared `_removeTabFromGroup` helper.

**Explicitly deferred to the Phase 13 polish pass** (see Phase 13 below): drag preview / drop indicator, split-divider drag handle + ratio persistence, tab context menu, Alt+1..9 group switch, Ctrl+PgUp/PgDn alias, `_insertSplit` defensive short-circuit (low-impact correctness, no behaviour delta until a malformed tree shows up).

## Pre-Phase-6 gate — 100-range amendment pass

**Status:** Closed (2026-05-17). ADRs 101 / 103 / 104 / 105 amended in the Post-Phase-8 cleanup pass; the Bundle Host is now named as the fourth trust zone in ADR-101 and the capability host alongside Main in ADR-103. ADR-104 names the manifest-read step at `apps/desktop/electron/main/bundle-host/manifest.ts`; ADR-105 pins `activate(...)` to the Bundle Host process.

Before Phase 6 starts referencing the wrong text, apply the deferred amendments to the 100-range:

- **ADR-101** — add Bundle Host as the fourth trust zone (third-party-trust), alongside Renderer / Main / Cloud Backend.
- **ADR-103** — capability implementations may live in the Bundle Host; routing through Main.
- **ADR-104** — manifest read by Main, registry sent to Renderer at boot.
- **ADR-105** — `activate(...)` runs in the Bundle Host.

This is a documentation-only pass; no code changes. It is a hard gate, not a side task.

## Phase 6 — Bundle Host real: manifest, activation, capabilities — Complete

**Status:** Complete (2026-05-16). Trimmed scope landed; lazy activation + host hardening deferred to Phase 6.5 (below).

**Goal:** Bundle Host runs real bundle code end-to-end (no UI yet). Capability calls route Renderer → Main → Host and back.

**Deliverable (landed):**
- Wire protocol extended (`host.activate` / `host.deactivate` / `host.cap.invoke` / `host.cap.result|error` / `host.activated|activate.failed|deactivated`) — `electron/shared/host-protocol.ts`.
- Bundle Host runtime: dynamic ESM `import()` of bundle entry, `activate(ctx)` with `registerCapability`, dispatcher for `host.cap.invoke`, disposable held + invoked on `host.deactivate`, handler errors caught and reported as `cap.handler_threw`, host-level `uncaughtException` ⇒ `process.exit(1)` ⇒ Main detects + marks all hosted bundles inactive — `electron/bundle-host/index.ts`.
- Main manager extended: single id-namespace pending map across ping / activate / deactivate / cap.invoke; activated-bundle bookkeeping; `setOnBundlesCrashed` callback drives renderer event; graceful `shutdownHost()` deactivates each known bundle before sending `host.shutdown` — `electron/main/bundle-host/manager.ts`.
- Manifest reader: hand-rolled validator over `{ id, version, entry, activationEvents, capabilities[] }`, scans `<RU_SOAM_BUNDLES_DIR | app.getAppPath()/bundles | resourcesPath/bundles>` — `electron/main/bundle-host/manifest.ts`.
- Boot loader: registers a Main-side routing capability handler per declared bundle capability that forwards via `manager.invokeBundleCapability`; activates each `eager` bundle on boot; installs the `bundle.crashed` `soam:event` bridge — `electron/main/bundle-host/loader.ts`.
- Graceful quit: `before-quit` preventDefault → `shutdownHost()` → `app.quit()`, so dispose handlers run before exit — `electron/main/index.ts`.
- Renderer: three Developer commands (`developer.bundles.pingEcho` / `.echoCrashHandler` / `.echoKillHost`) + a `bundle.crashed` event listener in `boot.ts` (sets `bundles.lastCrash` context key + console error). Banner contribution waits for Phase 7.
- Test bundle: `apps/desktop/bundles/echo-test/{manifest.json,index.mjs}` registering `echo.ping@1.0` with `echo` / `crash` / `fatal` methods (latter two are test hooks for the failure paths).

**ADRs:** ADR-103, ADR-104, ADR-105, ADR-410.

**Open items raised:**
- **O113** — Manifest schema hardening: zod schema, signature/integrity policy, bundle-id namespacing rules, prod packaging path. Currently `validate()` is hand-rolled and JSON-parser permissive. Lands with the first third-party bundle work or Phase 13 polish, whichever comes first.

**Open items remaining:** O65 (host hardening surface — partially staged, full deny set in Phase 6.5), O68 (activation timing — `lazy` / `onCommand` / `onEvent` triggers in Phase 6.5).

**Exit (verified live via agent-browser CDP 9333):**
- ✓ `echo.ping` `echo` returns `{ pong, hostPid, ts }` — Renderer → Main → Bundle Host two-hop confirmed.
- ✓ Handler-throw (`crash` method) surfaces as `[cap.handler_threw] echo.ping requested-crash` to the Renderer; host process keeps running.
- ✓ Fatal in-host throw (`fatal` method) takes down the host process; workbench keeps running; subsequent `echo.ping` call returns `Bundle inactive: echo-test` (mapped through `cap.handler_threw` for now — proper code passthrough is part of O113).
- ✓ `shutdownHost()` deactivates each bundle then exits Bundle Host cleanly.

**Known follow-ups (tracked):**
- ~~Code-mapping in routing handler: today the inner `cap.not_found` from `invokeBundleCapability` is reflattened to `cap.handler_threw` by the registry. Cleaner mapping lands with Phase 6.5 alongside O68.~~ (Resolved Phase 6.5 via `extractCapErrCode` in `electron/main/capability/registry.ts:19`)
- Production bundle packaging path: dev mode resolves `apps/desktop/bundles/`. Packaged-app path (`process.resourcesPath/bundles`) is wired but bundles are not yet copied by `electron-builder`. File alongside O113.

## Phase 6.5 — Bundle Host follow-ups (lazy activation + hardening) — Complete

**Status:** Complete (2026-05-16). Trimmed scope landed; `onCommand` / `onEvent` activation triggers + full per-line stdout/stderr attribution deferred (see open items below).

**Goal:** close out the deferred Phase 6 items so Phase 7's `view://` work has a hardened, lazy-activating host underneath it.

**Landed deliverables:**
- **Cap-error code passthrough (`registry.ts`).** `invokeCapability` extracts a recognised `CapErrCode` from a thrown handler error's `.code` and returns it instead of always re-wrapping as `cap.handler_threw`. Bundle-routing handlers now surface `cap.not_found` for an inactive bundle end-to-end. Unknown codes still fall through to `cap.handler_threw`.
- **Lazy activation event (O68, partial).** Manifest accepts `activationEvents: ["lazy"]`. Loader still registers routing handlers at boot for every declared capability; for a `lazy` bundle the handler awaits `ensureActivated(bundleId, entryPath)` before invoking. Concurrent first invocations share one activation promise (per-bundle in-flight lock). After a host crash, a `lazy` bundle auto-reactivates on next call; an `eager` bundle does not (eager remains one-shot, preserving the Phase 6 crash semantics).
- **Bundle Host hardening (O65, main slice).**
  - Two-layer module deny in `bundle-host/index.ts`: CJS `Module._load` patch *and* an ESM `module.register()` resolve hook delivered as a data URL. Both reject `electron`, `child_process`, `fs`, `net`, `dgram`, `worker_threads`, `vm` (with or without `node:` prefix; sub-paths covered by head-matching).
  - Globals neutered via `Object.defineProperty` (configurable/writable both false): `process.exit`, `process.dlopen`, `process.binding` throw `<name> denied` when called from bundle code. The host captures the real `process.exit` BEFORE neutering and uses it for its own shutdown + crash paths.
  - `process.env` replaced with a frozen snapshot — reads pass through; writes/deletes throw.
- **Per-bundle Output ring buffer (`manager.ts`).** 256-line in-memory ring per `bundleId`. Populated by two reply kinds only: `host.cap.error` (attributed via the pending-request `bundleId`) and `host.activate.failed` (attributed via the reply's `bundleId`). Each line is ISO-timestamped. Full per-line stdout/stderr attribution deferred — see O136.
- **`platform.bundles@1.0` capability.** New `electron/main/capability/bundles-output.ts` exposes `getOutput(bundleId): { lines }` and `listActivated(): { bundleIds }`. Registered alongside `platform.window` in `main/index.ts`.
- **Test surfaces.**
  - `echo-test` bundle gains `try-electron` / `try-fs` / `try-child-process` / `try-process-exit` methods.
  - New `echo-lazy` bundle (`bundles/echo-lazy/`) with `activationEvents: ["lazy"]`, `echo.lazy@1.0`, single method `whoami` returning `activatedAt` for re-activation detection.
- **Developer commands (`platform-commands.ts`).** `developer.bundles.tryElectron`, `tryFs`, `tryChildProcess`, `tryProcessExit`, `pingLazy`, `dumpOutput`.

**Verification (agent-browser CDP 9333):**
- All four `try-*` probes return `ok: false` with rejection messages `module denied: <name>` (imports) and `process.exit denied`.
- `pingLazy` first call activates `echo-lazy`; second call reuses (same `activatedAt`); both in the same host pid as eager `echo-test`.
- After `fatal` crash: `listActivated.bundleIds = []`; next `echo.ping` call returns `cap.not_found: Bundle inactive: echo-test`; next `echo.lazy` call **auto-reactivates** in a fresh host pid.
- `getOutput('echo-test')` after a handler crash returns an ISO-timestamped line `[err] cap.handler_threw: echo.ping requested-crash`.

**Open items raised:**
- **O134** — `onCommand` activation trigger. Needs manifest `commands: [...]` field + renderer CommandService → bundle-activation lookup at command exec. Lands **Phase 7** alongside `view://` (first bundle views will likely contribute commands).
- **O135** — `onEvent` activation trigger. No consumer exists yet. Deferred indefinitely; lands with first event-driven bundle.
- **O136** — Full per-line stdout/stderr attribution. Needs `AsyncLocalStorage`-tagged capture inside the host (wrap each handler invocation in a context scope; redirect `process.stdout.write` / `process.stderr.write` to attribute to the current scope's bundleId). Lands when first third-party bundle work begins OR when the Phase 7 Panel UI demands richer output.
- **O137** — ESM-side hardening depth. The Module._load patch + data-URL resolve hook cover ordinary CJS / ESM imports but not `Function()` / base64-eval smuggling, nor process-API surfaces beyond `exit/dlopen/binding`. Deeper sandbox (vm isolate, full process freeze, syscall restrictions) lands when **first untrusted bundle** ships.

**Open items remaining:** O65 (composite — hardening will tighten further at O137), O68 (composite — partial; O134 / O135 carry the rest).

**Exit:** met.
- ✅ Lazy bundle does not load until first capability invocation; `[bundles] lazy-activating echo-lazy` log fires on first call only.
- ✅ Host-side denial of `electron` / `fs` / `child_process` / `process.exit` from bundle code, end-to-end via agent-browser probe.
- ✅ Cap error codes match end-to-end (`cap.not_found` post-crash; `cap.handler_threw` for handler throws).
- ✅ `getOutput('echo-test')` returns timestamped error-attribution lines.

## Phase 7 — View hosting: `view://` + iframe + bridge — Complete

**Goal:** bundles render UI in a sandboxed iframe.

**Trimmed scope (landed):**

- **`view://` protocol** registered as a privileged scheme (`standard`, `secure`, `corsEnabled`); handler resolves `view://<bundleId>/<assetPath>` against the bundle's `view-assets/` directory. HTML responses get the bridge `<script>` tag and CSP injected; non-HTML assets pass through. Reserved host `_platform_/bridge.js` serves the in-iframe bridge.
- **Manifest schema** extended with `views: [{ id, path }]`. Path traversal denied at parse time. Bundles declaring no views skip view registration entirely.
- **CSP for view documents**: `default-src 'none'; script-src view: 'unsafe-inline'; style-src view: 'unsafe-inline'; img-src view: data:; font-src view: data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`. `frame-ancestors` deliberately omitted — workbench is on a different origin and must be able to embed. Refinement → **O81** (existing).
- **Workbench CSP** updated with `frame-src view:` so the shell can host view iframes. `installCsp` skips view: responses so per-view CSP isn't overwritten.
- **Sandbox flags**: `allow-scripts allow-forms`. `allow-pointer-lock` deferred → **O80** (existing).
- **Bridge script** (`window.soamView`): `bindCapability`, `events.onActivate / onDeactivate`, `theme` snapshot (CSS variables, applied to `documentElement`), `requestClose / requestFocus`. Lifecycle: `view.ready` (out) → `init` + `activate` (in) → `cap.call` / `cap.response` round-trips → `deactivate` (in) on unmount.
- **Renderer relay (`BundleViewIframe`)**: hosts one iframe per editor tab whose resource is a `view://` URL. Forwards `cap.call` to `window.soam.bindCapability`, pushes CSS-variable snapshot at init and on every theme / dark-mode change, handles `request.close` via `EditorService.close`. Renderer does not interpret payloads — Main is the broker, per ADR-411 §Communication discipline.
- **EditorGroup** dispatches the `view:` scheme to `BundleViewIframe`; the existing `placeholder:` path is untouched.
- **`platform.views@1.0`** capability with `resolve(bundleId, viewId)` so the Renderer can ask Main for a fully-formed `view://` URL — keeps the view registry in Main, where it's populated alongside the bundle loader.
- **Test bundle**: `echo-test` ships `view-assets/echo-view.html` (manifest entry `views: [{ id: 'main', path: 'echo-view.html' }]`) with an auto-ping on `activate`, manual buttons, and in-iframe hardening probes that report results back to the parent via `postMessage`.
- **Dev command** `developer.bundles.openEchoView` resolves the URL through `platform.views` and opens it as a new editor tab.

**Verification (CDP 9333, agent-browser):**

- Bridge loads inside iframe — parent receives `view.ready` postMessage with `origin: "null"` (sandbox without `allow-same-origin`, as designed).
- `init` push delivers full theme snapshot (17 CSS variables); iframe applies them to `documentElement`.
- On `activate`, iframe auto-pings `echo.ping@1.0` via bridge: reply round-trips through relay → Main → Bundle Host → back, includes `hostPid` matching the same utilityProcess that serves the eager `echo.ping`.
- In-iframe probes deny everything:
  - `window.soam` → `undefined`
  - `window.parent.document` → blocked (cross-origin)
  - `window.require` / `window.process` → `undefined`
  - `window.top.location` → blocked (cross-origin)
  - `window.origin === "null"`
- Theme swap (`workbench.theme.bamboo` ↔ `stone`) and dark-mode toggle each trigger one fresh `theme` postMessage into the iframe; computed `--color-surface-base` flips appropriately (`oklch(0.985 …)` ↔ `oklch(0.160 …)`).
- `pnpm exec tsc -b` clean.

**ADRs:** ADR-411 (load-bearing). Workbench CSP carve-out and view-CSP omission of `frame-ancestors` documented in `electron/main/security.ts` and `electron/main/bundle-host/view-protocol.ts`.

**Open items landed / still in flight from ADR-411 list:**
- **O78** — scheme name resolved (`view://`, with reserved `_platform_` host for the bridge).
- **O79** — bridge shape committed for Phase 7 surface; further methods land per **O141** (new) below as needed.
- **O80, O81, O82, O83, O84, O85** — unchanged from ADR-411.

**Open items newly raised:**
- **O138** — Side bar / Panel slot iframe mounting. Mechanism identical, separate wiring + manifest contribution points (`contributes.views.sidebar`, `…panel`) and per-slot bridge events. Lands **first clinical-bundle phase** (first clinical-bundle phase that needs a sidebar view; sequenced after Phase 13 Audit Viewer, exact number set at that phase's gate).
- **O139** — Crash placeholder UI for orphaned iframes after Bundle Host crash. The renderer keeps the iframe DOM intact post-crash; pending `cap.call` promises hang. Replace with a timeout-aware placeholder ("view inactive — bundle host crashed"). **First clinical-bundle phase.**
- **O140** — Full `view.activate(viewId, ctx)` lifecycle hook in bundle (ADR-411 §View lifecycle step 6). Phase 7 stubs activation at the renderer/Main boundary only; the bundle's Node code is unaware a view exists. **First clinical view phase implements.**
- **O141** — `events.onResize`, `events.onResourceChange`, `notifyDirty`, `notifyTitle`, `announce` (a11y live region). Land when first view actually needs each. **Per-clinical-bundle phase, as need arises.**
- **O142** — `ThemeTokens` typed surface on `window.soamView.theme`. Phase 7 ships raw CSS-variable record; typed object lands when RuEdit / clinical views need named-token access. **Phase 7.5**.
- **O143** — Tighten view CSP `script-src` / `style-src` — Phase 7 allows `'unsafe-inline'` for ergonomics; refine alongside O81 once first non-test bundle ships a real view. **Lands at first non-test bundle view, sequenced after Phase 13.**

**Why this lands at Phase 7 trimmed:**
- Editor-Area-only mount surface is sufficient to prove the mechanism end-to-end; sidebar/panel use the same code path with extra slot plumbing (deferred to first real consumer per [[feedback_scope_discipline]]).
- A11y patterns, declarative views, and full event surface land alongside real bundle views, not against a synthetic test bundle.

**Exit:** met.
- ✅ `developer.bundles.openEchoView` opens a sandboxed iframe in the Editor Area; bridge initialises and round-trips a capability call.
- ✅ Theme swap and dark-mode toggle propagate CSS variables into the iframe.
- ✅ Iframe cannot reach `window.soam`, `window.parent.document`, `window.top.location`, `require`, or `process`.
- ✅ `pnpm exec tsc -b` clean across renderer, main, preload, bundle-host.

## Phase 7.5a — RuEdit core skeleton — Complete

**Goal:** ship the platform's editor primitive — `@ru-soam/editor` (RuEdit), a raw-ProseMirror surface analogous to Monaco-in-VSCode — so every later prose-bearing editor type (session notes, intake narratives, discharge summaries) and every clinical bundle composes the same engine. No clinical schema yet; foundation only.

**Landed (Phase 7.5a):**

- New workspace package `packages/editor/` (`@ru-soam/editor`), MIT/BSD ProseMirror deps only (`prosemirror-{model,state,view,transform,commands,keymap,history,schema-list,inputrules}` + `orderedmap`). `pnpm-workspace.yaml` widened to `packages/*`; root `tsconfig.json` references the new package.
- ProseMirror schema v1 (`packages/editor/src/schema.ts`): `doc`, `paragraph`, `heading` (levels 1–3), `bullet_list`, `ordered_list`, `list_item`, `blockquote`, `horizontal_rule`, `hard_break`, `text`. Marks: `strong`, `em`, `underline`, `code`. Stable per-block `_id` attr (UUID v4) emitted as `data-soam-id` in the DOM.
- Stable-ID plugin (`id-plugin.ts`): `appendTransaction` stamps fresh UUIDs onto id-bearing blocks lacking one or sharing an id (split-sibling case). `ensureStableIds(doc)` normalizes a doc tree synchronously so `getDoc()` is stable before the first transaction.
- Versioned JSON envelope (`json.ts`): `{ schemaVersion: 1, doc }`. `nodeToJSON` / `nodeFromJSON`; schema-version mismatch and unknown-node-type both throw a named `RuEditSchemaError` (with `cause`), never silent coercion.
- Imperative mount API (`mount.ts`): `mountRuEdit(container, { initial, readOnly, onChange })` → `RuEditHandle { getDoc, setDoc, focus, dispose, view }`. `dispose()` tears down the `EditorView`.
- Default keymap (`keymap.ts`): history (Mod-Z / Mod-Shift-Z / Mod-Y), list nav (Tab / Shift-Tab indent, Enter split), marks (Mod-B / Mod-I / Mod-U / Mod-`), heading toggles (Mod-1/2/3 ↔ paragraph), hard-break (Shift-Enter), input rules for Markdown-style `#`/`##`/`###` heading + `-`/`*` bullet + `1.` ordered list.
- Renderer-side React chrome (`apps/desktop/src/platform/ru-edit/RuEditView.tsx`) per ADR-415: vanilla PM in a `ref`-mounted div, React never reaches inside the content, uncontrolled-with-explicit-replacement; remount only on `instanceId` change.
- `apps/desktop/src/workbench/middle/ScratchRuEdit.tsx` host with in-memory doc cache (`platform/ru-edit/scratch-store.ts`) so docs survive tab switches; `onChange` dumps JSON to devtools; "Log JSON" button forces a `getDoc()` dump.
- `EditorGroup` dispatches the `ru-edit-scratch:` scheme to `ScratchRuEdit`.
- Developer command `developer.editor.openScratch` ("Developer: Open RuEdit Scratch") opens `ru-edit-scratch://scratch-<n>` tabs.
- Workbench CSS for `.ru-edit-host` (host sizing, padding, scroll) and `.ru-edit-scratch` (toolbar chrome) plus `.ProseMirror` typography (headings, lists with explicit `list-style: disc/decimal`, blockquote, inline code).

**Verification (CDP 9333, agent-browser):**

- Scratch tab mounts; `document.querySelector(".ru-edit-host .ProseMirror")` present.
- Typing into the editor produces correct DOM ("Hello RuEdit" → `<p data-soam-id="…">Hello RuEdit</p>`).
- Input rule `# ` rewrites to `<h1>` with a stable id.
- Bullet input rule `- ` + Tab nests; `data-soam-id` present on every `<li>`, `<ul>`, and `<p>`.
- `Mod-B` toggles `<strong>` across selection (4 strong wrappers across the populated doc), `Mod-Z` removes them, `Mod-Shift-Z` restores them.
- `ensureStableIds` assigns a UUID v4 to an id-less paragraph supplied via `initial`; `getDoc()` immediately after mount returns an id-bearing envelope.
- `nodeFromJSON({ schemaVersion: 99, … })` throws `RuEditSchemaError: RuEdit schemaVersion mismatch: expected 1, got 99`.
- `nodeFromJSON({ schemaVersion: 1, doc: { type: "doc", content: [{ type: "made_up_node" }] } })` throws `RuEditSchemaError: RuEdit doc failed schema validation: Unknown node type: made_up_node`.
- Full setDoc round-trip: `getDoc()` → `JSON.stringify` → `JSON.parse` → `setDoc()` → `getDoc()`; second dump identical to first (string equality on a doc containing `heading`, `bullet_list`, two `list_item`s — 675 bytes).
- `mountRuEdit` → `dispose()` removes `.ProseMirror` from the host (manual leak smoke-test; formal heap-snapshot harness deferred to O146).
- `pnpm exec tsc -b apps/desktop packages/editor` clean.

**ADRs:** ADR-414 (RuEdit primitive), ADR-415 (React/PM boundary). ADR-404 amended to reflect that prose-bearing editor types now compose RuEdit.

**Open items raised (Phase 7.5a):**
- **O144** — *(resolved in 7.5b)* `IRuEditService` / `RuEditServiceId` workbench primitive registered in `boot.ts`.
- **O145** — *(resolved in 7.5b)* Reload-survival via `sessionStorage` (serialize → reload → deserialize, IDs preserved).
- **O146** — Heap-snapshot dispose-leak harness. Phase 7.5a verified dispose tears the DOM down; formal CI-shaped harness lands when leak-gating becomes valuable. **Target:** Phase 9 hardening pass.
- **O147** — *(resolved in 7.5b)* RuEdit toolbar UI (mark / heading / list / undo / redo buttons).

## Phase 7.5b — RuEdit primitive integration — Complete

**Goal:** make the RuEdit primitive workbench-addressable, durable across renderer reload, and usable without keyboard memorization. Closes the three trim-deferred items from 7.5a (O144, O145, O147).

**Landed:**

- **O144 — `IRuEditService` primitive.** `apps/desktop/src/platform/ru-edit/ru-edit-service.ts` defines `IRuEditService` with `register(reg)`, `unregister(instanceId)`, `setActive(instanceId | null)`, `getActive()`, `forResource(resource)`, `forInstance(instanceId)`, `list()`. `RuEditServiceId` registered in `platform/services/ids.ts`; instance created and registered in `workbench/boot.ts` ("Phase 7.5b" section). `ScratchRuEdit` calls `register({ resource, instanceId, handle })` + `setActive(instanceId)` on mount via the `onHandle` callback, and `unregister(instanceId)` on unmount. `boot.ts` subscribes to `editor.onDidChange` to sync the active RuEdit instance to the focused editor tab, and mirrors the live id into the context key `ruEdit.activeInstance`.
- **O145 — `sessionStorage`-backed reload-survival.** `scratch-store.ts` replaces the in-memory `Map` with a `sessionStorage` cache keyed by `ru-edit-scratch:<resource>`. Hydration on mount restores the envelope; `onChange` persists the latest doc; corrupt entries are dropped silently. Renderer `Ctrl+R` reload preserves both the tab list (via `EditorService`) and per-tab doc content (incl. every `_id`).
- **O147 — Minimal toolbar.** New command helpers in `packages/editor/src/commands.ts`: `toggleStrong`, `toggleEm`, `toggleUnderline`, `toggleCode`, `setHeading(level)`, `wrapInBulletList`, `wrapInOrderedList`, `runUndo`, `runRedo`, plus a generic `runCommand(handle, cmd)` escape hatch. New renderer `apps/desktop/src/platform/ru-edit/RuEditToolbar.tsx` renders 4 grouped clusters (inline marks · headings · lists · history) of 11 buttons total; each button preserves selection with `onMouseDown=preventDefault` then dispatches through `handle.view`. `ScratchRuEdit` renders the toolbar above the editor host. Toolbar CSS lives alongside other editor styles in `workbench.css`.

**Verification (CDP 9333, agent-browser):**

- Toolbar renders 11 buttons in correct order: `B | I | U | <> | H1 | H2 | H3 | • List | 1. List | Undo | Redo`.
- Clicking `B` after `Ctrl+A` wraps the selection in `<strong>`.
- Clicking `H2` on a non-empty selection promotes the block to `<h2 data-soam-id="…">`; with an empty selection and the cursor already in an `<h2>` of the same level, clicking `H2` again toggles back to `<p>`.
- Clicking `• List` on a paragraph wraps it in `<ul><li><p>…</p></li></ul>` with fresh `_id`s on the new `ul` and `li`; clicking `Undo` reverses the wrap.
- `sessionStorage` after edits contains a single key `ru-edit-scratch:ru-edit-scratch://scratch-1` whose value is a `{schemaVersion:1, doc:…}` envelope.
- `Ctrl+R` (renderer reload) → tab "RuEdit Scratch 1" reopens with the bullet-list content intact; `data-soam-id` of the top `<ul>` matches the value captured before reload (`63970f10-…` → `63970f10-…`).
- `window.__soamRegistry.get({ id: "workbench.ruEdit" }).getActive()` returns `{ resource: "ru-edit-scratch://scratch-1", instanceId: "instance-1", handle: { getDoc: [Function], … } }`.
- `getActive().handle.getDoc()` → `setDoc(doc)` → `getDoc()` returns byte-identical serialization (384 bytes).
- `pnpm exec tsc -b apps/desktop packages/editor` clean.

**Open items raised (Phase 7.5b):**
- **O148** — *(resolved in 7.5c)* Mark / heading **active-state** highlighting on toolbar buttons.
- **O149** — Read-only mode UI toggle on scratch. `mountRuEdit` already accepts `readOnly`; surfacing it in the toolbar is cosmetic for the developer scratch. **Target:** first clinical consumer.
- **O150** — Command-palette commands for the toolbar actions ("Editor: Toggle Bold", "Editor: Insert Heading 1", …). Routes through `IRuEditService.getActive()`. **Defer reason:** keyboard shortcuts already cover the surface; palette commands gain value once non-scratch consumers exist. **Target:** first clinical consumer.
- **O151** — *(resolved in 7.5c)* Auto-coerce heading → paragraph when wrapping in a list.

**Open items raised (carried from full plan):**
- **O128** — _Closed by ADR-416._ Originally "SmartText engine"; renamed **Snippet engine** (Epic's `Smart*` family is trademarked — see ADR-416 §Vocabulary). Lands as renumbered **Phase 8**; previous Phase 8 (Crypto) and all downstream phases shifted +1.
- **O129** — Custom atomic blocks (Vitals first, then Allergies / MedList). Lives in the phase after Phase 8 Snippet engine; numbering set at that phase's gate. Picklist *placeholder* (a single field inside a Snippet) ships in Phase 8 per ADR-416; richer structured blocks live here.
- **O130** — React-in-nodeView strategy revisit (vanilla DOM vs `@handlewithcare/react-prosemirror` / `@nytimes/react-prosemirror`). Decide at custom-block phase entry per ADR-415's recorded criteria.
- **O131** — Stable ID revisit (UUID v4 → v7 when per-block revision history lands).
- **O132** — Print pipeline (JSON → print-React → Puppeteer-in-Main → PDF, page templates, signature block). Lives in the phase after custom blocks.

**Open items deferred long-range:**
- **O120** — Voice dictation adapter interface (Web Speech / Dragon / Deepgram Medical).
- **O121** — Multi-clinician collab via Yjs + Cloud Backend awareness. Single-clinician-per-record is the assumption through the foreseeable phases.
- **O122** — Template authoring UI inside ru-soam.

## Phase 7.5c — RuEdit toolbar polish — Complete

**Goal:** make the scratch toolbar reflect live editor state and stop silently no-op-ing on heading→list wraps. Closes O148 and O151 from 7.5b.

**Landed:**

- **O148 — Active-state highlighting.** New `packages/editor/src/active-state.ts` exports `RuEditActiveState` + `computeActiveState(state)`. Snapshot covers active marks (`strong/em/underline/code`), block kind + heading level, list ancestry (`inBulletList`/`inOrderedList`), and history depth (`canUndo`/`canRedo`). `mountRuEdit` handle gains `getActiveState()` and `subscribe(listener) → unsubscribe`; the dispatch-transaction hook notifies subscribers after every applied tr (including selection-only moves and `setDoc`). `ScratchRuEdit` subscribes on `onHandle` and feeds `active` into `RuEditToolbar`. Toolbar adds `.is-active` + `aria-pressed` per inline-mark / heading-level / list button and `disabled` on Undo/Redo when their depth is zero. CSS adds `.is-active` accent-styled state and `:disabled` opacity in `workbench.css`.
- **O151 — Heading auto-coerce on list wrap.** `commands.ts` adds `wrapInListCoerced(listType, paragraph)` used by both `wrapInBulletList` and `wrapInOrderedList`. When the active block is a heading, a single transaction does `tr.setBlockType($from.before(), $from.after(), paragraph)` then `tr.wrap(range, findWrapping(...))`. Result: a single history entry — one `Ctrl+Z` reverses both the paragraph conversion and the wrap.

**Verification (CDP 9333, agent-browser):**

- `getActive().handle.getActiveState()` returns the documented shape; reflects `canUndo:true` after typing, `marks.strong:true` after `Ctrl+B`, `block:"heading"` + `headingLevel:2` after `Ctrl+2`, `inBulletList:true` after wrap.
- DOM snapshot of toolbar buttons confirms only the matching button carries `is-active` + `aria-pressed="true"` (e.g. after `Ctrl+2`: `H2` is the only active button; `Redo` is `disabled:true` until an undo is applied).
- Clicking `• List` while the cursor is in an `<h2>` produces `bullet_list → list_item → paragraph` (verified via `getDoc()`); a single `Ctrl+Z` restores the original heading-only doc (single tr → single history step).
- `pnpm exec tsc -b apps/desktop packages/editor` clean.

**Open items deferred (still open after 7.5c):**
- **O146** — Heap-snapshot dispose-leak harness. Still targeted at the Phase 9 hardening pass.
- **O149** — Read-only mode UI toggle. Still cosmetic-only on scratch; target first clinical consumer.
- **O150** — Command-palette commands for toolbar actions. Target first clinical consumer.

## Phase 8 — Snippet engine

**Goal:** clinician-grade snippet expansion in RuEdit. Type `/abbrev` + Tab → snippet body inserts, cursor lands on first placeholder, Tab walks placeholders, Esc aborts, last Tab/Enter finalises. Closes ADR-414 O128 via ADR-416.

**Naming-policy note:** See ADR-416 §Vocabulary for the naming policy.

**Trigger character:** `/`. Rationale recorded in ADR-416.

**Deliverable:**

- New module `packages/editor/src/snippets/`:
  - `registry.ts` — `SnippetRegistry` (in-memory map `abbrev → SnippetDef`), `SnippetDef`, `SnippetPlaceholder` types. Placeholder types in this phase: `text`, `picklist`. Reserved (not implemented): `number`, `date`, `datalink`.
  - `trigger-plugin.ts` — ProseMirror plugin: detects `/` mid-prose, opens completion-popup decoration, accepts on Tab/Enter/click.
  - `expand.ts` — single-transaction expansion: remove trigger text, insert body fragment + placeholder nodes, set selection to first placeholder.
  - `placeholders.ts` — placeholder keymap (Tab next, Shift+Tab prev, Enter finalize-last, Esc abort-to-history).
  - `picklist-view.ts` — vanilla DOM `NodeView` for picklist placeholders (per ADR-415: no React in content).
- Schema **v1 → v2** in `@ru-soam/editor`: adds atomic inline node `placeholder` with attrs `{ name, type: "text" | "picklist", default?, options?, value? }`. Codec v1→v2 migration: no-op for docs without placeholders. Schema-mismatch errors named per ADR-414.
- `mountRuEdit` gains optional `snippets: SnippetRegistry` option; trigger plugin attaches only when supplied.
- `ISnippetService` + `SnippetServiceId` registered in `workbench/boot.ts`, sibling to `RuEditServiceId`. Exposes `registry()` only; mutation API deferred to capability-surface phase (O416c).
- Developer command `developer.snippets.seed` populates the registry with three fixed test snippets:
  - `/hello` — plain-text body, no placeholders.
  - `/hpi` — body with one `text` placeholder (e.g. "Patient reports {{chief_complaint}}.").
  - `/disp` — body with one `picklist` placeholder (e.g. disposition options).
- Context keys: `snippet.active` (cursor inside snippet with unfinalized placeholders) and `snippet.placeholder.type` (`text` | `picklist`). Mirror `ruEdit.activeInstance` from 7.5b.
- Scratch RuEdit pulls registry from `SnippetService` and passes into mount. Toolbar from 7.5c unchanged.

**ADRs:** **ADR-416** (Snippet engine — new). ADR-414 amended (O128 closed, vocabulary policy added). ADR-415 amended (NodeView phase reference symbolised; picklist nodeView added as Phase 8 instance of the imperative-DOM rule).

**Verification (CDP 9333, agent-browser):**

- Type `/hello` + Tab → trigger text removed, snippet body inserted, doc round-trips schema v2 codec.
- Type `/hpi` + Tab → cursor lands on `{{chief_complaint}}` placeholder. Type "headache" → Tab finalizes. Doc contains zero `placeholder` nodes; `headache` is plain text.
- Type `/disp` + Tab → picklist dropdown opens. Arrow keys + Enter select option. Tab finalizes / advances.
- `Ctrl+Z` immediately after `/hpi` expansion fully reverses (one history step). Esc mid-walk also reverts to pre-expansion doc.
- `pnpm exec tsc -b apps/desktop packages/editor` clean.

**Exit criteria:**

- All three seeded snippets expand, walk, finalize, abort as documented.
- Schema v2 codec round-trips docs both with and without placeholders. Mismatched-version error is named and recoverable.
- Picklist nodeView is vanilla DOM (no React in content path); confirmed by inspection.
- Heap snapshot before / after a mount + dispose with snippets in the doc shows no leaked `EditorView`.
- `pnpm exec tsc -b` clean for both `apps/desktop` and `packages/editor`.

**Open items raised (sequenced past Phase 8):**

- **O416a** — Type-constrained placeholders (`number`, `date`, regex-validated text). Lands with first clinical consumer requiring them.
- **O416b** — Shared / clinic-level snippet registries + persistence. Local-workspace persistence aligns with Phase 10 (Local Store); multi-clinician sharing with Phase 11 (Sync).
- **O416c** — Snippet authoring UI (clinician edits own library inside ru-soam). Renamed from ADR-414 O122; long-range product phase.
- **O416d** — Snippet recursion (snippet body containing a `/abbrev` that re-triggers on finalize). Defer until use case.
- **O416e** — DataLink placeholder type (Epic-equivalent of SmartLink). Reserved type name in Phase 8; full implementation requires chart/FHIR phase with capability-mediated data access.
- **O416f** — Template phase (Epic-equivalent of SmartText): whole-document default scaffolds per note type. Distinct ADR; sequenced when editor-type views with note-typed resources land.
- **O416g** — Trigger-character override per workspace setting. Default `/` locked; override is long-range.
- **O416h** — Completion popup UX (filter ordering, recent-first, descriptions, fuzzy match). Phase 8 ships minimal list; richer UX once snippet libraries grow.
- **O130** (ADR-415) — React-in-nodeView decision shifts forward by one concrete data point: how the Phase 8 picklist nodeView felt to build informs the criteria, but the decision still lives at the custom-blocks phase (O129) entry.

**Why this lands now, ahead of Crypto (Phase 9):**

- RuEdit primitive surface and PM transaction pattern is freshly built (7.5a–7.5c); keymap, plugin, schema, and codec internals are hot for the team.
- Snippet expansion exercises the schema-v2 migration path before the heavier O129 atomic blocks land, de-risking that phase.
- Snippet has zero dependency on Crypto, Local Store, or Sync; persistence is explicitly out of scope this phase.
- The clinical phases (post-13) want snippets and templates as table stakes for any prose-bearing editor-type view; landing the engine here unblocks future product scoping.

## Phase 9 — Crypto + KEK + workspace lock / unlock

**Goal:** PHI gate lands before any patient / session schema goes near disk.

**Deliverable:** KEK derivation, workspace unlock UI, KEK relock command, encryption-at-rest primitives (key handling, envelope format, table-level encryption hooks ready for Phase 10), "KEK locked" StatusBar entry live, PHI capability calls refused while locked.

**ADRs:** ADR-301 (crypto), ADR-303 (KEK / recovery; recovery UX lands Phase 12), ADR-403 (lock state).

**Open items:** crypto-domain open items (300-range; tracked in the ADRs).

**Exit:** force-restart → must unlock to access PHI; relock works mid-session; cold storage of the still-empty PHI tables shows ciphertext only; lock state is a context key consumed by when-clauses.

## Phase 10 — Local Store + audit log + TanStack Query data wiring

**Goal:** capability-backed data flow real; audit spine in place; encryption-at-rest applied from the first write.

**Deliverable:** SQLite-backed Local Store in Main, change-event capability, TanStack Query invalidation bridge, one demo capability that reads/writes a non-sensitive table (e.g., user preferences). Audit log capability: append-only store, redaction discipline (no PHI-adjacent context keys in audit payloads), every capability invocation that should audit, does.

**ADRs:** ADR-302 (Local Store), ADR-403 (workspace settings cascade), ADR-407 (PHI-adjacent key scrubbing), ADR-412, ADR-502 (audit infrastructure; viewer bundle ships Phase 13).

**Open items:** O55, O97, O100, O95 (context-key scrub list).

**Exit:** prefs survive restart; mutation invalidates query; demo proves the pipeline without touching PHI; audit table records every audited capability call; redaction verified by test.

## Phase 11 — Sync queue + cloud mirror

**Goal:** local-first writes propagate; conflict policy committed.

**Deliverable:** outbound sync queue, server-side mirror endpoint, conflict resolution per ADR-302 policy, sync-state StatusBar entry.

**ADRs:** ADR-302, ADR-304 (sync), ADR-305 (cloud transport).

**Open items:** 300-range sync items (tracked in those ADRs).

**Exit:** offline edit → reconnect → mirror converges; conflict surfaced in UI; cloud receives ciphertext only (structural enforcement per ADR-301).

## Phase 12 — Recovery + Onboarding + Settings surfaces

**Goal:** three of the four core Activity Bar items real (Recovery, Onboarding, Settings). Bundles surface lands here as the fourth.

**Deliverable:** Settings editor (built-in, not a bundle), Recovery flow (KEK recovery codes), Onboarding flow, Bundles surface (list installed, enable / disable, view manifest).

**ADRs:** ADR-405, ADR-303 (recovery UX).

**Open items:** O69–O72.

**Exit:** fresh install → Onboarding → workspace created → KEK set → recovery codes captured → Settings reachable; existing install → Recovery flow restores access from a recovery code.

## Phase 13 — Audit Viewer bundle (first first-party bundle) + editor polish pass

**Goal:** dogfood the whole stack with the only first-party bundle anchored in the ADR set (ADR-502). Audit Viewer is the forcing function that finally renders real bundle content inside the editor area — so this phase also picks up the editor UX items deferred from Phase 5.5, since they only start to bite once a non-trivial editor is actually being looked at.

**Deliverable:**
- Audit Viewer ships as a bundle (not built into the shell). Bundle manifest, activation, view hosted in the Primary Side Bar or Editor Area (decision in the bundle's design doc), reads audit store via capability, respects redaction.
- Editor polish items deferred from Phase 5.5 (land alongside, prioritised against Audit-Viewer-specific gaps surfaced during dogfooding):
  - Drag preview + drop indicator (`editor-tab--dragging` class on `dragstart`, `editor-group--drop-target` outline on `dragenter`, insertion indicator between tabs). Likely co-evolves with the O152 event-granularity decision.
  - Split-divider drag handle on `editor-split-divider` — mouse-drag to resize, snap at min widths. Resolves O111 (ratio persistence via the Phase-4 layout path).
  - Tab context menu surface (right-click, middle-click-close, pin/unpin, "close others / close to the right / close all"). Resolves O112; depends on the command-menu mechanism this phase needs anyway for the Audit Viewer's row actions.
  - Cross-group keyboard nav: Alt+1..9 (jump to group N) + Ctrl+PgUp/PgDn (alias for within-group cycle already shipped in 5.5).
  - `_insertSplit` defensive short-circuit (stop recursing once the target group is found; cleanup that pays off once split-divider drag exercises the tree more aggressively).

**ADRs:** ADR-502, ADR-405, ADR-411 (Audit Viewer); ADR-404 amendment if O152 lands here.

**Open items:** any audit-viewer-specific items raised when the bundle is designed; O152 / O111 / O112 resolved or formally re-deferred during this phase.

**Exit:** Audit Viewer activates on demand, runs in the Bundle Host, renders in a sandboxed iframe, reads only through capabilities, has no privileged path back to the renderer. Editor area drag-drop shows preview + drop indicator; split dividers are draggable and ratios persist per workspace; tab right-click opens a context menu; Alt+N switches groups.

## Cross-cutting workstreams

These run alongside the phases, not in sequence with them.

### Product-scoping doc (Open Item O72)

Owner: product, not architecture. Must land **before Phase 14** (first product bundle beyond the Audit Viewer). Defines the first-party bundle catalogue (Patients / Sessions / Calendar / Tasks / Library / etc.) with anchored sources for each.

### Theme token catalogue (Open Item O107)

Grows phase by phase as new surfaces appear. Freeze for v1 before any third-party theme bundle is invited in.

### Documentation discipline

Each phase that lands new mechanism updates the corresponding ADR's Open Items list — items resolved are struck through; new items uncovered are appended. ADRs remain the source of truth; the implementation plan does not duplicate their content.

### Security review cadence

After Phase 7 (view hosting), Phase 9 (crypto), Phase 10 (audit), and Phase 11 (sync), a focused security pass on the just-landed surface. PHI never reaches cloud in plaintext is the load-bearing invariant; each pass re-verifies it structurally, not by inspection.

## What this plan deliberately does not cover

- Specific product features (Patients, Sessions, Calendar, etc.). Owned by the product-scoping doc.
- Multi-tenancy / clinic expansion. Deferred to post-503 per ADR-501.
- Telemetry, error reporting, update channel. Drop into a later phase when the feature surface stabilises.
- The exact engineering breakdown of each phase (sprints, tickets, owners). Belongs in the project tracker, not in architecture documentation.
