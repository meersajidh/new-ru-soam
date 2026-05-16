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

## Phase 6.5 — Bundle Host follow-ups (lazy activation + hardening)

**Goal:** close out the deferred Phase 6 items so Phase 7's `view://` work has a hardened, lazy-activating host underneath it.

**Scope:**
- **Lazy activation triggers (O68).** `lazy` (first capability bind) and `onCommand` (first execution of a manifest-declared command id). `onEvent` waits for a concrete event surface (deferred again if no consumer needs it yet).
- **Host hardening (O65).** Default-deny for `electron`, raw `fs`, raw `net`, `child_process`, `process.exit` mutation outside the host loader. Concrete shape: a curated globals shim + module-resolution wrapper inside `electron/bundle-host/index.ts`. Verify by trying each from the `echo-test` bundle and asserting failure.
- **Cap-error code passthrough.** Registry routing should preserve the inner `cap.not_found` / `cap.handler_threw` codes from the host instead of re-wrapping. One-line behaviour change in `loader.ts` + a small switch in `registry.ts`.
- **Per-bundle Output capture stub.** Route Bundle Host stdout / stderr into a per-bundle in-memory ring buffer (UI lands Phase 7 with the Panel content model); Main exposes a `platform.bundles@1.0 getOutput(bundleId)` capability so a Phase 7 view can render it.

**Open items:** O65, O68.

**Exit:** lazy bundle does not load until first command invocation; host-side `import('electron')` from a bundle throws; cap error codes match end-to-end; `getOutput('echo-test')` returns the bundle's stderr from the latest `fatal` call.

## Phase 7 — View hosting: `view://` + iframe + bridge

**Goal:** bundles render UI in a sandboxed iframe.

**Deliverable:** `view://` protocol handler in Main, sandbox + CSP applied, bridge surface (`bindCapability`, lifecycle events, theme snapshot, resource snapshot), theme propagation to the iframe document root. Test bundle ships a view that calls its own capability through the bridge.

**ADRs:** ADR-411.

**Open items:** O78–O85.

**Exit:** test bundle view opens in the Editor Area and in the Panel; theme swap propagates to the iframe; the iframe cannot reach `window.soam`, the renderer ServiceRegistry, or `require('electron')`.

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
