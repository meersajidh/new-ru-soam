# ADR-421 Execution Tracker (F1–F6)

**Status:** F1 in progress (shim-transition). **Date:** 2026-07-07.
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

## F2–F6 (stubs — detail when reached)

- **F2** — `@basebench/ui` becomes shadcn `packages/ui` (hand-configured `components.json`, Tailwind-v4 empty-tailwind CSS-var mode); `theme.css` = the contract; reconcile `tokens.css` ↔ view-kit `theme.css` → one theme both surfaces import; begin deleting shim as shell consumers migrate; retire palette files if not in F1.
- **F3** — unify Icon: single inline-SVG `<Icon>`, multi-source registry, **Phosphor primary** (`@phosphor-icons/react` paths) + codicon/Fluent mountable; drop shell font-codicon; lint no-raw-svg both surfaces.
- **F4** — **Base UI CSP spike** (prove Select/Popover positions in a real `view://` iframe under STRICT_VIEW_CSP) → vendor shadcn/Base UI interactive primitives into `@basebench/ui`; both surfaces import; re-base the 13 S1 primitives; finish shim deletion.
- **F5** — (was S4b) static fragments EmptyState/Card/Badge/Chip/KvRow/Section in `@basebench/ui`, shadcn-styled, token-only; migrate ~14 views + shell call-sites; delete copies.
- **F6** — `/dev/design-system` gallery; theme × mode toggles; view primitives in a real `view://` iframe frame.

## Deps for the user to install (when reached, NOT in F1)
`@base-ui-components/react` (verify name), `@phosphor-icons/react`, `class-variance-authority`, `tw-animate-css`. Inter font files (F1 — asset, self-hosted). Agent does not run installs.
