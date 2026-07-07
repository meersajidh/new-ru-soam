# ADR-421 Execution Tracker (F1–F6)

**Status:** F1+F2+F3 + **F4 4a–4d COMMITTED** (`a717ab5`) + **4e COMMITTED** (`9af2115`; F3=`8b6a09a`). 4e = Select→Base UI `Select` + full menu-engine re-base: usePopover + S1 Popover DELETED; UserAvatar/WorkspaceSwitcher/ContextMenu on Base UI `DropdownMenu`, SettingsMenu on Base UI `Popover`, AccountSelect on Base UI `Select`. **FormField→Base UI `Field` DONE + 4f DONE (UNCOMMITTED, 2026-07-08):** FormField recipe internals re-based onto `Field.Root`/`Field.Label`/`Field.Error`; 4f = no S1 remnants left (all deleted incrementally 4b–4e). Accent collision resolved throughout (`bg-accent`→`bg-muted`). One deferred bug **O518** (submenu-on-modal hover dismiss; Color Theme = only + vestigial submenu). **NEXT = F5 (static fragments + shim/accent-rename + bridge retarget) → F6 (gallery).** **Date:** 2026-07-08.
(lockfile prune commit for the `@vscode/codicons` removal may still be pending — user's git.)
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

## F3 OUTCOME (2026-07-07) — done, dogfooded, committed (`8b6a09a`)

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
- **F4** — reordered **gate-first** (spike before `apply`, since `apply` installs Base UI + scaffolds — a post-`apply` gate failure = wasted install + broken D4 core assumption).
  - **Step 1 — Base UI CSP gate: ✅ PASSED (2026-07-07).** Pkg = **`@base-ui/react@1.6.0`** (NOT `@base-ui-components/react` — renamed; installed by user). Throwaway Popover+Select wired into `ru-soam-sessions/meetings` view, built, dogfooded via CDP in the real `view://ru-soam-sessions` iframe under STRICT_VIEW_CSP. Result: both render + **CSSOM-position** correctly (Popover floated top:50/left:6; Select listbox anchored below trigger); **0 `securitypolicyviolation` events**, **0 injected inline `<style>`**. Spike reverted (meetings.tsx clean); `@base-ui/react` dep retained for F4.
    - **★ CRITICAL FINDING — the wrapper that makes it CSP-safe:** Base UI v1.6 *does* render inline `<style>` elements for scroll-lock/scrollbar-hide (that's why it ships `CSPProvider` w/ `nonce` + `disableStyleElements`). Under `style-src 'self'` (no nonce, no `unsafe-inline`) those would be **blocked**. Fix = wrap the view tree in **`<CSPProvider disableStyleElements>`** (from `@base-ui/react/csp-provider`) → Base UI emits **no** inline `<style>`; styling comes from class names (our external Tailwind, `style-src 'self'` OK); positioning stays CSSOM `.style` (ungoverned — O513 escape). **The re-base step must adopt `<CSPProvider disableStyleElements>` in `ViewRoot`** (view-kit) so every view — esp. scroll-locking Dialog/Menu — is covered. Popover/Select alone don't inject, but Dialog will.
  - **Step 2 — hand-config `@basebench/ui/components.json`: ✅ DONE + validated (2026-07-07).** Key resolutions (via `npx shadcn@latest info -c packages/basebench-ui` + `preset decode` + schema.json — all read-only):
    - **Preset `b6tOtw19k` decoded** (read-only `preset decode`): `style=luma`, `baseColor=olive`, `theme=amber`, `chartColor=olive`, `iconLibrary=phosphor`, `font=inter`, `radius=medium`, `menuAccent=subtle`, `menuColor=default`. NO component source (presets = config only) → confirms `apply` gives nothing we lack.
    - **★ There is NO `base` field in components.json** (schema-confirmed). The behavior primitive (Radix vs Base UI) is **encoded in the `style` name**: `radix-*` vs `base-*`. So Base UI (D4) = **`style: "base-luma"`** (= preset name in MEMORY.md). CLI default was `radix` → would have emitted Radix; `base-luma` flips `info` links to `.../bases/base/ui/[component]` (Base UI). This was the load-bearing config fix.
    - Final `components.json`: `style:"base-luma"`, `tailwind.baseColor:"olive"`, `iconLibrary:"phosphor"`, `menuAccent:"subtle"`, `menuColor:"default"`, `css:"src/theme.css"`, cssVariables true, aliases → `@basebench/ui/{components,components/ui,lib,lib/utils,hooks}`.
    - `packages/basebench-ui/tsconfig.json` gained `paths:{"@basebench/ui/*":["./src/*"]}` (NO `baseUrl` — deprecated in our TS7-track; `paths` resolves relative to tsconfig dir). shadcn needs `paths` to map aliases → dirs. Compile clean; resolvedPaths → `src/components/ui`, `src/lib/utils`.
  - **Step 3 — `apply --preset` = SKIP** (theme/font/icon/base all already in F1/F2/F3; running it would clobber the F2 `--color-*` shim → breaks old-name consumers before F5). Component **source** instead via **user-run** `shadcn add <component>` (pulls Base UI source into `src/components/ui/` + auto-installs component deps incl. cva/clsx/tailwind-merge + creates `lib/utils.ts` `cn`). Probe `add select` first, inspect Base-UI-vs-Radix + placement, then bulk. **Probe done (2026-07-07, `--dry-run` + `--view`, no write/install):** `select.tsx` emits `import { Select as SelectPrimitive } from "@base-ui/react/select"` (Base UI ✓), `cn` from `@basebench/ui/lib/utils`, icons direct from `@phosphor-icons/react` (bypasses our F3 `<Icon>` registry — lint-clean, keep-vs-swap decided at re-base), classes on contract tokens (`bg-input`,`ring-ring`,`text-muted-foreground`,`border-destructive`) — all present in `tokens.css` (F1). `rounded-3xl` = luma round corners. Mechanism validated end-to-end.
  - **Step 4 staging (each static-green + dogfood):** 4a foundation → 4b Button → 4c TextInput/FormField → 4d Dialog → 4e Popover/usePopover/Select cluster (ADR-417 menus, high-risk) → 4f delete superseded + final.
    - **4a ✅ DONE + dogfooded (2026-07-07):** `@basebench/ui` re-exports `CSPProvider` (from `@base-ui/react/csp-provider`); `view-kit` `ViewRoot` wraps its whole tree in `<CSPProvider disableStyleElements>` (imports from `@basebench/ui` — no new dep). Added `packages/view-kit/src/css.d.ts` (`declare module '*.css'`) — ViewRoot now pulls the kit's component source into view-kit's program, whose `.css` side-effect imports need the ambient decl (mirrors `@basebench/ui/src/css.d.ts`). Added `src/components/ui/index.ts` barrel (6 Base UI components; root index re-exports per-sub as each promotes). compile (all pkgs + view-src) + lint + build:views green; Sessions view renders unchanged under the CSPProvider wrap (dogfooded via CDP). Old S1 primitives still coexist at root — deleted per-sub.
    - **4b ✅ DONE + dogfooded (2026-07-07):** Button re-based onto shadcn `components/ui/button.tsx` (Base UI + cva). Root index exports `{ Button, buttonVariants }` from `./components/ui/button.js`; old `Button.tsx`+`Button.css` deleted (no orphan consumers of `.btn`/`ButtonVariant`). 31 call sites (7 files) migrated: `variant="primary"→"default"`, `"danger"→"destructive"`, `ghost`/`size="sm"` unchanged (all sites were explicit — no bare-button trap). Dialog dogfooded: amber `default` pill + ghost — correct base-luma.
      - **★ TWO reusable infra fixes discovered here (needed by ALL subs, one-time):**
        1. **`@source` in `tokens.css`** — `packages/basebench-ui` is outside each consumer's Tailwind content root, so the kit's utility classes (`bg-primary`,`rounded-4xl`,…) were never GENERATED (silent no-op → transparent bg / 0 radius). Added `@source "./**/*.{ts,tsx}"` in `tokens.css` (resolves relative to it); every surface importing these tokens now scans the kit + emits its classes. (Old primitives hid this by using hand-written `.css`.) Cost: each view's CSS now includes the kit's shadcn classes (minor bloat, acceptable).
        2. **Canonical `@theme inline` color block** — the contract vars (`--primary`,`--ring`,`--destructive`,`--input`,`--muted-foreground`,…) were `:root` props but never mapped to Tailwind's `--color-*` namespace, so shadcn color utilities emitted nothing. Added `@theme inline { --color-primary: var(--primary); … }` (16 canonical tokens; `inline` → mode-switches via `.dark`). **`--color-accent` DELIBERATELY omitted** — legacy shim owns it (`= --primary`, the app's amber, ~45 sites + 20 CSS files); shadcn `bg-accent` therefore resolves to amber (slightly-wrong hover on 4d/4e select/dialog) until the F5 accent rename. Only true shim/contract collision surfaced.
      - Needs full app restart to pick up package-source deletes (stale HMR served old `Button.tsx` → `btn--default` undefined class); CSS `@source`/`@theme` changes DID hot-apply.
    - **★ STRATEGIC RULE (stakeholder-set, debt-averse) — the taxonomy going forward:** Primitives = shadcn/Base UI used **as the standard exposes them** (compound at call sites); NO custom-API wrappers (the old `Dialog(open,onClose,width)` was exactly that debt). Recipes = OUR compositions **built from** standard primitives, promoted only by rule-of-three, with a semantic API (`ConfirmModal`, not `Dialog(open)`). Debt test: does the wrapper HIDE the primitive behind a hand-rolled API → debt; does it COMPOSE primitives for a repeated pattern → clean recipe. (The `--color-accent` deferral is NOT debt — it's an ADR-scheduled F5 shim step.)
    - **4c ✅ DONE + dogfooded:** `TextInput`→shadcn `Input` (drop-in, `React.ComponentProps<"input">`); 10 usages/6 files renamed `TextInput`→`Input`; old `TextInput.tsx`/`.css` deleted (`.text-input` had no real consumers, 2 stale CSS *comments* remain — F5). `FormField` = a **recipe** (label+error+slot), NO Base UI primitive equivalent → KEPT (re-base its internals onto Base UI `Field` deferred to the FormField step; not a `Dialog→field` swap).
    - **4d ✅ DONE + dogfooded:** Dialog re-based onto shadcn **compound** (`Dialog/DialogContent/DialogHeader/DialogTitle/DialogFooter`, exported from index). 4 real consumers migrated (ChangePassphrase, ClientErase, DeleteWorkspace, WhatsNew — UserAvatar/SettingsMenu only *render* those, no `<Dialog>`). Per the rule: compound used **directly** at call sites, NO `Modal` recipe (the 4 vary — form/confirm/content — so a recipe would reintroduce a custom API). `<h2 id>`→`<DialogTitle>` (auto aria-labelledby); footer→`<DialogFooter>`; `useModalKeys` dropped from dialogs (Base UI Dialog handles Escape/focus-trap natively via `onOpenChange`) — `useModalKeys` KEPT (still used by non-Dialog gates: UnlockGate/LoginModal/PrefsDevPanel/keys). Old `Dialog.tsx`/`.css` deleted. Dogfooded: base-luma rounded-4xl card + backdrop dim/blur + auto-focus + X close (compound adds it) + Escape-dismiss all correct; Input = rounded-3xl `bg-input/50`.
    - **4e SPLIT (census-driven, 2026-07-08):** the "cluster" is two risk tiers. `usePopover` is NOT wrapper-debt — it's the app's shared floating/menu ENGINE (element+coord anchoring, 3 placement strategies, **iframe-blur dismiss gotcha**, focus-restore). Its 4 consumers are all bespoke menu surfaces. `Select` (S1) is separable — 1 consumer.
      - **census:** `usePopover` → ContextMenu (557-line submenu engine, coord-anchored, Alt-cmds, type-ahead, radio, cross-iframe), SettingsMenu (729-line drill-down panel), WorkspaceSwitcher (listbox dropdown), UserAvatar (menu dropdown). `Select` S1 → AccountSelect only (shell-only, no iframe). `Popover` default-import → none (only S1 Select used it internally).
      - **4e-i ✅ DONE + dogfooded (2026-07-08):** Select → Base UI `Select` compound (`Select/SelectTrigger/SelectValue/SelectContent/SelectItem` exported from index). AccountSelect rewritten as a recipe composing the compound over domain data (`items=[{value,label}]`, `SelectValue` renders nickname; `SelectTrigger` `className="w-full"` + `ref=triggerRef`). Deleted S1 `Select.tsx`/`Select.css` + bespoke `AccountSelect.css` (base-luma `SelectTrigger` `rounded-3xl bg-input/50` == the `Input` primitive → visual match free, no per-call-site override). `Popover`/`usePopover` KEPT (still the 4 menu surfaces). **★ Accent collision resolved (the planned 4e fix):** open select item aligned-with-trigger rendered AMBER (`focus:bg-accent` → legacy `--color-accent`=amber shim, F5-deferred, NOT base-luma neutral `--accent`). Own-source edit `focus:bg-accent`→`focus:bg-muted` in `components/ui/select.tsx` (base-luma `--accent`==`--muted`, identical → visually = base-luma intent; `text-accent-foreground` left, it IS mapped correctly). Only accent use in components/ui. Gates: compile+lint+build:views green. Dogfood (CDP, identify-mode via unlock→signOut→restore): trigger dark bg-input/50, width 352==passphrase field, rounded-3xl, shows nickname; open popup neutral item + check indicator (NOT amber, post-fix screenshot-confirmed); **0 CSP violations** (shell allows inline style; views covered by `disableStyleElements`).
      - **4e-ii SPIKE ✅ GREEN (2026-07-08) — re-base is VIABLE, usePopover can DIE.** Temp `_SpikeMenu.tsx` (Base UI `Menu`, modal default) mounted in `Workbench.tsx`; CDP-dogfooded in the real unlocked shell with a `view://ru-soam-practice/roster.html` iframe on screen. Findings:
        1. **iframe-blur gotcha SOLVED FOR FREE.** `Menu.Root` is **`modal:true` by default** → renders a viewport-covering pointer-blocking overlay (`inset:0`, position fixed) portaled AFTER the iframe → above it in z-order. `elementFromPoint(iframe-center)` with menu open returned the overlay DIV, **not** the iframe (`isIframe:false`). A dispatched click over the iframe region **dismissed the menu** (`popupStillOpen:false`) — the iframe never receives the event, so the "iframe swallows mousedown" gotcha is structurally impossible. usePopover's bespoke `window blur` listener is **obviated**.
        2. **coord-anchor WORKS.** `Menu.Positioner anchor={{getBoundingClientRect:()=>new DOMRect(400,300,0,0)}}` placed the popup correctly (x=320 = 400 − 80 half-width at default `align=center`; ContextMenu will use `align=start`/`side=bottom` for top-left-at-{x,y}). Base UI Menu covers the {x,y} case incl. iframe-forwarded coords.
        - **Base UI Menu parity for ContextMenu:** ships `submenu-root`/`submenu-trigger` (flyouts), `checkbox-item`/`radio-item` (+indicators) (the checked/radio roles), `portal`, `backdrop`, `viewport`. Dedicated `ContextMenu` (root+trigger) package exists for right-click, but our menus open at programmatic {x,y} → controlled `Menu.Root` + virtual anchor is the fit.
        - **Caveats for the rewrite:** (a) modal locks page scroll → inline `<style>` — shell CSP allows it (0 violations, as with Select); these menus are shell-only so no CSPProvider needed. (b) Backdrop *eats* the iframe click (no pass-through) → one extra click to then act on the iframe; standard menu UX, arguably safer than usePopover's pass-through. (c) Spike fully reverted (`_SpikeMenu.tsx` deleted, `Workbench.tsx` restored).
      - **4e-ii ✅ DONE + dogfooded (2026-07-08); usePopover + S1 Popover DELETED.** Source via user-run `shadcn add dropdown-menu` (= Base UI `Menu` compound, cn + IconPlaceholder→Phosphor auto-rewritten; no new deps). Own-source fixes: 6× `bg-accent`→`bg-muted` (accent collision) + added `anchor` passthrough to `DropdownMenuContent` (for the coord case). Index now exports the DropdownMenu + Base UI Popover compounds; the S1 `Popover` default-export replaced.
        - **Surface mapping (refined):** MENUS → `DropdownMenu` (Base UI Menu, `modal` default → iframe-dismiss immunity free). **UserAvatar** ✅ (dropdown, icon+label `DropdownMenuItem`s, `variant="destructive"` Sign out, `side="right" align="end"`). **WorkspaceSwitcher** ✅ compile (only 1 workspace locally → renders the plain span; dropdown code mirrors UserAvatar). **ContextMenu** = OUR recipe over `DropdownMenu` (controlled `open`, virtual `{x,y}` anchor, `renderItem` recursion: separators via firstInGroup, submenus via `Sub/SubTrigger/SubContent`, Alt-command title/exec kept, check/radio glyph column via Tailwind `w-3.5`; **Fragment** wrappers not `<div>` so Base UI roving-focus sees items as direct Popup children). **PANEL** (not a menu) → **SettingsMenu** = Base UI **`Popover`** with `modal` (Popover defaults `modal:false` → MUST set `modal` for iframe-dismiss); base skin neutralized via tailwind-merge overrides (`w-auto p-0 gap-0 bg-transparent rounded-none shadow-none ring-0`) so `.settings-popover` owns the look; drill-down reset moved from a setState-in-effect to the `onOpenChange` handler (lint).
        - **Dogfood (CDP :9333, light):** UserAvatar menu (positioned, destructive red Sign out, DEV footer); SettingsMenu (positioned, nav rows, **text-input typing works inside the modal Popover**, custom skin intact); ContextMenu via **trusted right-click** on titlebar (`workbench/title/context`) — renders at cursor coords, check glyph on visible parts, separator, **keyboard ArrowDown nav**, **item-select** (clicked "Panel" → layout toggled + menu closed), and **iframe-dismiss** (open → trusted click into the Practice `view://` iframe → dismissed). Gates: compile + lint + build:views green.
        - **★ Deferred bug O518:** hovering the "Color Theme" **submenu** trigger dismisses the whole modal context menu (Base UI submenu + modal + externally-opened root; no error — root `onOpenChange(false)` → MenuHost unmount). Only submenu in the app (1 theme post-F1 → vestigial). User chose DEFER; everything else works. (Note: titlebar menu-BAR dropdowns File/Edit/… are stubs — not built — so the only live ContextMenu path is right-click `workbench/title/context` + roster/tab context menus.)
      - **FormField → Base UI `Field` ✅ DONE + dogfooded (2026-07-08).** FormField stays a **recipe** (stable `{label, htmlFor, error?, children, className?}` API, ~9 call sites — rule-of-three), internals re-based from hand-rolled `<div><label><p>` onto Base UI `Field` primitive (`@base-ui/react/field`, imported direct — headless, no injected `<style>`, CSP-safe; no shadcn `field.tsx` scaffold pulled = no-sprawl). Structure: `<Field.Root invalid={Boolean(error)}>` + `<Field.Label htmlFor={htmlFor}>` (explicit `htmlFor` overrides Base UI auto-id → associates the caller-supplied child control; `text-fg-secondary` semibold, inline `style={{letterSpacing}}` → `tracking-[0.02em]`, last inline style gone) + children + `<Field.Error match className="text-xs text-error …">` (`match` force-shows the caller string with Base UI's accessible error wiring; renders `<p>`). Gates: compile+lint green both surfaces. Dogfood (CDP, UnlockGate): label `for=unlock-passphrase` wired to input, style 600/13.2px/ls 0.02em; wrong passphrase → red `Field.Error` "Incorrect passphrase (4 attempts remaining)." (oklch red, 13.2px); correct unlock → workbench, no regression.
      - **4f ✅ DONE (2026-07-08).** No S1-superseded files remain in `packages/basebench-ui/src` — Button/TextInput/Dialog/Select/Popover/usePopover all deleted incrementally across 4b–4e. Kit root now = recipes (FormField, PageShell) + primitives (Icon, ResizeHandle) + infra (cn, lib, tokens/theme.css) + `components/ui/` shadcn sources. `components/ui/label.tsx` unreferenced but KEPT (shadcn-managed registry primitive, not S1 — future `shadcn add` may depend). Final compile+lint green both surfaces. **Next = F5** (static fragments EmptyState/Card/Badge/Chip/KvRow/Section + finish shim deletion + bridge `TOKEN_NAMES`→contract-leaf retarget + legacy `--color-accent`=amber rename) → **F6** (`/dev/design-system` gallery).
  - **Step 4 — vendor + re-base** the 13 S1 primitives (current `Popover`/`Select`/… are hand-rolled on `usePopover`) onto the added Base UI source; both surfaces import base; `ViewRoot` gains `<CSPProvider disableStyleElements>`; consolidate our naïve `cn` (src/cn.ts) with shadcn's `lib/utils.ts` cn (clsx+tailwind-merge) — delete the dup (rule-of-three / delete-on-promote).
- **F5** — (was S4b) static fragments EmptyState/Card/Badge/Chip/KvRow/Section in `@basebench/ui`, shadcn-styled, token-only; migrate ~14 views + shell call-sites; delete copies. **Also finishes shim deletion + bridge `TOKEN_NAMES`→contract-leaf retarget** (deferred from F2 — done together once consumers are off the `--color-*` names).

  ### F5 census + decomposition (2026-07-08)
  **Census (verified):** `view://` views = **0** raw `var(--color-*)` (already contract-clean via utilities). Shim migration is **shell (272) + kit (40)** CSS refs + ~19 tsx alias utilities. Deletable direct-alias names (1:1 → contract): `surface-base/panel/elevated/active`, `fg-primary/secondary/muted`, `border`, `border-focus`, `accent`(→primary, same amber), `accent-fg`, `error`. **KEEP as extension (rebased, NOT deleted):** semantic `info/success/warning`, all `tint-*`, `accent-hover/pressed`, `border-hover/subtle/warning-*`, `surface-input/sunken/recessed`, shadows, type/spacing/radii, fonts. Static fragments = **net-new** (no named EmptyState/Card/Badge/Chip/KvRow/Section exist).
  **2 slices, staged by risk:**
  - **F5·1 — shim kill (token spine).** (a) migrate 312 consumer CSS refs + 19 tsx utilities alias→contract [LOW risk: shim stays as backstop]; (b) tokens.css surgery — rebase internal extension defs off aliases, delete alias defs from `@theme`+real-`:root`, add `@theme inline --color-accent: var(--accent)` (neutral, canonical shadcn) + revert `bg-accent`→`bg-muted` own-source hacks; (c) bridge `TOKEN_NAMES`→contract leaves + delete real-`:root` shim block [HIGH risk: repaint/blank]. Commit boundary between (a) and (b+c).
  - **F5·2 — static fragments.** Additive, independent; after the spine.

  - **F5·1(a) ✅ DONE + dogfooded (2026-07-08).** Deterministic sed (literal `)` prevents prefix-bleed into extension names): 12 alias→contract pairs across all shell `.css` (excl. tokens.css) + kit `{PageShell,ResizeHandle}.css`; tsx `text-fg-secondary`→`text-muted-foreground`, `text-error`→`text-destructive`, `bg-surface-elevated`→`bg-popover`. **40 files, +301/−289.** tokens.css UNTOUCHED (shim + extension intact = backstop; bridge still on shim). Residual deletable-alias refs in consumers = **0**. Gates: compile+lint+build:views green. **Dogfood (CDP :9333):** shell chrome + Practice roster `view://` iframe, **both dark AND light** (real statusbar mode toggle → bridge re-push flips the iframe too) — amber active tab/avatar/wordmark, warning/neutral chips, borders, green status dots all correct; no transparent paints, no blank views, no regression (contract values == shim values by construction). **UNCOMMITTED — clean commit boundary. NEXT = F5·1(b+c)** (tokens.css surgery + bridge retarget + shim delete; isolated high-risk diff).
- **F6** — `/dev/design-system` gallery; theme × mode toggles; view primitives in a real `view://` iframe frame.

## Deps for the user to install (when reached, NOT in F1)
`@base-ui-components/react` (verify name), `@phosphor-icons/react`, `class-variance-authority`, `tw-animate-css`. Inter font files (F1 — asset, self-hosted). Agent does not run installs.
