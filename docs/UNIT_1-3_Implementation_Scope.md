# Unit 1–3 Implementation Scope — version entry · notification subsystem · update alerts

**Status:** Planned, not started. Carry-forward for a fresh session (no `/resume`).
**Date:** 2026-05-24
**Owner planning:** Opus (lead). Implementation → `implementer` subagent per CLAUDE.md orchestration.
**Prereqs DONE:** Release/update A.1 (CI pipeline) + A.2 (Cloudflare R2 distribution + website) shipped & verified live (v0.1.1 baseline on `dl.ru-soam.com`). See `memory/project_release_update_workstream.md`.

This doc pre-writes the three implementer briefs so work can resume cold. Read order for a fresh session: project `CLAUDE.md` → `memory/MEMORY.md` → `memory/project_release_update_workstream.md` → this file.

---

## Why these three units

User wants: (a) app version shown in the status bar, and (b) the old app's notification/alert subsystem ported into the new repo. Investigation (this session) decomposed that into three dependency-ordered units. **Decision locked: full-parity notification port.**

**A.3 mapping:** the original release-workstream "A.3 (UI surfacing)" = **Unit 3 only**. Unit 2 is a *prerequisite* that turned out to be the reserved Phase-9 `NotificationService` (shell work, not release work). Unit 1 is a small sibling add-on.

```
Unit 1 (version entry, standalone) ─┐
Unit 2 (NotificationService, Phase 9) ─┼─→ Unit 3 (update alerts + what's-new modal = release A.3)
```
U1 feeds U3's modal (version source); U2 feeds U3's alerts (push target). Build U1 + U2, then U3. Recommended start: Unit 1 (smallest, validates the version-source decision early).

No new ADRs required — ADR-412 commits `NotificationService`, ADR-409 the status-bar bell, ADR-204 §8 the what's-new modal. Two things to log as Open Items at implementation time (see each unit).

---

## Verified architecture facts (don't re-derive)

- **StatusBarService** — `apps/desktop/src/platform/statusbar/statusbar-service.ts`. `register / update(id, patch) / getEntries(region) / onDidChangeEntries`. 250ms per-entry rate-limit. `StatusBarEntry` fields: `id, region('left'|'right'), priority, text, tooltip?, command?, visible, icon?, iconSize?, severity?('ok'|'warning'|'error'), badge?, scope?('always'|'workspace')`. Higher priority = closer to the corner (left region: leftmost; right region: rightmost).
- **Anchored entries** — `apps/desktop/src/platform/statusbar/anchored-ids.ts` (`ANCHORED_ENTRIES[]`). Already contains `workbench.notifications` (right, priority 100, icon `bell`, iconSize 15, `badge: 0`, visible true) — **wired to no command, badge never updated**. Also `workbench.dev-mode` (good pattern reference for a static-ish entry).
- **StatusBar part** — `apps/desktop/src/workbench/parts/StatusBar.tsx` (+ `StatusBar.css`). `EntryNode` already renders `badge` (when `>0`) and renders a `<button>` running `commands.execute(entry.command)` on click when `command` is set. `ICON_MAP` maps icon names → lucide components (add new names here if a new icon is used). **No StatusBar.tsx change needed** for the bell wiring — only data (register command on the entry + update badge).
- **Service registry** — `apps/desktop/src/platform/services/registry.ts`; ids in `apps/desktop/src/platform/services/ids.ts`; hooks in `apps/desktop/src/platform/services/hooks.ts` (`useService`, `useStatusBarEntries`, etc.). `NotificationServiceId` exists at `ids.ts:43` but typed `serviceId<unknown>` and **never registered**.
- **Boot** — `apps/desktop/src/workbench/boot.ts` registers core services + `ANCHORED_ENTRIES` and flips entry `visible` flags. New services + entry registration happen here.
- **Commands** — `apps/desktop/src/workbench/platform-commands.ts` registers `workbench.*` commands (e.g. `workbench.toggleDarkMode`). Add new commands here.
- **Persistence** — prefs capability surfaced in renderer via `apps/desktop/src/platform/data/use-capability.ts` + `store-events-bridge.ts`; usage example `apps/desktop/src/workbench/middle/PrefsDevPanel.tsx`. `lastSeenVersion` persists through this (verify exact prefs API at impl).
- **Update capability** — `platform.update@1.0`. Renderer bridge: `apps/desktop/electron/preload/soam.ts` (`soam.update.getState / checkNow / downloadNow / installAndRestart / getCopyInstallCommand / onChange`). Main: `electron/main/ipc/update-channel.ts` + `electron/main/updater/index.ts`. Event channel `SOAM_EVENT_CHANNEL`, event `platform.update.state-changed`. State types: `electron/shared/update.ts` (`UpdateState`, `UpdateStateChangedPayload`).
- **GAP — no app-version source in renderer.** `app.getVersion()` is NOT exposed (grep found none in `electron/main`). The updater `getState` only carries the *available update's* version, not the running version. Must add a version source (see Unit 1).
- **Bundled changelog** — `apps/desktop/changelog.json` (produced by `apps/desktop/scripts/build-changelog.mjs`, last 10 versions). Already bundled into the app via `electron-builder.yml` `files`. Used by the what's-new modal (Unit 3).

