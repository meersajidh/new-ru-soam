# ADR-421 Execution Tracker (F1–F6)

**Status:** F1 + F2 committed. **F3 DONE + dogfooded (unified Phosphor Icon), uncommitted.** **Date:** 2026-07-07.
**Authority:** `docs/ADRs/421-design-system-foundation-shadcn.md`. Supersedes ADR-420 model; builds on committed S1/S1b/S2/S4a/S3.
**Strategy (locked):** shim-transition — adopt the shadcn CSS-var contract as the new source of truth; keep a thin alias layer mapping old `--color-*` names → new contract vars so **every existing component keeps rendering**; migrate consumers off old names incrementally (F2/F5); delete the shim when the last consumer moves. **App never breaks between commits.**

This is the resume artifact — everything needed to execute F1 post-compaction is here (no re-fetch, no re-derive).

---

## Preset `b6tOtw19k` = "base-luma" (fetched verbatim 2026-07-07 via `https://ui.shadcn.com/init?preset=<id>`)

- **base (behavior):** `@base-ui/react` (Base UI — verify real npm name at install: likely `@base-ui-components/react`).
- **iconLibrary:** `phosphor` → `@phosphor-icons/react`.
- **deps:** `class-variance-authority`, `tw-animate-css`, `@base-ui/react`, `@phosphor-icons/react`. **registryDependencies:** `utils` (cn), `font-inter` (Inter).
- **config:** style `base-luma`, tailwind.baseColor `olive`, rtl false, menuColor default, menuAccent subtle.
- **cssVars.theme:** `--font-heading: var(--font-sans)`.
- **css:** imports `tw-animate-css` + `shadcn/tailwind.css`; `@layer base { *{@apply border-border outline-ring/50} body{@apply bg-background text-foreground} }`.
- **type:** `registry:base`, `extends: none`.

### Light tokens (verbatim)
```
background            oklch(1 0 0)
foreground            oklch(0.153 0.006 107.1)
card                  oklch(1 0 0)
card-foreground       oklch(0.153 0.006 107.1)
popover               oklch(1 0 0)
popover-foreground    oklch(0.153 0.006 107.1)
primary               oklch(0.555 0.163 48.998)   ← burnt amber
primary-foreground    oklch(0.987 0.022 95.277)
secondary             oklch(0.967 0.001 286.375)
secondary-foreground  oklch(0.21 0.006 285.885)
muted                 oklch(0.966 0.005 106.5)
muted-foreground      oklch(0.58 0.031 107.3)
accent                oklch(0.966 0.005 106.5)
accent-foreground     oklch(0.228 0.013 107.4)
destructive           oklch(0.577 0.245 27.325)
border                oklch(0.93 0.007 106.5)
input                 oklch(0.93 0.007 106.5)
ring                  oklch(0.737 0.021 106.9)
chart-1               oklch(0.88 0.011 106.6)
chart-2               oklch(0.58 0.031 107.3)
chart-3               oklch(0.466 0.025 107.3)
chart-4               oklch(0.394 0.023 107.4)
chart-5               oklch(0.286 0.016 107.4)
radius                0.625rem
sidebar               oklch(0.988 0.003 106.5)
sidebar-foreground    oklch(0.153 0.006 107.1)
sidebar-primary       oklch(0.666 0.179 58.318)
sidebar-primary-foreground  oklch(0.987 0.022 95.277)
sidebar-accent        oklch(0.966 0.005 106.5)
sidebar-accent-foreground   oklch(0.228 0.013 107.4)
sidebar-border        oklch(0.93 0.007 106.5)
sidebar-ring          oklch(0.737 0.021 106.9)
```

