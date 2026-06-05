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
- **O452 (DONE + committed 2026-06-05) PHI-at-rest split:** Local Store split by residency — `operational` (`local-store.db`, raw safeStorage key, open-while-locked: prefs/settings/`audit_log`, O307f preserved) vs `protected` (`protected-store.db`, KEK-wrapped key, opened-on-unlock/closed-on-relock: PHI). Base residency-neutral (never names "PHI"); domain opts in via manifest `residency:'protected'`; lazy-provisioned. `store.write`/`store.query` route by `tableResidency`/template residency; audit stays operational (PHI-free invariant). Dev inspect: `just dev-db <ws> --protected`/`dev-db-psql` (passphrase→KEK→unwrap). Deferred: O26 KEK-rotation re-wrap, prod PHI migration out of `local-store.db`, per-table PHI. Detail → ADR-302/307 + [[project_o452_phi_at_rest]].
- **ADR-505 (Draft) Practice Activity (+ Am1–4):** roster + Client record; record opens as Overview editor (form = create-path only); tables `patients` / `patient_profile` / `patient_lifecycle`; Am3 lifecycle/status model (orthogonal axes, cyclic stages). **Am4 (2026-06-05) = Practice Information Architecture**: synthesized by working BACKWARDS from the static prototype (`practice-proto-handoff/`). Two new journal artifacts are the source of truth → `docs/Activities/practice/practice-information-architecture.md` (the IA matrix: *lifecycle×entity×surface×command×ownership*, surface map, 3 Overview view-modes, intake capture path, drill-down ladder) + `practice-build-plan.md` (release phases P0 legibility→P1/P2 owned spine→P3 docs→P4 Risk→P5 modes/Intake/Attention→P6 projections; spine-real-first, projections-mock). **Am4 resolves: Risk/Safety = BOTH banner+aspect (§A4.1, was the O419 keystone), Intake = progressive-capture checklist (§A4.3), Overview view-modes = pref axis (§A4.2), residency reconciled to ADR-506 (§A4.4, supersedes Am3 "Main-resident"), UI maturity-marking Concrete/WIP/Mock (§A4.5).** Projection cards mock (source-pill) until owning Activities ship. Open: O419 (residual = safety-plan fields + §23 UX), O420 (adjuncts), O421/A1 (Billing — confirm or Payment stays mock), O453 (maturity-marking, P0), O454 (protected blob store, gates P3 docs), O455 (view-modes), O456 (Attention set), O422 (shared fonts). Product_Scope amendments A1–A3 proposed.
- **ADR-417 (Accepted) menu + keybinding contributions:** `menus` / menu-id registry / renderer-owned `IMenuService` / `keybindings`; renderer↔iframe context-menu channel. **Pattern — PHI-touching bundle actions = renderer-domain commands (`src/domain/bootstrap.ts`), never host commands, so PHI never enters the host.** Follow-ups built: O423 toggle, O424 alt-command, O425 submenu/radio, O426 multi-stroke + rebinding UI, O429 `usePopover` primitive. Detail → ADR-417 + Open_Items.
- **ADR-413 Am1 (Accepted) icons = VS Code Codicons:** `<Icon>` font in the shell, inline-SVG in iframes; `src/platform/icons/` registry is the single swap point. Built O434 (shell), O435 (iframe). Detail → ADR-413 Am1 + Open_Items.
- **Activity/Aspect taxonomy (O418):** Aspect = uniform view primitive (Navigation vs Contextual by slot); Activity = top-level surface. Vocabulary + MVP catalogue → `docs/Product/Product_Scope.md` (O72/O197).
- **Practice design = journal+promote (`docs/Activities/practice/`):** own `00NN` log; settled → ADRs, open → Open-Items; continuity map = `adr-crosswalk.md`.
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