## Old-repo source map (the feature to port — Unit 2)

Old app at `/home/meer/Repos/msh/ru-soam` (OUTSIDE this repo; readable directly via absolute path with the Read tool — confirmed, no `/add-dir` needed).

- Store: `…/apps/desktop/src/shell/app/stores/notificationStore.ts` (74 LOC) — zustand. `Notification{id,severity,title,message?,timestamp,read,sticky,actions?}`; `Severity = 'error'|'warning'|'success'|'info'|'alarm'`; `NotificationAction{label,onClick}`. State: `notifications[]`, `toastIds[]` (max 3), `panelOpen`. Methods: `push(input)→id`, `dismiss`, `markRead`, `markAllRead`, `dismissAllRead`, `removeFromToast`, `togglePanel`, `closePanel`.
- UI: `…/apps/desktop/src/shell/app/regions/Notifications/` — `NotificationToast.tsx` (66), `NotificationPanel.tsx` (67), `NotificationItem.tsx` (71), `NotificationBell.tsx` (29), `index.ts`. **Port the toast + panel + item; drop the old `NotificationBell.tsx`** (the new bell is the anchored status-bar entry, not a standalone component).
- Old emitters (`ProfileSettingsPanel.tsx`, `useWelcomeCards.ts`) — those surfaces may not exist in the new repo. **Do NOT block on porting emitters**; Unit 2 ships the service + generic surfaces. Feature-specific emitters land with their features.

---

## UNIT 1 — App version status-bar entry

**Goal:** Show the running app version in the status bar.

**Decisions (locked):**
- Placement: **right region, `priority: 50`** (innermost — ambient, non-actionable; sits left of `workbench.notifications`@100 and `workbench.theme.darkMode`@1000-corner). Matches ADR-409 "right = global/behind-the-scenes".
- Entry: `id: workbench.version`, `region: 'right'`, `priority: 50`, `text: 'v<version>'`, no icon, `tooltip: 'Ru-Soam <version> — what's new'`, `scope: 'always'`, `command: 'workbench.showWhatsNew'` (registered in Unit 3; until then the command may be unregistered → click is a no-op, acceptable, or register a stub).
- **Version source:** expose `app.getVersion()` once and share it with Unit 3's modal. **Prefer adding a small preload bedrock surface** (mirror the existing `soam.lock`/`soam.workspace` shape), e.g. `soam.app.getVersion(): Promise<string>` backed by an `ipcMain.handle` calling `app.getVersion()` in Main. Avoid a Vite build-time define (the modal needs the runtime value). If a new `platform.app@1.0` capability is used instead of bedrock, **log an Open Item** (new capability = contribution-point per CLAUDE.md conventions).

**Scope (files):**
- `electron/main/` — add `app.getVersion()` IPC handler (place with the other platform handlers; follow `update-channel.ts` registration style or the bedrock handlers).
- `electron/preload/soam.ts` — add `app` bedrock surface (`getVersion`). Update the `Soam*` types + the exposed object.
- `apps/desktop/src/platform/statusbar/anchored-ids.ts` — add the `workbench.version` entry (initial `text: ''`, `visible: true`).
- `apps/desktop/src/workbench/boot.ts` — fetch version at boot, `statusBar.update('workbench.version', { text: 'v'+version, tooltip: ... })`.

**Success criteria:** App shows `v0.1.1` (matches `apps/desktop/package.json`) at the inner-right of the status bar; tooltip shows full name+version; `npm run compile -w ru-soam` + `lint` clean; visible in `just dev-desktop`.

**Watch out:** Renderer must never import `electron` (ADR-202) — version comes through `window.soam` only.

---

## UNIT 2 — NotificationService port (FULL PARITY) — completes Phase-9 reserved service

**Goal:** Port the old notification subsystem into the new renderer-service architecture (ADR-412), preserving old semantics behind a new service API; restyle surfaces to the new design system.

**Decisions (locked):**
- Full parity: service + toast stack (max 3, auto-expire) + notifications panel (flyout from the bell) + item (severity, actions, read/unread) + bell badge + read-management.
- `panelOpen` lives **in `NotificationService`** for now (port old semantics). **Log an Open Item:** future refactor of panel/flyout visibility into a generic UI/flyout service (boundary decision deferred).
- Service registry pattern per ADR-412 (NOT a zustand global). State owner = service; React subscribes via an `onDidChange` + a `useNotifications()` hook.