### Dark tokens (verbatim)
```
background            oklch(0.153 0.006 107.1)
foreground            oklch(0.988 0.003 106.5)
card                  oklch(0.228 0.013 107.4)
card-foreground       oklch(0.988 0.003 106.5)
popover               oklch(0.228 0.013 107.4)
popover-foreground    oklch(0.988 0.003 106.5)
primary               oklch(0.473 0.137 46.201)   ← burnt amber (dark)
primary-foreground    oklch(0.987 0.022 95.277)
secondary             oklch(0.274 0.006 286.033)
secondary-foreground  oklch(0.985 0 0)
muted                 oklch(0.286 0.016 107.4)
muted-foreground      oklch(0.737 0.021 106.9)
accent                oklch(0.286 0.016 107.4)
accent-foreground     oklch(0.988 0.003 106.5)
destructive           oklch(0.704 0.191 22.216)
border                oklch(1 0 0 / 10%)
input                 oklch(1 0 0 / 15%)
ring                  oklch(0.58 0.031 107.3)
chart-1               oklch(0.88 0.011 106.6)
chart-2               oklch(0.58 0.031 107.3)
chart-3               oklch(0.466 0.025 107.3)
chart-4               oklch(0.394 0.023 107.4)
chart-5               oklch(0.286 0.016 107.4)
sidebar               oklch(0.228 0.013 107.4)
sidebar-foreground    oklch(0.988 0.003 106.5)
sidebar-primary       oklch(0.769 0.188 70.08)
sidebar-primary-foreground  oklch(0.279 0.077 45.635)
sidebar-accent        oklch(0.286 0.016 107.4)
sidebar-accent-foreground   oklch(0.988 0.003 106.5)
sidebar-border        oklch(1 0 0 / 10%)
sidebar-ring          oklch(0.58 0.031 107.3)
```

---

## The shim mapping (old bespoke `--color-*` → shadcn contract)

Old tokens are in `apps/desktop/src/styles/tokens.css` (`@theme {}`) + `packages/view-kit/src/tokens.css` (parallel). Shim layer defines the old names as `var(<new>)` so existing consumers render unchanged.

### Direct aliases (old → new contract var)
| Old bespoke token | → shadcn contract |
| --- | --- |
| `--color-surface-base` | `--background` |
| `--color-surface-panel` | `--card` |
| `--color-surface-elevated` | `--popover` |
| `--color-surface-active` | `--accent` |
| `--color-surface-input` | `--input` (or `--muted`) |
| `--color-fg-primary` | `--foreground` |
| `--color-fg-secondary` | `--muted-foreground` (or mix fg/muted) |
| `--color-fg-muted` | `--muted-foreground` |
| `--color-border` | `--border` |
| `--color-border-focus` | `--ring` |
| `--color-accent` | `--primary` |
| `--color-accent-fg` | `--primary-foreground` |
| `--color-error` | `--destructive` |
| `--radius-md` | `--radius` (0.625rem); keep `--radius-sm`/`--radius-card` derived |
| `--font-sans` | Inter (from `font-inter`); `--font-display` → `--font-heading` (= sans) |

### Keep as our own extension layer (NO shadcn equivalent — rebase on new vars, do NOT drop)
- Semantic colors `--color-info` / `--color-success` / `--color-warning` (only `error`→`destructive` maps). Keep; pick oklch values harmonized with base-luma.
- All tint scales: `--color-tint-{accent,info,success,warning,error,neutral}-*` — keep, `color-mix` off the **new** `--primary`/semantic/`--foreground`.
- `--color-accent-hover` / `-pressed` — derive `color-mix(--primary …)`.
- `--color-border-hover` / `-subtle` / `-warning-*`, `--color-surface-sunken-*` / `-recessed` / `-input-focus`, `--color-scrim-*`, `--color-highlight-edge*`, all `--shadow-*`.
- Type scale `--text-*` (6 steps + micro 2xs/3xs/4xs), `--spacing`, `--radius-card`/`-sm`, `--header-height`, `--glow-mul`, `--root-font-size`. shadcn defines none of these — they stay ours.

### Net token layers after F1
1. **Contract** (base-luma light + `.dark`) — source of truth, shadcn names.
2. **Extension** — our semantic/tint/shadow/type/spacing tokens, rebased on layer 1.
3. **Shim** (temporary) — old `--color-*` names aliased to layers 1/2 so unmigrated components render. Deleted across F2/F5 as consumers migrate.

---

## F1 step list (execute post-compact; each verified `compile`+`lint`, dogfood at end)

