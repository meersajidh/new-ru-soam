# PR-1 — Styling consolidation: semantic tint tokens + shadow sweep

Part of the multi-PR effort to consolidate the styling layer documented in
the 19 May 2026 audit. See `CLAUDE.md` → "Styling system" for the target
conventions.

## Goal

Introduce semantic tint tokens (`--tint-{color}-{step}`) and migrate every
**static** semantic `color-mix(... N%, transparent)` literal and every raw
`box-shadow: ... rgba(0,0,0,*)` literal to use the existing
`--shadow-{rest|card|overlay|modal}` and new tint tokens. No visual
rewrites; this is a token-refactor PR.

## Scope

Files in scope:

- `apps/desktop/src/styles/tokens.css` — add tint tokens.
- `apps/desktop/src/styles/workbench.css` — sweep.
- `apps/desktop/src/styles/setup.css` — partial sweep.
- `apps/desktop/src/workbench/middle/WorkspaceTileGrid.css` — sweep.

Out of scope (deferred to later styling PRs):

- Animated glow sites that use `calc(N% * var(--glow-mul))` — leave as-is.
- Surface-blend mixes shaped `color-mix(... N%, var(--color-surface-*))` —
  defer to PR-2.
- White-highlight mixes shaped `color-mix(... white N%, transparent)` —
  defer to PR-2.
- Neutral `fg-primary` tints (`setup.css:187,513,591,732`) — defer.
- Modal scrim backgrounds (`rgba(0,0,0,0.45)` / `0.55`) — defer to PR-2
  (introduces `--color-scrim` token).
- Any restructuring of `workbench.css`/`setup.css` selectors.

## Token additions

Append the following block to the `@theme {}` block in
`apps/desktop/src/styles/tokens.css`, after the existing `--shadow-*`
declarations:

```css
/* Semantic tints — N% of color over transparent.
   5-step scale: subtle → soft → medium → strong → bold.
   Add new steps here before using new percentages elsewhere. */
--tint-accent-subtle:  color-mix(in oklch, var(--color-accent)  10%, transparent);
--tint-accent-soft:    color-mix(in oklch, var(--color-accent)  20%, transparent);
--tint-accent-medium:  color-mix(in oklch, var(--color-accent)  35%, transparent);
--tint-accent-strong:  color-mix(in oklch, var(--color-accent)  55%, transparent);
--tint-accent-bold:    color-mix(in oklch, var(--color-accent)  75%, transparent);

--tint-info-subtle:    color-mix(in oklch, var(--color-info)    15%, transparent);
--tint-info-medium:    color-mix(in oklch, var(--color-info)    35%, transparent);
--tint-info-strong:    color-mix(in oklch, var(--color-info)    40%, transparent);
--tint-info-bold:      color-mix(in oklch, var(--color-info)    80%, transparent);

--tint-success-subtle: color-mix(in oklch, var(--color-success) 15%, transparent);
--tint-success-soft:   color-mix(in oklch, var(--color-success) 20%, transparent);
--tint-success-medium: color-mix(in oklch, var(--color-success) 30%, transparent);
--tint-success-strong: color-mix(in oklch, var(--color-success) 40%, transparent);
--tint-success-bold:   color-mix(in oklch, var(--color-success) 70%, transparent);

--tint-warning-subtle: color-mix(in oklch, var(--color-warning) 10%, transparent);
--tint-warning-soft:   color-mix(in oklch, var(--color-warning) 15%, transparent);
--tint-warning-medium: color-mix(in oklch, var(--color-warning) 40%, transparent);
--tint-warning-strong: color-mix(in oklch, var(--color-warning) 60%, transparent);

--tint-error-subtle:   color-mix(in oklch, var(--color-error)   12%, transparent);
--tint-error-medium:   color-mix(in oklch, var(--color-error)   35%, transparent);
--tint-error-strong:   color-mix(in oklch, var(--color-error)   60%, transparent);
```

`--color-error` is declared in `tokens.css` but is not yet used by any
`color-mix` site; the error tint tokens are added now to keep the scale
shape consistent. No existing sites use them.

## Tint rewrites (shape: `color-mix(... N%, transparent)`)

Lines refer to the file state on `main` at the time of the audit. Verify
each match before editing — if the line number has shifted, locate by the
literal `color-mix(...)` expression.

