# PR-7b — Styling consolidation: type & spacing sweep + recipe rewrite

The big one. Routes every component-CSS font and spacing property through
the new 6-step type scale (PR-7a) and Tailwind's `--spacing`-driven
utilities via `@apply`. Rewrites `type.css` with the new recipe names.
Deletes the obsolete `--space-N` tokens. Result: single source of truth
for type and spacing across the codebase.

## Goal

After this PR:
- No `font-size: Npx` anywhere outside `tokens.css`.
- No `font-family: var(--font-*)` anywhere outside `tokens.css` (the body
  rule sets the default; nothing else needs to declare it).
- No `padding: Npx`, `margin: Npx`, `gap: Npx` literal values in
  component CSS — all via `@apply` of `p-N` / `m-N` / `gap-N` etc.
- No `var(--space-N)` references — token deleted.
- `type.css` recipes renamed and re-authored via `@apply`. No raw type
  properties remain.
- `.t-display` and `.t-title` deleted (renamed to `.t-h1` / `.t-h2`).
- `.t-label`, `.t-caption`, `.t-micro` collapse into a single `.t-caption`.

## Scope

CSS files to sweep:
- `apps/desktop/src/styles/type.css` — full rewrite.
- `apps/desktop/src/styles/workbench.css` — every rule that touches type
  or spacing.
- `apps/desktop/src/styles/setup.css` — same.
- `apps/desktop/src/workbench/middle/WorkspaceTileGrid.css` — same.
- `apps/desktop/src/styles/tokens.css` — delete the `--space-N` block.

JS/TSX files to update (recipe rename only; no other changes):
- All consumers of `.t-display`, `.t-title`, `.t-label`, `.t-micro` —
  grep + rename.

Hard non-scope:
- Tint / scrim / edge-highlight / tinted-border tokens (`--tint-*`,
  `--scrim-*`, `--highlight-*`, `--border-*`, `--surface-input*`,
  `--surface-sunken*`, `--surface-recessed`) stay as `var(...)` access in
  component CSS — Tailwind doesn't auto-generate utilities for them since
  they aren't under the `--color-*` namespace. Migration to
  `--color-{tint|scrim|...}` namespace is PR-7c.
- Color tokens that ARE under `--color-*` (e.g. `--color-fg-primary`,
  `--color-surface-panel`, `--color-warning`) — switch to `@apply
  text-*` / `bg-*` / `border-*` utilities where the rule already touches
  another @apply-able property; otherwise leave the raw `var()` access.
  Bulk recolor-via-utilities is a separate cleanup.
- Animated `calc(... * var(--glow-mul))` expressions — untouched.
- Theme files (`themes/*.css`, `font-sets/*.css`) — untouched.
- No new selectors, no selector renames, no specificity changes (PR-6
  already handled BEM).
- Decomposing `workbench.css` / `setup.css` into colocated component CSS
  — that's PR-8.

## Substitution policy

### Type properties → `@apply text-{xs|sm|base|lg|xl|2xl}`

Replace any rule that sets two or more of `{font-size, line-height,
letter-spacing}` with a single `@apply text-{step}` and the size's baked
LH/LS take over.

If only `font-size` is set (no `line-height`, no `letter-spacing`),
`@apply text-{step}` is still preferred — the baked LH may differ from
the previous `line-height: normal` (browser ~1.2). Accept the small
shift; flag as a watch-out if a specific rule has tight numeric
positioning (status-bar badges, etc.).

**Type-scale rounding table — apply for every bespoke font-size:**

| Bespoke | New | Δ | Notes |
|---|---|---|---|
| 9px | `text-xs` (12) | +3 | floor of the scale; one site (`.sb-badge`) |
| 10px | `text-xs` (12) | +2 | one site |
| 11px | `text-xs` (12) | +1 | captions/labels |
| 12px | `text-xs` (12) | 0 | — |
| 13px | `text-sm` (13) | 0 | body default |
| 14px | `text-sm` (13) | −1 | "Remove input deviation" per requirement |
| 15px | `text-base` (16) | +1 | rare |
| 16px | `text-base` (16) | 0 | — |
| 18px | `text-base` (16) | −2 | default-down |
| 20px | `text-lg` (20) | 0 | — |
| 22px | `text-lg` (20) | −2 | default-down |
| 24px | `text-xl` (24) | 0 | — |
| 26px | `text-xl` (24) | −2 | default-down |
| 28px | `text-2xl` (32) | +4 | aesthetic upshift — only site is the old `.t-display` |
| 32px | `text-2xl` (32) | 0 | — |
| 1.6em / 1.3em | `text-lg` / `text-base` | — | ProseMirror H1/H2 — round absolute calculated value |
| 0.85em | `text-xs` | — | inline mono (size relative to parent) |
| 0.92em | `text-xs` | — | inline mono |

