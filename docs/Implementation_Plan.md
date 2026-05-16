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

**Goal:** confirm Electron + React SPA + TanStack scaffolding holds.

**Deliverable:** `pnpm dev` opens an empty Electron window; React mounts; TanStack Router + Query initialised; type-check + lint pass.

**ADRs:** ADR-101, ADR-201

**Open items:** none binding.

**Exit:** hot-reload Renderer; Main starts cleanly; CI runs the build.

## Phase 1 — Process skeleton + IPC contract

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

**Goal:** command-driven shell with palette, before any feature uses commands.

**Deliverable:** CommandService (Renderer mirror + Main registry), ContextKeyService with the VSCode-style expression evaluator, KeybindingService. Command Palette opens. About six platform commands wired (`workbench.toggle*Bar`, `workbench.openSettings`, `workbench.openCommandPalette`, etc.).

**ADRs:** ADR-406, ADR-407.

**Open items:** O86–O95.

**Exit:** `Ctrl+Shift+P` opens the palette; when-clauses gate visible commands; reserved-namespace check rejects bad registrations; PHI-adjacent context keys never appear in any persisted payload.

## Phase 4 — Workspace concept + lifecycle

**Goal:** Workspace = Entity. Open / close / lock lifecycle reaches services that care.

**Deliverable:** WorkspaceService, workspace open / close events, `workspace.entityId` context key, persisted-layout reload on workspace open, lock-state stub (real KEK lands in Phase 8).

**ADRs:** ADR-403; ADR-501 referenced but not implemented.

**Open items:** O53–O56, O98 (lifecycle reset matrix).

**Exit:** open a mock workspace → context keys emit; layout persists across reopen; close → all workspace-scoped services reset per the matrix.

## Phase 5 — Editor area + resource URIs

**Status:** Complete.

**Goal:** editor mechanism lands before any concrete editor type.