| File / line | Before (color, %) | After |
|---|---|---|
| `workbench.css:337` | accent 18% | `var(--tint-accent-soft)` |
| `workbench.css:342` | accent 12% | `var(--tint-accent-subtle)` |
| `workbench.css:440` | warning 12% | `var(--tint-warning-soft)` ⚠ |
| `workbench.css:928` | info 15% | `var(--tint-info-subtle)` |
| `workbench.css:929` | info 40% | `var(--tint-info-strong)` |
| `workbench.css:935` | info 35% | `var(--tint-info-medium)` |
| `workbench.css:936` | info 80% | `var(--tint-info-bold)` |
| `workbench.css:939` | info 30% | `var(--tint-info-medium)` ⚠ |
| `workbench.css:943` | success 15% | `var(--tint-success-subtle)` |
| `workbench.css:944` | success 40% | `var(--tint-success-strong)` |
| `workbench.css:950` | success 25% | `var(--tint-success-soft)` ⚠ |
| `workbench.css:951` | success 70% | `var(--tint-success-bold)` |
| `workbench.css:955` | success 25% | `var(--tint-success-soft)` ⚠ |
| `workbench.css:956` | success 70% | `var(--tint-success-bold)` |
| `workbench.css:957` | success 30% | `var(--tint-success-medium)` |
| `setup.css:465` | accent 70% | `var(--tint-accent-strong)` ⚠ |
| `setup.css:628` | warning 8% | `var(--tint-warning-subtle)` ⚠ |
| `setup.css:637` | warning 14% | `var(--tint-warning-soft)` |
| `WorkspaceTileGrid.css:33` | accent 55% | `var(--tint-accent-strong)` |
| `WorkspaceTileGrid.css:117` | success 18% | `var(--tint-success-soft)` ⚠ |
| `WorkspaceTileGrid.css:118` | success 38% | `var(--tint-success-strong)` ⚠ |

⚠ = scale value differs from the original by ≤5 percentage points. Confirm
visually in dogfood; if a regression is noticeable on any palette, add an
extra scale step rather than skipping the migration.

## Shadow rewrites (raw `rgba(0,0,0,*)` shadows only)

| File / line | Before | After |
|---|---|---|
| `workbench.css:796` | `box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);` | `box-shadow: var(--shadow-overlay);` |
| `setup.css:552` | `0 6px 24px rgba(0, 0, 0, 0.4);` (one layer of a multi-shadow stack) | `var(--shadow-card)` (preserve the other layers in the stack as-is) |
| `WorkspaceTileGrid.css:27` | `box-shadow: 0 8px 32px rgba(0, 0, 0, 0.38);` | `box-shadow: var(--shadow-overlay);` |

Do NOT rewrite these (scrim backgrounds, not box-shadows — deferred to
PR-2):

- `workbench.css:782` (`background: rgba(0,0,0,0.45);`)
- `setup.css:887` (`background: rgba(0,0,0,0.55);`)
- `setup.css:1037` (`background: rgba(0,0,0,0.55);`)

## Constraints

- Do not modify any percentage that lives inside
  `calc(... * var(--glow-mul))`.
- Do not touch surface-blend, white-highlight, or `fg-primary` tint forms.
- Multi-shadow stacks (e.g. `setup.css:551-553`): preserve every other
  layer; only rewrite the targeted `rgba(0,0,0,*)` shadow into the
  matching `var()`.
- Do not introduce new token names beyond the list above.
- Do not reorder or rename existing tokens.
- Do not add new selectors. Do not move any selector between files.

## Success criteria

- `pnpm --filter ru-soam-app compile` clean.
- `pnpm --filter @ru-soam/editor compile` clean.
- `pnpm --filter ru-soam-app lint` clean.
- `just dev-desktop` boots; visually compare against `main` on all three
  palettes (bamboo / stone / geist) and both font-sets:
  - Workspace picker tile hover + MRU border + recent pill.
  - Setup wizard progress rail (animated glow is out of scope here, but
    adjacent borders that use accent tints should look unchanged).
  - Snippet picklist halo (workbench.css:928–957).
  - StatusBar warning entry (workbench.css:440).
- The following greps return **zero** matches inside the scope files:
  - `box-shadow:.*rgba\(0, ?0, ?0` (in scope files only).
  - `color-mix\(in oklch, var\(--color-(accent|info|success|warning|error)\) [0-9]+%, transparent\)`
    in scope files **outside** `calc(...)` expressions.
- Scrim `rgba(0,0,0,*)` backgrounds and animated `calc(...)` color-mix
  forms remain — these are deferred deliberately.

## Watch out for

- `workbench.css:337` and `:342` sit inside a `repeating-linear-gradient(...)`.
  Preserve the gradient stop syntax: replace only the `color-mix(...)`
  expression, keep the trailing `0 1px,` and the surrounding stops intact.
- `setup.css:465` sits inside a stacked `box-shadow:` value (multiple
  layers separated by commas). Preserve every other layer, including the
  inset white-highlight (which is out of scope).
- `WorkspaceTileGrid.css:33` is a single-line rule
  (`.wtg-tile--mru { border-color: ...; }`). Keep the formatting compact;
  do not reflow the block.
- After editing `tokens.css`, run `just dev-desktop` once before sweeping
  the consumer files to confirm Tailwind picks up the new `@theme`
  declarations without warnings.