**Scope (files):**
- `apps/desktop/src/platform/notification/notification-service.ts` (new) — `INotificationService` + `NotificationService` impl. Port the store API: `push(input)→id`, `dismiss`, `markRead`, `markAllRead`, `dismissAllRead`, `removeFromToast`, `togglePanel`, `closePanel`, getters (`getAll`, `getToasts`, `isPanelOpen`, `getUnreadCount`), `onDidChange(listener)→dispose`. Reuse the `Notification`/`Severity`/`NotificationAction` types (port from old store).
- `apps/desktop/src/platform/services/ids.ts:43` — retype `NotificationServiceId` from `serviceId<unknown>` to `serviceId<INotificationService>`.
- `apps/desktop/src/platform/services/hooks.ts` — add `useNotifications()` (+ `useUnreadCount()` or fold into one) following the `useStatusBarEntries` subscribe pattern.
- `apps/desktop/src/workbench/notifications/` (new) — port surfaces restyled to new tokens/styling-system (`docs/Guides/styling-system.md`; invoke `frontend-design` skill): `ToastStack.tsx`, `NotificationPanel.tsx`, `NotificationItem.tsx` (+ CSS). Drop the old standalone bell.
- `apps/desktop/src/workbench/boot.ts` — register `NotificationService` under `NotificationServiceId`; subscribe to push unread count → `statusBar.update('workbench.notifications', { badge })`.
- `apps/desktop/src/workbench/platform-commands.ts` — register `workbench.notifications.toggle` → `notificationService.togglePanel()`.
- `apps/desktop/src/platform/statusbar/anchored-ids.ts` — add `command: 'workbench.notifications.toggle'` to the existing `workbench.notifications` entry.
- Mount `ToastStack` + `NotificationPanel` in the workbench shell (near `Workbench.tsx`; panel anchored to the bell / corner).

**Success criteria:** Bell shows live unread badge; clicking toggles the panel (flyout); `push()` adds a toast (auto-expiring, max 3) + a panel item; mark-read / dismiss / mark-all-read work; restyled to new design system; compile + lint clean; demoable via a temporary dev push (e.g. a dev command) in `just dev-desktop`.

**Watch out:** Renderer-internal state only (no IPC) — this is a pure renderer service per ADR-412. Match new design tokens, not the old app's CSS. `panelOpen` reset behaviour on workspace lock/unlock — `NotificationService` persists across workspace switches per ADR-412 (don't wire it to reset).

---

## UNIT 3 — Update-alert surfacing + what's-new modal (= release-workstream A.3)

**Goal:** Surface auto-update state to the user (ADR-204 §4/§5, ADR-409) and show a post-update changelog modal (ADR-204 §8), riding on Units 1+2.

**Scope (files):**
- `apps/desktop/src/platform/update/` (new) — renderer update binding: subscribe to `soam.update.onChange` (event `platform.update.state-changed`) → translate `UpdateState` (`available` / `downloading` / `ready` / `error`) into `notificationService.push(...)` calls + drive a status-bar alert. Map: available → info notification with "Download" action (`soam.update.downloadNow`); ready → success notification + "Restart to update" action (`soam.update.installAndRestart`); Linux ready → show `getCopyInstallCommand()` (guided install, ADR-204 §5). Use existing `soam.update` bridge.
- Status-bar update alert — either reuse `workbench.notifications` severity/badge, or a dedicated transient entry; keep ≤ small. (ADR-409 alert surface.)
- What's-new modal — `apps/desktop/src/workbench/whats-new/` (new): on boot, read current version (Unit 1 source) + persisted `lastSeenVersion` (prefs capability); if `current > lastSeenVersion`, load entries in range `(lastSeenVersion, current]` from bundled `changelog.json` and show a modal; on dismiss persist `lastSeenVersion = current`.
- `apps/desktop/src/workbench/platform-commands.ts` — register `workbench.showWhatsNew` (opens the modal on demand; also the `workbench.version` entry's click command from Unit 1).

**Success criteria:** A simulated update state change surfaces a notification + status-bar indicator with working actions; on version bump the what's-new modal shows the new version's changelog once and not again after dismiss; `workbench.version` click opens it; compile + lint clean.

**Watch out:** Renderer never calls `electron-updater` directly (ADR-102/202) — only via `soam.update.*`. Modal must work offline (bundled `changelog.json`, no network). Version compare must handle the prerelease suffix.

---

## Open Items to log at implementation time
- Panel/flyout visibility → generic UI service (Unit 2 `panelOpen` boundary). Deferred.
- If Unit 1 uses a new `platform.app@1.0` capability instead of preload bedrock → log it (new contribution point).

## Verification (no automated test suite)
Per `CLAUDE.md`: `npm run compile -w ru-soam && npm run compile -w @ru-soam/editor`, `npm run lint -w ru-soam`, then dogfood with `just dev-desktop`. Use the `agent-browser` skill for Electron dogfooding if needed.