### Font-family → `@apply font-{sans|mono|display}` or delete

- Rules that set `font-family: var(--font-sans)` redundantly (body already
  inherits `--font-sans` from `.workbench` / `.setup-page`) — **delete
  the declaration entirely**. Same for the body inheritance into the
  unlock gate (`.unlock-gate-overlay`) etc.
- Rules that set `font-family: var(--font-mono)` or `var(--font-display)`
  for an override — **replace with `@apply font-mono` / `@apply
  font-display`**.
- Rules with a complex fallback list (e.g. `var(--font-mono, monospace)`)
  in ProseMirror styles — same treatment; `@apply font-mono` is fine,
  the token already has its fallback chain.

### Font-weight → `@apply font-{normal|medium|semibold|bold}`

- `font-weight: 400` → delete (default).
- `font-weight: 500` → `@apply font-medium`.
- `font-weight: 600` → `@apply font-semibold`.
- `font-weight: 700` → `@apply font-bold`.

### Color → `@apply text-{color}` (foreground only — backgrounds stay raw if not @theme-registered)

- `color: var(--color-fg-primary)` → `@apply text-fg-primary`.
- `color: var(--color-fg-secondary)` → `@apply text-fg-secondary`.
- `color: var(--color-fg-muted)` → `@apply text-fg-muted`.
- `color: var(--color-accent)` → `@apply text-accent`.
- `color: var(--color-warning|success|error|info)` → `@apply
  text-{warning|success|error|info}`.

### Spacing properties → `@apply p-N` / `m-N` / `gap-N`

Tailwind v4 `--spacing: 0.25rem` (from PR-7a). Multipliers `N` resolve to
`N × 0.25rem`. Fractional multipliers (`.5`) supported.

**Spacing rounding table — `var(--space-N)` to utility:**

| Old | New | Notes |
|---|---|---|
| `var(--space-1)` (4px) | `p-1` / `m-1` / `gap-1` | — |
| `var(--space-2)` (8px) | `p-2` / `m-2` / `gap-2` | — |
| `var(--space-3)` (12px) | `p-3` / `m-3` / `gap-3` | — |
| `var(--space-4)` (16px) | `p-4` / `m-4` / `gap-4` | — |
| `var(--space-6)` (24px) | `p-6` / `m-6` / `gap-6` | — |
| `var(--space-8)` (32px) | `p-8` / `m-8` / `gap-8` | — |

**Bespoke px → utility — default down on equidistant ties:**

| Bespoke | Multiplier | Utility | Δ |
|---|---|---|---|
| 2px | 0.5 | `p-0.5` | 0 |
| 3px | 1 | `p-1` | +1 |
| 4px | 1 | `p-1` | 0 |
| 5px | 1 | `p-1` | −1 |
| 6px | 1.5 | `p-1.5` | 0 |
| 7px | 1.5 | `p-1.5` | −1 |
| 8px | 2 | `p-2` | 0 |
| 10px | 2 | `p-2` | −2 (default down) |
| 12px | 3 | `p-3` | 0 |
| 13px | 3 | `p-3` | −1 |
| 14px | 3 | `p-3` | −2 (default down) |
| 16px | 4 | `p-4` | 0 |
| 18px | 4 | `p-4` | −2 (default down) |
| 20px | 5 | `p-5` | 0 |
| 22px | 5 | `p-5` | −2 (default down) |
| 24px | 6 | `p-6` | 0 |
| 26px | 6 | `p-6` | −2 (default down) |
| 28px | 7 | `p-7` | 0 |
| 32px | 8 | `p-8` | 0 |
| 40px | 10 | `p-10` | 0 |