**Deliverable:** EditorService (recursive split-tree `EditorLayoutNode`: `group | split`; groups + tabs with `open / close / splitGroup / moveTab` lifecycle; auto-collapse of empty groups when >1 group exists); `EditorArea` walks the tree recursively, splits render as CSS flex with fixed 0.5 ratio; `EditorGroup` tab strip with HTML5 drag-and-drop, routes resource URI to a renderer; built-in `placeholder://` scheme + `PlaceholderEditor`; three commands wired (`editors.openPlaceholder`, `editors.splitRight` = `ctrl+\`, `editors.closeActive` = `ctrl+w`); `editor.activeResource` context key synced on every change.

**ADRs:** ADR-404.

**Open items:** O73–O77 (unchanged); O108–O112 added — see Phase 5.5.

**Exit:** open two placeholder editors side-by-side via Command Palette + keybinding; drag tab between groups (HTML5 D&D); close last tab in a non-sole group → group auto-collapses; close all → editor area empty hint shows; `editor.activeResource` reflects focused tab in context-key snapshot. Verified live in Electron via Chrome DevTools Protocol on `localhost:9333` (agent-browser).

### React-19 re-render pattern (caveat captured)

Initial implementation used `[, tick] = useState(0)` + `tick(n => n + 1)` in `useEditorState` / `useEditorGroup` and read live data via `editor.getGroup(id)` during render. Tabs did not appear after `open()` despite `getGroups()` reflecting the new tab.

Fix: store the snapshot in state (`const [group, setGroup] = useState(() => editor.getGroup(groupId))`) and call `setGroup(editor.getGroup(groupId))` from the `onDidChange` listener — same pattern as every other hook in the codebase.

Caveat: the initial Phase-5 summary blamed React 18 concurrent mode for "silently dropping" `tick(n => n + 1)` updates. **That diagnosis is not load-bearing and should not be cited going forward** — `setState(n => n + 1)` does re-render under both React 18 and React 19. The actual root cause was probably mount-order / subscription-timing: the listener was set up after the first emit fired, or the live-read pattern depended on a Map ref that mutated in place. The new "snapshot in state" pattern is correct regardless, captures identity at subscription time, and is the canonical style — keep using it. Do not reintroduce the `[, tick]` pattern.

## Phase 5.5 — Editor UX parity polish (trimmed)

**Goal:** close the highest-value UX gaps between "Phase 5 functional" and "feels like VSCode" before Phase 6 mechanism layers on top. Deliberately narrow — anything that needs a new mechanism, new persistence path, or open-ended event surface is deferred to the Phase 12 polish pass (see below). 5.5 is paint + one tiny correctness fix + the two interactions that hurt most when missing (split-clones-active, keyboard tab cycle).

**Already landed during the Phase-5 review pass:**
- `.editor-group--focused` CSS rule (previously applied as a class with no matching selector → focused group was invisible). Active-tab styling sharpened: active tab matches editor surface, inactive tabs sit on darker strip bg, accent stripe uses `--color-accent` for focused-group / `--color-fg-muted` for unfocused-group.
- `EditorService._emit` snapshots `[...this._listeners]` before iterating, to keep synchronous re-subscription inside a listener from mutating the Set mid-iteration.
- `EditorService.setActiveTab(groupId, instanceId)` added — tab click handler now addresses by instance ID, not resource string. Fixes the bug where clicking a duplicate-resource tab activated the first match instead of the clicked one.
- `editors.openPlaceholder` command appends a per-session counter (`placeholder://new-tab-1`, `-2`, …) so repeated invocations create distinct tabs instead of tripping `open()`'s resource-dedup branch.
- Tab cursor + close-button cursor switched to `pointer`. Tabstrip pinned to `min-height: 30px` so close-last-tab does not cause layout jump.

**Remaining (trimmed scope):**
- **Split clones active editor.** `editors.splitRight` currently creates an empty group. Match VSCode: after `splitGroup`, if the source group had an active tab, `open(sameResource, { groupId: newGroupId })` so the split lands with the active editor mirrored side-by-side. If no active tab, the new group stays empty.
- **Dirty dot in tab.** `EditorInstance.isDirty` field already exists. Render a `•` in the close-button slot when `isDirty && !hover`; reveal `×` on hover. No new state, no new API — pure render-time + CSS hover swap.
- **Keyboard nav: Ctrl+Tab / Ctrl+Shift+Tab cycle within focused group.** Two new platform commands (`editors.nextTab`, `editors.previousTab`) + keybindings. Within-group only; cross-group nav deferred to Phase 12.
- **Refactor: extract `_removeTabFromGroup(groupId, instanceId)` private helper** — `close()` and `moveTab()` currently duplicate the collapse / focus-reassign logic. Mechanical, no behaviour change.

**ADRs:** ADR-404 (no normative change; UX-polish-only).

**Open items added (404-range):**
- **O108** — Editor service event granularity. Single `onDidChange` re-renders every consumer on every mutation. VSCode's editor service has per-axis events (`onDidAddGroup`, `onDidActiveEditorChange`, `onDidChangeGroupModel`). Decide between (a) split-emitter API now, (b) version-number selectors, (c) defer until Phase 12 when a real bundle dogfoods the editor.
- **O109** — `editor.activeResource` context-key scrubbing for ADR-407. Currently `''` for `placeholder://` URIs. Once real schemes land (`patient://abc-123`, `session://...`), the value will contain PHI-adjacent IDs and **must** appear on the Phase 9 audit-payload scrub list. Tracked alongside O95.
- **O110** — Tab dedup policy. `open(resource)` currently dedups by resource-string equality. The placeholder counter is a temporary workaround; decide if a `forceNew` option, a `pinned` flag, or a richer key (resource + view-state hash) is the right shape before any real editor opts in.
- **O111** — Split-ratio persistence. Phase 5 hard-codes `ratio: 0.5`. Once O108 ships per-axis events and split-divider drag lands (Phase 12 polish), persist ratio per workspace via the Phase 4 layout-persistence path.
- **O112** — Tab context menu surface. Right-click, middle-click-close, pin/unpin, "close others / close to the right / close all". Belongs to the command + context-key spine (ADR-406/407); waits on the command-menu mechanism scheduled with Phase 12 polish.

**Exit:** focused group visually distinct from unfocused (✓); active tab visually distinct from inactive (✓); split clones active editor into new group; dirty dot appears in tab when `isDirty`; Ctrl+Tab cycles forward within group, Ctrl+Shift+Tab cycles backward; `close()` and `moveTab()` route through the shared `_removeTabFromGroup` helper.

**Explicitly deferred to the Phase 12 polish pass** (see Phase 12 below): drag preview / drop indicator, split-divider drag handle + ratio persistence, tab context menu, Alt+1..9 group switch, Ctrl+PgUp/PgDn alias, `_insertSplit` defensive short-circuit (low-impact correctness, no behaviour delta until a malformed tree shows up).

## Pre-Phase-6 gate — 100-range amendment pass

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
- **O113** — Manifest schema hardening: zod schema, signature/integrity policy, bundle-id namespacing rules, prod packaging path. Currently `validate()` is hand-rolled and JSON-parser permissive. Lands with the first third-party bundle work or Phase 12 polish, whichever comes first.

**Open items remaining:** O65 (host hardening surface — partially staged, full deny set in Phase 6.5), O68 (activation timing — `lazy` / `onCommand` / `onEvent` triggers in Phase 6.5).

**Exit (verified live via agent-browser CDP 9333):**
- ✓ `echo.ping` `echo` returns `{ pong, hostPid, ts }` — Renderer → Main → Bundle Host two-hop confirmed.
- ✓ Handler-throw (`crash` method) surfaces as `[cap.handler_threw] echo.ping requested-crash` to the Renderer; host process keeps running.
- ✓ Fatal in-host throw (`fatal` method) takes down the host process; workbench keeps running; subsequent `echo.ping` call returns `Bundle inactive: echo-test` (mapped through `cap.handler_threw` for now — proper code passthrough is part of O113).
- ✓ `shutdownHost()` deactivates each bundle then exits Bundle Host cleanly.

**Known follow-ups (tracked):**
- Code-mapping in routing handler: today the inner `cap.not_found` from `invokeBundleCapability` is reflattened to `cap.handler_threw` by the registry. Cleaner mapping lands with Phase 6.5 alongside O68.
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
- **O138** — Side bar / Panel slot iframe mounting. Mechanism identical, separate wiring + manifest contribution points (`contributes.views.sidebar`, `…panel`) and per-slot bridge events. Lands **Phase 9.0** (first clinical-bundle phase that needs a sidebar view).
- **O139** — Crash placeholder UI for orphaned iframes after Bundle Host crash. The renderer keeps the iframe DOM intact post-crash; pending `cap.call` promises hang. Replace with a timeout-aware placeholder ("view inactive — bundle host crashed"). **Phase 9.0**.
- **O140** — Full `view.activate(viewId, ctx)` lifecycle hook in bundle (ADR-411 §View lifecycle step 6). Phase 7 stubs activation at the renderer/Main boundary only; the bundle's Node code is unaware a view exists. First clinical view phase implements. **Phase 9.0**.
- **O141** — `events.onResize`, `events.onResourceChange`, `notifyDirty`, `notifyTitle`, `announce` (a11y live region). Land when first view actually needs each. **Phase 9.X**.
- **O142** — `ThemeTokens` typed surface on `window.soamView.theme`. Phase 7 ships raw CSS-variable record; typed object lands when RuEdit / clinical views need named-token access. **Phase 7.5**.
- **O143** — Tighten view CSP `script-src` / `style-src` — Phase 7 allows `'unsafe-inline'` for ergonomics; refine alongside O81 once first non-test bundle ships a real view. **Phase 9.X**.

**Why this lands at Phase 7 trimmed:**
- Editor-Area-only mount surface is sufficient to prove the mechanism end-to-end; sidebar/panel use the same code path with extra slot plumbing (deferred to first real consumer per [[feedback_scope_discipline]]).
- A11y patterns, declarative views, and full event surface land alongside real bundle views, not against a synthetic test bundle.

**Exit:** met.
- ✅ `developer.bundles.openEchoView` opens a sandboxed iframe in the Editor Area; bridge initialises and round-trips a capability call.
- ✅ Theme swap and dark-mode toggle propagate CSS variables into the iframe.
- ✅ Iframe cannot reach `window.soam`, `window.parent.document`, `window.top.location`, `require`, or `process`.
- ✅ `pnpm exec tsc -b` clean across renderer, main, preload, bundle-host.

## Phase 7.5 — RuEdit core skeleton

**Goal:** ship the platform's editor primitive — `@ru-soam/editor` (RuEdit), a raw-ProseMirror surface analogous to Monaco-in-VSCode — so every later prose-bearing editor type (session notes, intake narratives, discharge summaries) and every clinical bundle composes the same engine. No clinical schema yet; foundation only.

**Trimmed scope** (anything that touches a registry capability, a paid tier, or open-ended block design is deferred — see open items below):

- New workspace package `packages/editor/` (`@ru-soam/editor`). Deps: `prosemirror-{model,state,view,transform,commands,keymap,history,schema-list,inputrules}`. MIT/BSD only. No Tiptap, no BlockNote, no Lexical.
- ProseMirror schema v1: `doc`, `paragraph`, `heading` (levels 1–3), `bullet_list`, `ordered_list`, `list_item`, `blockquote`, `horizontal_rule`, `hard_break`, `text`. Marks: `strong`, `em`, `underline`, `code`. Stable per-block `_id` attribute assigned by an `appendTransaction` plugin (UUID v4 in this phase; v7 revisit at O131).
- Versioned JSON envelope: `{ schemaVersion: 1, doc }`. `toJSON(handle)` and `fromJSON(json, schema)`. Schema-version mismatch raises a named recoverable error, never silent coercion.
- Imperative mount API:
  ```ts
  mountRuEdit(container: HTMLElement, opts: {
    initial?: RuEditDoc;
    readOnly?: boolean;
    onChange?: (doc: RuEditDoc) => void;
  }): RuEditHandle;
  ```
  `RuEditHandle` exposes `getDoc()`, `setDoc(doc)`, `focus()`, `dispose()`.
- Default keymap: history (Ctrl+Z / Ctrl+Shift+Z), list nav (Tab / Shift+Tab indent, Enter split), marks (Ctrl+B / Ctrl+I / Ctrl+U / Ctrl+`), heading shortcuts (Ctrl+1/2/3 toggle), hard-break (Shift+Enter), input rules for Markdown-style `#` heading + `-`/`*` bullet + `1.` ordered.
- Renderer-side React chrome wrapper `RuEditView` (in `apps/desktop/src/platform/ru-edit/`) per ADR-415: vanilla PM in a `ref`-mounted div; React owns chrome, never reaches inside content; uncontrolled-with-explicit-replacement pattern.
- Workbench primitive `IRuEditService` (`RuEditServiceId`) registered in `boot.ts`. Sibling to `EditorServiceId` — distinct concern: tabs/groups vs. rich-text instances.
- One developer command `developer.editor.openScratch` opening a `ru-edit-scratch://` resource. `EditorGroup` dispatches that scheme to `RuEditView`. Doc held in-memory; `onChange` dumps JSON to devtools.

**Deliverable:** clinician (or developer) opens scratch tab → types, indents lists, toggles marks, applies headings, undo/redo, save/restore JSON round-trip — all functional. Type-check + lint clean; agent-browser CDP 9333 verifies the demo end-to-end.

**ADRs:** ADR-414 (RuEdit primitive), ADR-415 (React/PM boundary). ADR-404 amended to reflect that prose-bearing editor types now compose RuEdit.

**Open items raised:**
- **O128** — SmartText engine (trigger char, phrase registry capability, placeholder navigation). Lands Phase 8 (renumbered alongside Phase 7.5; current "Phase 8 — Crypto" becomes Phase 9; downstream shifts by +1) — **or** keep crypto numbering and SmartText lands as Phase 7.6. Numbering policy decision deferred to the gate before SmartText work starts.
- **O129** — Custom atomic blocks (Vitals first, then Allergies / MedList / picklist). Lives in the phase after SmartText.
- **O130** — React-in-nodeView strategy revisit (vanilla DOM vs `@handlewithcare/react-prosemirror` / `@nytimes/react-prosemirror`). Decide at custom-block phase entry per ADR-415's recorded criteria.
- **O131** — Stable ID revisit (UUID v4 → v7 when per-block revision history lands).
- **O132** — Print pipeline (JSON → print-React → Puppeteer-in-Main → PDF, page templates, signature block). Lives in the phase after custom blocks.

**Open items deferred long-range:**
- **O120** — Voice dictation adapter interface (Web Speech / Dragon / Deepgram Medical).
- **O121** — Multi-clinician collab via Yjs + Cloud Backend awareness. Single-clinician-per-record is the assumption through the foreseeable phases.
- **O122** — Template authoring UI inside ru-soam.

**Exit:**
- `developer.editor.openScratch` opens a tab containing a working RuEdit instance.
- Typing, list indent/outdent, mark toggles, heading toggles, undo/redo all work via keyboard.
- JSON envelope round-trips across reload: serialize, store in `sessionStorage`, reload page, deserialize, content identical (including stable `_id`s on every block).
- Schema-rejected inputs (unknown node type, missing required attrs) fail loudly with a named error, not silent drop.
- Devtools heap snapshot before / after a mount + dispose shows no leaked `EditorView` (dispose-safe verified).
- `pnpm exec tsc -b` clean for both `apps/desktop` and `packages/editor`.

**Why this lands at 7.5 and not earlier:**
- Phase 6.5 hardens the Bundle Host so a misbehaving editor-bearing bundle does not crash the workbench.
- Phase 7's view hosting is the surface inside which iframe-hosted editor-type views will mount RuEdit at the first clinical-bundle phase.
- RuEdit itself is renderer-trust code in the workbench shell; the first scratch demo could run earlier in principle, but the first *clinical* RuEdit instance requires both 6.5 and 7 to be load-bearing.

## Phase 8 — Crypto + KEK + workspace lock / unlock

**Goal:** PHI gate lands before any patient / session schema goes near disk.

**Deliverable:** KEK derivation, workspace unlock UI, KEK relock command, encryption-at-rest primitives (key handling, envelope format, table-level encryption hooks ready for Phase 9), "KEK locked" StatusBar entry live, PHI capability calls refused while locked.

**ADRs:** ADR-301 (crypto), ADR-303 (KEK / recovery; recovery UX lands Phase 11), ADR-403 (lock state).

**Open items:** crypto-domain open items (300-range; tracked in the ADRs).

**Exit:** force-restart → must unlock to access PHI; relock works mid-session; cold storage of the still-empty PHI tables shows ciphertext only; lock state is a context key consumed by when-clauses.

## Phase 9 — Local Store + audit log + TanStack Query data wiring

**Goal:** capability-backed data flow real; audit spine in place; encryption-at-rest applied from the first write.

**Deliverable:** SQLite-backed Local Store in Main, change-event capability, TanStack Query invalidation bridge, one demo capability that reads/writes a non-sensitive table (e.g., user preferences). Audit log capability: append-only store, redaction discipline (no PHI-adjacent context keys in audit payloads), every capability invocation that should audit, does.

**ADRs:** ADR-302 (Local Store), ADR-403 (workspace settings cascade), ADR-407 (PHI-adjacent key scrubbing), ADR-412, ADR-502 (audit infrastructure; viewer bundle ships Phase 12).

**Open items:** O55, O97, O100, O95 (context-key scrub list).

**Exit:** prefs survive restart; mutation invalidates query; demo proves the pipeline without touching PHI; audit table records every audited capability call; redaction verified by test.

## Phase 10 — Sync queue + cloud mirror

**Goal:** local-first writes propagate; conflict policy committed.

**Deliverable:** outbound sync queue, server-side mirror endpoint, conflict resolution per ADR-302 policy, sync-state StatusBar entry.

**ADRs:** ADR-302, ADR-304 (sync), ADR-305 (cloud transport).

**Open items:** 300-range sync items (tracked in those ADRs).

**Exit:** offline edit → reconnect → mirror converges; conflict surfaced in UI; cloud receives ciphertext only (structural enforcement per ADR-301).

## Phase 11 — Recovery + Onboarding + Settings surfaces

**Goal:** three of the four core Activity Bar items real (Recovery, Onboarding, Settings). Bundles surface lands here as the fourth.

**Deliverable:** Settings editor (built-in, not a bundle), Recovery flow (KEK recovery codes), Onboarding flow, Bundles surface (list installed, enable / disable, view manifest).

**ADRs:** ADR-405, ADR-303 (recovery UX).

**Open items:** O69–O72.

**Exit:** fresh install → Onboarding → workspace created → KEK set → recovery codes captured → Settings reachable; existing install → Recovery flow restores access from a recovery code.

## Phase 12 — Audit Viewer bundle (first first-party bundle) + editor polish pass

**Goal:** dogfood the whole stack with the only first-party bundle anchored in the ADR set (ADR-502). Audit Viewer is the forcing function that finally renders real bundle content inside the editor area — so this phase also picks up the editor UX items deferred from Phase 5.5, since they only start to bite once a non-trivial editor is actually being looked at.

**Deliverable:**
- Audit Viewer ships as a bundle (not built into the shell). Bundle manifest, activation, view hosted in the Primary Side Bar or Editor Area (decision in the bundle's design doc), reads audit store via capability, respects redaction.
- Editor polish items deferred from Phase 5.5 (land alongside, prioritised against Audit-Viewer-specific gaps surfaced during dogfooding):
  - Drag preview + drop indicator (`editor-tab--dragging` class on `dragstart`, `editor-group--drop-target` outline on `dragenter`, insertion indicator between tabs). Likely co-evolves with the O108 event-granularity decision.
  - Split-divider drag handle on `editor-split-divider` — mouse-drag to resize, snap at min widths. Resolves O111 (ratio persistence via the Phase-4 layout path).
  - Tab context menu surface (right-click, middle-click-close, pin/unpin, "close others / close to the right / close all"). Resolves O112; depends on the command-menu mechanism this phase needs anyway for the Audit Viewer's row actions.
  - Cross-group keyboard nav: Alt+1..9 (jump to group N) + Ctrl+PgUp/PgDn (alias for within-group cycle already shipped in 5.5).
  - `_insertSplit` defensive short-circuit (stop recursing once the target group is found; cleanup that pays off once split-divider drag exercises the tree more aggressively).

**ADRs:** ADR-502, ADR-405, ADR-411 (Audit Viewer); ADR-404 amendment if O108 lands here.

**Open items:** any audit-viewer-specific items raised when the bundle is designed; O108 / O111 / O112 resolved or formally re-deferred during this phase.

**Exit:** Audit Viewer activates on demand, runs in the Bundle Host, renders in a sandboxed iframe, reads only through capabilities, has no privileged path back to the renderer. Editor area drag-drop shows preview + drop indicator; split dividers are draggable and ratios persist per workspace; tab right-click opens a context menu; Alt+N switches groups.

## Cross-cutting workstreams

These run alongside the phases, not in sequence with them.

### Product-scoping doc (Open Item O72)

Owner: product, not architecture. Must land **before Phase 13** (first product bundle beyond the Audit Viewer). Defines the first-party bundle catalogue (Patients / Sessions / Calendar / Tasks / Library / etc.) with anchored sources for each.

### Theme token catalogue (Open Item O107)

Grows phase by phase as new surfaces appear. Freeze for v1 before any third-party theme bundle is invited in.

### Documentation discipline

Each phase that lands new mechanism updates the corresponding ADR's Open Items list — items resolved are struck through; new items uncovered are appended. ADRs remain the source of truth; the implementation plan does not duplicate their content.

### Security review cadence

After Phase 7 (view hosting), Phase 8 (crypto), Phase 9 (audit), and Phase 10 (sync), a focused security pass on the just-landed surface. PHI never reaches cloud in plaintext is the load-bearing invariant; each pass re-verifies it structurally, not by inspection.

## What this plan deliberately does not cover

- Specific product features (Patients, Sessions, Calendar, etc.). Owned by the product-scoping doc.
- Multi-tenancy / clinic expansion. Deferred to post-503 per ADR-501.
- Telemetry, error reporting, update channel. Drop into a later phase when the feature surface stabilises.
- The exact engineering breakdown of each phase (sprints, tickets, owners). Belongs in the project tracker, not in architecture documentation.
