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

- **Orchestration:** Opus plans + reviews; Sonnet (`implementer`) builds. Thin briefs (intent + scope + success criteria); the agent reads context from the codebase. Full process → Orchestration Protocol below.
- **Styling:** policy in Conventions → UI/styling + `docs/Guides/styling-system.md`; architectural changes need an ADR.
- **Two-axis architecture (the frame for everything):** trust zones (ADR-101: Main→Preload→Renderer→Bundle-Host, privilege) ⟂ layers (ADR-106: base/domain/extensions, generic↔specific). Orthogonal — can't read one from the other. Guide: `docs/Guides/architecture-two-axes.md`.
- **ADR-106 base/domain (+ Am1 extensions tier):** base = `basebench` mechanisms (`@basebench/*`); domain = `ru-soam` first-party bundles; extensions = third-party. One-way dep `base ← domain ← extensions`, lint-enforced. Deferred: O194 (extract base pkg), O195 (Layer-field sweep), O196 (brand→`basebench` rename: `window.soam`/`@ru-soam/*`/`__soamView`/`RuEdit`).
- **ADR-418 (+Am1) bundle trust tiers:** First-Party-Host (trusted: binds any cap incl. PHI *returns*, NO keys) vs untrusted Bundle-Host (PHI caps hard-denied structurally). `electron/fp-host/` (renamed from `bundle-host`, O450) IS the FP-Host and is **MVP**; deferred = the 2nd untrusted third-party host (rung H). UI sandbox for ALL bundles. **PHI invariant:** keys/decrypt/ciphertext Main-only; PHI plaintext only in Renderer + FP-Host. **`trustClass` = platform-assigned by provenance, NEVER self-declared** (MVP: in-package→first-party). Detail → ADR-418.
- **ADR-506 (Accepted) domain module model — SUPERSEDES ADR-504:** Main is pure-`basebench` (NO domain code); canonical record = a first-party bundle, command logic in FP-Host, persisted via generic ownership-scoped base store caps (`store.write`/`store.query`). CQRS = **separate command/query caps**; sole-writer Main-enforced via declared table ownership; validation line: **structural→Main schema, domain-value-vocabulary→FP-Host** (§5 amended). **Logical ownership ≠ execution residency.** Ladder `0→G` COMPLETE + dogfooded (2026-06-05): pure-base Main + CQRS ABI split (`bindQuery`/`bindCommand`, `cap.kind_mismatch`) + manifest-as-data schema (ownedTables/migrations/queryTemplates/residency/dependencies). **Authoring rule for NEW modules:** CQRS-explicit + FP-Host-resident + manifest-declared from the start; move-cap-to-host = declare in manifest + register in `activate()` + DELETE any Main registration. Deferred: O445 full dep-graph (until module #2), O441 trustClass-tag, O451 cap-transport, rung-H. Detail → ADR-506 + [[project_adr506_migration]].
- **Practice P4 (O460, BUILT + fully CDP-verified 2026-06-06, uncommitted) Risk/Safety keystone — closes O419 residual:** new protected tables `patient_risk_event` (multi-row child) + `patient_safety_plan` (India-adapted Stanley-Brown 7-field, PK patient_id); §23 flag + capacity reuse `patient_consent_state`. FP-Host cmds `addRiskEvent`/`setCapacity`/`toggleException`/`setSafetyPlan` + queries `listRiskEvents`/`getSafetyPlan`. **§23 = reasoned flow:** `toggleException(active,{ground,disclosedTo,reason})`, ground ∈ bounded MHA-2017-§23 enum (web-verified: §23 right-to-confidentiality + bounded exceptions + minimal-disclosure), writes consent flag + `s23_disclosure` risk_event. **PHI invariant VERIFIED via CDP:** §23 reason/disclosedTo + risk summaries + plan text only in row columns — full 605-row ledger scan = ZERO PHI in audit detail (enum-only `{kind,severity}`/`{status}`/`{action,ground}`). UI: Risk/Safety aspect real + conditional Overview banner + NEW `safety-plan.html` owned writable editor tab (opened via `soamView.openInEditor`; Tele-MANAS 14416 + pesticide/family-custody means seeded). audit-types += 4 kinds; erase cascade auto-covers both new tables (P2 deleteWhere loop). Dogfood green: risk/capacity/§23-invoke(ground-required)/revoke/safetyplan/erase-cascade + zero-PHI-leak + UI render. Detail → ADR-505 Am4 §A4.1 (residual resolved) + Open_Items O460.
- **Practice P2 (O459, BUILT + CDP-verified 2026-06-06, uncommitted) People/Circle + Consent & Legal real:** tables `patient_circle_member` (own `id` PK + `patient_id` FK — **first multi-row child**) + `patient_consent_state` (PK `patient_id`), protected; FP-Host cmds `addCircleMember`/`updateCircleMember`/`setNR`/`setConsentState` + queries `getCircle`/`getConsentState`; People/Circle + Consent & Legal aspects + Overview AD/capacity/tele badges + NR mini → Concrete. **ABI increment (ADR-506 §6):** `store.write` grew predicate-scoped `deleteWhere`/`updateWhere` — equality-AND `where`, PRAGMA-validated cols, `string|number` values, **non-empty-predicate blast-radius guard**, caller-supplied audit `recordId`, coarse `store.changed`. Table stays explicit arg → ownership gate unchanged; base stays domain-free (bundle supplies column). **Erase cascade now `deleteWhere({patient_id})`** → cascades multi-row children correctly (was a PK-only-delete orphan/DPDP gap). `setNR` = demote-all (`updateWhere`) then promote-one (PK update) + cross-patient guard. Open: consent value-vocab unpinned; §23 here = plain edit (audited §23 flow = Phase 4 / O419). Detail → ADR-506 §6 increment + Open_Items O459.
- **O452 (DONE + committed 2026-06-05) PHI-at-rest split:** Local Store split by residency — `operational` (`local-store.db`, raw safeStorage key, open-while-locked: prefs/settings/`audit_log`, O307f preserved) vs `protected` (`protected-store.db`, KEK-wrapped key, opened-on-unlock/closed-on-relock: PHI). Base residency-neutral (never names "PHI"); domain opts in via manifest `residency:'protected'`; lazy-provisioned. `store.write`/`store.query` route by `tableResidency`/template residency; audit stays operational (PHI-free invariant). Dev inspect: `just dev-db <ws> --protected`/`dev-db-psql` (passphrase→KEK→unwrap). Deferred: O26 KEK-rotation re-wrap, prod PHI migration out of `local-store.db`, per-table PHI. Detail → ADR-302/307 + [[project_o452_phi_at_rest]].
- **Practice P3 (O454 build, BUILT 2026-06-08, compile+lint+node-check green + code-reviewed, runtime-CDP-verify pending unlock, uncommitted) Documents on lean protected blob store:** 3 layers. **L1 base blob store** (Main, clones O452 store-key machinery): `local-store/protected-blobs.ts` `protectedBlobsManager` (open/close/current + `put(bytes)→{id,sha256,size}`/`get`/`delete`; per-file wire `nonce(12)‖ciphertext‖tag(16)`, AAD=`blob:<id>` binds id, 25 MiB cap, path-traversal guard, key held in-mem + zeroed on close); `protected-blobs-key.ts` (`ensureProtectedBlobsKey`, KEK-wrapped `protected-blobs.key.json`, **caller does NOT zero — manager owns key lifetime**, unlike store-key); `envelope.ts` += `buildProtectedBlobsKeyAad` (`{purpose:'protected-blobs-key',workspaceId}`); `blob-cap.ts` `blob.write@1.0` (put/delete, phi+command — **`blob.read` cap deferred → O462**, manager.get() exists for it); lock-seam in `ipc/lock-channel.ts` (`openProtectedStoreIfNeeded` opens blobs under same `hasProtectedSets()`+KEK gate, independent guard; close+zero on the two relock `onDidChange` + sign-out + delete); boot `registerBlobCapabilities()`. **L2 domain** (`ru-soam-practice`): manifest v8 `patient_document` (id/patient_id/kind/title/storage_ref/mime_type/sha256/linked_*/created_at) + `listDocuments` template + `blob.write@1.0` dep + ownedTables; FP-Host `record.patient` cmds `attachDocument`/`removeDocument` + query `listDocuments`; **erase unlinks blobs (try/catch each, before the deleteWhere row cascade)** — rows auto-cascade via manifest-derived loop. **Byte transport = base64 STRING iframe→renderer→Main→FP-Host (bridge hops not guaranteed binary-safe), decode→Buffer→`blob.write.put` (final fp-host→Main hop = structured-clone-safe).** sha256/size computed in Main (plaintext layer; FP-Host avoids `crypto`). **L3 UI** Documents aspect in `aspects.html` (list+upload via `FileReader.readAsDataURL`→strip prefix+remove, 25 MiB client guard, Concrete). **PHI:** title/fileName NEVER in audit; detail=`{mime_type?,size}`; bytes plaintext only transiently in renderer/FP-Host/Main, on disk only as ciphertext. audit-types += `record.patient.document.attached`/`.removed` + base `blob.put`/`blob.delete`. **Viewing (decrypt-to-memory render) deferred → O462.** Detail → Open_Items O454/O462 + ADR-302/307.
- **Practice P5 (BUILT 2026-06-08, lint+compile green + reviewed, runtime-CDP-verify pending unlock, uncommitted) Workflow layer = Intake checklist + Attention lens:** PURE read-derivation — **NO new table/command/migration/ADR/audit-kind**. Insight (IA §6): intake-completeness + lifecycle is ONE data set read TWICE. **Data:** manifest 2 query templates under existing `record.patient.query` cap — `patient.intakeCompleteness` (per-client `@id`) + `patient.attentionScan` (roster-wide, no params), shared SQL flag block (EXISTS/`length(trim())` 0/1 booleans, LEFT JOIN profile/lifecycle/consent/safety_plan). index.mjs: `INTAKE_ITEMS` (10: demographics/language/diagnosis/circle/informedConsent/teleConsent/capacity/advanceDirective/riskScreen/documents) + `mapIntakeCompleteness` + `deriveObligations` (`ON_HOLD_REVIEW_DAYS=30`; obligations intake_incomplete/no_risk_screen/missing_consent_doc/on_hold_stale; archived+discharged skipped) + query methods `getIntakeCompleteness`/`listAttention` (host filters obligations>0). **UI:** NEW `intake.html` per-client checklist editor (progress + 10-item check/circle list + "Open record" on incomplete); roster.html Attention lens real (obligation chips → navigate: intake_incomplete→`intake.html`, else→overview) + **Attention = default landing lens** + intake-board rows open checklist + N/10 badges + `onStoreChange` reloads attention on any of 8 owned tables. **PHI:** returns = booleans/enums/displayName (already roster-visible); audit reuses existing `viewed`/`listed`, zero new detail. **🔑 Review fix (re-delegated):** `intake.html` is a PINNED per-client editor tab → MUST take clientId via URL `?id=` (safety-plan pattern: opener passes `openInEditor('intake',{query:'id='+enc(id)})`, view reads `location.search`, loads immediately). NOT the overview/`kind:'context'`-message path (that follows the *active* client, wrong for a pinned tab) and NOT onActivate-gated. First build wired `{entityId}` only → checklist got no id. Pattern rule: context-following view (aux/overview) = `kind:'context'` entityId; pinned editor tab (safety-plan, intake) = URL `?id=`. Detail → build-plan §"Phase 5" + Open_Items O455/O456/O464.
- **O455 + O465 (BUILT 2026-06-08, lint+compile green + reviewed, runtime-verify pending, uncommitted) — Practice view-layer wiring (both = wiring on already-built UI, not new views):** **O455** persists the Overview view-mode (dense/focused/timeline — all 3 modes + the in-view density dropdown already existed; gap was zero persistence, the sandboxed opaque-origin iframe can't use localStorage). Renderer single-source mirrors `MaturityHighlightService`: NEW `OverviewViewModeService` (`src/platform/view-mode/`, localStorage `soam.overviewViewMode`) + id + boot register (no StatusBar/cmd — dropdown is the control); `BundleViewIframe` pushes mode in init + initial `context` post + dedicated `kind:'overviewViewMode'` on change + inbound `request.setOverviewViewMode`; bridge verb `soamView.setOverviewViewMode`; overview.html reads `d.overviewViewMode` generically, dropdown routes through the verb. **🔑 view-specific reads must ride `context` (bridge-replayed on DOMContentLoaded), NOT `init` (no replay) — large docs (overview=1523 lines) can drop `init` before the body listener registers; this was the review fix.** **O465** intake checklist item → deep-link to its owning aspect (aspects render in a SEPARATE aux-sidebar iframe → needed a renderer-mediated hop): NEW `view-focus-bus.ts` (module-singleton pub/sub) + bridge verb `soamView.focusAspect(sectionId)`; `BundleViewIframe` `request.focusAspect` → resolve `aspects` url + reveal aux (`LayoutService.setVisibility`) + bus-emit; the iframe whose `resource` matches posts `kind:'focusAspect'` inward; `aspects.html` `focusSection()` expands (`is-open`, mirrors the DOM-class header toggle → no JS-state desync) + scrolls; intake.html `ITEM_ASPECT` map (capacity+AD→consent, riskScreen→risk, etc). Detail → Open_Items O455/O465 + [[project_practice_ia_workstream]].
- **O454 (DECIDED 2026-06-08, BUILT as P3 — see prior bullet) protected blob store = LEAN:** binary/file PHI (Documents: consent PDFs, AD/NR artifacts) stored as encrypted files `$ws/protected-blobs/<id>` (`nonce‖AES-256-GCM‖tag`), **sibling** to the protected DB — single per-workspace KEK-wrapped key `protected-blobs.key.json`, same lock seam (`ipc/lock-channel.ts` unwrap-on-unlock/evaporate-on-relock), lazy-provisioned. Base residency-neutral `blob.put`/`get`/`delete` cap; domain stores scheme-tagged `storage_ref=blob:<id>`. Write blob-first / delete row-then-unlink + startup orphan-sweep; **erase (O457) = domain unlinks blobs, DB `deleteWhere` cascade is rows-only**. Posture lean = one key + single-shot full-load (fine for small docs; DB stays lean vs bytes-in-DB). **Reuses `crypto/envelope.ts` wrap/unwrap + clones `ensureProtectedStoreKey` lifecycle** — only new crypto = AES-GCM over file bytes. **Rejected:** bytes-in-DB (bloat/VACUUM), plaintext FS incl. git (fails close-on-lock; git history vs DPDP erasure; native-git packaging). **Deferred → O461:** per-object-DEK envelope (ADR-303 sync unit, unlocks O26 cheap rotation) + framed streaming AEAD (large payloads) — additive behind `storage_ref` tag, no live consumer yet. **NEXT = build P3 on this (stand up blob store first, then doc cmds/aspect).** Detail → ADR-302 §"Protected blob store" + ADR-307 §"Sibling protected-blobs key" + Open_Items O454/O461.
- **ADR-505 (Draft) Practice Activity (+ Am1–4):** roster + Client record; record opens as Overview editor (form = create-path only); tables `patients` / `patient_profile` / `patient_lifecycle`; Am3 lifecycle/status model (orthogonal axes, cyclic stages). **Am4 (2026-06-05) = Practice Information Architecture**: synthesized by working BACKWARDS from the static prototype (`practice-proto-handoff/`). Two new journal artifacts are the source of truth → `docs/Activities/practice/practice-information-architecture.md` (the IA matrix: *lifecycle×entity×surface×command×ownership*, surface map, 3 Overview view-modes, intake capture path, drill-down ladder) + `practice-build-plan.md` (release phases P0 legibility→P1/P2 owned spine→P3 docs→P4 Risk→P5 modes/Intake/Attention→P6 projections; spine-real-first, projections-mock). **Am4 resolves: Risk/Safety = BOTH banner+aspect (§A4.1, was the O419 keystone), Intake = progressive-capture checklist (§A4.3), Overview view-modes = pref axis (§A4.2), residency reconciled to ADR-506 (§A4.4, supersedes Am3 "Main-resident"), UI maturity-marking Concrete/WIP/Mock (§A4.5).** Projection cards mock (source-pill) until owning Activities ship. Open: O419 (residual = safety-plan fields + §23 UX), O420 (adjuncts), O421/A1 (Billing — confirm or Payment stays mock), O453 (maturity-marking, P0), O454 (protected blob store, gates P3 docs), O455 (view-modes), O456 (Attention set), O422 (shared fonts). Product_Scope amendments A1–A3 proposed.
- **ADR-417 (Accepted) menu + keybinding contributions:** `menus` / menu-id registry / renderer-owned `IMenuService` / `keybindings`; renderer↔iframe context-menu channel. **Pattern — PHI-touching bundle actions = renderer-domain commands (`src/domain/bootstrap.ts`), never host commands, so PHI never enters the host.** Follow-ups built: O423 toggle, O424 alt-command, O425 submenu/radio, O426 multi-stroke + rebinding UI, O429 `usePopover` primitive. Detail → ADR-417 + Open_Items.
- **ADR-413 Am1 (Accepted) icons = VS Code Codicons:** `<Icon>` font in the shell, inline-SVG in iframes; `src/platform/icons/` registry is the single swap point. Built O434 (shell), O435 (iframe). Detail → ADR-413 Am1 + Open_Items.
- **Activity/Aspect taxonomy (O418):** Aspect = uniform view primitive (Navigation vs Contextual by slot); Activity = top-level surface. Vocabulary + MVP catalogue → `docs/Product/Product_Scope.md` (O72/O197).
- **Practice design = journal+promote (`docs/Activities/practice/`):** own `00NN` log; settled → ADRs, open → Open-Items; continuity map = `adr-crosswalk.md`.
- **ADR-311 (Accepted 2026-06-14) Cloud Backend identity service = Phase 11a (DESIGN ONLY, not built):** takes up ADR-309 Part B / O309a. **Node-first invariant:** the desktop app is a self-sufficient node — works offline/standalone, and does **all** Google connectivity itself. **Two independent concerns, never conflated:** (1) **identity** — OAuth runs in **Main** (PKCE+loopback, `openid email profile` only), Main does the code exchange, ships **only the ID-token** to our server; (2) **provider connectivity** (Calendar/Meet/AI/KMS) = node-direct **ADR-305 Flow-A** plugins, OS-keychain creds, brokered via Main, **zero server dependency** (new providers contributable w/o server change). **Server scope (4 things only):** verify Google ID-token (JWKS) → auto-register (`sub`=key) → issue RS256 (Cloud-KMS-signed) session JWT + rotating refresh → record session events `{sub, device_id(generated UUID, NOT fingerprint), event_type, ts, app_version}` (no IP/location; operational-class; distinct from ADR-502 clinical ledger; PHI-free by construction). Same JWT later authorizes 11b sync. **Stack (Solution A):** Cloud Run (Go) + Cloud SQL Postgres + Cloud KMS (JWT signing) + Secret Manager, **`asia-south1`** (India/DPDP residency). **`client_id`+`client_secret` STAY bundled** — Desktop-app secret is non-confidential by Google's model, PKCE is the real control; **exchange-on-server REJECTED** (breaks offline-self-sufficiency) → "client-secret removal" closed N/A, token-exchange-home = Main. **Resolved/changed:** O309a (design resolved), O307h withdrawn (nickname display-only — Google identity is the unique key), O307f shrunk (only client cred = `cloud-session-token`, kek-wrapped; no `google-oauth-refresh` client cred), O309c end-state revised (secret stays bundled). **New O468** = usage-analytics consent/notice + retention (must land before telemetry ships). **NEXT = build 11a** (Go server from scratch; old `~/Repos/msh/ru-soam` Go `identityaccess/auth` = design reference for an A/B review, NOT lift-and-shift — survey deferred). 11b (sync + O23 conflict, working assumption per-record LWW) follows. Detail → ADR-311 + Open_Items O309a/O468.
- **Phase 11a BUILT (ADR-311) — 11a.0–11a.5b committed, runtime-verify of β pending:** Go identity service at `server/identity/` (Gin+pgx+goose+golang-jwt; layered `internal/{rest,session,service,store,…}`). Slices: 11a.0 skeleton → 11a.1 Google ID-token JWKS verifier → 11a.2 `accounts` auto-register → 11a.3 RS256 session JWT + hashed-refresh rotation w/ reuse-detection → 11a.4 `session_events` store → **11a.5a** client↔Main online path (`electron/main/cloud/`: device-id, identity-client, `CloudSessionService` hold-pending→commit-on-KEK; `cloud-session-token` KEK-wrapped, zero token leak to renderer) → **11a.5b** offline/returning-user + telemetry. **11a.5b key principle: token calls (session/refresh/revoke) = functional auth, NOT telemetry — kept as separate channels.** α = `refreshOnUnlock`/`revokeOnSignOut` + `CloudAuthError`(dead-token) vs `CloudOfflineError`(retryable); server stopped recording events as a token-endpoint side-effect. β = telemetry decoupled to **`POST /v1/events`** behind a `requireSession` RS256 JWT middleware (account_id from JWT only, RS256 double-fenced vs alg-confusion); Main `telemetry.ts` 3-mode pref `cloud.telemetryMode` (off/online-only/on, **default off = DPDP opt-in**), emit at login/refresh/signout, durable queue pref `cloud.telemetryQueue` (FIFO-200, PHI-free), `net.isOnline()` watcher, cycle-broken via injected tokenProvider; `SettingsMenu` "Usage analytics" control + consent notice. **Invariants:** account_id never client-asserted; events carry only `{event_type, device_id(install UUID), app_version}` — never PHI; refresh-token at rest only as KEK-wrapped `cloud-session-token`. **O468 retention DECIDED = 90 days rolling** (purge-impl deferred to 11a.6). Dev: root `.env` `IDENTITY_BASE_URL=http://127.0.0.1:8080` + `just dev-identity` (JWT_DEV_EPHEMERAL=true) + identity-dev-db pg. Detail → ADR-311 + Open_Items O468/O471 + [[project-cloud-backend-workstream]].
- **Phase 11a.6 GCP deploy DONE + prod-verified 2026-06-15 (infra live; code uncommitted):** identity service running on **Cloud Run `asia-south1`** → `https://identity-797916105958.asia-south1.run.app`. **Code slice 11a.6-a (uncommitted):** `KMSSigner` (`internal/service/kms_signer.go`) impl of the existing `Signer` interface — **per-JWT Cloud KMS `AsymmetricSign`** (RSA_SIGN_PKCS1_2048_SHA256 = RS256; private key never leaves KMS; `SigningString()`→SHA256→KMS→base64url-concat; public key fetched+cached at boot via `GetPublicKey`), behind a mockable `kmsClient` interface (4 unit tests, fake local-RSA); `build.go` selects KMS when `JWT_KMS_KEY_NAME` set else existing `PEMSigner`; `config/signer.go` += `KMSKeyName`. PEMSigner/dev-ephemeral path untouched. **Infra (gcloud, asia-south1, DPDP residency):** Cloud SQL Postgres-16 `identity-pg` (goose-migrated via Auth Proxy) + KMS keyring `identity`/key `jwt-signing` + Secret Manager `identity-database-url`/`identity-google-client-id` (user-managed replication → asia-south1) + Artifact Registry `identity` + Cloud Run (runtime SA `identity-run` with **scoped** roles: `cloudkms.signerVerifier` on the key, `cloudsql.client`, `secretmanager.secretAccessor` per-secret; `--allow-unauthenticated` — endpoints self-auth via Google-token-verify + `requireSession` RS256, Cloud Run IAM is NOT the gate; `--add-cloudsql-instances` mounts `/cloudsql/<conn>` unix socket → DATABASE_URL uses `host=/cloudsql/...` socket form). Build = Cloud Build (fresh project needed `roles/cloudbuild.builds.builder` on the compute default SA). `.gcloudignore` added to `server/identity/` so dev `keys/`+`tmp/` never reach the source tarball (image is multistage-clean regardless — final stage copies only the binary). Deploy vars in gitignored `server/deploy/prod/gcp.env` (self-deriving from gcloud config; `server/.gitignore` `*.env`). **Verified via prod psql:** Google ID-token verify → account auto-register → **KMS-signed** session JWT → refresh-rotate → telemetry `/v1/events` (requireSession RS256) → Cloud SQL `session_events` (refresh+signout rows, zero PHI, stable install `device_id`). `/health/ready` 200 (DB+KMS healthy at boot). **NOT done / deferred:** O468 **90d-purge job** (Cloud Run Job + Cloud Scheduler + `cmd/purge` — parked, dev-mode, unbuilt); 3 client telemetry-flow gaps surfaced during verify → **O472** (`login` event near-uncapturable — fires only at workspace-creation sign-up, before telemetry opt-in possible), **O473** (signout orphans cloud session — no re-link-Google UX), **O474** (pre-unlock pref-read noise). 11a.6 code (`server/identity/*` KMSSigner + `.gcloudignore`) **uncommitted** — owed commit. 11a.6-a now **COMMITTED** (`19e8cc3`). Detail → ADR-311 + Open_Items O468 + [[project_cloud_backend_workstream]].
- **ADR-311 Amendment 1 (2026-06-15) telemetry-flow pass — sign-out is LOCAL; login≡signup; revoke→delete-account (closes O472/O473/O474):** the 11a.6 verify gaps were a category error — O472/O473 conflated **two independent token systems** ADR-311 §4–5 already separates. **System A (built)** = identity/our-server session: Google **ID-token** consumed **once at signup**, our server mints **our own** session JWT + **30-day-sliding** refresh (the KEK-wrapped `cloud-session-token` = OUR refresh, not Google's; **Google never re-contacted** after signup). **System B (unbuilt, domain)** = Google **provider** tokens (Calendar/Meet, ADR-305 Flow-A, OS-keychain) — where "Google refresh expires→re-auth" is actually real. **Am1 decisions:** (A1.1/2) routine **sign-out (2b) + lock (2a) are LOCAL** — keep the credential at rest, rotate on next unlock; **each workspace = an account** (picker switches accounts); **revoke moves to delete-account** only (no separate disconnect UI — telemetry has its own off-switch, sync is future+consented). (A1.3) **`login` ≡ signup, one-time**; recurring heartbeat = `refresh`-on-unlock (already captured) — O472 dissolves; enum `{login,refresh,signout}` unchanged. (A1.4) the **one** path Google reappears for identity = ≥30d-idle dead-refresh → re-**sign-in** (not signup); recovery "Reconnect to sync" UX deferred → **O475**. (A1.5) System-B provider consent/scope strategy (incremental-vs-bundled) deferred → **O476**. **Code slice (compile+lint green, UNCOMMITTED, RUNTIME-VERIFIED via CDP 2026-06-15 — all 4 green):** `lock-channel.ts` (sign-out drops the revoke branch → `clearVolatile()` only, credential kept; delete-account gains `revokeOnDisconnect(id,kek)`+`stopWatcher()` before relock), `session-service.ts` (`revokeOnSignOut`→`revokeOnDisconnect` + docstrings; `login` emit untouched = signup-only), `telemetry-mode-service.ts` (O474: `_reload` guards on `workspace.getActive()`). **Verified:** routine sign-out→re-unlock keeps cred + `refresh` rotation + NO `signout` row; delete-account → `signout` row + server `refresh_tokens.revoked_at` (family revoked) + ws gone; fresh-signup login DROPPED when mode default-off (login≡signup); zero `cap.not_found` on sign-out. **Commit owed:** slice + ADR-311 Am1 + Open_Items + this log. Detail → ADR-311 Am1 + Open_Items O472–O476 + [[project_cloud_backend_workstream]].
- **ADR-312 (Accepted 2026-06-15) usage telemetry = two-tier (base mechanism + domain vocabulary), PHI-free by construction:** consolidates the telemetry policy that was split across ADR-311 §7 (mechanism) + O468 (policy) into one ADR, and fixes the **base/domain split** on the ADR-106 axis (same pattern as store ADR-506 / commands ADR-417). **Base (`basebench`)** owns the *mechanism* (`/v1/events`+`requireSession` channel, 3-mode consent gate `cloud.telemetryMode` default-off DPDP-opt-in, classification, retention/purge) **and** generic lifecycle events (`session.*`/`workbench.*`) — this is the live 11a.6 surface (`session_events` login/refresh/signout). **Domain (`ru-soam`)** owns *event vocabulary only*, emitted through the base channel under the same gate — **decided but deferred-build** (no domain events exist yet; stand up at first need, "until module #2" discipline). **Domain tier carries a STRICTER invariant than base:** even column-PHI-free domain counters can leak clinically by *inference* → MUST be aggregate/counter-only, **no per-entity(patient) linkage**, no re-identifying timing, closed namespaced vocab (no free text), explicit review gate. Retention 90d (O468 = remaining purge-job impl). Data shape: current closed-enum `session_events` = base instantiation; domain = deferred ABI increment (generalized namespaced `usage_events`, same endpoint). Detail → ADR-312 + Open_Items O468.
- **Release / update (ADR-204 + Am1–3, ADR-308):** `electron-updater` generic provider reads `latest*.yml` from Cloudflare R2; NSIS (Win) + `.deb` (Linux), roll-forward. Native packaging: pnpm `nodeLinker: hoisted` — **NEVER** the isolated linker, **NEVER** `pnpm deploy`, keep `npmRebuild:false`; per-dir node-gyp rebuild. Full detail → ADR-204 Am3.
- **ESM build gotcha (decision):** main + fp-host need a `createRequire` banner in `vite.{main,fp-host}.config.ts` (bundled CJS deps' `require('fs')` throws in ESM). Do NOT switch main to CJS.
- **"Account" = UI label; `workspace` = base mechanism term:** visible strings say "account"; internal `workspace.*` identifiers unchanged by design (ADR-106 — base must not adopt domain vocab). Full internal rename = O196.
- **No-ADR renderer-only feature decisions:** resizable Parts (LayoutService sizes + `ResizeHandle`, persisted via `prefs`); Activity-Bar density pref (localStorage axis, like Font/Theme).

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