(Use `.5` multipliers only when the brief explicitly calls for them or
when whole rounding visibly destroys component fidelity. Default to
whole multipliers per the user's "fixed scale, default down" rule.)

Composite paddings like `padding: 13px 16px` map to `@apply px-4 py-3`
(rounding each axis per table). Margins/gaps similarly.

### Letter-spacing → `@apply tracking-[Nem]` (arbitrary value) or `tracking-tight|wide|widest`

Recipe sizes (`text-lg`, `text-xl`, `text-2xl`) already bake letter-spacing
(`-0.005em`, `-0.012em`, `-0.025em` from PR-7a). **Drop redundant
`letter-spacing` declarations** that match the baked value.

For bespoke letter-spacing that does NOT match the baked value:
- `0.02em` → `tracking-[0.02em]` (eyebrow text)
- `0.08em` → `tracking-[0.08em]` (uppercase mini-labels)
- `0.18em` → `tracking-[0.18em]` (progress eyebrow)
- `-0.015em` → `tracking-[-0.015em]` (workspace tile name)
- etc.

Keep these as arbitrary-value utilities. Letter-spacing tokens are not
worth a scale for now.

### What stays as raw `var(...)`

- `border-radius: var(--radius-sm|md)` — actually use `@apply rounded-sm|md` instead.
- `background: var(--color-surface-X)` — use `@apply bg-surface-X`.
- `background: var(--tint-X)` / `var(--scrim-X)` / `var(--surface-input)`
  etc. — **keep raw** (no Tailwind utility; namespace migration is
  PR-7c).
- `border: 1px solid var(--color-border)` — use `@apply border border-border`.
- `border: 1px solid var(--border-warning-soft)` — **keep raw** (same
  reason as tints).
- `box-shadow: var(--shadow-*)` — use `@apply shadow-{rest|card|overlay|modal}`.
- `transition: ...` — keep raw (Tailwind's transition utilities don't
  cover every prop combination cleanly).
- Animations, transforms, `outline`, `cursor`, `position`,
  `display: grid/flex`, `grid-template-columns`, `flex` shorthand,
  `min-width`, `max-width`, `height`, `width` (when not on the spacing
  scale), `overflow`, `z-index` — keep raw. These are layout/shape
  primitives; Tailwind utilities would be longer than the raw form.

## `type.css` rewrite

Replace the entire current `type.css` body with:

```css
/* ─────────────────────────────────────────────────────────────────────────────
 * Semantic type recipes. Composed from Tailwind utilities via @apply.
 *
 * Recipes are the standard UX layer. Components may use them directly and
 * override per-variant where the design requires (e.g. a button that uses
 * .t-body-strong but needs slightly tighter line-height). Layout is left
 * to JSX (page / route / context).
 *
 * Naming: .t-{role}. Role names match the type scale or the semantic
 * function. Headings use .t-h1 / .t-h2 / .t-h3 because <hN> elements are
 * reset (see index.css) — every heading instance picks a recipe class.
 * ──────────────────────────────────────────────────────────────────────────── */

/* Hero / display — wordmark, splash, page-defining headlines. */
.t-h1          { @apply text-2xl font-semibold text-fg-primary; }

/* Section titles — modal titles, route titles, banner titles. */
.t-h2          { @apply text-xl font-semibold text-fg-primary; }

/* Sub-section / group titles — inside a card or panel. */
.t-h3          { @apply text-lg font-semibold text-fg-primary; }

/* Body — the default for any block of UI text. */
.t-body        { @apply text-sm text-fg-primary; }
.t-body-strong { @apply text-sm font-medium text-fg-primary; }

/* Description — body-tier explanatory copy under a heading. */
.t-description { @apply text-sm text-fg-secondary; }

/* Caption — small uppercase or lowercase metadata, labels, badges. */
.t-caption     { @apply text-xs text-fg-muted; }

/* Mono — monospaced numeric / code data. */
.t-mono        { @apply text-xs font-mono text-fg-primary; }

/* Inline mono — short code/key tokens inside a body paragraph. */
.t-mono-inline { @apply text-xs font-mono rounded-sm bg-surface-elevated;
                 padding: 0 4px; }
```

Deletions / collapses:
- `.t-display` → renamed `.t-h1`.
- `.t-title` → renamed `.t-h2`.
- `.t-label` → folded into `.t-caption`.
- `.t-micro` → folded into `.t-caption`.

Note on `.t-mono-inline`: the `padding: 0 4px` is layout, not type; could
be authored as `@apply px-1` (4px = 0.25rem = 1×spacing). Use that:

```css
.t-mono-inline { @apply text-xs font-mono rounded-sm bg-surface-elevated px-1; }
```

(Single line, fully `@apply`-composed.)

## `tokens.css` cleanup

After all consumer sweeps in this PR, delete the entire `--space-N`
block from `tokens.css`:

```css
/* DELETE this entire block — Tailwind utilities driven by --spacing
   (PR-7a) replace it. */
:root {
  --space-1: 0.25rem;
  /* ... */
  --space-8: 2rem;
}
```

But preserve the `--radius-sm` / `--radius-md` declarations (radii are
not on the spacing scale and Tailwind generates `rounded-sm` / `rounded-md`
from them at @theme level — actually move radii into @theme if they
aren't already so the utilities resolve cleanly).

**Action:** move `--radius-sm: 4px; --radius-md: 8px;` from the `:root`
block into `@theme {}` as `--radius-sm: 0.25rem; --radius-md: 0.5rem;`
(in rem, matching the rest of the scale). Update any consumer references
of `var(--radius-*)` to `@apply rounded-sm|md`.

After cleanup, the post-PR-7a `:root` block that held `--space-N` +
`--radius-*` should be **gone entirely** — its contents either migrated
to `@theme` (radii) or deleted (spacing).

## Consumer renames

Grep + rename across `apps/desktop/src` and `packages/editor/src`:

| Old | New |
|---|---|
| `t-display` | `t-h1` |
| `t-title` | `t-h2` |
| `t-label` | `t-caption` |
| `t-micro` | `t-caption` |

Use word-boundary grep (e.g. `\bt-display\b`) so partial matches like
`t-display-foo` are not affected. There should be ≤ 50 sites total.

## Constraints

- Sweep mechanically per the substitution tables. When a rule has
  multiple type/spacing properties, combine into a single `@apply` line
  rather than multiple chained `@apply` directives.
- A rule that ends up with ONLY layout/shape primitives (`display`,
  `transition`, etc.) after the sweep keeps those as raw properties.
- A rule that ends up entirely composed of `@apply` is fine — the rule
  is a recipe.
- A rule that ends up EMPTY after the sweep — delete it.
- Preserve all selector text and order. No specificity changes.
- The `--space-N` block is deleted ONLY after every consumer is swept;
  if any consumer remains, the compile will fail and signal a miss —
  fix the miss, do not restore the token.
- Animated `calc(... * var(--glow-mul))` expressions inside other
  declarations (e.g. inside a `box-shadow`) are untouched. Do not
  attempt to express them via utilities.
- ProseMirror selectors (`.ru-edit-host .ProseMirror hN`, `... p`, etc.)
  follow the same substitution rules.

## Success criteria

- `pnpm --filter ru-soam-app compile` clean.
- `pnpm --filter @ru-soam/editor compile` clean.
- `pnpm --filter ru-soam-app lint` clean.
- `grep -rEn "font-size: ?[0-9]+(px|em|rem|%)" apps/desktop/src packages/editor/src` returns zero matches in CSS files (animated/ProseMirror sites included).
- `grep -rEn "font-family: ?var" apps/desktop/src/styles/workbench.css apps/desktop/src/styles/setup.css apps/desktop/src/workbench/middle/WorkspaceTileGrid.css` returns zero matches.
- `grep -rEn "var\(--space-[1-9]\)" apps/desktop/src packages/editor/src` returns zero matches.
- `grep -rEn "\bt-(display|title|label|micro)\b" apps/desktop/src packages/editor/src` returns zero matches.
- `--space-N` block is deleted from `tokens.css`.
- `--radius-sm` / `--radius-md` live inside `@theme {}` in rem form.

## Reporting

When done, report:
1. Compile + lint.
2. Zero-match confirmation for all four success-criteria greps.
3. **Aesthetic-override list** — any rule where the implementer chose
   `.5` multipliers, kept raw spacing, or applied an aesthetic upshift
   (e.g. 22px → `p-5` (20) is default-down; 22px → `p-5.5` (22) is a
   keep-as-is). Up to ~5 expected. Flag for dogfood spot-check.
4. **Rule-removal list** — selectors that became empty after sweep and
   were deleted.
5. **Any token-namespace blockers** — sites where `@apply` couldn't
   substitute because the source value lives outside `--color-*` (e.g. a
   `background: var(--tint-warning-soft)` that stays raw). Confirm these
   are not regressions vs current behavior.
6. Total touch count: rules edited / rules deleted / JSX file count.

Do not run `just dev-desktop` or git commands. Opus dogfoods after handoff.
