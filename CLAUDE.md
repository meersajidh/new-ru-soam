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
  Top-level, always-relevant decisions only. Specific/detailed designs
  belong in ADRs (`docs/ADRs/`) — link from here when needed. One line per
  decision. No entry per task, per PR, or per day.
-->

- Orchestration: Opus plans + reviews; Sonnet implements. Thin briefs (intent + scope + success criteria); implementer reads context from codebase. Full process → Orchestration Protocol section below.
- Styling-system policy lives in **Conventions → UI/styling** + `docs/Guides/styling-system.md`. Architectural changes require an ADR.
- Release & update channel (ADR-204) + update-time data integrity (ADR-308) accepted. Auto-update via `electron-updater` from Main; NSIS (Win) + `.deb` (Linux); roll-forward only; prerelease semver tags staged (`allowPrerelease=false`).
- **ADR-204 Amendment 1: artefact host = Cloudflare R2, not GitHub Releases** (private repo → anon GH release assets 404, breaks website + updater feed). `electron-updater` `provider: generic` reads `latest*.yml` from a public R2 URL; CI builds `--publish never` then uploads `release/*` over the R2 S3 API. Feed URL bakes into `app-update.yml` → fix before first R2 release (v0.1.0 GH-provider updater is dead). Needs R2 S3 creds as GH secrets (separate from Pages `CLOUDFLARE_API_TOKEN`). Full detail + O186/187/188 in ADR-204 Am1.
- **ESM main + bundle-host need a `createRequire` banner.** Vite/Rolldown bundles CJS deps whose internal `require('fs')` → `__require` helper that throws in ESM (packaged app crash: "Calling require for fs in an environment that doesn't expose the require function"). Fix: `rollupOptions.output.banner` injecting `import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);` in `vite.main.config.ts` + `vite.bundle-host.config.ts`. Do NOT switch main to CJS (preload is already CJS, unaffected).
- **Package manager = pnpm workspaces, `nodeLinker: hoisted`.** Native-module packaging is load-bearing + trap-laden — do NOT change without reading [ADR-204 Amendment 3](docs/ADRs/204-installer-integrity-and-update-channel.md) (owns full detail: per-dir `node-gyp` rebuild in `scripts/rebuild-natives.mjs`, `allowBuilds` map, Windows VC++ DLLs, MSVC+Python prereq). Hard invariants: never pnpm's default isolated linker (broke v0.1.0–0.1.2), never `pnpm deploy` (wrong-ABI'd v0.1.3), keep `npmRebuild: false`.
- **ADR-106 two-layer (2026-05-27): domain-agnostic base `basebench` + domain layer `ru-soam`.** Base = mechanisms/engines/primitives (`@basebench/*` scope); domain = PHI schema, clinical bundles, tenancy, brand/copy, `patient.*`/`record.*` keys. **One-way dep: base never imports domain; lint-enforced.** Orthogonal to ADR-101 trust zones. Phase A landed (folder `src/domain/` + lint). Deferred: O194 physical extraction → `packages/core-shell`, O195 ADR Layer-field sweep, O196 brand→`basebench` identifier rename (`window.soam`, `@ru-soam/*`, `__soamView`, `RuEdit`).
- **ADR-504 (Draft): `ru-soam.core-domain` owns canonical Client/Patient record + `record.*` capability namespace** (first member `record.patient`); surfaces consume, never re-declare. **Key: core-domain is Main-resident** (PHI-flagged ADR-307, base Local Store), NOT a Bundle-Host bundle — PHI plaintext never enters Host (ADR-410). Deliberate exception to ADR-106 "domain ships as bundles": PHI data-authority is Main-resident, feature surfaces still bundles. First domain code in Main (`electron/main/domain/bootstrap.ts`, imported only by `main/index.ts`). O69/O70 resolved by design.
- **ADR-505 (Draft): `ru-soam.practice` Activity** — first clinical surface, opens MVP core loop (Practice→Sessions→Schedule). Bundle-Host Activity (activity-bar + Primary Side Bar roster, ADR-405, lazy). Lean PHI schema (`patients` table, data-min ADR-301, local-only ADR-302); `patient_profile` adjunct (migration v5) under same Main-resident `record.patient@1.0` cap (`getProfile`/`updateProfile`, audit-on-write ADR-502). Client record opens as read-only Overview in Editor Area (ADR-404, first non-prose editor; sets `patient.activeId`/`record.active*` ADR-403/407); form kept only as New-client create path. Identity + profile REAL via cap; all projection cards mock (source-pill marked) until owning Activities ship. Amendments 1–3 + open items (O419 clinical-aspect cluster inc. Risk/Safety, O420 adjunct ownership, O421 Billing, O422 shared fonts) in ADR-505.
- **Activity/Aspect taxonomy (O418): two-axis model** — **Aspect** = uniform view primitive (VS Code *View*), plays a role by slot: **Navigation Aspect** (Primary Side Bar, drill-in lists, selection opens in Work Area) vs **Contextual Aspect** (Secondary Side Bar/Panel, bound to active entity). **Activity** = top-level navigation surface you move *between*. Promotion (Aspect→Activity) = abstraction lift, not slot relocation. Mechanism unchanged (ADR-405) → no ADR amendment; vocabulary owned by `docs/Product/Product_Scope.md` (also owns MVP surface catalogue, O72/O197).
- **Practice design = "journal + promote" method (2026-05-29).** `docs/Activities/practice/` is a living design journal (own `00NN` decision log, NOT the canonical ADR registry); settled decisions promote into ADRs, OPEN threads stay journal + tracked as Open Items. Continuity map = `docs/Activities/practice/adr-crosswalk.md`. Journal "owner/Practice-owned" = domain data-model + CRUD-capability ownership (residency-agnostic) → resolves to Main-resident `core-domain` `record.*` per ADR-504 (PHI never in Bundle Host; Practice bundle is consumer UI only).
- **Resizable workbench Parts (2026-05-29, no ADR):** Primary/Aux Side Bars + Panel drag-resizable (min/max clamps, dbl-click reset). `LayoutService` (`src/platform/layout/layout-service.ts`) gains size state (`getSizes`/`setSize`/`onDidChangeSizes`); `useLayoutSizes()` hook; `ResizeHandle.tsx` per Part. Sizes persist via base `prefs` capability (`workbench.layout.*`), restored in `boot.ts`. Renderer-only (ADR-102), existing persisted shape → no ADR.
- **ADR-417 (Accepted, 2026-05-31): menu + keybinding contributions — fully built + runtime-verified.** Commits four contribution points: (1) `menus` — declarative items `{command, when?, group, order?, toggled?}` keyed by menu-id slot, reference command ids (never fn refs); (2) menu-id registry — base-reserved slot set + `group@order` ordering + base/domain namespacing; (3) `IMenuService` — renderer-owned (ADR-412) context-menu/dropdown primitive `showContextMenu({menuId, anchor, ctx})`, `when`-filtered, owns outside-click/Esc/arrow-nav/focus-restore/edge-flip (resolves O162); (4) `keybindings` — `{key, command, when?, args?}`, override order user>bundle>platform. All three contribution types share one manifest→snapshot→renderer-seed pipeline (`seedContributed*`, idempotent, reseeded on boot + `bundle.crashed`); `default-keybindings.ts` re-homes old `basic-shortcuts.ts` (zero behavior change, platform-source). **Renderer↔view channel**: sandboxed iframe (ADR-411) posts `request.contextMenu` via `view-bridge.ts`; relay (`BundleViewIframe.tsx`) validates `menuId.startsWith(bundleId+'/')`, translates iframe→viewport coords, renders shell-side (view-proposes/shell-disposes). **Pattern — PHI-touching bundle actions are renderer-domain commands** (`src/domain/bootstrap.ts` via CommandService, e.g. `ru-soam-practice.roster.reveal`), NOT host commands, so PHI never enters Bundle Host (ADR-504/410). Per-slice impl detail + verification receipts in ADR-417. Open items: O423 toggle items, O424 alt-command, O425 submenus/radio, O426 multi-stroke + user-rebinding UI, O427 manifest validation, O428 iframe menu a11y, O429 dropdown primitive, O430 lazy-activation-on-command, O432 menu `order` field unread, O433 real PHI roster actions. (`user` keybinding source + mac cmd↔ctrl fold are forward-compat stubs.)
- **O429 resolved (2026-06-01): shared popover primitive = headless `usePopover` hook, NOT a service / `showDropdown`.** New `src/platform/popover/` — `use-popover.ts` (anchor-relative positioning + up/down edge-flip, capture-phase outside-click that excludes the element anchor so a trigger's own onClick owns toggle, Esc, focus capture/restore; coord OR HTMLElement anchor), `Popover.tsx` portal shell, `Select.tsx` (ARIA-listbox value-select on the hook). `ContextMenu.tsx` refactored onto the hook (menu-specific arrow-nav/type-ahead/separators/check kept; zero behavior change, verified). Rich shell popovers stay plain anchored components consuming the hook — no open-state bus, MenuService unchanged. **Supersedes ADR-417's interim "dropdown = element-anchored showContextMenu" stance.** First consumer = O162 StatusBar workspace quick-switcher (`WorkspaceSwitcher.tsx`, special-cased one branch in `StatusBar.tsx`): >1 workspace → upward-flipping listbox; select → `workspace.setActive(id)` + `lock.relock()` → target's unlock gate (each workspace owns its KEK, ADR-307 — relock mandatory, no no-auth switch). Renderer-only (ADR-102). **All three bespoke popovers since migrated onto the primitive (2026-06-01): SettingsMenu + UserAvatar onto `usePopover`/`Popover`, AccountSelect onto `<Select>` (first Select consumer).** Hook gained `placement: 'right-end'` + `gap` options (default `bottom-start` byte-unchanged) for the Activity-Bar-footer rail popovers that open to the side. Stopgap window-blur patches removed; no hand-rolled popover/outside-click/Esc effects remain in the shell.
- **O423 resolved (2026-06-01): toggle/checked menu items — first live consumer + toggle-icon-state.** Menu-side `toggled`→`checked`→check-glyph was built with ADR-417 but unconsumed. (1) TitleBar's 3 panel-toggle buttons reflect slot visibility via existing `useLayoutVisible(slot)` → `.tb-icon-btn.is-active` (`surface-active` bg + `text-fg-primary`) + `aria-pressed`, live-updating. (2) New right-click TitleBar context menu `workbench/title/context` (registered in `platform-commands.ts`) with 3 checkbox items (`toggled:'sideBar.visible'`/`'panel.visible'`/`'auxSideBar.visible'`, title-overridden) firing the existing toggle commands. Renderer-only. Gotcha: right-click on pure `-webkit-app-region: drag` strips won't fire `contextmenu` (Chromium) — root handler covers non-drag clusters. Radio-group = O425.
- **O434 done (2026-06-01): icon-registry seam + Codicon adoption (shell).** New `src/platform/icons/` — `Icon.tsx` (`<Icon name size? className? title?>` → `<i class="codicon codicon-<glyph>">`, imports `@vscode/codicons/dist/codicon.css`, `aria-hidden` unless `title`; inline `fontSize` overrides base `font:16px/1` shorthand — no `!important` so per-site sizing preserved) + `icon-registry.ts` (the SINGLE semantic-id→codicon-glyph table = the one place a future icon-lib swap touches; `question` fallback; icon-theme override seam marked). All 15 lucide call sites migrated; `ActivityBar`+`StatusBar` string ICON_MAPs folded into the registry; `lucide-react` removed, `@vscode/codicons@^0.0.45` declared. Codicons are font glyphs (no strokeWidth — ActivityBar active-state was already CSS class+pip, not strokeWidth). No CSS `svg` selectors existed (clean swap). Substitutions where no 1:1 codicon: hash→`tag`, stethoscope→`pulse`, dot/circle-dot→`circle-filled`, shield-check→`verified-filled`. **Distinct theme glyphs (2026-06-01): theme-light→`circle-large-outline`, theme-dark→`circle-large-filled`** (hollow vs filled = light vs dark; applies to both SettingsMenu Light/Dark buttons + StatusBar toggle, which remaps `sun`/`moon`→theme-light/theme-dark via `STATUS_ICON_REMAP`). Renderer-only. Bundle iframe icons (inline-SVG) = O435.
- **O435 done (2026-06-01): bundle iframe icons → inline-SVG codicons (ADR-413 Am1).** All 47 hand-inlined lucide stroke-SVGs in the `ru-soam-practice` views (roster/overview/aspects/projections) replaced with codicon inline-SVGs via a NEW per-bundle helper `view-assets/codicons.js` — `window.codicon(name,size)` returns a 16×16 `fill=currentColor` SVG string from an embedded `PATHS` map (verbatim from `@vscode/codicons/src/icons/*.svg`), `window.hydrateCodicons()` swaps static `[data-codicon]` spans on DOMContentLoaded, dynamic JS uses `codicon()` directly. Served over `view://` through the existing asset path (same as Practice fonts → Chromium MIMEs `.js`, classic `<script>` in `<head>` runs; CSP `script-src view:` already permits). Inline SVG (not the font) per Am1 — dodges the iframe font-src constraint. **Manifest `icon` vocab left unchanged** (shell renders them as codicons via the O434 registry already); lucide→codicon-id manifest rewrite + `$(…)` reserved-prefix formalization + O427/O86 prefix lint = deferred (O436-class). A few MOCK projection-card icons are stretch-substitutions (phone→account, pill→milestone, etc., source-pill ADR-505) — revisit when those Activities ship real. **Iframe views are cross-origin sandboxed → NOT CDP-drivable; needs full `just dev-desktop` restart + manual visual verify** ([[feedback_cross_origin_iframe_verify]]).
- **Activity-Bar density user setting (2026-06-01, no ADR — appearance pref like font-set).** New `src/platform/activity-bar/density-service.ts` (`ActivityBarDensityService`, `ActivityBarDensityServiceId`): applies `actbar-density-<compact|default|large>` class on `document.documentElement`, `onDidChangeDensity`, persists via `localStorage['soam.activityBarDensity']` (same mechanism as Font/Theme axes — NOT the prefs proxy, which is layout-only). Seeded at boot before paint (no flash). `ActivityBar.css` scales item size (30/36/44px) + gaps per density class; `ActivityBar.tsx` scales icon size (18/20/26) via `DENSITY_ICON_SIZE`, subscribed. SettingsMenu gains a Compact/Default/Large segmented control under Appearance. Live-verified via CDP: switch resizes items+icons+spacing, persists across reload. (Scoped to activity bar deliberately — global icon-scale rejected: shell icons set tuned inline `fontSize` per surface, a global multiplier fights them.)
- **ADR-413 Amendment 1 (Accepted, 2026-06-01): built-in icon set = VS Code Codicons; O108 resolved.** Product wants codicons everywhere (VS Code parity). As-built shell drifted from ADR-413's `$(…)` icon-registry design: icons consumed via direct `lucide-react` component imports (~16 files) + `ActivityBar.ICON_MAP` (lucide names as de-facto manifest contract). Amendment commits: **codicons replace lucide**; **O108 resolved split by surface** — icon **font** (`@vscode/codicons` ttf, local asset, no CDN per ADR-203) in the React shell behind a single `<Icon name>` component, **inline SVG** inside sandboxed bundle iframes (dodges the `view://` font-src gotcha); bundle-contributed icons stay SVG. `$(…)` registry becomes the only icon API; manifest `icon` fields migrate lucide→codicon ids (breaking for external bundles, OK pre-1.0). **Deferred (not started — write-ADR-now/build-later per user):** O434 (icon-registry seam + shell codicon adoption, migrate the ~16 call sites + ICON_MAP, drop lucide dep), O435 (first-party manifest icon-vocab → codicon ids + iframe inline-SVG + reserved-prefix mapping; couples O427/O86 prefix-collision lint).
- **O433 resolved (2026-06-01): first real Practice-roster PHI mutation — set client status via renderer-domain commands.** Proof `ru-soam-practice.roster.reveal` (console.log) dropped; `src/domain/bootstrap.ts` now registers `ru-soam-practice.roster.{setActive,setInactive,archive}` → one `setPatientStatus(ctx, status)` helper binding `record.patient@1.0` via `window.soam.bindCapability`, calling `setStatus(clientId, status)`, disposing proxy in `finally`. `clientId` comes from the iframe-forwarded menu ctx as `args[0]` (untrusted → shape-guarded; existence + lock enforced at cap = the roster-validation guard). Cap method was already wired (ADR-505): status-enum validation + audit `record.patient.status.changed` (ADR-502) + `emitTableChange('patients')` → roster auto-reloads via existing `onStoreChange('patients')` (no manual refresh). Manifest `menus["ru-soam-practice/roster/context"]` = 3 items, groups `1_status@1/@2` + `9_danger@1` (Archive separated). **Confirms the ADR-417 pattern end-to-end: PHI-touching bundle context-action = renderer-domain command, PHI never enters Bundle Host (ADR-504/410).** Status-conditional hiding deferred (iframe ctx carries only `{clientId}`, not status → all 3 shown, idempotent). User dogfood-verified.
- **O438 resolved (2026-06-02): bundle views stay mounted across panel toggles + `view://` canDisplay warning is cosmetic.** Two findings. (1) **Remount-on-toggle (real, fixed):** `Middle.tsx` gated each Part `{showX && <Part/>}` → hide→show **unmounted/remounted** the Part subtree → `BundleViewIframe` re-fetched HTML, re-inited bridge, lost state every toggle. Fix: wrap `PrimarySideBar`/`Panel`/`AuxSideBar` in `<div style={{display: showX ? 'contents' : 'none'}}>` — `display:contents` keeps the Part root as the real flex item when visible, `display:none` hides but **keeps mounted** (iframe persists; VS Code webview model). Renderer-only. **agent-browser-verified (CDP 9333 via a temp `window.__viewMounts` mount-counter probe):** toggle all 3 Parts off+on = **0 remounts** (was N); editor open/switch minimal (new tab +1, tab-switch 0, preview-reuse 0, first client-open mounts overview+aspects+projections once each). (2) **The `Unsafe attempt to load URL view://…/<view>.html from frame with URL <same>. Domains, protocols and ports must match.` console line = COSMETIC, intrinsic to ADR-411.** It is the iframe's own **main-document load**: `sandbox="allow-scripts allow-forms"` (no `allow-same-origin`) = **opaque/null origin** committing a `standard`+`secure` `view://host` doc → Blink `canDisplay` logs INFO but the **load succeeds** (handler 200, view renders). Temp `[view:FETCH]` log in the `view:` handler proved every line = a real main-doc load, **zero** subresource fetches (bridge/codicons/fonts all inlined). **Not removable** without breaking the PHI sandbox (`allow-same-origin`) or bundleId-origin isolation (`standard:true`, `index.ts:75`, needed for `new URL().hostname`). Dev counts further ×2 from `<StrictMode>` (dev-only); prod logs it verbosely per load on cold HTTP cache. **No resource-blowup risk — actual loads are 1-per-tab, 0-on-switch.** **Supersedes the earlier WRONG "cold-cache self-referencing subresource" guess.**
- **O424/O425/O426 resolved (2026-06-02): ADR-417 menu+keybinding follow-ups — alt-command, submenus/radio, multi-stroke chords + user-rebinding UI.** Three threads landed (Opus implemented directly — implementer subagent spawn 529'd 3×; self-reviewed). **O424 (alt-command):** `alt?` field flows `MenuItemContribution`→`SeededMenuItem`→manifest→`MenuItemSnapshot`; resolver fills `altCommand`/`altTitle`; `ContextMenu` tracks Alt keydown/keyup → swaps label while held; `executeItem(item,args,useAlt)` routes alt. Consumer: `editor/title/context` "Close"→Alt "Close Others". **O425 (submenu+radio):** `submenu?`+`radioGroup?` fields. Submenu = recursive `SubMenuFlyout` rendered as a **DOM descendant of the parent `<li>` (NOT a portal)** so the parent's `usePopover` outside-click containment treats flyout clicks as inside → parent stays open (the #1 gotcha). `usePopover` gained `right-start` placement + left edge-flip; hover-open 150ms / Right-arrow / Left+Esc closes flyout only. **Esc-close-flyout uses `stopImmediatePropagation` (not `stopPropagation`)** — usePopover's Esc listener is on the SAME node (`document`) at the SAME phase (capture), so plain stopPropagation wouldn't block it → whole menu would also close. Radio = radio-dot glyph + `menuitemradio` role; mutual-exclusion is the consumer's per-item `toggled` clauses (presentational only). **Submenu parents are LABEL-ONLY** — `command` is now optional on a menu item when `submenu`+`title` are present (resolver synthesizes `__submenu__:<id>` for React keying, never executed); this killed the no-op anchor-command hack that would've polluted the Command Palette. Consumer: titlebar `workbench/title/context`→"Color Theme" submenu, 5 palettes as a radio group driven by a new `workbench.colorTheme` context key (set in boot on theme change). **O426 (multi-stroke + rebinding):** `KeybindingService` rewritten — chords are space-separated strokes (`ctrl+k ctrl+s`), `normalizeChord` splits/normalizes per stroke; a first-stroke **prefix set** (rebuilt on any binding mutation via dirty flag) drives a **pending state machine** (1200ms timeout, `onDidChangePendingChord`→`workbench.pendingChord` StatusBar entry). **Pure-modifier keydowns (`Control/Shift/Alt/Meta/AltGraph`) are skipped** — the Ctrl-alone keydown before `k` must not be a stroke nor clear pending. User overrides persist in **global `localStorage['soam.userKeybindings']`** (`user-keybindings-store.ts`) — chosen over per-workspace prefs: keybindings are non-PHI, mirrors VSCode `keybindings.json` + the Font/Theme/density localStorage-axis pattern (NOT the prefs proxy, which is layout/workspace-scoped); O89 privacy parallel N/A. **VSCode-style `-command` removal encoding** in the store + a `_userRemovals` set keyed `${normalizedChord}::${commandId}` (chord MUST be normalized identically to stored bindings or removals silently no-op); `setUserBinding` makes the new key the SOLE trigger (adds removals for every other chord of that command); `resetCommand` drops user entries; user-source already top-ranked (user>bundle>platform). Keyboard Shortcuts editor (`workbench/keyboard-shortcuts/KeyboardShortcuts.tsx`, CommandPalette-shaped overlay, opened by `ctrl+k ctrl+s` which **dogfoods** the engine): search, rows w/ chord chips + Default/User badge + Edit/Reset, inline `ChordRecorder` whose **`setCapturing(true)` flag bails the global keydown handler** so pressing app shortcuts records instead of firing them (set on recorder mount, cleared in effect cleanup = every exit path). `chordFromEvent`/`isModifierEvent` exported for the recorder. All renderer-only (ADR-102). Deferred: per-workspace keybinding scoping, mac cmd↔ctrl fold, conflict-detection UI. **CSS gotcha re-confirmed:** `--color-surface-sunken` doesn't exist → painted transparent; hand-written CSS must use palette tokens that exist (`surface-base/active/elevated/panel`).
- **O419 thread 1 resolved + built (2026-06-02): client lifecycle/status model → ADR-505 Amendment 3, + live Intake aspect.** First O419 design thread promoted (5 are still open). **Design (ADR-505 Am3):** lifecycle **stage** is **orthogonal** to the shipped `patients.status` (status = roster shelf/visibility, manual, unchanged; stage = care pathway, doesn't govern visibility — both enums contain `active`, accepted). Lean **cyclic** stage set `referral·intake·active·on_hold·discharged`; **any→any transition** (relapse `discharged→active`, suspend `active↔on_hold`), no enforced graph, every transition audited w/ **optional reason** (graph is presentational). **Extensible without migration:** `stage` is `TEXT` with **no DB CHECK** — validity enforced at the cap against an app-level `LIFECYCLE_STAGES` registry (`electron/main/domain/lifecycle-stages.ts`); adding a stage = registry edit, zero migration. Owned by `record.patient` (core-domain, Main-resident). Plus a recorded **future** status-axis hook: optional inactivity auto-tag (`active→inactive` after idle period) — gated on Schedule, not built. **Build (vertical slice, implementer + Opus review):** migration **v6** `patient_lifecycle(patient_id PK/FK, stage, stage_updated_at, stage_reason)` + backfill existing→`active`; cap methods `getLifecycle`/`setStage`/`listLifecycleStages`, `create()` seeds default `active` row, `list()` LEFT-JOINs `COALESCE(stage,'active')` into `PatientSummary`; audit `record.patient.lifecycle.changed` carries **stage enum only, never the free-text reason** (PHI). Renderer-domain commands `ru-soam-practice.lifecycle.set{Referral,Intake,Active,OnHold,Discharged}` (O433 pattern → `setStage`, PHI never in Bundle Host). Manifest: `stage/submenu` + `intake/context` (flat) + a **label-only "Set Stage" submenu** on roster context (validator at `manifest.ts:468` accepts command-less `title`+`submenu` parents — no fallback needed). `roster.html` `#lens-intake` is now a **live board**: filters shared `_roster` to pre-active stages, groups by stage, per-row context menu, reloads on **both** `patients` AND `patient_lifecycle` store-changes. `@ru-soam/domain` gained `LifecycleStage` union + `PatientLifecycle` (types-only; runtime registry stays in Main). **NOT done:** Risk/Safety keystone + Attention obligation set + note-privacy split (O419 threads 2–5); Intake board shows the **status** dot not a stage indicator (orthogonality-consistent); `implCreate`'s patient+lifecycle inserts not atomic (degrades via COALESCE/backfill); `listLifecycleStages()` available-but-unconsumed (view hardcodes the 2 pre-active labels for MVP). compile+lint clean; **needs full `just dev-desktop` restart + manual unlock to dogfood-verify** (Main+manifest changed; not yet user-verified).
- **Architecture design session (2026-06-02): two-axis model formalized + ADR-418 (bundle trust tiers) + ADR-506 (CQRS module model) banked + Accepted 2026-06-02.** A step-back analysis of the client-record CRUD model across Activities clarified two **orthogonal** axes that "ownership"/"trust" had been smearing: **trust zones** (ADR-101, privilege gradient Main→Preload→Renderer→Bundle-Host) vs **layers** (ADR-106, base↔domain). Neither maps to the other — `core-domain` proves it (domain layer, Main zone); renderer theme/menu/font engines prove the converse (base layer, Renderer zone). Captured as a new guide **`docs/Guides/architecture-two-axes.md`** (Linux kernel/userspace analogy + the trap it sets; threat-model-not-framework reason for the gradient; VS Code extHost = resilience-not-security contrast; capability = typed-RPC + complete-authority ocap-intent, today **identity-blind/unscoped**; the **honest PHI invariant** — keys/decrypt/ciphertext Main-only, but PHI plaintext **does** enter the host as cap *returns*, e.g. the roster renders names; slogan "PHI never enters host" was overstated). **ADR-418 (Accepted, 400-range, extends 410/101):** split the host tier by **provenance** → **First-Party-Host** (trusted: binds any cap incl. PHI returns, **NO keys/decrypt** — peer-trust to Renderer, process-isolated) + **Bundle-Host** (untrusted third-party: PHI caps **hard-denied structurally**, non-PHI granted/tiered). **UI sandbox unchanged for ALL bundles** (provenance-trust ≠ memory-safety; first-party UI stays in `view://` iframe). Enforcement = **coarse `trustClass` identity** (`bundleId→first-party|third-party`) checked at BOTH cap-bind chokepoints (host bridge + renderer `soamView` relay) — the *light residue* of full per-method ocap; **Fork C deferrable indefinitely**, sole-writer stays convention-among-trusted. Restated invariant becomes **structurally true**: PHI plaintext only in Renderer+First-Party-Host, never the untrusted host. Rejected alts: co-resident decrypt in First-Party-Host (2nd plaintext authority, erodes ADR-301/504), relax-UI-sandbox-for-trusted. **MVP defers building the 2nd host** (first-party only) — but attach `trustClass` now + keep cap-bind paths centralized. **ADR-506 (Accepted, 500-range, extends 504/505):** **CQRS** is the governing domain-module pattern — **command** (writes, one sole-writer Activity, validated+audited) / **query** (reads, many consumers, projections/read-models) / **overlay** (a consumer's own command on its own tables, journal 0010). A **bundle = a vertical slice** declaring its schema+migrations+command/query handlers+UI+deps; **multi-zone** — **PHI command/query handlers + migrations EXECUTE in Main regardless of logical owner** (only zone with keys), contributed by the owning first-party bundle via a Main seam generalizing core-domain's bootstrap; third-party bundles get NO Main code / NO PHI tables. **Logical ownership ≠ execution residency** is the key reconciliation of the journal spine (ADR-0008/0011 "Sessions owns notes") with ADR-504 (Main-resident authority): Sessions ships the `record.note` model (runs in Main) + is sole writer; Practice binds query methods only. One physical store per workspace; ownership logical → real cross-module FKs + erasure cascade. **Forks resolved by direction:** A→distributed (A2), B→command/query cap split, D→Overview-as-read-model, E→`ErasePatient` cascading command. Naming: **"First-Party-Host"** chosen over "Native-Host" (native-modules confusion) and "Domain-Host" (re-fuses layer⟂trust — both hosts run domain code). New open items **O439–O446** (trust-class assignment, FP-Host granularity, non-PHI grant model, CQRS method-split, read-model materialization, per-bundle migrations, module deps, per-domain Main-handler seam). Current code is **pre-explicit-CQRS** (`record.patient` mixes command+query; central `migrations.ts`) — migration is incremental, not a rewrite; new modules author CQRS-explicit. **Nothing built this session — design/docs only** (2 ADRs + guide + README + Open_Items).
- **REVISION same session (2026-06-02): pure-base Main + `core-domain` RETIRED — ADR-506 rewritten, ADR-504 superseded.** Continuing the Socratic design, the user pushed: *is anything loaded-and-run as part of Main?* Conclusion: **domain-in-Main is eliminable + the `core-domain` term retires.** **Main becomes pure-`basebench`** (keys/crypto/store engine/audit ledger + a **generic ownership-scoped CRUD cap** + a **declared-query executor** + migration-executor/dep-validator) — **NO domain code loaded into Main.** The canonical record becomes a **first-party bundle** like any other; its **command logic runs in First-Party-Host** (which already holds PHI returns, no keys — ADR-418), persisting via the generic base store cap (encrypt+audit). **Validation = HYBRID:** hard safety/legal invariants → **declarative schema constraints in Main** (`CHECK`/`FK`/trigger — Main-enforced, *as data, no domain code*); soft/UX → First-Party-Host; audit hash-chain Main-owned (command *names* its event, can't skip). **Sole-writer becomes Main-ENFORCED** via declared table ownership (`callerBundleId==owner(table)`, owner from migrations) — upgrade over "convention," needs `bundleId` identity (ADR-418 §5). Generic store cap is **ownership-scoped + audit-tagged + NOT raw-SQL** (parameterized CRUD + pre-declared load-validated query templates). **Preload ABI gains CQRS shape** — query bridge + command bridge (or one bridge w/ method-classes; O447) — also lets untrusted bundles get the query side only. **Deps declared (FK/caps/bundles) + graph validated before load** (refuse on dangling-FK/cycle/missing — ADR-104/105). **Layering refines to 3 tiers (ADR-106 Am1): base · domain (first-party) · extensions (third-party);** provenance→trustClass→host maps domain→First-Party-Host, extensions→Bundle-Host — a *policy mapping, NOT an axis collapse* (base still spans all zones; trust ⟂ layer holds). **This is the KEY reconciliation:** "Sessions owns notes" = Sessions ships the model that runs **in First-Party-Host** (not Main) + Main-enforced sole-writer; Main holds bytes, never domain logic. Big win: ADR-504's domain-in-Main exception + the O446 per-domain-Main-bootstrap pattern + the "first-party ships maximally-privileged Main code" worry **all dissolve**; Main stays smallest/most-audited. Trade accepted: PHI command *logic* on a larger trusted surface (per-bundle FP-Host + deps), mitigated by ownership-scoping (blast radius = own tables) + Main-enforced hard-constraints + Main-owned audit integrity. Docs: ADR-506 rewritten, ADR-504→Superseded (header + note, body retained), ADR-418 consequence updated, ADR-106 Am1 (extensions tier), guide §8 rewritten (§8.2 pure-base-Main, §8.3 3-tier), README + Open_Items (O446 reframed to generic-store-cap design; +O447 bridge-shape, +O448 declarative-invariant boundary). Still **design-only, nothing built.** Current code stays M1 (`core-domain` in Main) until incrementally migrated; **O419 Risk/Safety should be authored to THIS model** (its command logic in FP-Host, hard invariants as schema constraints).
- **"Account" = user-facing label; `workspace` stays the internal/base term (2026-06-01).** The 1 account : N workspaces model was dropped for 1:1, making user-facing "workspace" copy redundant — renamed visible strings (switcher, StatusBar tooltips, setup wizard, unlock gate, etc.) to "account". Internal identifiers (`window.soam.workspace.*`, IPC `soam:workspace:*`, `WorkspaceMeta`, `WorkspaceEntityType`, `workspace.*` context keys, CSS, filenames, `variant='workspace'` mode) unchanged **by design**: `workspace` is the base (`basebench`) domain-agnostic mechanism vocabulary (ADR-106 — base must not adopt identity vocab); "Account" is the domain/product label. Same split as the configurable Client/Patient label (ADR-407). Full internal rename would be O196-class (deferred, and arguably wrong at the base layer).

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