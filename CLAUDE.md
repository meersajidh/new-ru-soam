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

- Electron 41 (main + preload + renderer + bundle-host = four processes / trust zones — ADR-101, ADR-410). Pinned at 41 in Phase 10a — `better-sqlite3-multiple-ciphers@12.9.0` no compile against Electron 42 V8 14 API. Bump re-evaluated when SQLCipher lands in 10b (O157).
- React 19 + React Compiler, TanStack Router (file-based, generated `routeTree.gen.ts`), TanStack Query
- Tailwind v4 (`@tailwindcss/vite`) with CSS class-based theming (palette × luminance × font-set axes — ADR-413)
- ProseMirror (in `@ru-soam/editor`, RuEdit primitive)
- Vite for renderer, main, preload, bundle-host bundles (four `vite.*.config.ts`)
- TypeScript ESNext, ESM-only, `strict`, `verbatimModuleSyntax`, `erasableSyntaxOnly`
- pnpm workspaces (`nodeLinker: hoisted` in `pnpm-workspace.yaml`); `just` for dev recipes; `electron-builder` for packaging (reverted to pnpm — ADR-204 Amendment 3; hoisted gives the flat real-dir node_modules needed for correct native-module packaging on Windows, without pnpm's default isolated linker)

**Entry points:**

- Renderer: `apps/desktop/src/main.tsx` → `App.tsx` → `Workbench.tsx`
- Main: `apps/desktop/electron/main/index.ts`
- Preload: `apps/desktop/electron/preload/index.ts` (exposes `window.soam` — ADR-202)
- Bundle Host: `apps/desktop/electron/bundle-host/index.ts` (Node process spawned on demand — ADR-410)
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
│   │   │   ├── bundle-host/       # Bundle Host Node process (ADR-410)
│   │   │   └── shared/            # IPC + host protocol types (renderer↔main↔host)
│   │   ├── src/                   # Renderer (React composition shell — ADR-102)
│   │   │   ├── platform/          # services, command, context-key, keybinding,
│   │   │   │                      # theme, font, layout, statusbar, workspace, ru-edit
│   │   │   ├── workbench/         # Parts: TitleBar, Banner, Middle (5 slots), StatusBar
│   │   │   ├── routes/            # TanStack Router (file-based) + routeTree.gen.ts
│   │   │   └── styles/            # tokens.css, palette CSS, workbench.css
│   │   ├── bundles/               # First-party bundles (e.g. echo-test, echo-lazy)
│   │   └── vite.{main,preload,bundle-host,config}.ts
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
- Bundle Host crash must NOT take down Renderer (ADR-410, Phase 1 exit). Treat host calls as remote: timeouts, typed errors, no shared memory assumptions.
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
  OWNS the detail. NO build or PR receipts — the ADR or the committed code is the home.
  If an entry needs more than ~2 lines, it belongs in an ADR or Open-Item, not here.
  Reusable operational traps go in Dev Gotchas below, not here.
-->

- **Orchestration:** Opus plans + reviews; Sonnet (`implementer`) builds. Thin briefs (intent + scope + success criteria); the agent reads context from the codebase. Full process → Orchestration Protocol below.
- **Styling:** policy in Conventions → UI/styling + `docs/Guides/styling-system.md`; architectural changes need an ADR.
- **Two-axis architecture (the frame for everything):** trust zones (ADR-101: Main→Preload→Renderer→Bundle-Host, privilege) ⟂ layers (ADR-106: base/domain/extensions, generic↔specific). Orthogonal — can't read one from the other. Guide: `docs/Guides/architecture-two-axes.md`.
- **ADR-106 base/domain (+ Am1 extensions tier):** base = `basebench` mechanisms (`@basebench/*`); domain = `ru-soam` first-party bundles; extensions = third-party. One-way dep `base ← domain ← extensions`, lint-enforced. Deferred: O194 (extract base pkg), O195 (Layer-field sweep), O196 (brand→`basebench` rename: `window.soam`/`@ru-soam/*`/`__soamView`/`RuEdit`).
- **ADR-418 (Accepted) bundle trust tiers:** First-Party-Host (trusted: binds any cap incl. PHI *returns*, NO keys) vs Bundle-Host (untrusted: PHI caps hard-denied structurally). UI sandbox for ALL bundles; coarse `trustClass` identity (not full ocap). Honest PHI invariant: keys/decrypt/ciphertext Main-only, PHI plaintext only in Renderer + First-Party-Host. MVP defers the 2nd host. Detail → ADR-418.
- **ADR-506 (Accepted) domain module model — SUPERSEDES ADR-504:** Main is pure-`basebench` (NO domain code); `core-domain` RETIRED; canonical record = a first-party bundle, command logic in First-Party-Host, persisted via a generic ownership-scoped base store cap. CQRS (command/query/overlay); hybrid validation (hard = Main schema constraints, soft = FP-Host, audit Main-owned); sole-writer Main-enforced via declared ownership; CQRS preload bridge split; deps declared + validated pre-load. Key reconciliation: **logical ownership ≠ execution residency** ("Sessions owns notes" = ships the model that runs in FP-Host, not Main). Forks A→distributed / B→cmd-query split / D→read-model / E→cascading-erase. Open: O439–O451. **SPINE `0→A→B→C→D` COMPLETE 2026-06-03 — PURE-BASE MAIN REACHED for the patient record** (`record-patient-cap.ts` deleted; both record caps FP-Host-resident in ru-soam-practice, persisting via `store.write`/`store.query`; Main registers no domain logic). Remaining: E (preload CQRS bridge O447), F (dep-graph O445), G (hard-invariants→schema O448); migration sets + query templates still Main-boot-registered as data (stopgap). Author NEW modules CQRS-explicit + FP-Host-resident from the start.
- **ADR-418 Am1 + ADR-506 phasing correction (2026-06-03):** FP-Host is **MVP, not deferred** — the deferred zone is the 2nd untrusted **third-party/extensions** host (rung H). Existing `electron/bundle-host/` = the **First-Party-Host**; promote it **capably** (not a label). "Pure-base Main" is an **MVP target** (rung D moves record cmd logic into FP-Host). **Migration rung ladder, spine `0→C→D`:** `0` FP-Host capable seam (O449: Host→Main consumer channel + caller `bundleId`/`trustClass` in registry dispatch + PHI-gate-by-trustClass; today host can only PROVIDE caps, dispatch is identity-blind) → A CQRS-author (O442) → B per-bundle migrations (O444) → C generic ownership-scoped store cap (O446) → D Main→FP-Host cmd move = pure-base Main → E CQRS preload split (O447) → F dep-graph (O445) → G hard-invariants→schema (O448). **trustClass = platform-assigned by provenance, NEVER self-declared** (O439 tiered: MVP = in-signed-package→first-party + optional hash fingerprint; rung H = publisher-key authN). Naming hazard O450 (`bundle-host` dir now hosts FP-Host). Risk/Safety (O419) authors CQRS-explicit, may stopgap as Main cap until C/D. Naming hazard O450 (`bundle-host` dir now hosts FP-Host).
- **O449 rung-0 seam BUILT (2026-06-03, compile+lint green, runtime-unverified):** FP-Host now CONSUMES Main caps with caller identity, not just provides. (1) `TrustClass` in `shared/host-protocol.ts`; provenance-assigned in `loader.ts` (in-package→`first-party`), stored on `manager` activated record. (2) Host→Main consumer channel: `ctx.bindCapability(name,ver)→{call,dispose}` (`bundle-host/index.ts`, host-local id namespace `hostNextId`/`hostPending`); protocol += `host.consume.invoke` + `host.consume.result|error`; `manager.handleConsumeRequest` branches **before** reply-pending lookup (id-collision guard) + resolves trustClass from Main's OWN record (host never sends it → no self-elevation). (3) `invokeCapability(...,opts?:{caller?})` additive → undefined caller (renderer/internal Main) = trusted PHI zone, gate dormant. (4) PHI gate `entry.phi && caller && trustClass!=='first-party' → cap.denied` (new `CapErr.Denied`), before lock-gate. Proof: echo-test `consume-prefs` binds `platform.bundles.listActivated` through seam; dev self-check `main/index.ts:189-202` asserts synthetic `third-party`→`cap.denied`.
- **Rung A / O442 CQRS-author DONE (2026-06-03, compile+lint green, runtime-unverified):** Decision = **SEPARATE CAPS** per module (cap identity = CQRS class), not method-classes within one cap. Rationale: command path → FP-Host owner-only (rung D) ⟂ query path → Main generic query executor (rung C) = different residency+authz futures, so split now makes B/C/D mechanical not re-split. (§7 query-only-to-untrusted lever secondary for PHI records — rung-0 PHI gate denies untrusted wholesale; lever bites non-PHI only.) Hard sole-writer stays at generic store cap (`callerBundleId==owner`, rung C), NOT cap shape. **Built:** `record.patient@1.0` (`kind:'command'`: create/update/setStatus/setStage/updateProfile) + `record.patient.query@1.0` (`kind:'query'`: get/list/getProfile/getLifecycle/listLifecycleStages); both `phi:true`, both Main-resident as stopgap until rung D. `registerCapability` opts += dormant `kind?:'command'|'query'` (consumed at rung E preload-split / rung C store-cap; not enforced now). All binders updated lockstep — query views (projections/aspects/overview/roster) → `.query` cap; `bootstrap.ts` setStatus/setStage stay command; **form.html edit-mode dual-binds** (owner legitimately commands+queries).
- **Rung B / O444 per-bundle migrations DONE (2026-06-03, compile+lint green, runtime-unverified):** Central linear `migrations.ts` → per-owner `MigrationSet`s. Base registry in `local-store/migrations.ts` (`MigrationSet{owner,migrations[]}` + `registerMigrationSet` + `getOrderedMigrationSets`); base set (owner `'base'`, v1-3) self-registers on module load. `_schema_version` reshaped single-row→**per-owner** `(owner TEXT PK, version INTEGER)`. `runMigrations` applies pending per owner in deterministic order (**base first, then domain in registration order**), whole upgrade in ONE tx. **Owner key = bundleId, NEVER Activity** (`'ru-soam-practice'` from manifest; "Practice" is an Activity *inside* the bundle). Patient tables → new `domain/practice-migrations.ts` (renumbered v1-3), registered via `registerDomainMigrations()` (domain/bootstrap.ts) at **`index.ts:150`, BEFORE `openFor()` (:162)** — THE ORDERING TRAP: store-open triggers runMigrations, so sets must register first (caps still register late at :213, they need lock-gate armed; migrations don't). All CREATE += `IF NOT EXISTS`; lifecycle backfill → `INSERT OR IGNORE`. **No legacy reconciliation** (dev — user wipes DBs before next launch). DEFERRED: FK-dep-graph ordering → F/O445; **explicit table→owner mapping still IMPLICIT in DDL** — rung C/O446 store-cap needs it explicit for `callerBundleId==owner` enforcement. **NEXT: dogfood (wipe dev DBs + verify table creation), then rung C (O446 generic ownership-scoped store cap) per spine 0→C→D.**
- **Rung C slice 1 (C1+C2) / O446 DONE (2026-06-03, compile+lint green, runtime-unverified):** Decision (user): **PRAGMA cached column validation — NO ORM, NO hand-rolled descriptor, NO separate ADR** (Drizzle would ride better-sqlite3 w/o native binary but wrong shape: store cap is runtime-dynamic-table, ORMs are compile-time-schema-bound; revisit only if really needed). Sliced C1+C2 first, **C3 query executor deferred to slice 2** (read path stays `record.patient.query` direct-DB until D). **C1:** `MigrationSet`+=`ownedTables:string[]`; `registerMigrationSet` throws on dup table-claim; `tableOwner(table)→owner|null` (base owns prefs/audit_log/workspace_settings; ru-soam-practice owns patient tables; `_schema_version` unowned). **C2:** new `local-store/store-write-cap.ts` = `store.write@1.0` (`phi:true,kind:'command'`) generic `insert/update/delete`→`{changes}`. Enforce order: registry PHI-trustClass → registry lock → `tableOwner` null⇒`cap.not_found` → PROTECTED{audit_log,_schema_version}⇒`cap.denied` (integrity, even Main-internal) → ownership `caller.bundleId!=owner`⇒`cap.denied` (dormant when caller undefined=Main-internal) → audit.event required → cached PRAGMA `table_info` column-validate → Main-built parameterized SQL (no caller SQL) → `emitTableChange`+`auditService.emit`. **`CapabilityHandler` additively gained 3rd `caller?` arg** (registry threads `opts?.caller`; all existing handlers ignore). **UNCONSUMED until rung D** (record.patient keeps direct-DB handlers). DEV self-check (index.ts, **after** registration — caught+fixed in review: was before → cap.not_found false-FAIL) asserts non-owner first-party→`cap.denied`, lock-tolerant SKIP. Deferred hardening: write+audit not 1 tx (matches record-cap; §6 omit-guard met); per-table PHI (store.write PHI wholesale).
- **Rung C slice 2 (C3) / O446 DONE (2026-06-03, compile+lint green, runtime-unverified) — rung C now COMPLETE:** `local-store/store-query-cap.ts` = `store.query@1.0` (`phi:true,kind:'query'`) declared-query executor. `run(templateId, params?, audit?)`→rows. `registerQueryTemplate` (dup-id + static SELECT/WITH-only + single-statement guards). Per-call `db.prepare` (NO cached stmt — safe across workspace switch) + **authoritative `stmt.readonly===true` assertion** = "queries never mutate" (non-readonly⇒cap.denied + console.error); named `@param` binding via `stmt.all(params??{})`; unknown template⇒cap.not_found; audit OPTIONAL on reads (caller view-audit tag, emit if present — audit-on-view becomes FP-Host job at D). NOT owner-gated (many-consumer §3; PHI gate = access control). Practice read templates in new `domain/practice-queries.ts` (patient.get/list/getProfile/getLifecycle, raw-row SELECTs mirroring record-patient-cap; listLifecycleStages excluded=static) via `registerDomainQueries()` (bootstrap.ts 3rd entry point; index.ts:274 after store.query registered). DEV self-check unknown-template→cap.not_found, lock-tolerant. **UNCONSUMED until D.** (Stale-LSP `recordId` error after AuditTag edit — `tsc -b` clean, ignore per O450-class gotcha.)
- **Rung D1 / queries→FP-Host DONE (2026-06-03, compile+lint green, runtime-unverified):** First real consumption of the store caps + first domain LOGIC out of Main. **Enabler:** `CapabilityManifestEntry` (fp-host/manifest.ts) += optional `phi?`/`kind?`; `manifest.ts validate()` parses them; `loader.ts registerRoutingHandlers` passes `{phi:cap.phi??false, kind:cap.kind}` as the 4th config arg to the routing `registerCapability` → host-PROVIDED PHI caps now lock-gated at the record boundary (defense-in-depth; store caps re-gate anyway). **Move:** `ru-soam-practice/manifest.json` declares `record.patient.query@1.0` (phi,query); `ru-soam-practice/index.mjs` `activate(ctx)` binds `store.query` (rung-0 `ctx.bindCapability`) + registers `record.patient.query` host-side (get/list/getProfile/getLifecycle/listLifecycleStages) — calls `storeQuery.call('run',[templateId,params,auditTag])`, maps RAW snake_case rows→camelCase records in plain JS (bundles = hand-authored .mjs, NO TS build), audit-on-view passed as the store.query audit tag (list drops count — post-query). `record.patient.query` registration + query impls REMOVED from Main `record-patient-cap.ts` (now command-only) to avoid double-registration (the loader routing entry + a Main entry = `registerCapability` "already registered" throw). **🔑 REUSABLE: moving a cap Main→host = (1) add to manifest capabilities w/ phi/kind, (2) register host-side in activate(), (3) DELETE the Main registration — else double-reg collision.** Lazy activation intact (first query invoke → loader `ensureActivated` → activate() registers handler). Known dup: `LIFECYCLE_STAGES` now in Main (command-cap validateStage) + host copy — consolidates at D2. **NEXT: dogfood D1 (open roster/overview/aspects/form-edit — all reads route renderer→Main-routing→host→store.query→Main; confirm records load + audit-on-view still emits), then rung D2 (command cap→host consuming store.write, DELETE record-patient-cap.ts = pure-base Main).**
- **Rung D2 / commands→FP-Host DONE (2026-06-03, compile+lint green, runtime-unverified) — 🎯 PURE-BASE MAIN REACHED:** `record.patient` command cap relocated to `ru-soam-practice/index.mjs` (manifest declares it phi/command; activate() binds `store.write` + registers all 5 cmd methods). Each method: validate (givenName/status-enum/stage-enum, JS) → persist via `storeWrite.call('insert'|'update', [table, row/pkValue/patch, auditTag])` → read-back via `storeQuery.call('run',['patient.get'|...])` → map to record. **`record-patient-cap.ts` DELETED**; `domain/bootstrap.ts registerDomainCapabilities` = no-op stub (Main registers NO domain logic; migrations + query templates stay as DATA). **Behavior deltas (accepted, store.write contract):** `create` emits 2 audit entries (patients + lifecycle inserts — store.write mandates audit/write); audit `principal` now `ru-soam-practice` (was 'system') = real writer; multi-write non-atomic (2 inserts, matches prior sequential); `setStage`→`update` not upsert (lifecycle row exists from create); `updateProfile`→read-then-insert/update (no upsert primitive); returns via store.query read-back (store.write returns {changes}). id-gen = `globalThis.crypto.randomUUID()` (Web Crypto global, survives host module-deny). Lock: `record.patient` phi in manifest → Main routing entry lock-gates → renderer gets `cap.locked` at routing (form `isLockedError` works, same as pre-D). `lifecycle-stages.ts` now unused in Main (sole importer was deleted cap) — left in place. **🔑 DOGFOOD CRITICAL (writes now traverse renderer→Main-routing→host→store.write→Main): create a client, edit+save (form populateForm uses update return), roster status/stage context actions, verify audit ledger entries + sole-writer (only ru-soam-practice writes patient tables).**
- **Rung E / O447 CQRS preload+view bridge split DONE (2026-06-03, compile+lint green, runtime-unverified):** Decision (user) = **TWO MULTIPLEXERS** (`bindQuery`/`bindCommand`), not one bridge w/ method-classes — strongest structural read/write separation + clean future untrusted-query-only lever. **Scope: preload `window.soam` + iframe `soamView` view bridge** (views = dominant CQRS consumer). Additive, `bindCapability` unchanged for unclassified caps. Wire: `CapabilityCallRequest`+=`expectKind?:'command'|'query'`; `CapErr`+=`KindMismatch:'cap.kind_mismatch'`. **Main gate (registry.ts, AFTER not-found, BEFORE PHI-trustClass+lock = fail-fast on ABI misuse):** `expectKind!==undefined && entry.kind!==expectKind ⇒ cap.kind_mismatch` — so unclassified cap (`entry.kind===undefined`) via bindQuery/bindCommand is ALWAYS mismatch (unclassified MUST use bindCapability). `soam-channel` threads `raw.expectKind`. Preload `makeProxy(name,ver,expectKind?)` factory → 3 exports. view-bridge `_makeBoundProxy` → `soamView.{bindCapability,bindQuery,bindCommand}`; `expectKind` added to `cap.call` msg only when defined (no wire change for unclassified). `BundleViewIframe` relay `getProxy(name,ver,expectKind?)` keys cache `name@ver#kind` + routes to window.soam.bindQuery/bindCommand/bindCapability. **8 record bind sites migrated** (5 query: aspects/overview/projections/roster + form edit-query; 3 command: form create+edit-cmd + `src/domain/bootstrap.ts`×2). Gate has data: record.patient/.query routing entries carry `kind` from manifest (D1 loader). **Host `ctx.bindCapability` UNTOUCHED** (store.write/query already separate caps = kind encoded in identity). All levers (discipline, future read-model cache, untrusted-query-only grant) DORMANT in MVP — rails only. Dogfood: open record views = bindQuery path; create/save/status/stage = bindCommand path; identical behavior (ABI shape only).
- **Rung F / O445 (partial) manifest-driven schema relocation + cap-dep check DONE (2026-06-03, compile+lint green, runtime-unverified):** Decisions (user): scope = **data-relocation now, DEFER full dep-graph** (nothing cross-module to validate yet — speculative FK-graph would be wrong shape; build the live socket, extend when module #2 lands); migration/template representation = **SQL-string data in manifest** (NOT declarative-DDL descriptor — no-ORM ethos; Main exec'ing first-party-authored DDL strings = data of manifest provenance, schema-only no-PHI, accepted; untrusted-bundle migration sandboxing → rung H). **Built:** (1) `BundleManifest` += `ownedTables`/`migrations:[{version,description,sql}]`/`queryTemplates:[{id,sql}]`/`dependencies:{capabilities:["name@version"]}` (manifest.ts validate() parses+guards). New BASE infra `fp-host/bundle-schema.ts` (ADR-106 base, no domain imports): `registerBundleMigrations(discovered)` builds base `MigrationSet{owner:manifest.id,ownedTables,migrations→{up:db=>db.exec(sql)}}` (base `registerMigrationSet`/`MigrationSet`/`up` interface UNCHANGED — fed from manifest); `registerBundleQueryTemplates(discovered)` registers each; `validateCapabilityDependencies(manifest)` throws if a declared cap-dep unregistered (`registry.isCapabilityRegistered` added). (2) **`electron/main/domain/practice-migrations.ts` + `practice-queries.ts` + `bootstrap.ts` DELETED** — SQL moved verbatim into `ru-soam-practice/manifest.json` (v3 backfill `${now}`→SQLite `(strftime('%s','now')*1000)`); `domain/` now holds only unused `lifecycle-stages.ts`. **🎯 PURE-BASE MAIN NOW ALSO AT DATA LEVEL** (Main binary = zero domain SQL; base set owner `'base'` stays base code — base is not a bundle). (3) index.ts resequenced: `discoverBundles` ONCE early (`resolveBundlesDirectory()` exported from loader), `registerBundleMigrations` BEFORE `openFor()` (ordering trap), `registerBundleQueryTemplates` after `registerStoreQueryCapability()`, `loadAndActivateBundles(discovered)` shares list (no double-discovery). Cap-dep validation wired into BOTH loader paths (eager try/catch→failed; lazy throws→cap error); ru-soam-practice declares store.write@1.0 + store.query@1.0. **DEFERRED (O445 open, TODO at validateCapabilityDependencies):** FK/cross-module-query/bundle-dep + activation-ordering graph — extend the live cap-dep socket when a 2nd domain module lands. Dogfood: wipe dev DBs → launch → confirm patient tables created from manifest migrations + roster/overview load via manifest query templates.
- **Rung G / O448 RESOLVED 2026-06-03 — PRINCIPLE, NO CODE (closes E→F→G):** User challenged §5-as-written ("should Main even be aware of domain invariants like enums? FK yes, but enums belong to the owner bundle"). **Agreed + drew the line: structural/referential integrity vs domain value-vocabulary.** **Structural → Main schema** (`FK`/`NOT NULL`/`PRIMARY KEY`/`UNIQUE`, + `CHECK` only when structural e.g. `amount>=0`): integrity independent of domain meaning, manifest-declared data, pure-base holds. **Domain value-vocabulary → FP-Host** (enum membership `status∈{…}`/`stage∈{…}`, trimming, required-field UX): domain knowledge that evolves; DB `CHECK` would duplicate the valid-set (FP-Host + schema) → drift + migration-coupling. **🔑 Why FP-Host value-enforcement suffices (no DB-CHECK backstop):** sole-writer ownership gate (`store.write` `callerBundleId==tableOwner`) ⇒ only writer to a record's tables = its owner FP-Host, whose only write path runs validated command logic ⇒ no generic-bypass writer to defend against; defense-in-depth applies to STRUCTURAL integrity (corruptible by a logic bug regardless of writer), not vocabulary. **Patient record: structural invariants ALREADY declarative** (FK pragma on `store.ts:61`, `REFERENCES patients(id)` live, `given_name`/`status` NOT NULL); enums stay in ru-soam-practice FP-Host (`VALID_STATUSES`/`VALID_STAGES`) — **no DDL change, FP-Host validation kept**. **ADR-506 §5 AMENDED** (structural-vs-value line replaces "hard vs soft" CHECK-lumping). **Caveat (O448 stays a living test, not dead):** re-apply per record type — a future record may earn a genuinely structural `CHECK`/`UNIQUE` (billing `amount>=0`, unique email). **🎯 ADR-506 ladder COMPLETE: spine 0→D (pure-base Main, logic) + E (CQRS ABI split) + F (pure-base at data level) + G (validation line drawn). REMAINING/DEFERRED: O445 full dep-graph (until module #2), O441 iframe-relay trustClass tagging, O451 cap-transport, rung-H 2nd untrusted host. NEXT thread = Risk/Safety O419 (authorable clean as fresh FP-Host bundle) or other product work — user picks.**
- **O452 (Partial, decision committed 2026-06-04) PHI-at-rest key posture — KEK-wrapped PHI DB that closes on lock:** raised in the dev-localstore inspection thread. **Problem:** `local-store-db-key` is stored **`raw`** in safeStorage (not KEK-wrapped) per O307f bootstrap chicken-and-egg — but that rationale predates PHI landing in the SAME DB (ADR-505/506 patient tables), and the store is **NOT closed on lock** (Operational class). Net today: PHI-at-rest protected by safeStorage (OS keyring) ONLY — passphrase/KEK adds ZERO PHI at-rest protection, lock doesn't gate PHI; safeStorage defends file-theft/other-users NOT same-user code w/ unlocked keyring. **Decision = Option #2:** split PHI into a SEPARATE DB whose key is KEK-wrapped (passphrase-derived) + CLOSED on lock; prefs/bootstrap DB keeps raw key (preserves O307f). Rejected #1 accept-and-document, #3 two-layer envelope. **Open mechanism** (→ O452 in Open_Items): PHI-DB layout/path, KEK wrap/unwrap on lock/unlock (ADR-303/307 lock-service+envelope), patient-table migration out of `local-store.db`, store-cap table→DB routing, audit_log placement, KEK-rotation re-wrap (O26), dev-tooling (`scripts/dev-localstore.mjs`/`just dev-db` learn PHI DB + unwrap). **Dev tooling shipped this thread:** `scripts/dev-localstore.mjs` (Electron-context, safeStorage→DB-key, `--list`/`--info`/`--tables`/`--sql`, read-only, dev-only) + `just dev-db`/`just dev-db-sql`. **🔑 Crypto reality check:** local-store DB = better-sqlite3-multiple-ciphers DEFAULT `chacha20` scheme (sqleet), **NOT SQLCipher** — external inspect needs `sqlite3mc` (built from utelle amalgamation: compile shell3mc+sqlite3mc amalgamation together), `sqlcipher` CLI fails HMAC every page. store.ts comments corrected.
- **O452-A BUILT + RUNTIME-VERIFIED 2026-06-05 (compile+lint green; dogfood all 6 checks green — CDP, meersh workspace, no-wipe; uncommitted) — PHI-at-rest split. ADR-302 + ADR-307 amended (2026-06-05), Open_Items O452 row updated.** Two physical DBs/workspace by **residency class** (base-neutral per ADR-106 — base NEVER names "PHI"): `operational` (`local-store.db`, raw key, open-while-locked — prefs/settings/`audit_log`, O307f preserved) + `protected` (`protected-store.db`, **KEK-wrapped** random 256-bit key, opened-on-unlock/closed-on-relock — Clinical PHI). **Residency = explicit field** on `MigrationSet` + bundle manifest (`residency:'operational'|'protected'`, default operational); domain opts in (`ru-soam-practice/manifest.json` += `"residency":"protected"`). **Lazy provisioning**: protected store + key file exist ONLY when `hasProtectedSets()` true. Key wrap = `wrapKeyToEnvelope`/`unwrapKeyFromEnvelope` (AES-GCM-KW) AAD `buildProtectedStoreKeyAad(workspaceId)` purpose `'protected-store-key'` (dedicated builder, NOT widened `buildKekWrapAad`), persisted `protected-store.key.json` (mode 0o600, NOT lock.json — subsystem boundary, NOT keychain). **Lifecycle (lock-channel.ts):** `openProtectedStoreIfNeeded(workspaceId,svc)` (guards `hasProtectedSets()` + `kekHandle()!==null` + already-open-same-ws skip) wired into unlock/unlock-recovery/setup-acknowledge success; `onDidChange(state.locked)`→`closeProtected()` on BOTH initial + set-active subscriptions (covers relock/auto-lock/set-active/sign-out); `closeActive`+`quiesceActive` also close protected. Boot stays locked → protected NOT opened until first unlock. **No re-wrap on passphrase change** (KEK stable; only O26 rotation re-wraps). **Routing:** `runMigrations(db,residency)` filters sets per-DB (each DB own `_schema_version`; operational=base+operational-domain, protected=protected-only); `store.write` `requireStoreForTable(table)` + `store.query` `requireStoreForTemplate(template.residency)` route by `tableResidency`. **🔑 dev-provision needs NO change** — ALL unlock/setup go through the IPC handlers (`svc.unlock` only at lock-channel:130, `setupAcknowledge` only :260; no direct bypass), so dev auto-unlock opens protected too. **Files:** `crypto/envelope.ts` (+AAD builder), `local-store/{paths,migrations,store,index,store-write-cap,store-query-cap}.ts`, NEW `local-store/protected-store-key.ts`, `fp-host/{manifest,bundle-schema}.ts`, `ipc/lock-channel.ts`, `bundles/ru-soam-practice/manifest.json`. Opus review caught + fixed 2 key-hygiene gaps on the idempotent-open path (zero key on `openProtectedFor` same-ws early-return; skip KEK-unwrap in `openProtectedStoreIfNeeded` when already open). **DEFERRED: O452-B** dev-tooling for protected DB (`just dev-db` needs passphrase→KEK→unwrap; operational DB still inspectable as-is), O26 rotation re-wrap, prod PHI migration out of `local-store.db`, per-table PHI. **DOGFOOD DONE 2026-06-05 (all green, no wipe — cleaner test):** protected-store.db+key.json created on unlock (0600, valid envelope, AAD `protected-store-key`); empty roster (reads moved off local-store.db); create→count 0→1 read-back; audit continuous in operational DB (seq 253→268, principal ru-soam-practice); relock→protected DB **physically closed** (0 fds via `/proc/*/fd | grep protected-store.db`)+cap.locked; re-unlock→reopened (3 fds), data persisted. Verify recipe: `/proc/*/fd | grep protected-store.db | wc -l` = handle count (lsof unreliable); confirm `window.soam.lock.state().locked` before asserting gate (meersh ws auto-re-unlocked between eval calls once). **CLEANUP pending (user):** orphan patient rows still in local-store.db (raw-keyed, open-while-locked = the exposure O452 fixes) — file-delete local-store.db(+wal/shm) after sign-out for fresh operational DB; KEEP protected-store.key.json. **NEXT = commit (ADRs+code+manifest+docs uncommitted).**
- **ADR-505 (Draft) Practice Activity (+ Am1–3):** roster + Client record; record opens as Overview editor (form = create-path only); tables `patients` / `patient_profile` / `patient_lifecycle`; Am3 lifecycle/status model (orthogonal axes, cyclic stages — O419 thread 1 built). Projection cards mock (source-pill) until owning Activities ship. Open: O419 (Risk/Safety keystone + 4 threads), O420 (adjuncts), O421 (Billing), O422 (shared fonts).
- **ADR-417 (Accepted) menu + keybinding contributions:** `menus` / menu-id registry / renderer-owned `IMenuService` / `keybindings`; renderer↔iframe context-menu channel. **Pattern — PHI-touching bundle actions = renderer-domain commands (`src/domain/bootstrap.ts`), never host commands, so PHI never enters the host.** Follow-ups built: O423 toggle, O424 alt-command, O425 submenu/radio, O426 multi-stroke + rebinding UI, O429 `usePopover` primitive. Detail → ADR-417 + Open_Items.
- **ADR-413 Am1 (Accepted) icons = VS Code Codicons:** `<Icon>` font in the shell, inline-SVG in iframes; `src/platform/icons/` registry is the single swap point. Built O434 (shell), O435 (iframe). Detail → ADR-413 Am1 + Open_Items.
- **Activity/Aspect taxonomy (O418):** Aspect = uniform view primitive (Navigation vs Contextual by slot); Activity = top-level surface. Vocabulary + MVP catalogue → `docs/Product/Product_Scope.md` (O72/O197).
- **Practice design = journal+promote (`docs/Activities/practice/`):** own `00NN` log; settled → ADRs, open → Open-Items; continuity map = `adr-crosswalk.md`.
- **Release / update (ADR-204 + Am1–3, ADR-308):** `electron-updater` generic provider reads `latest*.yml` from Cloudflare R2; NSIS (Win) + `.deb` (Linux), roll-forward. Native packaging: pnpm `nodeLinker: hoisted` — **NEVER** the isolated linker, **NEVER** `pnpm deploy`, keep `npmRebuild:false`; per-dir node-gyp rebuild. Full detail → ADR-204 Am3.
- **ESM build gotcha (decision):** main + bundle-host need a `createRequire` banner in `vite.{main,bundle-host}.config.ts` (bundled CJS deps' `require('fs')` throws in ESM). Do NOT switch main to CJS.
- **"Account" = UI label; `workspace` = base mechanism term:** visible strings say "account"; internal `workspace.*` identifiers unchanged by design (ADR-106 — base must not adopt domain vocab). Full internal rename = O196.
- **No-ADR renderer-only feature decisions:** resizable Parts (LayoutService sizes + `ResizeHandle`, persisted via `prefs`); Activity-Bar density pref (localStorage axis, like Font/Theme).

### Dev Gotchas (operational, reusable)

- **Full `just dev-desktop` restart required after Main / Bundle-Host / manifest changes.** Renderer HMR + Main-only restart leaves the bundle-host running stale module-cached code → command/contribution appears unregistered. Clean restart fixes. (Hit repeatedly during ADR-406/417 verify.)
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