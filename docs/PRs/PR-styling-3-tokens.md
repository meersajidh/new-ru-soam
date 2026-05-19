# PR-3 — Styling consolidation: tinted-border tokens + accent surface-blend cleanup

Part of the multi-PR effort to consolidate the styling layer documented in
the 19 May 2026 audit. See `CLAUDE.md` → "Styling system" for the target
conventions. Builds on PR-1 (semantic tint tokens + shadows) and PR-2
(scrim + edge-highlight + neutral tints).

## Goal

Continue the token sweep by:

1. Introducing a **tinted-border** token family for the `color-mix(...,
   var(--color-border))` and `color-mix(... border N%, transparent)` shapes
   (4 new tokens).
2. Eliminating the two remaining **accent-over-surface** literals by
   reusing the existing `--tint-accent-subtle` token (small +2pp delta,
   within tolerance).

No new visual rewrites; pure token-refactor.

## Scope

Files in scope:

- `apps/desktop/src/styles/tokens.css` — add 4 new tokens.
- `apps/desktop/src/styles/setup.css` — sweep (7 sites).

No `workbench.css` or `WorkspaceTileGrid.css` changes — all remaining
surface-blend sites live in `setup.css`.

Out of scope (deferred):

- **Surface-over-surface mixes** (5 sites: `setup.css:350, 379, 668, 678,
  755`) — shape `color-mix(... var(--color-surface-X) N%, var(--color-surface-Y))`
  and `color-mix(... var(--color-surface-X) N%, transparent)`. Each is a
  subtle luminance adjustment; the right consolidation is unclear (token
  vs direct surface color vs delete the mix). Deferred to PR-4.
- Inline `style={{}}` triage in `.tsx` files — deferred to PR-5.
- BEM-strict naming codemod — deferred to PR-5.
- Type recipe (`.t-*`) adoption — deferred to PR-6.
- CSS file relocation and recipe layer — deferred to PR-7.

## Token additions

Append the following block to the `@theme {}` block in
`apps/desktop/src/styles/tokens.css`, after the existing `--tint-neutral-*`
block:

```css
/* Tinted borders — color-tinted variants of --color-border.
   `--border-hover` is the standard hover-state border (uses fg-muted as
   the tint source, not a semantic color, since hover affordance is
   neutral). Warning variants tint the border with the semantic warning
   color for severity-marked surfaces. */
--border-hover:           color-mix(in oklch, var(--color-fg-muted) 50%, var(--color-border));
--border-warning-soft:    color-mix(in oklch, var(--color-warning)  40%, var(--color-border));
--border-warning-strong:  color-mix(in oklch, var(--color-warning)  60%, var(--color-border));

/* Subtle border — alpha-faded variant of --color-border, used for
   secondary structural lines (e.g. inner grid cells) where the full
   border weight would be too loud. */
--border-subtle: color-mix(in oklch, var(--color-border) 60%, transparent);
```

## Rewrites

Lines refer to the file state on `main` at the time of the audit. Verify
each match before editing — if the line number has shifted, locate by the
literal expression.

### Tinted borders — 5 sites

| File / line | Before | After |
|---|---|---|
| `setup.css:370` | `color-mix(in oklch, var(--color-fg-muted) 50%, var(--color-border))` | `var(--border-hover)` |
| `setup.css:760` | `color-mix(in oklch, var(--color-fg-muted) 50%, var(--color-border))` | `var(--border-hover)` |
| `setup.css:623` | `color-mix(in oklch, var(--color-warning) 60%, var(--color-border))` | `var(--border-warning-strong)` |
| `setup.css:638` | `color-mix(in oklch, var(--color-warning) 40%, var(--color-border))` | `var(--border-warning-soft)` |
| `setup.css:680` | `color-mix(in oklch, var(--color-border) 60%, transparent)` | `var(--border-subtle)` |

All exact-% match. Zero visual delta.

### Accent surface-blend — 2 sites (small +2pp delta)

| File / line | Before | After |
|---|---|---|
| `setup.css:77` | `color-mix(in oklch, var(--color-accent) 8%, var(--color-surface-panel))` | `var(--tint-accent-subtle)` |
| `setup.css:269` | `color-mix(in oklch, var(--color-accent) 8%, var(--color-surface-base))` | `var(--tint-accent-subtle)` |

⚠ These two sites change shape: from opaque `color-mix(... 8%, surface-X)`
to translucent `color-mix(... 10%, transparent)` (the existing
`--tint-accent-subtle` token). The translucent form composites against
whatever surface the element sits on, producing a visually-similar but
not identical result. Net effect: each site renders ~2pp more
accent-saturated than before.

The two affected surfaces:
- `setup.css:77` — `.setup-help-btn` hover background (top-right help
  button in the setup wizard).
- `setup.css:269` — `.step-node.is-active` background (the current step
  ring in the progress rail).

Both are within the ≤5pp tolerance documented in the consolidation plan.
Confirm visually in dogfood; if either looks too saturated, the
mitigation is to add a new `--tint-accent-faint: ... 8%, transparent`
token rather than tightening `--tint-accent-subtle`.

## Constraints

- Do not introduce token names beyond the four listed above.
- Do not reorder or rename existing tokens.
- Do not touch surface-over-surface mixes (the
  `color-mix(... var(--color-surface-X) N%, ...)` shape — 5 sites). They
  are explicitly deferred to PR-4.
- Do not add new selectors. Do not move any selector between files.
- Do not touch any `.tsx` file in this PR.

## Success criteria

- `pnpm --filter ru-soam-app compile` clean.
- `pnpm --filter @ru-soam/editor compile` clean.
- `pnpm --filter ru-soam-app lint` clean.
- The following greps return **zero** matches inside `setup.css`:
  - `color-mix\(in oklch, var\(--color-(fg-muted|warning)\) [0-9]+%, var\(--color-border\)\)`
    (confirms tinted-border sweep complete).
  - `color-mix\(in oklch, var\(--color-border\) [0-9]+%, transparent\)`
    (confirms border-subtle sweep complete).
  - `color-mix\(in oklch, var\(--color-accent\) [0-9]+%, var\(--color-surface-(panel|base)\)\)`
    (confirms accent-surface-blend sweep complete).
- Surface-over-surface mixes remain — those are the deferred shape.

## Watch out for

- `setup.css:760` may sit in a `:focus` or `:focus-visible` rule —
  verify before substituting that the token name `--border-hover`
  still reads correctly in context. If it's clearly a focus border (not
  hover), surface as a finding and propose a `--border-focus-subtle` or
  similar follow-up instead of mapping to `--border-hover`.
- `setup.css:269` is the active-step node — the most visually prominent
  use of the accent-tinted surface. Spot-check this one carefully when
  reviewing the diff.

## Reporting

When done, report:
1. Confirmation that the three success-criteria greps return zero matches.
2. Result of compile + lint commands.
3. Any sites where line numbers had drifted and how you located them.
4. Whether `setup.css:760` was a hover or focus border (informs whether
   the `--border-hover` token name is appropriate).
5. Anything skipped and why.
