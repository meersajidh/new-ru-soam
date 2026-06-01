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
- **Activity-Bar density user setting (2026-06-01, no ADR — appearance pref like font-set).** New `src/platform/activity-bar/density-service.ts` (`ActivityBarDensityService`, `ActivityBarDensityServiceId`): applies `actbar-density-<compact|default|large>` class on `document.documentElement`, `onDidChangeDensity`, persists via `localStorage['soam.activityBarDensity']` (same mechanism as Font/Theme axes — NOT the prefs proxy, which is layout-only). Seeded at boot before paint (no flash). `ActivityBar.css` scales item size (30/36/44px) + gaps per density class; `ActivityBar.tsx` scales icon size (18/20/26) via `DENSITY_ICON_SIZE`, subscribed. SettingsMenu gains a Compact/Default/Large segmented control under Appearance. Live-verified via CDP: switch resizes items+icons+spacing, persists across reload. (Scoped to activity bar deliberately — global icon-scale rejected: shell icons set tuned inline `fontSize` per surface, a global multiplier fights them.)
- **ADR-413 Amendment 1 (Accepted, 2026-06-01): built-in icon set = VS Code Codicons; O108 resolved.** Product wants codicons everywhere (VS Code parity). As-built shell drifted from ADR-413's `$(…)` icon-registry design: icons consumed via direct `lucide-react` component imports (~16 files) + `ActivityBar.ICON_MAP` (lucide names as de-facto manifest contract). Amendment commits: **codicons replace lucide**; **O108 resolved split by surface** — icon **font** (`@vscode/codicons` ttf, local asset, no CDN per ADR-203) in the React shell behind a single `<Icon name>` component, **inline SVG** inside sandboxed bundle iframes (dodges the `view://` font-src gotcha); bundle-contributed icons stay SVG. `$(…)` registry becomes the only icon API; manifest `icon` fields migrate lucide→codicon ids (breaking for external bundles, OK pre-1.0). **Deferred (not started — write-ADR-now/build-later per user):** O434 (icon-registry seam + shell codicon adoption, migrate the ~16 call sites + ICON_MAP, drop lucide dep), O435 (first-party manifest icon-vocab → codicon ids + iframe inline-SVG + reserved-prefix mapping; couples O427/O86 prefix-collision lint).
- **O433 resolved (2026-06-01): first real Practice-roster PHI mutation — set client status via renderer-domain commands.** Proof `ru-soam-practice.roster.reveal` (console.log) dropped; `src/domain/bootstrap.ts` now registers `ru-soam-practice.roster.{setActive,setInactive,archive}` → one `setPatientStatus(ctx, status)` helper binding `record.patient@1.0` via `window.soam.bindCapability`, calling `setStatus(clientId, status)`, disposing proxy in `finally`. `clientId` comes from the iframe-forwarded menu ctx as `args[0]` (untrusted → shape-guarded; existence + lock enforced at cap = the roster-validation guard). Cap method was already wired (ADR-505): status-enum validation + audit `record.patient.status.changed` (ADR-502) + `emitTableChange('patients')` → roster auto-reloads via existing `onStoreChange('patients')` (no manual refresh). Manifest `menus["ru-soam-practice/roster/context"]` = 3 items, groups `1_status@1/@2` + `9_danger@1` (Archive separated). **Confirms the ADR-417 pattern end-to-end: PHI-touching bundle context-action = renderer-domain command, PHI never enters Bundle Host (ADR-504/410).** Status-conditional hiding deferred (iframe ctx carries only `{clientId}`, not status → all 3 shown, idempotent). User dogfood-verified.
- **"Account" = user-facing label; `workspace` stays the internal/base term (2026-06-01).** The 1 account : N workspaces model was dropped for 1:1, making user-facing "workspace" copy redundant — renamed visible strings (switcher, StatusBar tooltips, setup wizard, unlock gate, etc.) to "account". Internal identifiers (`window.soam.workspace.*`, IPC `soam:workspace:*`, `WorkspaceMeta`, `WorkspaceEntityType`, `workspace.*` context keys, CSS, filenames, `variant='workspace'` mode) unchanged **by design**: `workspace` is the base (`basebench`) domain-agnostic mechanism vocabulary (ADR-106 — base must not adopt identity vocab); "Account" is the domain/product label. Same split as the configurable Client/Patient label (ADR-407). Full internal rename would be O196-class (deferred, and arguably wrong at the base layer).

### Dev Gotchas (operational, reusable)

- **Full `just dev-desktop` restart required after Main / Bundle-Host / manifest changes.** Renderer HMR + Main-only restart leaves the bundle-host running stale module-cached code → command/contribution appears unregistered. Clean restart fixes. (Hit repeatedly during ADR-406/417 verify.)
- **HMR doesn't swap boot-instantiated singletons.** Editing a registered service's interface (e.g. adding `LayoutService.getSizes`) while dev runs throws `X is not a function` at consumers until a full boot — HMR swaps component modules, not the singleton. Renderer full-reload or restart fixes.
- **Document-level drag over an iframe needs a drag-shield.** A mid-drag cursor over a bundle iframe makes it swallow the parent's `document` mouse events (stalls resize). Fix: append a full-viewport transparent `position:fixed;inset:0;z-index:99999` div on mousedown, remove on mouseup/cleanup.
- **Sandboxed iframe fonts need `font-src view:` in the page's own `<meta>` CSP** (the injected VIEW_CSP allows it but the page meta didn't). Local `@font-face` over `view://` only — iframe must NOT reach the renderer's Google-Fonts CDN (ADR-203). Shared font hosting → O422.
- **Popovers/menus must dismiss on `window` blur, not just `document` mousedown.** A sandboxed bundle iframe swallows the parent's mousedown, so a `document`-only outside-click listener never closes a popover when the click lands on a loaded iframe (Practice roster/overview). Clicking into an iframe blurs the parent window — add a `window` `blur` → close listener while open. `usePopover` does this; any hand-rolled popover needs the same (same root cause as the drag-shield gotcha above).
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