1. **theme.css / token layer** — author base-luma contract (`:root` light + `.dark`) + extension tokens + shim, in the shell styles. Decide file split: contract+extension in a new `theme-base-luma.css`; shim in `tokens-shim.css`; keep `tokens.css` importing them (or replace its `@theme` body). **Watch the `@theme` tree-shake gotcha** (CLAUDE.md): hand-written CSS must reference tokens that are real `:root`/class custom-props, not `@theme`-only vars.
2. **Named-theme × mode mechanism** — theme = one class (`theme-base-luma` or just `:root`, since 1 theme) + mode = `.dark` toggle (shadcn's). Merge `ThemeService` (`platform/theme/theme-service.ts`) + `FontService` (`platform/font/font-service.ts`) → one `{theme, mode}` service. Retire 3-axis class apply (`theme-*` palette + `font-set-*`). Update `initial-theme.ts` / `initial-font-set.ts` + boot apply (App/main).
3. **Fonts** — self-host **Inter** woff2 (`font-src 'self' data:`; NOT CDN — CSP gotcha). Note base-luma uses **Inter**, current app uses **Inter Tight** (`view-fonts.ts`). Add Inter as the sans; wire `--font-sans`. Reuse the `view-fonts.ts` inlining path for views.
4. **Bridge snapshot** — the renderer→view appearance snapshot (was `ThemeService.TOKEN_NAMES` + `FontService.FONT_VAR_NAMES`) → snapshot the new contract vars + `{theme, mode}`. Find: search `TOKEN_NAMES` / appearance / snapshot in `platform/theme`, `fp-host/view-protocol.ts`, `view-fonts.ts`.
5. **view-kit parallel** — mirror the contract+shim into `packages/view-kit/src/tokens.css` (kept in sync until F2 unifies). Views must resolve the same vars.
6. **Dogfood** — shell (unlock/settings/a dialog) + one Practice/Schedule view, light **and** dark. Confirm no empty paints (tree-shake), Inter renders, `.dark` toggles. `compile` + `lint` + `build:views` green.

**Files to audit at execution (not yet read this session):**
- `apps/desktop/src/platform/theme/theme-service.ts`, `.../themes/initial-theme.ts`
- `apps/desktop/src/platform/font/font-service.ts`, `.../font-sets/initial-font-set.ts`
- `apps/desktop/src/styles/{tokens.css, theme.css, type.css, themes/*.css, font-sets/*.css, fonts/google-fonts.css}`
- `packages/view-kit/src/{tokens.css, theme.css}`
- `apps/desktop/src/platform/.../view-fonts.ts` (Inter Tight inlining) + `electron/main/fp-host/view-protocol.ts` (appearance snapshot / CSP)
- boot apply site (App.tsx / main.tsx `applyInitialTheme`)

**Retire (this phase or F2):** 5 palette files (`themes/{bamboo,iris,primer,spectrum,stone}.css`), 3 font-sets (`font-sets/*.css`), `fonts/google-fonts.css` (CDN — must go, CSP). Since **1 signature theme**, palettes are removed, not converted. Keep archived in git history.

---

## F1 OUTCOME (2026-07-07) — done, uncommitted

**Approach taken = minimal-churn shim, NOT a service merge.** The 3-axis collapse
was achieved without merging ThemeService/FontService (deferred to F2): services
stay, fed **single-entry registries** (`built-in.ts` → one `base-luma` theme +
one `base-luma` font-set), so SettingsMenu/commands render one option with zero
component change. `theme-*` / `font-set-*` classes still get applied but match no
CSS (base-luma lives on `:root`); `.dark` is the only live axis.

**Files changed (all uncommitted):**
- `styles/tokens.css` — contract (`:root` light + `.dark`, base-luma verbatim) +
  semantic `--info/success/warning` (light+dark) + rebased the 17 `@theme`
  color leaves → `var(--contract)` + `--radius-md: var(--radius)` + font shim.
- `styles/index.css` — dropped 5 palette + 3 font-set `@import`s (files kept, F2 deletes).
- `themes/built-in.ts`, `font-sets/built-in.ts` — single `base-luma` descriptor.
- `themes/initial-theme.ts`, `font-sets/initial-font-set.ts` — base-luma ids; stale prefs sanitize.
- `platform-commands.ts` — 5 theme + 3 font commands + submenu → 1 each (dark toggle kept).
- `view-kit/src/tokens.css` — cold-start defaults → base-luma DARK (bridge overrides at runtime).

**★ Bridge-snapshot gotcha found + fixed (carry into F2).** `ThemeService.getTokenSnapshot()`
reads `getComputedStyle(root).getPropertyValue('--color-*')`. Once the old
`--color-*` names became `@theme` vars = `var(--card)`, **getComputedStyle returns
`""` for them** (the @theme readback/tree-shake gotcha) → the iframe appearance
snapshot went empty → bundle views fell to cold-start defaults (dark panel in a
light shell). CONTRACT leaves (`--card`, `--background`… = real `:root`/`.dark`
props) read back fine; a real `:root` prop `--x: var(--card)` **also** reads back
resolved (CDP-verified). **Fix:** a real `:root` shim block in `tokens.css`
mirroring the snapshot names (`--color-*` + `--font-*`) = `var(<contract>)`, so
getComputedStyle resolves them; mode rides the contract indirection (no `.dark`
copy needed). **F2 retires this block** by pointing the snapshot at contract
leaves directly (`TOKEN_NAMES` → contract, view-kit maps contract→utilities).

**Dogfood (CDP :9333):** light + dark, shell (lock + workbench chrome) + Practice
roster `view://` iframe — both modes coherent, burnt-amber primary, Inter Tight
sans, no empty/transparent paints, no blank views, no console theme errors.
Static gates green: `compile`, `lint`, editor `compile`, `build:views`.

---

## F2 PLAN (cut 2026-07-07) — token unification only; `apply --preset` folded into F4

**Scope cut:** F2-as-written bundled two separable things. Split:
- **(a) token/theme unification** = F2 now. Pure CSS + package.json. No install, no git.
- **(b) `@basebench/ui` → shadcn `packages/ui`** (`components.json` + `shadcn apply --preset b6tOtw19k`, adds Base UI deps, scaffolds `components/ui/*`) = **folded into F4**, where Base UI is actually consumed. Single user-run CLI step there (ADR D7 / integration-constraint-2: stakeholder runs it).

**Bridge NOT touched in F2.** `TOKEN_NAMES` stays the 17 old `--color-*` names; the F1 real-`:root` shim stays (still the bridge readback source + legacy hand-CSS compat). The bridge retarget (`TOKEN_NAMES`→contract leaves) pairs naturally with **shim deletion in F5** — do them together, not now. Keeping the bridge frozen de-risks F2 (F1 bridge is dogfooded-good).

**Why unification is safe with the frozen bridge:** shared file carries contract (`:root`+`.dark` real props) + `@theme`(extension + `--color-*`→`var(--contract)` map) + real-`:root` `--color-*` shim. View utilities `bg-surface-panel`=`var(--color-surface-panel)`; bridge pushes resolved `--color-surface-panel` inline on the iframe root (mode already baked by shell's `getComputedStyle`) → inline shadows the `var(--card)` chain → correct. Cold-start (pre-push) resolves via `:root` shim → light contract, then push corrects. Identical to how the shell shim already works.

**Resolution:** `nodeLinker: hoisted` + apps/desktop already deps `@basebench/ui` ⇒ `@basebench/ui/tokens.css` resolves from any view CSS with NO relink; only need export-map subpaths.

### Slices
- **F2a+b (combined — a alone not dogfoodable):**
  1. New `packages/basebench-ui/src/tokens.css` = current shell `styles/tokens.css` 3-layer content verbatim (header updated: now the shared base-layer source).
  2. New `packages/basebench-ui/src/theme.css` = `@import "tailwindcss"; @import "./tokens.css";` (Tailwind entry / `@reference` target; mirrors shell+view entries).
  3. basebench-ui `package.json` exports: add `"./tokens.css"`, `"./theme.css"`.
  4. Shell `index.css`: `@import "./styles/tokens.css"` → `@import "@basebench/ui/tokens.css"`.
  5. Shell `styles/theme.css`: `@import "./tokens.css"` → `@import "@basebench/ui/tokens.css"`.
  6. **Delete** shell `styles/tokens.css` (only index.css + theme.css imported it, both repointed).
  7. view-kit `src/tokens.css` → body becomes `@import "@basebench/ui/tokens.css";` (drop the hardcoded base-luma-dark parallel; kills the drift).
  8. 7 basebench-ui component `.css` `@reference "../../../apps/desktop/src/styles/theme.css"` → `@reference "./theme.css"` (own entry; the base→app relative smell, breaks when views import these in F4).
  9. view-kit `package.json`: add `"@basebench/ui": "workspace:*"` dep (hygiene; resolvable now under hoisted). If a `pnpm install` is wanted to formalize the symlink, hand to user — NOT build-blocking.
  - Gates: `compile` + `lint` + `build:views`. Dogfood shell + a view, light **and** dark.
- **F2c:** delete 5 `styles/themes/*.css` + 3 `styles/font-sets/*.css` (dead since F1). Keep `styles/fonts/google-fonts.css` (still index.css-imported; the @fontsource loader). Gate `build:views` + shell boot.

### Deferred out of F2 (were in the old stub)
- `components.json` + `shadcn apply --preset` + Base UI deps + `components/ui/*` → **F4**.
- Bridge `TOKEN_NAMES`→contract-leaf retarget + shim deletion → **F5**.

## F2 OUTCOME (2026-07-07) — done, uncommitted

**Delivered = token unification (scope (a)); `apply --preset` (scope (b)) folded into F4; bridge frozen (retarget → F5).**

**Single shared token source created:** `packages/basebench-ui/src/tokens.css` = the former shell 3-layer content (contract `:root`+`.dark` + `@theme` extension/shim + real-`:root` bridge shim + root-font-size block), now the ONE source both surfaces import. New `packages/basebench-ui/src/theme.css` = Tailwind entry / `@reference` target. Exports added (`./tokens.css`, `./theme.css`).

**Files changed (all uncommitted):**
- **new** `basebench-ui/src/tokens.css` (the shared source) + `theme.css` (entry) + package.json exports.
- `apps/desktop/src/index.css` + `styles/theme.css` → `@import "@basebench/ui/tokens.css"`.
- **deleted** `apps/desktop/src/styles/tokens.css` (redundant; both importers repointed).
- `view-kit/src/tokens.css` → `@import "@basebench/ui/tokens.css"` (dropped the hardcoded base-luma-dark parallel — **kills the drift**). view-kit `package.json` += `@basebench/ui: workspace:*`.
- 7 basebench-ui component `.css`: `@reference "../../../apps/desktop/src/styles/theme.css"` → `@reference "./theme.css"` (killed the base→app relative smell that would break when views import these in F4).
- **deleted** 5 `styles/themes/*.css` + 3 `styles/font-sets/*.css` (dead since F1) + orphaned `styles/font-sets/README.md` + both now-empty dirs (`styles/themes/`, `styles/font-sets/`). Stale `index.css` collapse comment fixed.
- `styles/fonts/google-fonts.css` **renamed → `webfonts.css`** (legacy misnomer — self-hosted @fontsource, never Google CDN; index.css import + fonts/README updated). Comment de-staled; Source Serif/IBM Plex kept for editor+code — font-asset pruning deferred.

**Resolution proof:** `nodeLinker: hoisted` + apps/desktop already deps `@basebench/ui` ⇒ `@import "@basebench/ui/tokens.css"` from view-kit resolved in the view build with NO relink. `build:views` green.

**Bridge unchanged (as planned):** `TOKEN_NAMES` = 17 old `--color-*`; real-`:root` shim in the shared file remains the readback source. View utilities `bg-surface-panel` → shim `--color-*`, bridge pushes resolved values inline on the iframe root (mode baked by shell `getComputedStyle`), inline shadows the `var(--contract)` chain. CDP-verified: iframe `hasInlineColorVars:true`, correct dark AND light values after a `setDarkMode` flip re-push.

**Static gates green:** workspace `compile`, editor `compile`, `lint`, `build:views` (×2 — before + after deletions).
**Dogfood (CDP :9333):** shell light (screenshot — clean, burnt-amber active tab/avatar, chips/dots correct) + dark (computed values); Practice roster `view://` iframe light + dark (computed values, not blank, bridge re-push follows mode). No regression on fresh reload post-deletion. Dev app shut down, `:9333`+`:5173` clear.

**Carry into F4/F5:**
- **F4** owns the deferred `apply --preset` (hand-config `components.json` first) + Base UI spike.
- **F5** owns bridge `TOKEN_NAMES`→contract-leaf retarget **+** shim deletion (done together once consumers move off `--color-*`). Also: consider font-asset pruning (Source Serif/IBM Plex if editor drops them).

## F3 PLAN (cut 2026-07-07) — unify Icon, Phosphor primary

**Decisions (user, 2026-07-07):** (1) Phosphor delivery = **`@phosphor-icons/react` lib** (runtime dep, component API, tree-shaken per build; inline-SVG → CSP-clean in views). (2) Call sites = **unify to clean semantic vocab** — rewrite all ~143 (67 shell semantic + 76 view raw-codicon).

**Install (user-run):** `pnpm --filter @basebench/ui add @phosphor-icons/react`. Dep home = `@basebench/ui` (Icon's package); resolves in shell + every view build under `nodeLinker: hoisted`.

**Current state:** two Icons — shell `basebench-ui/Icon.tsx` (FONT codicon `<i class=codicon>`, `@vscode/codicons` CSS, semantic-id→glyph via `icon-registry.ts`); view `view-kit/Icon.tsx` (inline-SVG from hand-extracted `codicon-paths.ts` (210 lines), raw codicon names). no-raw-svg lint = view-src only (S3). No Fluent anywhere.

### Slices (each `compile`+`lint`+`build:views`, dogfood at end)
- **F3a** — unified `<Icon>` in `@basebench/ui`: `name`(semantic id) → Phosphor React component (`PHOSPHOR_REGISTRY`); multi-source — Phosphor primary + codicon-path **fallback source** (move `codicon-paths.ts` into `@basebench/ui`) for any glyph Phosphor lacks + `source:` prefix override (`codicon:foo`). Define canonical semantic vocabulary = deduped superset of the two current name sets. Icon renders `<PhosphorComp size weight/>` or inline-SVG codicon fallback. Export from `@basebench/ui`.
- **F3b** — shell imports unified Icon; rewrite 67 shell sites to canonical vocab (most already semantic); delete old font `Icon.tsx` path + `@vscode/codicons/dist/codicon.css` import (drop shell font-codicon). Keep `icon-registry.ts`? folds into the Phosphor registry.
- **F3c** — views: view-kit re-exports (or bundles import) the `@basebench/ui` Icon; rewrite 76 view sites raw-codicon→semantic; delete `view-kit/Icon.tsx` + `codicon-paths.ts` (moved to base). **Dogfood: Phosphor renders + positions in a real `view://` iframe under STRICT_VIEW_CSP** (Phosphor = pure SVG + a props Context, no runtime `<style>`/network → expected clean; verify).
- **F3d** — extend no-raw-svg `no-restricted-syntax` to the shell renderer block too; message → `@basebench/ui`; update `index.ts` exports/comments. Brand logo (MSH mark) keeps its `eslint-disable` opt-out.

### Watch
- Per-source **viewBox** differs (Phosphor `0 0 256 256`, codicon `0 0 16 16`) — registry entry carries its own viewBox.
- `@vscode/codicons` may drop to devDep (codicon-paths already hand-vendored) or be removed if the fallback source is unused post-curation.
- Medical glyphs improve: Phosphor HAS `stethoscope` (codicon substituted `pulse`).
- Icon **size** semantics change shell-side: font `fontSize` → SVG width/height (Phosphor `size` px). Audit any call passing odd sizes.

## F3 OUTCOME (2026-07-07) — done, dogfooded, uncommitted

**Decisions:** Phosphor delivery = `@phosphor-icons/react` lib (v2.1.10; `*Icon`-suffixed exports — bare names deprecated); vocab unified to clean semantic ids. **`apply --preset` NOT run** (only Phosphor installed; full preset → F4).

**Delivered:**
- **F3a** — ONE inline-SVG `<Icon name size? weight? className? title? />` in `@basebench/ui` (`Icon.tsx` + `icon-registry.ts`). Multi-source registry: **source-discriminated `IconEntry`** (Phosphor mounted; codicon/Fluent *mountable* — interface + `source:` prefix seam ready, not shipped). ~100 semantic ids → Phosphor components; per-entry `weight`/`mirrored` (filled radio circles, panel-right = SidebarSimple mirrored, panel-bottom = SquareHalfBottom). `size` omitted → `1em` (inherits font-size = old codicon-font behaviour). Fallback = Question.
- **F3b** — shell auto-picked up the new Icon (already imports `@basebench/ui`); **0 shell call-site edits** (shell vocab already semantic). Dropped `@vscode/codicons` font CSS import + old `<i class=codicon>`.
- **F3c** (delegated to implementer, verified) — 13 view files: Icon import swapped `@ru-soam/view-kit`→`@basebench/ui`; 5 conflict renames (gear→settings, x→close, organization→users, device-camera-video→video); **overview.tsx `ICON_MAP`/`MIcon` lucide-shim fully removed** (~20 sites → canonical ids). Deleted `view-kit/src/Icon.tsx` + `codicon-paths.ts`; removed from view-kit index.
- **F3d** — extended `no-restricted-syntax` no-raw-`<svg>` to the shell (`src/**`) too (shared `NO_RAW_SVG_SYNTAX`, msg → `@basebench/ui`); migrated 2 trash-glyph SVGs (Client/Workspace erase dialogs) to `<Icon name="trash">`; opt-out on 3 genuinely-bespoke (Google brand mark, 2 catenary-arc backgrounds). **Lint boundary retuned (ADR-421 D3/D9):** view-src may now import `@basebench/ui` (was banned); shell still can't import view-kit (view runtime is iframe-only).

**Registry gap hunt (0-gap proven):** diffed every used icon name (call-site literals + dynamic producers `icon:'…'` + default params + manifests, both surfaces) vs registry keys. Fixed gaps the literal-scope missed: `responseIcon` badges (thumbsup/thumbsdown/question), roster lens `organization`→users data, aspects `editIcon` default `edit`, statusbar `download/moon/target/triangle-alert` (last four ALREADY hit the old codicon fallback pre-F3 — fixed anyway). Final: 96 registry keys cover all 48 bundle + 46 shell used names.

**`@vscode/codicons` dep removed** from apps/desktop + basebench-ui package.json (fully dead post-F3). **→ user must `pnpm install` to prune the lockfile before commit.**

**Static gates green:** compile, editor compile, lint, build:views, node --test (18), **vitest 128/128**.
**Dogfood (CDP :9333):** shell chrome + Practice roster/overview/aspects `view://` iframes, light **and** dark. **Phosphor renders + positions in the strict-CSP view origin** (all svgs viewBox `0 0 256 256`, varied paths — no fallback storm; the D5 analog of the Base UI gate — inline SVG confirmed CSP-clean). overview (heaviest-migrated) visually verified: rupee ₹, video, calendar, users, link-external, check-square all correct. Dev app down, ports clear.

**Carry into F4/F5:** unchanged (F4 = `apply --preset` + Base UI CSP spike; F5 = static fragments + finish shim deletion + bridge retarget).

## F4–F6 (stubs — detail when reached)
- **F4** — **Owns the F2-deferred `apply --preset`:** hand-config `@basebench/ui/components.json` (two-surface, Tailwind-v4 CSS-var mode) → hand user `shadcn apply --preset b6tOtw19k` (writes deps + `components/ui/*`; stakeholder runs). Then **Base UI CSP spike** (prove Select/Popover positions in a real `view://` iframe under STRICT_VIEW_CSP) → vendor shadcn/Base UI interactive primitives into `@basebench/ui`; both surfaces import; re-base the 13 S1 primitives.
- **F5** — (was S4b) static fragments EmptyState/Card/Badge/Chip/KvRow/Section in `@basebench/ui`, shadcn-styled, token-only; migrate ~14 views + shell call-sites; delete copies. **Also finishes shim deletion + bridge `TOKEN_NAMES`→contract-leaf retarget** (deferred from F2 — done together once consumers are off the `--color-*` names).
- **F6** — `/dev/design-system` gallery; theme × mode toggles; view primitives in a real `view://` iframe frame.

## Deps for the user to install (when reached, NOT in F1)
`@base-ui-components/react` (verify name), `@phosphor-icons/react`, `class-variance-authority`, `tw-animate-css`. Inter font files (F1 — asset, self-hosted). Agent does not run installs.
