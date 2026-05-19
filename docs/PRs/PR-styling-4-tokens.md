# PR-4 — Styling consolidation: surface-over-surface mixes

Continues the token sweep. Closes out the surface-blend shape that PR-2
and PR-3 deferred.

## Goal

Introduce 5 surface tokens covering form-input backgrounds and recessed
surfaces. Sweep the 6 remaining `color-mix(... var(--color-surface-X) N%,
var(--color-surface-Y))` and `color-mix(... var(--color-surface-X) N%,
transparent)` literals.

## Scope

- `apps/desktop/src/styles/tokens.css` — add 5 tokens.
- `apps/desktop/src/styles/setup.css` — sweep (6 sites).

Out of scope:
- Inline `style={{}}` triage — PR-5.
- BEM naming codemod — PR-5.

## Token additions

Append to `@theme {}` after the existing `--border-*` block:

```css
/* Form input surfaces — opaque blend of panel into base.
   `:focus` uses a slightly darker variant for state reinforcement
   alongside the accent border + glow. */
--surface-input:        color-mix(in oklch, var(--color-surface-panel) 80%, var(--color-surface-base));
--surface-input-focus:  color-mix(in oklch, var(--color-surface-panel) 70%, var(--color-surface-base));

/* Sunken surfaces — translucent panel over the host bg.
   Used for inset grids, ghost buttons, trust badges. Two intensities. */
--surface-sunken-soft:   color-mix(in oklch, var(--color-surface-panel) 50%, transparent);
--surface-sunken-medium: color-mix(in oklch, var(--color-surface-panel) 60%, transparent);

/* Recessed surface — translucent base over the host bg.
   Darker than --surface-sunken-*; used for inner cells that sit inside
   an already-sunken container (e.g. recovery-word inside recovery-grid). */
--surface-recessed: color-mix(in oklch, var(--color-surface-base) 60%, transparent);
```

## Rewrites

All exact-% match (zero perceptual delta):

| File / line | Before (% / base) | After |
|---|---|---|
| `setup.css:350` | panel 80% × base | `var(--surface-input)` |
| `setup.css:379` | panel 70% × base | `var(--surface-input-focus)` |
| `setup.css:668` | panel 50% × transparent | `var(--surface-sunken-soft)` |
| `setup.css:678` | base 60% × transparent | `var(--surface-recessed)` |
| `setup.css:755` | panel 50% × transparent | `var(--surface-sunken-soft)` |
| `setup.css:785` | panel 60% × transparent | `var(--surface-sunken-medium)` |

## Constraints

- Do not introduce token names beyond the five listed.
- Do not reorder or rename existing tokens.
- Do not add new selectors or touch any `.tsx` file.
- Lines 376 and 378 (in the same `.setup-input:focus` rule as 379) are
  inside `calc(... * var(--glow-mul))` and must remain untouched.

## Success criteria

- Compile + lint clean (`pnpm --filter ru-soam-app compile`,
  `pnpm --filter @ru-soam/editor compile`, `pnpm --filter ru-soam-app lint`).
- Grep `color-mix\(in oklch, var\(--color-surface-(panel|base)\)` in
  `setup.css` returns **zero** matches outside of `calc(...)` expressions.

## Reporting

Report on:
1. Success-criteria grep.
2. Compile + lint results.
3. Any line drift.
4. Anything skipped.
