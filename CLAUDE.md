# Project Intelligence

<!--
  USAGE NOTES FOR OPUS (lead agent)
  ──────────────────────────────────
  This file is your persistent memory and the primary cache asset for the
  project. Both you and every Sonnet subagent load it on every invocation —
  so anything stable and reusable belongs here.

  After a significant design decision, add a one-line entry to the
  Architecture Log below — decisions only, not per-task or per-PR narrative.
  If nothing durable was decided, no entry. Conventions, code, and ADRs
  already capture implementation detail.
-->

---

## Project Overview

**Name:** ru-soam

**Purpose:** Local-first Electron workbench for mental-health practitioners. PHI never reach cloud in plaintext (ADR-301). VSCode-style composition shell — most features ship as bundles (capabilities + contributions) not core code. MVP tenancy = Individual practitioner (ADR-501); Clinic proposed (ADR-503).

**Stack:**

- Electron 41 (main + preload + renderer + fp-host = four processes / trust zones — ADR-101, ADR-410, ADR-418). Pinned at 41 in Phase 10a — `better-sqlite3-multiple-ciphers@12.9.0` no compile against Electron 42 V8 14 API. Bump re-evaluated when SQLCipher lands in 10b (O157).
- React 19 + React Compiler, TanStack Router (file-based, generated `routeTree.gen.ts`), TanStack Query
- Tailwind v4 (`@tailwindcss/vite`) with CSS class-based theming (palette × luminance × font-set axes — ADR-413)
- ProseMirror (in `@ru-soam/editor`, RuEdit primitive)
- Vite for renderer, main, preload, fp-host bundles (four `vite.*.config.ts`)
- TypeScript ESNext, ESM-only, `strict`, `verbatimModuleSyntax`, `erasableSyntaxOnly`
- pnpm workspaces (`nodeLinker: hoisted` in `pnpm-workspace.yaml`); `just` for dev recipes; `electron-builder` for packaging (reverted to pnpm — ADR-204 Amendment 3; hoisted gives the flat real-dir node_modules needed for correct native-module packaging on Windows, without pnpm's default isolated linker)

**Entry points:**

- Renderer: `apps/desktop/src/main.tsx` → `App.tsx` → `Workbench.tsx`
- Main: `apps/desktop/electron/main/index.ts`
- Preload: `apps/desktop/electron/preload/index.ts` (exposes `window.soam` — ADR-202)
- FP-Host: `apps/desktop/electron/fp-host/index.ts` (Node process spawned on demand — ADR-410, ADR-418; renamed from `bundle-host` O450)
- Dev: `just dev-desktop` or `pnpm --filter ru-soam dev`

---

## Repository Layout

```
/
├── apps/
│   ├── desktop/                   # Electron workbench (the product)
│   │   ├── electron/
│   │   │   ├── main/              # Main process: window, security, IPC, capability host
│   │   │   ├── preload/           # window.soam capability bridge (ADR-202)
│   │   │   ├── fp-host/           # FP-Host Node process (ADR-410, ADR-418)
│   │   │   └── shared/            # IPC + host protocol types (renderer↔main↔host)
│   │   ├── src/                   # Renderer (React composition shell — ADR-102)
│   │   │   ├── platform/          # services, command, context-key, keybinding,
│   │   │   │                      # theme, font, layout, statusbar, workspace, ru-edit
│   │   │   ├── workbench/         # Parts: TitleBar, Banner, Middle (5 slots), StatusBar
│   │   │   ├── routes/            # TanStack Router (file-based) + routeTree.gen.ts
│   │   │   └── styles/            # tokens.css, palette CSS, workbench.css
│   │   ├── bundles/               # First-party bundles (e.g. echo-test, echo-lazy)
│   │   └── vite.{main,preload,fp-host,config}.ts
│   └── web/                       # Placeholder (not yet implemented)
├── packages/
│   └── editor/                    # @ru-soam/editor — ProseMirror-based RuEdit primitive
├── docs/                          # ADRs/, Proposals/, Guides/, References/, Product/, Implementation_Plan.md, Open_Items.md
├── server/                        # Placeholder
├── justfile                       # `just dev-desktop`
├── pnpm-workspace.yaml            # pnpm workspaces + nodeLinker: hoisted + allowBuilds
└── package.json                   # workspaces: apps/* + packages/*
```

---

## Conventions

> **ADR-first.** Before any design, architecture, or planning activity,
> check `docs/ADRs/` for relevant decisions (ranges in `docs/README.md`).
> ADRs are the source of truth for specific designs — this file holds only
> the top-level invariants needed at all times.

### Code style

- TypeScript ESNext, ESM only. `strict`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `noUnusedLocals/Parameters`, `noFallthroughCasesInSwitch`. No emit (Vite handle bundling).
- Prettier (root `.prettierrc`): 2-space indent, single quotes, semicolons, trailing comma `all`, print width `100`, `endOfLine: lf`, `bracketSpacing: true`, `arrowParens: always`. JSX use double quotes.
- ESLint flat config (`apps/desktop/eslint.config.js`): `@eslint/js` recommended + `typescript-eslint` recommended + `eslint-plugin-react-hooks` + `eslint-plugin-react-refresh` (vite). `dist/` globally ignored.
- React 19 + React Compiler enabled via `babel-plugin-react-compiler`. No pre-memoize what compiler memoize; write idiomatic React.
- Tailwind v4 with `@theme {}` tokens in `apps/desktop/src/styles/tokens.css`. Use generated `bg-*` / `text-*` / `font-*` utilities, not inline `style={{...}}` for theme-able values.

### Naming

- File names: `kebab-case.ts` for modules, `PascalCase.tsx` for React components. Test files (when exist): `*.test.ts`.
- Service identifiers: branded `ServiceId<T> = { readonly _t: T; readonly id: string }` (O96 resolved Phase 2). Suffix DI tokens with `ServiceId` (e.g. `ThemeServiceId`, `FontServiceId`).
- Command ids: `<bundleId>.<verb>[.<noun>]` (platform commands use `workbench.*` namespace — ADR-406).
- Context keys: dotted, lowercase. Base-reserved namespaces (`workbench.*`, `editor.*`); domain-reserved namespaces (`patient.*`, `record.*`) — base/domain split per ADR-106. Bundles may not write to reserved namespaces.
- ADR files: `ADRs/NNN-kebab-case-title.md`; ranges defined in `docs/README.md`.

### Error handling

- Renderer is composition shell, not authority owner (ADR-102). Errors from capabilities surface as typed rejections through `window.soam.*` — propagate to TanStack Query / calling Part; no swallow.
- FP-Host (or any future untrusted Bundle-Host) crash must NOT take down Renderer (ADR-410, Phase 1 exit). Treat host calls as remote: timeouts, typed errors, no shared memory assumptions.
- Disposable pattern (`docs/Guides/disposable-pattern.md`) is cleanup convention across platform — return `IDisposable` from anything subscribe / register / spawn.

### Imports / module boundaries

- **Renderer must never import `electron`** or any node built-in. Cross-zone access go through `window.soam.*` capabilities only (ADR-202).
- **No `<webview>` and no direct `BrowserWindow`** outside `electron/main/window-factory.ts` (ADR-201). Bundle UIs render through sandboxed iframe + `view://` bridge (ADR-411).
- **Brokered networking only** — no direct `fetch` from Renderer to third-party origins; use `app://` protocol or capability wrapping it (ADR-203).
- Workspace package imports: use `@ru-soam/editor` (alias from `packages/editor` via pnpm workspace, dep `workspace:*`), not relative paths into `packages/*`.
- TanStack Router: file-based routes in `apps/desktop/src/routes/`. Regenerate with `pnpm --filter ru-soam route-gen` after add/rename routes. No hand-edit `routeTree.gen.ts`.
- Any architectural change (new trust-zone crossing, new contribution point, new protocol scheme, new persisted shape) requires ADR or Open Item entry — see `docs/README.md` and `docs/Open_Items.md`.

### UI / styling

- UI/UX work: invoke the **`frontend-design`** skill.
- All styling rules (layer order, tokens, type scale, `@apply` policy,
  `@reference` target, BEM naming, review checklist) live in
  `docs/Guides/styling-system.md`. Follow it.
- Architectural changes to the styling system require an ADR.

---

## Test Command

No automated test suite yet. Verify changes with type-check + lint:

```bash
# Type-check the whole workspace (project references via tsc -b)
pnpm --filter ru-soam compile && pnpm --filter @ru-soam/editor compile

# Lint the desktop app
pnpm --filter ru-soam lint

# Smoke-run the app (dogfood verification — Implementation_Plan.md uses
# "you can open the app and see X work" as the exit criterion for each phase)
just dev-desktop
```

---

## Skills & search-tool selection

### Always-on skills (main thread)

- **caveman** — keep output terse; drop articles, filler, pleasantries.
- **agent-browser** — reach when task needs Electron/browser
  automation or dogfooding.

### On-demand skills

- **frontend-design** — invoke only when scope touches UI components, pages,
  visual design.
- **ast-grep** — invoke per search-tool decision rule below.

### Search tool selection — `grep` vs `ast-grep`

Choose by query shape, not habit:

- **Use `grep`** for literal-string matches: known identifiers, error
  messages, import paths, file names, URL fragments. Anything paste
  between quotes.
- **Use `ast-grep`** moment query depends on code structure:
  - "all calls to X with N+ args" / "X called as second arg of Y"
  - "every `useState<T>(...)` where T is non-primitive"
  - "all `ipcMain.handle` registrations" (handlers may be registered via
    helpers, dynamic strings, chained calls `grep` will miss)
  - "every `switch` statement missing `default` case"
  - any rename or refactor where AST node type matters

If answer to "would `grep` match wrong things or miss syntactic
variants" is yes, `ast-grep` is correct tool. Default to `grep` for
speed; reach for `ast-grep` deliberately when query crosses
structural-vs-textual line above.

### Subagent dispatch

Use `subagent_type: implementer` (defined at `~/.claude/agents/implementer.md`)
for all implementation delegation. Agent system prompt bakes in
skill-activation rules above, so briefs no need repeat them — pass
only task-specific Goal / Scope / Constraints / Success criteria.

## Architecture Log

<!--
  DECISIONS ONLY — one line each: what was decided + the ADR / Open-Item / guide that
  OWNS the detail. NO build or PR receipts, NO "BUILT/DONE/runtime-unverified" status,
  NO per-rung/per-slice journals — the ADR, the committed code, and the per-workstream
  memory file are the home for that. If an entry needs more than ~2 lines it belongs in
  an ADR / Open-Item / memory, not here.
  When a multi-step workstream LANDS + commits, COLLAPSE its per-step entries into ONE
  pointer line (decision + ADR + [[memory]]); do not leave the build narrative here.
  Reusable operational traps go in Dev Gotchas below, not here.
  This file loads into context EVERY session — every stale line is paid for repeatedly.
-->

- **Orchestration:** Opus plans + reviews; Sonnet (`implementer`) builds. Thin briefs (intent + scope + success criteria); agent reads codebase. Process → Orchestration Protocol below.
- **Styling:** policy in Conventions → UI/styling + `docs/Guides/styling-system.md`; architectural changes need an ADR.
- **Two-axis architecture (the frame for everything):** trust zones (ADR-101: Main→Preload→Renderer→Bundle-Host) ⟂ layers (ADR-106: base/domain/extensions). Orthogonal. Guide: `docs/Guides/architecture-two-axes.md`.
- **ADR-106 base/domain (+Am1 extensions):** base = `basebench` (`@basebench/*`) ← domain = `ru-soam` bundles ← extensions = third-party; one-way dep, lint-enforced. Deferred: O194 (extract base pkg), O195 (Layer-field sweep), O196 (brand→`basebench` rename).
- **ADR-418 trust tiers + PHI invariant (CORE):** First-Party-Host (trusted; binds PHI caps incl. *returns*; NO keys) vs untrusted Bundle-Host (PHI caps structurally denied; the 2nd untrusted host = deferred rung-H). `electron/fp-host/` = the FP-Host (MVP). UI sandbox for ALL bundles. **PHI invariant: keys/decrypt/ciphertext Main-only; PHI plaintext only in Renderer + FP-Host.** `trustClass` platform-assigned by provenance, never self-declared. Detail → ADR-418.
- **ADR-506 domain module model (SUPERSEDES ADR-504) + store contract (CORE):** Main = pure `basebench` (no domain code); a domain module = first-party FP-Host bundle, command logic in FP-Host, persists via generic base store caps. **Authoring rule for NEW modules: CQRS-explicit (`bindQuery`/`bindCommand`, `cap.kind_mismatch`) + FP-Host-resident + manifest-declared (ownedTables/migrations/queryTemplates/residency/dependencies) from the start.** Sole-writer Main-enforced via declared table ownership. Validation: structural→Main schema, domain-value-vocab→FP-Host. **Store ABI:** `store.write`/`store.query`; predicate-scoped `deleteWhere`/`updateWhere` (equality-AND, PRAGMA-validated cols, non-empty-predicate guard, caller-supplied audit `recordId`, `store.changed`); erase = `deleteWhere({patient_id})` cascade. PHI tables `residency:'protected'` (KEK-wrapped `protected-store.db`, opened-on-unlock; operational `local-store.db` holds prefs/`audit_log`, PHI-free — ADR-452). **Protected blob store** (file PHI): `blob.write@1.0` (phi+command), `storage_ref=blob:<id>`, sibling KEK-wrapped key, erase unlinks blobs before row cascade. Deferred: O445 dep-graph, O441 trustClass-tag, O451 cap-transport, O26 KEK-rotation, O461 blob DEK-envelope, O462 blob read/view. Detail → ADR-506/302/307/452 + [[project_adr506_migration]] + [[project_o452_phi_at_rest]].
- **View / iframe contract (CORE, reusable):** bundle UIs = sandboxed opaque-origin iframes. Slots via manifest `viewContainers` (`location:"primary"|"auxiliary"`) + `panel.views` + `views[]`. Bridge `window.soamView` verbs (`openInEditor`/`focusAspect`/`setOverviewViewMode`) + context channel. **Context-following view (aux / overview / panel) = `kind:'context'` entityId; pinned editor tab (safety-plan, intake) = URL `?id=`.** Shared injected seam `window.__viewBoot` (awaitBridge/applyTheme/applyCodicons/parseQuery). **PHI-touching bundle actions = renderer-domain commands (`src/domain/bootstrap.ts`), never host commands** (ADR-417). Cross-iframe nav via renderer-mediated bus (`view-focus-bus.ts`). Tokens injected from `tokens.css`+theme files; Inter Tight inlined (`view-fonts.ts`), CDN fonts CSP-blocked. View-specific reads must ride `context` (replayed on load), not `init`.
- **Practice Activity — BUILT + committed (P0–P5 + record CRUD + view-layer, tree clean):** roster + Client record (Overview editor + contextual aspects). Clinically-safe spine through P5 = Risk/Safety (banner+aspect+`safety-plan` tab, MHA-2017 §23 reasoned-disclosure flow) + People/Circle + Consent/Legal + Documents (protected blobs) + workflow layer (Intake checklist + Attention lens, pure read-derivation). Tables `patients`/`patient_profile`/`patient_lifecycle`/`patient_circle_member`/`patient_consent_state`/`patient_risk_event`/`patient_safety_plan`/`patient_document`, all `protected`; audit PHI-free (ADR-502). **NEXT = P6 projections + overlays (O464), BLOCKED on Schedule/Sessions Activities.** Detail → ADR-505 (+Am1–4) + `docs/Activities/practice/` (IA + build-plan) + [[project_practice_ia_workstream]].
- **ADR-417 menus + keybindings:** `menus`/menu-id registry/renderer-owned `IMenuService`/`keybindings`; renderer↔iframe context-menu channel; `usePopover` primitive. Detail → ADR-417.
- **ADR-413 Am1 icons = VS Code Codicons:** `<Icon>` font in shell, inline-SVG in iframes; `src/platform/icons/` = single swap point. Detail → ADR-413 Am1.
- **Activity/Aspect taxonomy (O418):** Aspect = uniform view primitive (Navigation vs Contextual by slot); Activity = top-level surface. Catalogue → `docs/Product/Product_Scope.md` (O72/O197).
- **Per-Activity design method = journal+promote:** journal in `docs/Activities/<name>/`; settled → ADRs, open → Open-Items.
- **Cloud Backend (Phase 11a) — LIVE + committed; PARKED:** identity service on Cloud Run `asia-south1` (`https://identity-797916105958.asia-south1.run.app`): Google ID-token verify → auto-register `accounts` → KMS-signed RS256 session JWT + 30d-sliding hashed-refresh rotation → PHI-free telemetry `POST /v1/events` (requireSession RS256; 3-mode `cloud.telemetryMode` default-off DPDP; ADR-312 two-tier base/domain, domain deferred). Client `electron/main/cloud/`: hold-pending→commit-on-KEK, proactive silent rotation, account soft-delete (`status`/`deleted_at`, `account_deleted` event). **Invariants: account_id never client-asserted; events PHI-free `{event_type,device_id,app_version}`; refresh-token at rest only as KEK-wrapped `cloud-session-token`; node-first (app self-sufficient, Google contacted once at signup). Two independent token systems — System A (identity/our-server) vs System B (Google provider tokens Calendar/Meet, OS-keychain, Flow-A). Identity-mismatch gate on reconnect (Main-side, unspoofable).** Deferred: 11b sync (O23 LWW), O468 90d-purge job, O476 System-B consent. Detail → ADR-311 (+Am1/Am2)/312 + [[project_cloud_backend_workstream]].
- **Schedule + Sessions Activities (design LOCKED; Schedule P0 + P-A + P1 Slice-1 F1 residency refactor + Sessions P1 Slice-2 store + Slice-3 identity resolver + Slice-4a auto-link sync + Slice-4b triage panel + multi-cal slices 1–3 nav redesign ALL COMMITTED through 2026-06-20):** NOT a calendar app — calendars = *providers*. **Schedule = storeless UI over provider** (owns no tables; `CalendarProvider` port, Google = adapter#1); **Sessions = the only persistence = Client Meeting** (clinical subset; a client appointment = a *link* not a move; field-partitioned sync, no LWW, orphan-on-delete; `MeetingProvider` port Meet/Zoom). Identity resolution via `record.patient.resolveParticipant` (authority = Practice). **PHI = ADR-301 as destination not wall:** absolute vs OUR cloud; interim consented default-off gradient vs user's OWN provider + **PHI Safety Score** engine. P0 = Google Calendar read-only BUILT (`bundles/ru-soam-schedule` + `electron/main/calendar/`; `calendar.provider@1.0` phi:true lock-gated). **P-A UI BUILT** = calendar as **editor work-area pinned tab** (`nav.html` opener stub → `schedule.html`): work-header + 4 views (**Week/Day time-grid** `HOUR_H`===CSS `--tg-hour-h`, all-day strip, now-line, lane-packed overlaps, scroll-to-7AM; Day+Agenda centered 780px card; Agenda 3-col; Month 130px) + 6 states + **selection via `setSelection()` class-toggle, NOT `renderCalArea()` (a rebuild re-runs the rAF scroll-to-7AM = scroll-jump-on-click bug — don't regress)** + chips (modality icon + organiser-preferred participant) + **modal detail popover** (backdrop scroll-lock + viewport clamp/flip + copy-link [clipboard→`execCommand` fallback, since opaque-origin sandbox blocks clipboard API] + participants w/ you/organiser tags; title via textContent = PHI-safe). **Data: O488 adapter-extension partially pulled forward** — `CalendarEvent` + `google-adapter.ts` map optional `location`/`meetingLink`/`organizer`/`attendees` (Google API already returned them); PHI-safe (rides existing `phi:true` lock-gated cap → renderer is a trusted PHI peer, read-only, no new trust crossing). **Editor-tab `description` (no-ADR renderer/UI):** `EditorService.updateTab` (immutable + idempotent) + `EditorGroup` render + new `soamView.setTabDescription` view-bridge verb (mirrors `setOverviewViewMode`, resolves via `BundleViewIframe.instanceId`) → tab "Schedule" + muted per-view descriptor. **Platform codicon set extended** (`electron/main/fp-host/view-codicons.ts` — ADR-413 Am1, real @vscode/codicons paths: copy/link/layers/close/warning/debug-disconnect/globe/clockface). **Still INERT til P1/O485:** classification/client-linking/needs-linking. **NOT built:** P-B real nav + `ScheduleViewStateService` channel, P-C panel triage, P-D statusbar PHI score. **Sessions P1 Slice-2 (store) BUILT** = new `ru-soam-sessions` FP-Host bundle (zero Main TS; ADR-506 authoring rule): `client_meeting` table (`protected`, SQ-2 shape fixed) + CQRS caps `sessions.meeting.query`/`sessions.meeting` (phi:true) + standalone Sessions Activity (read-only "Upcoming Meetings" list; manual-create form dropped — real creation = provider sync). `patient_id` = plain col, **no cross-bundle FK** → cross-bundle DPDP erase gap = O490. **Sessions P1 Slice-3 (identity resolver) BUILT** = `record.patient` (Practice = identity authority, zero Main TS) gains query `resolveParticipant({email?,phone?,name?}) → {outcome:'match'|'candidates'|'none'|'suppressed'}` + `getAliases`, commands `addAlias` (confirm→alias enrich) + `suppressParticipant` (exclude); 2 new protected tables `patient_identity_alias` (PHI, patient-keyed, erase-cascaded) + `participant_suppression` (sha256-hashed `kind:value` only, no patient_id/plaintext, **excluded from erase cascade** — survives client erase by design); audit enum-only; resolver returns clientIds only; **ADR-313 opt-in NOT enforced here** (gate = upstream provider read, slice 4); unsalted hash MVP-acceptable (KEK-encrypted store). **Sessions orchestration deferred to slice 4.** **Sessions P1 Slice-4a (provider-origin auto-link sync) BUILT + live-verified on real Google Calendar 2026-06-18:** `sessions.meeting.sync` consumes cross-bundle `schedule.calendar.query.listEvents` + `record.patient.query.resolveParticipant` (**cross-bundle host→host sanctioned** — loader `registerRoutingHandlers` registers all bundle caps in Main registry w/ host-forwarding handler, first-party `phi:true` gate passes; deps declared in manifest). Pull now→+90d → per-event participants resolve → **single distinct `match` ⇒ auto-link** via shared `linkEvent` upsert keyed on `provider_event_id` (insert=`linked`/re-pull=`reconciled` TIME-SNAPSHOT ONLY, kind/status local-authoritative = field-partitioned no-LWW); **window-scoped** orphan flag (never delete); ambiguous/none/suppressed → **transient `needsLinking[]` report to renderer, NEVER persisted** (no non-client PII at rest). "Sync now" button + orphaned affordance. **Sessions P1 Slice-4b ("Needs Linking" triage panel) COMMITTED 2026-06-18 (`18ab656`):** Sessions `panel.view` (`needs-linking.html`, `when:workspace.activeId`, priority 90) renders the transient `needsLinking[]` from last `sync` (own Refresh button re-runs sync; **nothing persisted**); per-participant actions confirm→`record.patient.addAlias`+`sessions.meeting.linkProviderEvent` / promote→`record.patient.create`+link / exclude→`record.patient.suppressParticipant`. New `linkProviderEvent(event,clientId)` validates client via `record.patient.query.get` + reuses shared `linkEvent` (audit `{source:'provider',via:'triage'}`); `linkEvent` now origin-tolerant (`event.id ?? event.providerEventId`) + optional `auditDetail`; `sync` entries carry `meetingLink`. Cards removed by `providerEventId` not array index (concurrency-safe). **Renderer view-bridge binds NOT gated by host dep list** → no new manifest command-dep. Shell `icon-registry` += `link`. All event/participant text via `textContent` (PHI-safe). Verified: panel registers + iframe mounts + bridge up + auto-sync renders all-linked/empty clean on real calendar; card-render + 3 mutating actions code-reviewed (queue closure-private, no in-window unmatched event to stage). **§6 classification colors+badges COMMITTED 2026-06-19 (`2620f39`):** 5-state render-time classify (CLIENT green/PROBABLE amber-dotted/EXCLUDED muted/PERSONAL info-blue/UNCLASSIFIED), view-side derive in schedule.html (binds `sessions.meeting.query`+`record.patient.query` direct — view-bind not manifest-gated, dodges Schedule→Sessions host cycle). **P-B nav (trimmed) BUILT 2026-06-19** = `ScheduleViewStateService` channel (mirrors O455 overviewViewMode: service+id+boot+`BundleViewIframe` push/handler+`soamView.setScheduleViewState` verb) + `nav.html` (activity title month/year, connection block, calendars-from-events w/ swatch+toggle, view-buttons dropped) + schedule.html channel-consume (view+`calVisibility` filter, header switcher round-trips); compile/lint green, code-reviewed, NOT runtime-dogfooded — **SUPERSEDED same-day by multi-cal redesign.** **MULTI-CAL DESIGN COMMITTED (SD-20, 2026-06-19), NO CODE YET:** user lifted the storeless invariant — **Schedule now OWNS tables** (was an incremental stance, not permanent), residency=protected, event-cache DEFERRED (live-fetch v1). 2 ADRs (Draft): **ADR-314** = broker **account-keyed** grants `{providerType, externalAccountId}` (was provider-keyed single-grant), Main-only, identity **broker-discovered** (unspoofable, never bundle-asserted); **System A (identity) ≠ System B (provider)** even at same Google address. **ADR-507 Am1** = overrides §1 storeless for 2 `protected` tables `provider_account`+`calendar` (events stay un-cached/live-fetched); `CalendarProvider` port becomes **account-aware** (`authenticate→ProviderAccount` via Main broker, `listCalendars(accountId)`, `listEvents(accountId,calendarIds,range)`). **Calendar = a handle** (stable local row → `{account_id, provider_calendar_id}` + user name/color/`selected`); **Connect ≠ Add**; `calendar.selected` replaces P-B localStorage `calVisibility`. Canonical spec = `docs/Activities/schedule/schedule-multical-spec.md` (model/tables/port/revised CQRS caps/event-identity/6 slices). **Cross-bundle O493** = Sessions link-key must qualify by (`external_account_id`,`provider_calendar_id`,`provider_event_id`) — coordinate ADR-508 + O490 BEFORE linking multi-acct events; don't change ADR-508 key unilaterally. **MULTI-CAL SLICES 1 + 2 COMMITTED + DOGFOODED 2026-06-19:** **Slice 1 (O492, broker account-keying)** = `credential-broker.ts` keyed by `{providerType, externalAccountId}` via the existing credentialStore `ref` dimension (NO `CredentialType` union change); `grant` does broker-internal account-discovery (Google `calendars/primary`→`id`=email=externalId, Main-internal fetch NOT apiHosts-gated) + returns `{ok, account:{externalId,email,displayName}}`; `status/revoke/getValidAccessToken/clearToken` + `net.brokeredFetch` FetchArgs gain optional `accountId`; legacy single-grant migration (idempotent: refresh-if-expired→discover→re-key→drop legacy; leaves-as-is on fail = forces re-grant); `credentials/index.ts` += `listRefs` (prefix-slice, dot-safe email refs). Backward-compat: no-`accountId` callers resolve the single account (>1 ⇒ null). **Slice 2 (O494, Schedule data) ADDITIVE — keeps P0 caps + Sessions runnable:** `ru-soam-schedule` manifest += `residency:protected`/`ownedTables:[provider_account,calendar]`/migration-v1 (exact spec §2)/7 queryTemplates/`store.write+store.query` deps; adapter += `providerType:'google'` + 5 account-aware methods (`authenticate`/`getAccountStatus`/`disconnectAccount`/`listCalendars`/`listEventsForCalendars`) + shared `mapEvent`; index.mjs += registry + 5 query (`listAccounts`/`listAddedCalendars`/`listProviderCalendars`/`getAccountStatus`/`listAggregatedEvents`) + 6 command (`connectAccount`/`disconnectAccount`/`reconnectAccount`/`addCalendar`/`updateCalendar`/`removeCalendar`). Store-writes in index.mjs (adapter = pure port); audit detail PII-free (`{providerType}`/`{}`); `connectAccount` upserts by external id; `listAggregatedEvents` remaps provider-cal-id→local `cal_<uuid>` + attaches `color`; `selected=0` filters out. **Dogfood (real Google Calendar, CDP):** slice-1 migration verified (account-keyed `…token.sajid.rusoam@gmail.com`, zero legacy keys); slice-2 full path connect→listProviderCalendars(3 live, readOnly mapped)→addCalendar×2→listAggregatedEvents(remap+color)→update(selected/rename/recolor)→remove all green; `disconnect/reconnect` code-reviewed not live-fired (avoids 2nd consent + leaving acct disconnected). **DEV NOTE: host caps callable from TOP renderer** — `await window.soam.bindQuery|bindCommand('cap','1.0')` → `.call(method, arg0, arg1)` **positional, NOT array-wrapped** (first-party+unlocked passes phi:true; bind auto-activates lazy bundle); no opaque-iframe websocket needed. Residual dev DB: 1 account + 1 calendar seed. **MULTI-CAL SLICE 3 (O495, nav redesign) COMMITTED + dogfood-verified 2026-06-20 (`668d957`):** full multi-cal sidebar (`nav.html` rewrite) — CALENDARS colored-tick list (toggle → `updateCalendar(selected)` → calRev refetch) + title-row codicon buttons (`open-in-window` reopen aggregate tab + `add` open wizard) + FILTER BY CLASSIFICATION (5-state live counts via new non-persisted `ScheduleCountsService` relay + `classFilter` on `ScheduleViewState`, client-side visibility no-refetch) + **bottom-pinned ACCOUNTS section** (connected = `active` highlight, disconnected = dim+unchecked calendars; right-click Disconnect/Reconnect/Delete, **no inline buttons**) + per-cal right-click **Edit/Delete/Reconnect** (manifest `menus` `ru-soam-schedule/{calendar,account}/context` + renderer-domain cmds in `src/domain/bootstrap.ts` via `window.soam` POSITIONAL + `bumpScheduleCalRev`) + per-row `email / calendar` tooltip + cal/acct rows share classif hover/active. **Add-calendar wizard = `calendar-setup.html` work-area tab** (connect → choose account → pick provider calendar [dedupe, Primary/Read-only badges] → name + 10-swatch color → `addCalendar`; edit-mode `?mode=edit&id=` reuses name+color → `updateCalendar`). `disconnectAccount` now also unchecks the account's calendars (`selected=0`); new `deleteAccount` = **full forget** (broker `revoke` best-effort → cascade-delete calendars → delete account row; audit PII-free). **Organiser-hash fix** (`mapEvent`): secondary/holiday calendars return a resource-id `organizer.email` (`@group.calendar.google.com`/`@group.v.calendar.google.com`/contains `#`) → show calendar name, drop hash. `view-codicons.ts` gains multi-path + `fill-rule` entries + `open-in-window` glyph. `view-bridge` += `setScheduleCounts` + `requestContextMenu` 5th `contextOverrides` (validated plain-primitive obj in `BundleViewIframe`; blast-radius = own menu visibility, same precedent as `editor/title/context`). **Per-cal scoped tabs DROPPED in-session** (checkbox overlay supersedes — editor-tab color-dot infra [`EditorInstance.color`, `EditorGroup` dot, view-bridge/iframe color] + `schedule.html` `?id=cal_*` scope filter all reverted; do NOT reintroduce). **3 cap-call conventions:** index.mjs/adapter internal = ARRAY-wrapped (`storeWrite.call('delete',[...])`); renderer-domain `window.soam` + view `soamView` = POSITIONAL. **O493 (cross-bundle link-key) BUILT + dogfood-verified 2026-06-20 (NOT committed):** `client_meeting` += `external_account_id`+`provider_calendar_id` (migration v2 = 2 ALTER + composite index); link key now `(provider_id,external_account_id,provider_calendar_id,provider_event_id)` (ADR-508 Am1). Sessions `sync` source migrated `listEvents`→`listAggregatedEvents` (now multi-cal, follows SELECTED calendars — events from an un-added primary stop syncing). `linkEvent` = full-triple lookup → **legacy-NULL backfill-upgrade** (pre-O493 bare-event-id rows filled in place, no dup) → insert; reconcile fills NULL qualifiers. Orphan pass = composite-key compare + **selected-cal guard** (de-selected/removed calendar's rows NOT orphaned). Schedule `listAggregatedEvents` stamps `providerCalendarId` (captured PRE local-handle remap) + `externalAccountId` per event. `schedule.html` classify unaffected (uses only `provider_event_id`). **Dogfood (2 Google accounts, shared invite ⇒ same event id on both calendars):** → **2 distinct `client_meeting` rows** (same `provider_event_id`, diff `external_account_id`; pre-O493 collapsed to 1), reconcile no-dup, synthetic client+meetings cleaned up. Compile+lint green. **NEXT = O490** (cross-bundle DPDP erase cascade — `client_meeting.patient_id` plain col, no FK, roster-erase doesn't cascade) BEFORE prod; then slice 6 (event cache+sync, MS/Apple/CalDAV [O486], writes [O483/ADR-313 ramp]). Slices: ~~1 broker-keying [O492]~~✓ · ~~2 tables+port+caps [O494]~~✓ · ~~3 nav redesign [O495]~~✓ (absorbed 4 classifications [O491] + 5 context-menu) · ~~O493 link-key~~✓ · 6 later. Deferred folded: O488 aux detail slot, O489 one-click Join, O487 Sessions notes, O490 erase cascade (close before prod). Detail → ADR-313/314/507(+Am1)/508 + `schedule-multical-spec.md` + [[project_schedule_sessions_workstream]].
- **Release / update (ADR-204 +Am1–3, ADR-308):** `electron-updater` reads `latest*.yml` from Cloudflare R2; NSIS (Win) + `.deb` (Linux), roll-forward. Native packaging: pnpm `nodeLinker: hoisted` — **NEVER** isolated linker, **NEVER** `pnpm deploy`, keep `npmRebuild:false`. Detail → ADR-204 Am3 + [[project_release_update_workstream]].
- **ESM build gotcha:** main + fp-host need a `createRequire` banner in `vite.{main,fp-host}.config.ts` (bundled CJS `require('fs')` throws in ESM). Don't switch main to CJS.
- **"Account" = UI label; `workspace` = base mechanism term:** visible strings say "account"; internal `workspace.*` identifiers unchanged (ADR-106). Full rename = O196.
- **No-ADR renderer-only features:** resizable Parts (LayoutService + `ResizeHandle`, persisted via `prefs`); Activity-Bar density pref (localStorage).
- **`__viewQuery` — query-core data layer for iframe views (platform seam, Schedule-proven, COMMITTED 2026-06-20):** `@tanstack/query-core` bundled to an injected IIFE (`window.__tanstackQueryCore`) + thin cap-agnostic wrapper `window.__viewQuery` (`observeQuery({queryKey,queryFn,staleTime})` → QueryObserver `{subscribe,refetch,getCurrent,destroy}`; `runMutation({run,optimistic,invalidateKeys})` optimistic-flip+rollback+invalidate; `invalidate(key)` prefix-match). Injected inline via `view-protocol.ts` after `__viewBoot` (`view-query.ts` wrapper + generated `view-query-vendor.ts` via `scripts/gen-view-query-vendor.mjs` = Vite IIFE lib build, **`mode:'production'`+`define` mandatory** else `process` undefined in sandbox). Key convention `[capNamespace, op, ...args]` (mirrors shell `tanstack-query-keys.md`). **Per-iframe client (dies on remount — NOT an O438 cross-remount fix).** PHI stays in iframe (no new crossing). `calRev` channel = the view-tier invalidation trigger (iframes get no `store.changed`). Proven on `schedule.html` (events, `staleTime:5min`) + `nav.html` (cal/acct reads `30s` + optimistic toggle). **CRITICAL vanilla-query-core LESSON (dogfood-found, applies to ALL `observeQuery` consumers incl. O497 rollout): `QueryObserver.subscribe(listener)` does NOT replay current state to a new listener.** A cached-FRESH query (within `staleTime`) triggers no mount fetch → no state change → the listener NEVER fires → the view hangs forever on its loading spinner. The wrapper MUST emit the current result once on subscribe (`observer.updateResult(); cb(observer.getCurrentResult())`) — `view-query.ts` does this. (React's `useSyncExternalStore` reads `getCurrentResult` for the initial snapshot; vanilla must do it by hand.) **Corollary trap:** a short `staleTime` MASKS this bug (mount always refetches → state changes → listener fires) — so `staleTime` tuning interacts: schedule events use `5min` so active view-switching serves fresh cache (single render, no refetch, and no double-run of the expensive `runClassifyPass` per-event cross-bundle `resolveParticipant`). Verify both: revisit a warmed range → spinner must clear (no hang) AND `client.getQueryCache().subscribe` fetch-count must be 0 within the window. Rollout to other views = O497.
- **Schedule window-cache + client-side visibility (built on `__viewQuery`, COMMITTED 2026-06-20):** events are fetched ONCE per **month-grid window** (6-week span enclosing the anchor's month) via a new FP-Host query `schedule.calendar.query.listWindowEvents(from,to)` (= `listAggregatedEvents` but loads `calendar.list` = ALL added calendars, not `calendar.listSelected`). Query keyed by window bounds, NOT view → Day/Week/Month/Agenda at offset 0 all share one fetch (view-switch resets offset → same anchor month → cache hit, no Google call). Render filters the superset CLIENT-SIDE: visible-range (`eventsForDay` per-day) ∩ **calendar-visibility** (`_calVisibility` map from `listAddedCalendars`) ∩ classFilter. **Calendar toggle = client-side only:** `calRev` handler re-reads `listAddedCalendars`, diffs the added-SET vs the selected-FLAGS — selected-flag change → `renderCalArea` + recount (NO fetch, was a 2-3s Google refetch); added-set change (add/remove/connect) → `__viewQuery.invalidate(['schedule.calendar','windowEvents'])` to refetch (NOT destroy+reload — that reuses the still-fresh cache and misses the new calendar's events). `runClassifyPass` runs ONCE per window fetch (cached on event objects, reused across view-switches). `listAggregatedEvents` stayed selected-only (Sessions `sync` depends on it) — **as of slice 6 below it now reads the cache, still selected-only via `event.listForWindowFiltered`.** Counts reflect the visible range, not the whole window. This is the in-session fetch optimization. Tech-stack-of-bundle-views ADR = O496 (query-core forward-compatible w/ either outcome). Detail → `view-query.ts`.
- **Schedule persistent event cache + incremental sync (O495 slice 6 — BUILT + DOGFOOD-VERIFIED + COMMITTED 2026-06-20 `e486dfc`):** cross-session half of the window-cache. **Live-verified on real Google Calendar:** full-sync (235 rows), true incremental delta (real add+delete → exactly 1 upsert/1 deletion, not full re-pull), cache+token survive restart, shape parity, organizer hash-fix, calendar-delete cascade — all green. **Bug found+fixed mid-dogfood:** adapter full-sync `orderBy:'startTime'` made Google suppress `nextSyncToken` → incremental degraded to full-pull; FIX = drop `orderBy` (sort is client-side). 410-resync code-reviewed only (can't force token-expiry on demand). **ADR-507 Am2** authorises a `protected` `event` table (reverses Am1 "events un-cached"; **read-only ⇒ no LWW, O23 stays closed**). `ru-soam-schedule` migration **v2** = `event` table (UNIQUE on O493 triple `external_account_id,provider_calendar_id,provider_event_id`) + `calendar` sync cols (`sync_token`/`last_synced_at`/`sync_status`/`sync_window_min`). Adapter `syncEvents(extAcctId,provCalId,{syncToken?,timeMin?})` = full-list-bounded-by-`timeMin=now−3mo` (no token) / incremental delta (with token) / `410 Gone`→`{code:'sync.token_expired'}`→wipe-token-full-resync / `status:'cancelled'`→deletions[]; reuses `mapEvent` (organiser-hash fix preserved at WRITE time). Command `syncEvents` (all added calendars: insert→`updateWhere`-on-UNIQUE upsert, cancelled-delete, token bookkeeping, PHI-free audit). **`listWindowEvents`+`listAggregatedEvents` BOTH FLIPPED to read the `event` cache** (`mapEventRow` ≡ live shape incl. O493 triple+color; live Google now reached ONLY inside `syncEvents`) — single source of truth (DECIDED, NOT the plan's "leave live" default). **Sessions `sync` ordering (ADR-507 Am2):** fires cross-bundle `schedule.calendar.syncEvents` BEFORE `listAggregatedEvents` (offline-tolerant try/catch → stale cache on fail); Sessions manifest gains `schedule.calendar@1.0` dep. Cascade-delete `event` rows on removeCalendar/disconnectAccount/deleteAccount (disconnect also clears sync_token). schedule.html: `triggerBackgroundSync` on activate/connect/added-set-change → on-change `__viewQuery.invalidate(['schedule.calendar','windowEvents'])`. Compile+lint green. **O498 CLOSED (committed `250d910`, dogfood-verified 2026-06-20):** prune via queryTemplate `event.listStaleIds` (`SELECT id WHERE start<@cutoff`) + delete-by-PK loop (no new base primitive; `deleteWhere` stays equality-only) + full-sync `timeMax=now+365d` (syncToken-compatible) + 2 robustness fixes — **query-first upsert** (`event.getByProviderTriple`→exists?update:insert) replaces fragile insert-catch-UNIQUE string-match; **await-no-effect** fixed at root (adapter `syncEvents` `@returns` needed `Promise<>` wrapper, was overriding async inference). Re-sync idempotent + prune-clean verified; prune stale-DELETE code-reviewed only (can't stage >90d rows). Plan: `docs/Activities/schedule/event-cache-plan.md`. Detail → ADR-507 Am2 + [[project_schedule_sessions_workstream]].
- **Schedule PHI ramp — read-half (O483, P-D Safety Score) BUILT + DOGFOOD-VERIFIED 2026-06-20 (UNCOMMITTED):** closes the read side of ADR-313's consented-gradient. **ADR-313 Am1** locks the metric (resolves SQ-7/O483 scale): **0–100 "% PHI kept local"** computed in the **Sessions FP-Host bundle** (owns `client_meeting`; output = PHI-free aggregate). `readOptIn=false → 100`; `readOptIn=true → max(0, 100 − round(60·E/max(M,1)) − (writeOptIn?40:0))`; `M`=provider-origin linked meetings, `E`=those whose provider event still names the client (**v1 `E=M`**, no opaque-write path yet); weights `60/40` = the one tunable; deviation flag = `readOptIn‖writeOptIn`. **PHI-read opt-in = pref `sessions.calendarPhiReadOptIn` (default-off, `cloud.telemetryMode` precedent), audited via `prefs.set` auto-audit.** **The gate is a POLICY two consumers honor, not one call site:** Sessions `sync` short-circuits to the empty shape `{linked:0,reconciled:0,orphaned:0,needsLinking:[]}` when read-off (before any `syncEvents`/`listAggregatedEvents`/`resolveParticipant`), **AND** Schedule §6 classify (`schedule.html` `runClassifyPass`) reads `sessions.meeting.query.getPhiReadOptIn` per-pass + skips `resolveParticipant` → all `unclassified` when read-off (fails-closed). New caps: query `getPhiReadOptIn`/`getSafetyScore`, command `setPhiReadOptIn(bool)`; `prefs@1.0` manifest dep; audit enum `sessions.phi_read.opted_in/out` reserved. **P-D chrome = SHELL-ONLY (no iframe view-state channel):** `workbench.phi-safety` status-bar entry (`anchored-ids.ts`, `scope:'workspace'` → hides on lock, prefetches score on mount so the chip shows the number) + `usePopover` consent popover (`PhiSafetyPopover.tsx`, mirrors `WorkspaceSwitcher`; score+posture+honesty line+working PHI-read toggle; PHI-write row disabled = O499) + renderer cmd `workbench.phi-safety.show`. Honesty rule binds copy ("Accountable, not compliant — N meetings carry identifying detail," NEVER affirmative "compliant"). **Dogfood (real Google Calendar, CDP):** default-off→100; read-off `sync` empty + no provider read; opt-in→`sync` reads provider (13 needsLinking, 0 persisted); promote 1→client+`linkProviderEvent`→M=1→**score 40**; opt-out→empty+100; temp data erased. **Bug found+fixed mid-dogfood:** popover `fetchScore` bound `sessions.meeting` (command cap) not `sessions.meeting.query` → `cap.kind_mismatch`→blank chip; one-line cap-id fix (reusable: a query method via `bindQuery('<x>.meeting',…)` instead of `'…meeting.query'` binds OK but `.call` throws CQRS kind-check). **Accepted review calls:** read-off blanks ALL classification incl. already-linked (clean consent-off; rows still in Sessions list); score counts orphaned rows as exposure (more honest). **Write-half deferred → O499** (calendar write-back + PHI-write opt-in + the `writeOptIn=true`/`E<M` paths; factors pre-reserved). Detail → ADR-313 Am1 + design-log SD-24 + [[project_schedule_sessions_workstream]].

### Dev Gotchas (operational, reusable)

- **Full `just dev-desktop` restart required after Main / FP-Host / manifest changes.** Renderer HMR + Main-only restart leaves the fp-host running stale module-cached code → command/contribution appears unregistered. Clean restart fixes. (Hit repeatedly during ADR-406/417 verify.)
- **HMR doesn't swap boot-instantiated singletons.** Editing a registered service's interface (e.g. adding `LayoutService.getSizes`) while dev runs throws `X is not a function` at consumers until a full boot — HMR swaps component modules, not the singleton. Renderer full-reload or restart fixes.
- **Document-level drag over an iframe needs a drag-shield.** A mid-drag cursor over a bundle iframe makes it swallow the parent's `document` mouse events (stalls resize). Fix: append a full-viewport transparent `position:fixed;inset:0;z-index:99999` div on mousedown, remove on mouseup/cleanup.
- **Sandboxed iframe fonts need `font-src view:` in the page's own `<meta>` CSP** (the injected VIEW_CSP allows it but the page meta didn't). Local `@font-face` over `view://` only — iframe must NOT reach the renderer's Google-Fonts CDN (ADR-203). Shared font hosting → O422.
- **Sandboxed-iframe (opaque-origin) subresources must be SAME-HOST or inlined — never `view://_platform_/…` cross-host.** A bundle iframe is `sandbox="allow-scripts allow-forms"` (no `allow-same-origin`) → **opaque origin**. A **cross-host** `view://_platform_/foo.js` subresource fetch is intermittently blocked by Blink (`Unsafe attempt to load URL … Domains, protocols and ports must match`) — flaky per HTTP-cache/timing. Symptom (2026-06-01): moving the codicon helper to `view://_platform_/codicons.js` made `overview.html`'s top-level `window.codicon(…)` throw when the load was blocked → whole view IIFE aborted → **blank record**, never recovers. Same rule hits `@font-face url('view://<bundleId>/fonts/…')` (same-host → usually OK, but still logs the violation from an opaque origin; cosmetic — O422). **Fix: inject bridge + codicons INLINE** via `view-protocol.ts` `injectBridgeAndCsp` (`<script>…source…</script>`; CSP `script-src 'unsafe-inline'` already set; sources must be `</script>`-free) — no fetch, deterministic, available before the page's body script. Don't reintroduce `<script src="view://_platform_/…">`.
- **`Unsafe attempt to load URL view://…/<view>.html from frame with URL <same>` is COSMETIC — do NOT re-chase (O438).** It's the sandboxed iframe's own **main-document load** of a `standard` `view:` scheme from an **opaque** origin (`allow-scripts allow-forms`, no `allow-same-origin`) tripping Blink's `canDisplay`; the load **succeeds** (handler returns 200, view renders). NOT fonts, NOT a self-referencing subresource, NOT a real fetch failure. Intrinsic to ADR-411; not removable without breaking the PHI sandbox or bundleId-origin isolation. Prod logs it verbosely per load on cold HTTP cache; ignore.
- **Dev iframe-mount / `view:` fetch counts are ×2 inflated by `<StrictMode>` (`main.tsx:12`) — dev-only, no-op in prod.** When probing remount/fetch storms, halve dev counts for the prod estimate. To pin a real remount storm, add a temp mount-counter in `BundleViewIframe`'s main effect (`window.__viewMounts.push(...)` — readable via CDP since it runs in the parent `app://` renderer, not the cross-origin iframe) + a `[view:FETCH]` log in `view-protocol.ts`; MOUNT≈FETCH ⇒ React remount (fix render tree), MOUNT=1 but FETCH≫1 ⇒ self-nav/retry. Drive record open/switch via `__soamRegistry.get({id:'workbench.editor'}).open/setActiveTab` and toggles via `…get({id:'workbench.layout'}).toggleVisibility(part)` (the roster list is inside the iframe → not CDP-clickable). The real toggle-command ids are NOT `workbench.{panel,sideBar,auxSideBar}.toggle` (those reject "not registered by any active bundle").
- **Keep slot Parts MOUNTED across visibility toggles — hide via `display:contents`/`none` wrapper, not `{visible && <Part/>}` (O438).** `&&`-unmounting a Part tears down its `BundleViewIframe` → full re-fetch + bridge re-init + lost state on every toggle. `Middle.tsx` wraps each Part in `<div style={{display: showX ? 'contents' : 'none'}}>`: `contents` keeps the Part root as the real flex item, `none` keeps it mounted but hidden.
- **Popovers/menus must dismiss on `window` blur, not just `document` mousedown.** A sandboxed bundle iframe swallows the parent's mousedown, so a `document`-only outside-click listener never closes a popover when the click lands on a loaded iframe (Practice roster/overview). Clicking into an iframe blurs the parent window — add a `window` `blur` → close listener while open. `usePopover` does this; any hand-rolled popover needs the same (same root cause as the drag-shield gotcha above).
- **Services holding React-consumed state must replace objects IMMUTABLY, never `Object.assign` in place.** React Compiler memoizes child elements on prop **identity**. If a service mutates an object in place (`Object.assign(entry, patch)`) and hands the same reference to React, memoized children (e.g. `renderIcon(entry)` → `<Icon>`) keep the stale render even though sibling **property reads** in the same component (`title={entry.tooltip}`) update — symptom: one part of a row updates, another (a memoized child) is frozen. Hit on `StatusBarService` (O437): dark-mode glyph stuck `circle-large-filled` in light mode while its tooltip flipped correctly. Fix: replace the whole object (`map.set(id, { ...old, ...patch })`) so identity changes → memoization recomputes. Pairs with: cache `getEntries`-style derived arrays per key (stable ref between mutations, invalidate on change) to back `useSyncExternalStore` without loops.
- **Tailwind v4 `@theme {}` tokens are TREE-SHAKEN if only referenced via raw `var(--x)` in hand-written `.css`.** `tokens.css` defines color tokens inside `@theme {}`; Tailwind only emits the ones it sees "used" (utilities / `@apply` / arbitrary values). A token referenced solely as `background: var(--color-tint-neutral-medium)` in a component `.css` is dropped → `var()` resolves empty → `background` paints transparent (silent; no error, `getComputedStyle().getPropertyValue` on the dropped var returns `""`). Symptom hit on the activity-bar active-state (2026-06-01): `tint-neutral-medium`/`-soft` both came back transparent. **Fix: for hand-written CSS use tokens defined in the PALETTE files (`src/styles/themes/{spectrum,primer,stone}.css`, e.g. `--color-surface-active`) — those are normal `:root`/class custom props, never `@theme`-tree-shaken.** (Don't trust `getPropertyValue` to probe `@theme` vars — it reads empty even for ones that paint; screenshot instead.)
- **A 3rd-party lib bundled INTO a sandboxed iframe must be browser-pure — strip `process.env.NODE_ENV` at bundle time.** Vendoring `@tanstack/query-core` (et al.) as an injected IIFE via Vite/esbuild does NOT replace `process.env.NODE_ENV` unless you pass `mode:'production'` + `define:{'process.env.NODE_ENV':'"production"'}`. The opaque iframe has no `process` global → the lib throws `ReferenceError: process is not defined` on the first code path that hits a dev-warning guard (for query-core: the first fetch inside an observer). Symptom (2026-06-20): `__viewQuery` observers silently rendered empty (the throw was swallowed in the fetch chain — NOT a visible console error), so the cap returned data but the view painted nothing. Probe: raw-CDP into the opaque iframe (`suppress_origin=True`) and run the observer — the exception surfaces there. Fix lives in `scripts/gen-view-query-vendor.mjs`; grep the generated `*-vendor.ts` for `process` (must be 0).
- **Growing the injected `<head>` can expose a latent `document.body`-null race in head-run scripts (O-this).** The platform injects bridge/codicons/bootstrap/(now query-core) as inline `<script>`s in `<head>`, which run before `<body>` is parsed. The parent posts `init` on iframe load; a handler that touches `document.body` (e.g. `view-bridge.ts` maturity-highlight `document.body.classList.toggle`) throws when `init` wins the race — and if that throw is BEFORE `resolvedReady()`, the bridge `ready` promise never resolves → `awaitBridge()` hangs → the whole view loads no data. Enlarging the head (more injected bytes) shifts the race toward losing. Symptom (2026-06-20): adding the query-core vendor made every view (incl. untouched ones, same shared head) error `Cannot read properties of null (reading 'classList')` at the same injected line + go blank. Fix: make head-run handlers `document.body`-null-safe (defer to `DOMContentLoaded`) so `resolvedReady()` always runs. General rule: any injected head script must assume `<body>` may not exist yet.

---

## Orchestration Protocol (Opus must follow this)

### My role

I am lead agent. I think, plan, delegate, verify. I do not implement.

### Workflow per task

**1. Plan**
Reason through full requirement. Identify:

- What needs change and why
- Which modules / files in scope (names only, no read contents)
- Edge cases and constraints
- Success criteria (how know it's correct?)

**2. Delegate**
Spawn implementer agent via `Agent` with `subagent_type: implementer`
(defined at `~/.claude/agents/implementer.md`). Brief contains:

- **Goal** — one sentence
- **Scope** — list of file paths or directories in scope
- **Key constraints** — conventions, must-not-break interfaces, etc.
- **Success criteria** — what passing tests / behaviour looks like
- **Priority flags** — anything tricky to watch out for

Do NOT include file contents in handoff. Do NOT include full design
rationale. Do NOT repeat skill-activation rules — agent file owns those.
Keep brief to what implementer needs to act on — reads rest
from CLAUDE.md and codebase.

**3. Review**
After receiving handoff summary:

- Read changed files (read now, not before)
- Verify logic against plan and conventions
- Check test results reported
- If something wrong, produce correction brief and re-delegate
- When satisfied, summarise outcome for user and append any
  architectural decisions to Architecture Log above

### What makes a good brief (template)

```
Goal: <one sentence>

Scope:
- src/module/foo.ts  (add X)
- src/module/bar.ts  (update Y to support X)
- tests/module/foo.test.ts  (add tests for X)

Constraints:
- Must not change the public API of Bar
- Follow the error-handling pattern in src/utils/errors.ts
- All new functions need JSDoc

Success criteria:
- `pnpm test` passes with no new failures
- X is callable from Bar with the signature: foo(a: string): Result<T>

Watch out for:
- Bar has a caching layer — make sure X invalidates it correctly
```

### Context hygiene

- After each task cycle, consider whether any decision warrants entry in
  Architecture Log. If yes, write it before moving on.
- Keep conversational context lean. Stable knowledge belongs in this file,
  not in chat.