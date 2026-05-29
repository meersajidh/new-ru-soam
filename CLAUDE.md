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

- Electron 41 (main + preload + renderer + bundle-host = four processes / trust zones — ADR-101, ADR-410). Pinned at 41 in Phase 10a — `better-sqlite3-multiple-ciphers@12.9.0` no compile against Electron 42 V8 14 API. Bump re-evaluated when SQLCipher lands in 10b.
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
  Top-level, always-relevant decisions only. Specific/detailed designs
  belong in ADRs (`docs/ADRs/`) — link from here when needed. One line per
  decision. No entry per task, per PR, or per day.
-->

- Orchestration: Opus plans + reviews; Sonnet implements. Briefs thin (intent + scope + success criteria); implementer reads context from codebase.
- Electron pinned `^41.2.2` — `better-sqlite3-multiple-ciphers` does not compile against Electron 42 V8-14 API (O157 open). Revisit when BSMC supports V8-14.
- Styling system policy lives in **Conventions → Styling system**. Architectural changes to it require an ADR.
- Release & update channel (ADR-204) + update-time data integrity (ADR-308) accepted. Auto-update via `electron-updater` from Main; NSIS (Win) + `.deb` (Linux) targets; roll-forward only; staging via prerelease semver tags (`allowPrerelease=false` hides them from stable).
- **ADR-204 Amendment 1 (2026-05-24): artefact host = Cloudflare R2, not GitHub Releases.** Source repo is private → public GH release assets 404 for anon (breaks website downloads AND shipped `electron-updater` feed). Pivot: `electron-updater` `provider: generic` reading `latest*.yml` from a public R2 bucket URL. R2 is download-only for generic, so CI builds `--publish never` then uploads `release/*.{exe,deb,yml,blockmap}` to R2 over the S3 API (endpoint `https://<acct>.r2.cloudflarestorage.com`, region `auto`). No GitHub Release created; website is the changelog surface. Prerelease = channel manifest `beta.yml` (from `-beta.N` tag), not a GH prerelease flag. Website shows SHA-512 from the manifest (not SHA-256). **Feed URL bakes into `app-update.yml` → must be fixed before first R2 release; v0.1.0 (GH provider) has a dead updater, first R2 release is the working baseline.** New open items O186 (public-access surface), O187 (retention), O188 (upload integrity). Needs R2 S3 creds as GH secrets (`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`/`R2_BUCKET`/`R2_PUBLIC_URL`) — separate from the Pages `CLOUDFLARE_API_TOKEN`.
- Phase 10b migration runner must resolve O182 before wiring `schema-gate.ts`: migrations use a `_schema_version` table, but ADR-308 / `schema-gate.ts` assume `PRAGMA user_version` (reads 0 today). Pick one source of truth. `createPreMigrationBackup` + `quiesceForUpdate` helpers exist but are not yet wired into the live migration path.
- ESM main + bundle-host bundles need a `createRequire` banner. Vite 8/Rolldown bundles CJS deps (electron-updater, @scure/bip39, zxcvbn, lucide) whose internal `require('fs')` compiles to a `__require` helper that throws in ESM (`require` undefined) — packaged app crashed at startup with "Calling require for fs in an environment that doesn't expose the require function". Fix: `rollupOptions.output.banner` injecting `import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);` in `vite.main.config.ts` + `vite.bundle-host.config.ts`. Rolldown then routes all CJS requires through the real require (no `__require` helper emitted). Preserves ESM-only convention; preload already CJS so unaffected. Do NOT switch main to CJS.
- **Package manager = pnpm (pnpm workspaces, `nodeLinker: hoisted` in `pnpm-workspace.yaml`).** Commands: `pnpm install --frozen-lockfile`, `pnpm --filter ru-soam <script>`; packaging = `cd apps/desktop && pnpm exec electron-builder --config electron-builder.yml`. **Native-module packaging is load-bearing and trap-laden — do NOT change it without reading [ADR-204 Amendment 3](docs/ADRs/204-installer-integrity-and-update-channel.md),** which owns the full detail (nodeLinker rationale; the per-dir `node-gyp` rebuild in `scripts/rebuild-natives.mjs` that replaces the silently-no-op `@electron/rebuild`; the `allowBuilds` map; the Windows VC++-runtime DLLs staged beside the argon2 `.node`; the MSVC+Python build-host prereq; why one `pnpm-lock.yaml` makes npm #4828 moot). Hard invariants: never pnpm's default isolated linker (junctions unpacked → broke v0.1.0–0.1.2), never `pnpm deploy` (wrong-ABI'd v0.1.3), keep `npmRebuild: false`.
- **Two-layer architecture (ADR-106, 2026-05-27): domain-agnostic base `basebench` + domain layer `ru-soam` on top.** Base = mechanisms/engines/primitives (shell, command, context-key, layout, statusbar, services, theme, font, `BaseEdit` editor primitive, snippet engine, encrypted-store *capability*, generic workspace = Entity, identity + subscription + entitlement *mechanism*, sync transport); neutral package scope `@basebench/*`. Domain = PHI *schema*, clinical editor types, snippet *content*, tenancy model (`individual`/`clinic`), entitlement *policy* + clinical identity proofing, product brand/copy, `patient.*`/`record.*` context keys, clinical bundles (the bulk). **One-way dep: base never imports domain; lint-enforced** (extend `no-restricted-imports`). Axis is product-wide (client + future Cloud Backend) and **orthogonal to ADR-101 trust zones**. Phase A (landing now): `apps/desktop/src/domain/` home + `product.ts` for copy strings, pull `clinic` out of base `WorkspaceEntityType`, namespace reassignment, import-boundary lint. Deferred: **O194** physical extraction → `packages/core-shell`; **O195** ADR `Layer`-field classification sweep; **O196** brand→`basebench` identifier rename (`window.soam`, `@ru-soam/*`, `__soamView`, `RuEdit`) — load-bearing, staged with O194. Ladder: folder+lint (now) → published `@basebench/core-shell` (2nd domain real) → separate repo (separate team/cadence).
- **Product scope (O72 resolved, 2026-05-27): first-party surfaces = `ru-soam` domain bundles in two roles — **Activities** (top-level, Activity Bar→Primary Side Bar) and **Aspects** (entity-bound, Secondary Side Bar/Panel). Rule: default to Aspect, promote to Activity only on a compelling case (size of the action sub-space). MVP Activities: **Practice** (roster, owns canonical record), **Sessions**, **Schedule**, **Assessments**, **Planner** (Tasks+Treatment Plans merged), **Catalog** + anchored **Audit Viewer** (ADR-502). MVP Aspect: **Documents** (client PHI files); more per O197. Per-surface feature scope deferred (**O197**). Catalogue lives in `docs/Product/Product_Scope.md` (product-owned source of truth; per-Activity design → 500-series bundle ADRs that reference it). Client/Patient is a **configurable** UI label (Settings → `ProductConfigService`; `patient.*` namespace unchanged, ADR-407). **O69 now triggered** (pervasive cross-Activity refs to the Client/Patient record) — recommended `ru-soam.core-domain` foundational bundle owns shared record types and exposes capabilities; needs its own ADR before the first cross-referencing Activity is built.
- **Canonical record ownership (O69 resolved, 2026-05-28): ADR-504 (Draft, Layer: cross).** `ru-soam.core-domain` owns the canonical Client/Patient record + exposes the `record.*` capability namespace (first member `record.patient`); Activity/Aspect surfaces consume, never re-declare. **Key refinement: `core-domain` is a *Main-resident* domain service, NOT a Bundle-Host bundle** — PHI-flagged (ADR-307 lock-gate), on the base Local Store engine, so PHI plaintext never enters the Bundle Host (third-party-trust, ADR-410). Deliberate exception to ADR-106's "domain ships as bundles" default: domain *PHI data-authority* is Main-resident (like the base store capability), domain *feature surfaces* still ship as bundles. **No new base mechanism** — reuses existing `registerCapability` registry + composition-root domain-bootstrap pattern (`src/domain/bootstrap.ts`); adds the **first domain code in Main** via Main-side mirror `electron/main/domain/bootstrap.ts` (imported only by `main/index.ts`; base library stays domain-free, one-way lint intact). **O70 resolved by design** (record always-on Main-resident, not a disable-able peer → no "owner disabled, dependents broken"); residual cross-Activity projection fallbacks → O197. Method catalogue → O197 + core-domain's own design. Implementation is a later phase w/ own brief; ADR commits decision only.
- **Practice Activity (O197 first per-Activity pass, 2026-05-28): ADR-505 (Draft, Layer: domain).** First clinical surface + opens MVP core loop (Practice → Sessions → Schedule). `ru-soam.practice` = Bundle-Host Activity (activity-bar item + Primary Side Bar roster view container, ADR-405 shape, lazy activation). Defines the **`record.patient` method surface** ADR-504 deferred (owned by `core-domain`): `create`/`get`/`list`(roster)/`update`/`setStatus`/`subscribe`. **Lean PHI schema** (data-min, ADR-301): id, given/familyName, contactPhone?, contactEmail?, dob?, status(active/inactive/archived) — Clinical class, local-only (ADR-302). UI: **roster in Primary Side Bar, Client record opens as a form-based editor input in the Editor Area** (ADR-404 — platform's first non-prose editor kind, composes the generic container not BaseEdit). Sets `patient.activeId`/`record.active*` on open (ADR-403/407). Validation = ADR-104 contribution (renderer live + core-domain enforce); **audit-on-write at the `record.patient` capability boundary** in core-domain (ADR-502, first real PHI ledger use). Defers: Documents Aspect, session/assessment/schedule/planner linkage (506+), projection Aspects (O197/O70 residual once Sessions), search/filter/bulk/import-export (Practice v2), extra demographic fields (additive). Impl later phase w/ own brief.
- **Activity/Aspect taxonomy refined (O418, 2026-05-28): two-axis model.** Caught reasoning toward the Practice design chat. **Aspect** = the *uniform* view primitive (VS Code's *View*), renamed to the functional domain — **one** thing, not a per-location kind. Plays two **functional roles by axis**, slot encodes role: **Navigation Aspect** (Primary Side Bar, tightly coupled to Activity Bar; drill-in lists/trees, selection opens in Work Area) vs **Contextual Aspect** (Secondary Side Bar / Panel, bound to active Work-Area entity). **Activity** = navigation *surface* item (top-level domain you move *between*), not a mere grouping/container. **Promotion** (Aspect→Activity) = *abstraction lift*, not slot relocation; functional test = action granularity + breadth visible at once + importance/frequency (UX-driven). Fixes prior over-narrow Product_Scope definition (Aspect scoped to Secondary/Panel only, missed that Primary Side Bar lists are Aspects too). Mechanism unchanged (ADR-405 items + view containers) → **no ADR amendment**; vocabulary owned by living `docs/Product/Product_Scope.md` (edited). ADR-405/504/505 inherit by reference.
- **Practice roster polished to prototype grade (2026-05-29, ADR-505 Amendment 2).** Roster iframe view restyled: segmented **tab** lens switcher (Roster/Agenda/Attention/Intake — superseded the earlier collapsible-tree iteration, UI choice only), live **Filter clients** search + **Group None/Status** control (pulled forward from O197; Diagnosis/Language grouping deferred — needs `patient_profile` fields, O420, NOT faked), status-dot + name + optional dob-age rows, filled accent-block selection. **Brand UI font Inter Tight vendored** into `bundles/ru-soam-practice/view-assets/fonts/*.woff2`, `@font-face`'d over `view://` (had to add `font-src view:` to roster.html's own `<meta>` CSP — the injected VIEW_CSP allows it but the page meta didn't). Sandboxed iframe must NOT reach the renderer's Google-Fonts CDN (ADR-203) — local fonts only. Per-bundle font vendoring + renderer offline-CDN debt → **O422** (shared `view://_platform_/fonts/`). **HMR gotcha noted:** editing a registered service's interface (e.g. adding `LayoutService.getSizes`) while `just dev-desktop` runs throws `X is not a function` at consumers until a full boot — HMR swaps component modules but not the boot-instantiated singleton; renderer full-reload or restart fixes it.
- **Resizable workbench Parts (2026-05-29): platform shell feature, no ADR.** Primary Side Bar (right edge), Aux Side Bar (left edge), Panel (top edge) are now drag-resizable with min/max clamps (sidebars 180–480, panel 120–60vh) + double-click-to-reset. `LayoutService` (`src/platform/layout/layout-service.ts`) extended with size state (`getSizes`/`setSize`/`onDidChangeSizes` + `LAYOUT_SIZE_DEFAULTS` 240/240/200); `useLayoutSizes()` hook; `ResizeHandle.tsx` (hand-rolled drag, rAF-throttled, disposable doc listeners, `user-select:none` during drag) on each Part. Sizes **persist via the base `prefs` capability** (keys `workbench.layout.{primarySideBarWidth,auxSideBarWidth,panelHeight}`), written on mouseup, restored in `boot.ts`. Mirrors the old repo's `SideBar.tsx` handle pattern. Renderer-only (ADR-102 honored — prefs via capability, no electron import). No new contribution point / trust crossing; prefs is an existing persisted shape → no ADR. **Iframe-drag gotcha (fixed):** `ResizeHandle` mousemove is on `document`; dragging the cursor over a bundle iframe mid-drag makes the iframe swallow the parent's mouse events (Primary Side Bar narrowing over the roster iframe stalled). Fix = a full-viewport transparent **drag-shield** div (`position:fixed;inset:0;z-index:99999`) appended on mousedown, removed on mouseup/cleanup — keeps events flowing. Any future document-level drag over iframe regions needs the same shield.
- **Practice functional-design reconciliation (2026-05-29): "journal + promote" method established.** Online design conversation produced rich Practice functional design w/ its **own** decision log (`ADR-0001…0015`) under `docs/Activities/practice/` (functional-design draft + codex data-model proposal + Claude-Design HTML prototype in `practice-proto-handoff/`). That `00NN` numbering = **design journal**, NOT repo canonical ADR registry. Method (agreed): `docs/Activities/practice/` stays **living journal**; **settled** decisions promote into canonical authority, **OPEN** threads stay journal + tracked as Open Items (never promoted to ADR text early). Continuity seam = **`docs/Activities/practice/adr-crosswalk.md`** (maps every `00NN` → canonical landing). **Critical terminology fix:** journal "owner / Practice-owned" is *residency-agnostic* (chat lacked Main/Host vocabulary) = **domain data-model + CRUD-capability ownership**, which resolves to **Main-resident `core-domain` `record.*`** per ADR-504 (PHI never in Bundle Host); the Practice *bundle* is editor/consumer UI only. No architectural conflict — repo code (`electron/main/domain/record-patient-cap.ts` PHI-flagged Main + `bundles/ru-soam-practice` Host UI, `capabilities: []`) already matches. Promoted: **ADR-505 Amendment 1** (target Nav Aspect set Roster/Agenda/Attention/Intake; Overview Model-B + determinism/priming; Contextual Aspect inventory projections+native; adjunct ownership clarification; India regulatory grounding; phasing). New open items: **O419** (Practice clinical-aspect design cluster — Risk/Safety keystone, lifecycle/status, Intake stages, Attention set, note-privacy split), **O420** (adjunct-record ownership granularity: core-domain clinical adjuncts vs Practice overlays; per-table schema), **O421** (Billing candidate owning domain + promotion test). **Build scope unchanged** — slice 1 stays ADR-505 lean (roster Aspect + record form editor + Overview frame, projections stubbed; only `patients` table). Prototype = destination, not next commit (projections need unbuilt Activities; Risk/Intake/lifecycle still OPEN).

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