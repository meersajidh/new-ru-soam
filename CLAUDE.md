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
- Component/design-system discipline (3-tier taxonomy, rule-of-three promotion,
  gallery route, no-sprawl): `docs/Guides/design-system.md`. Read before building
  any new view or Activity.

---

## Test Command

Three gates — type, behavior, dogfood. Guide: `docs/Guides/testing.md`.

```bash
# TYPE gate — type-check the whole workspace (project references via tsc -b).
# As of O497 this ALSO type-checks every bundle's view-src/*.tsx: each
# bundles/*/view-src/tsconfig.json is a reference in apps/desktop/tsconfig.json
# (the solution file tsc -b builds). Vite/esbuild view builds DO NOT type-check
# — never trust a green `build:views` as a type-check; always run compile.
pnpm --filter ru-soam compile && pnpm --filter @ru-soam/editor compile

# BEHAVIOR gate — Vitest (projects mode: desktop/editor/domain/view-kit, node env,
# colocated *.test.ts). Vitest ≠ type gate (esbuild transform, no tsc). O517.
pnpm test

# Lint the desktop app (covers bundles/*/view-src too)
pnpm --filter ru-soam lint

# DOGFOOD — smoke-run the app (Implementation_Plan.md uses
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
- **View / iframe contract (CORE, reusable):** bundle UIs = sandboxed iframes on a **real per-bundle `view://<bundleId>` origin** (ADR-411 Am1, shipped O511 — `sandbox="allow-scripts allow-forms allow-same-origin"`, cross-origin to shell + other bundles → isolation via distinct origin, not opaqueness) under a **single strict CSP tier** (`script-src 'self'` AND `style-src 'self'`, no `'unsafe-inline'` — O513); seams served as external same-host `view://<bundleId>/_seam/*` files; views are React apps with their own per-bundle Tailwind v4 build (ADR-419; import `@ru-soam/view-kit/theme.css`, reference view `ru-soam-sessions/meetings`). **The several opaque-origin Dev Gotchas below (cross-host subresource, inline-injection, `canDisplay` cosmetic, `<StrictMode>` ×2, drag-shield, `document.body` race) are HISTORICAL — they explain the pre-Am1 opaque-origin era and its inline-seam hacks; kept for reasoning, not current practice.** Slots via manifest `viewContainers` (`location:"primary"|"auxiliary"`) + `panel.views` + `views[]`. Bridge `window.soamView` verbs (`openInEditor`/`focusAspect`/`setOverviewViewMode`) + context channel. **Context-following view (aux / overview / panel) = `kind:'context'` entityId; pinned editor tab (safety-plan, intake) = URL `?id=`.** Shared injected seam `window.__viewBoot` (awaitBridge/applyTheme/applyCodicons/parseQuery). **PHI-touching bundle actions = renderer-domain commands (`src/domain/bootstrap.ts`), never host commands** (ADR-417). Cross-iframe nav via renderer-mediated bus (`view-focus-bus.ts`). **`openInEditor` is cross-bundle-capable (ingress Slice C, 2026-06-21):** `soamView.openInEditor(viewId, { bundleId })` — optional `bundleId` (alias `targetBundleId` on the wire) resolves the view against a *different* bundle (`BundleViewIframe` resolves `targetBundleId ?? new URL(resource).hostname`); domain-agnostic in base (caller names target, base hardcodes nothing). First-party-only today; trust-gate the caller when untrusted Bundle-Host lands = O500. Tab dedup = `resource + entityId`. Tokens injected from `tokens.css`+theme files; Inter Tight inlined (`view-fonts.ts`), CDN fonts CSP-blocked. View-specific reads must ride `context` (replayed on load), not `init`.
- **Practice Activity — BUILT + committed (P0–P5 + record CRUD + view-layer, tree clean):** roster + Client record (Overview editor + contextual aspects). Clinically-safe spine through P5 = Risk/Safety (banner+aspect+`safety-plan` tab, MHA-2017 §23 reasoned-disclosure flow) + People/Circle + Consent/Legal + Documents (protected blobs) + workflow layer (Intake checklist + Attention lens, pure read-derivation). Tables `patients`/`patient_profile`/`patient_lifecycle`/`patient_circle_member`/`patient_consent_state`/`patient_risk_event`/`patient_safety_plan`/`patient_document`, all `protected`; audit PHI-free (ADR-502). **NEXT = P6 projections + overlays (O464), BLOCKED on Schedule/Sessions Activities.** Detail → ADR-505 (+Am1–4) + `docs/Activities/practice/` (IA + build-plan) + [[project_practice_ia_workstream]].
- **ADR-417 menus + keybindings:** `menus`/menu-id registry/renderer-owned `IMenuService`/`keybindings`; renderer↔iframe context-menu channel; `usePopover` primitive. Detail → ADR-417.
- **ADR-413 Am1 icons = VS Code Codicons:** `<Icon>` font in shell, inline-SVG in iframes; `src/platform/icons/` = single swap point. Detail → ADR-413 Am1.
- **Activity/Aspect taxonomy (O418):** Aspect = uniform view primitive (Navigation vs Contextual by slot); Activity = top-level surface. Catalogue → `docs/Product/Product_Scope.md` (O72/O197).
- **Per-Activity design method = journal+promote:** journal in `docs/Activities/<name>/`; settled → ADRs, open → Open-Items.
- **Cloud Backend (Phase 11a) — LIVE + committed; PARKED:** identity service on Cloud Run `asia-south1` (`https://identity-797916105958.asia-south1.run.app`): Google ID-token verify → auto-register `accounts` → KMS-signed RS256 session JWT + 30d-sliding hashed-refresh rotation → PHI-free telemetry `POST /v1/events` (requireSession RS256; 3-mode `cloud.telemetryMode` default-off DPDP; ADR-312 two-tier base/domain, domain deferred). Client `electron/main/cloud/`: hold-pending→commit-on-KEK, proactive silent rotation, account soft-delete (`status`/`deleted_at`, `account_deleted` event). **Invariants: account_id never client-asserted; events PHI-free `{event_type,device_id,app_version}`; refresh-token at rest only as KEK-wrapped `cloud-session-token`; node-first (app self-sufficient, Google contacted once at signup). Two independent token systems — System A (identity/our-server) vs System B (Google provider tokens Calendar/Meet, OS-keychain, Flow-A). Identity-mismatch gate on reconnect (Main-side, unspoofable).** Deferred: 11b sync (O23 LWW), O468 90d-purge job, O476 System-B consent. Detail → ADR-311 (+Am1/Am2)/312 + [[project_cloud_backend_workstream]].
- **Schedule + Sessions Activities (read-only foundation COMPLETE; NEXT = O501 Notes → O499 egress):** two Activities over calendar providers. **Schedule = UI that OWNS provider state** — `provider_account`/`calendar`/`event` tables (all `protected`), account-aware `CalendarProvider` port (`authenticate→ProviderAccount` via Main broker, `listCalendars`/`listEvents` by accountId), Google = adapter#1; persistent `event` cache + incremental syncToken sync (read-only ⇒ no LWW). **Sessions = the only clinical persistence = Client Meeting** (`client_meeting`, `protected`); field-partitioned sync, NO LWW, orphan-on-delete; `MeetingProvider` port. **Cross-bundle link-key = (`provider_id`,`external_account_id`,`provider_calendar_id`,`provider_event_id`)** (ADR-508 Am1). Identity resolution via `record.patient.resolveParticipant` (Practice = authority). Broker grants **account-keyed** `{providerType, externalAccountId}`, Main-only, broker-discovered/unspoofable; **System A (identity) ≠ System B (provider)** (ADR-314). **PHI = ADR-301 destination-not-wall:** absolute vs OUR cloud; reading user’s OWN provider PHI locally ≠ egress → **linking always-on, no gate** (ADR-313 Am2); PHI Safety Score deferred whole to O499. Classification = 4 render-time grid classes (Client/Excluded/Personal/Unclassified). INGRESS funnel = aux `event-detail` hub + intake-from-calendar (`kind` param, reuses `intake` stage) + cross-bundle record tab via `openInEditor` `targetBundleId`. Cross-bundle DPDP erase = base cap `store.eraseSubject@1.0` (O490). Calendar→client migration = independent bulk MODE (ADR-509; `migrated` stage, transient `client_incoming`, no PHI at rest). Open: O486 (MS/Apple/CalDAV), O496/O497 (view tech-stack + `__viewQuery`→react-query rollout), O499/O501, 9 migration OIs. Detail → ADR-313/314/507/508/509 + `docs/Activities/{schedule,sessions}/` + [[project_schedule_sessions_workstream]] + [[project_migration_onboarding]].
- **Release / update (ADR-204 +Am1–3, ADR-308):** `electron-updater` reads `latest*.yml` from Cloudflare R2; NSIS (Win) + `.deb` (Linux), roll-forward. Native packaging: pnpm `nodeLinker: hoisted` — **NEVER** isolated linker, **NEVER** `pnpm deploy`, keep `npmRebuild:false`. Detail → ADR-204 Am3 + [[project_release_update_workstream]].
- **ESM build gotcha:** main + fp-host need a `createRequire` banner in `vite.{main,fp-host}.config.ts` (bundled CJS `require('fs')` throws in ESM). Don't switch main to CJS.
- **"Account" = UI label; `workspace` = base mechanism term:** visible strings say "account"; internal `workspace.*` identifiers unchanged (ADR-106). Full rename = O196.
- **No-ADR renderer-only features:** resizable Parts (LayoutService + `ResizeHandle`, persisted via `prefs`); Activity-Bar density pref (localStorage).
- **`__viewQuery` (interim iframe view-data layer, being subsumed by per-bundle react-query — ADR-419):** injected query-core wrapper (`observeQuery`/`runMutation`/`invalidate`); `calRev` channel = the view-tier invalidation trigger (iframes get no `store.changed`). Superseded as views migrate to React+react-query (O497). Key gotchas (vanilla `QueryObserver.subscribe` needs a manual initial emit or the view hangs; `mode:'production'` NODE_ENV-strip for the bundled IIFE) → [[project_view_stack_migration]]. Detail → `view-query.ts`.

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
- **NEVER hold cross-module renderer state in a module-level mutable singleton — put it on a registry-singleton service (`1eabdec`, calRev fix).** A module-level `let _x` with a `registerX()/callX()` indirection (the deleted `schedule-cal-rev.ts` did exactly this for the schedule calRev bump) is fragile two ways: (1) **HMR does not swap boot-instantiated singletons** (existing gotcha) — editing any importer can leave `_x` registered in a stale module instance while consumers read a fresh one with `_x` null; (2) **build-time module duplication** — the same module reachable via different import specifiers/chunks can instantiate twice. Symptom (2026-06-22): the PHI-read popover toggle + calendar-color edit "did nothing" until close/reopen — `bumpScheduleCalRev()` `_bump?.()` silently no-op'd (calRev frozen 281→281, CDP-proven by importing the module and calling the export). The first dogfood missed it because it bumped via the service `setState` directly, bypassing the broken helper. Fix: `bumpCalRev()` METHOD on `ScheduleViewStateService` (a true registry singleton); consumers call `useService(ScheduleViewStateServiceId).bumpCalRev()`; module deleted. **Test the REAL consumer path, not a service-direct shortcut** — a shortcut that bypasses the indirection masks exactly this class of bug.

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