# PR-2 — Styling consolidation: scrim, edge-highlight, neutral tint tokens

Part of the multi-PR effort to consolidate the styling layer documented in
the 19 May 2026 audit. See `CLAUDE.md` → "Styling system" for the target
conventions. Builds on PR-1 (semantic tint tokens + shadow sweep).

## Goal

Introduce three more token families and migrate the remaining static
color-mix / rgba literals that PR-1 deliberately left in place:

1. **Scrim tokens** for the modal/overlay backdrop `rgba(0,0,0,*)` sites
   that PR-1 left intact (these are backgrounds, not box-shadows).
2. **Edge-highlight tokens** for the inset/outline `color-mix(... white N%,
   transparent)` glosses on accent surfaces.
3. **Neutral tint tokens** for the `color-mix(... var(--color-fg-primary)
   N%, transparent)` ambient surfaces.

No visual rewrites; pure token-refactor.

## Scope

Files in scope:

- `apps/desktop/src/styles/tokens.css` — add 7 new tokens.
- `apps/desktop/src/styles/workbench.css` — sweep (1 site).
- `apps/desktop/src/styles/setup.css` — sweep (9 sites).

Out of scope (deferred to later styling PRs):

- **Surface-blend mixes** — `color-mix(... N%, var(--color-surface-*))` and
  `color-mix(... N%, var(--color-border))` shaped expressions (8 sites in
  `setup.css`). These need a fresh token design pass (tinted-surface vs
  tinted-border patterns) — deferred to PR-3.
- Inline `style={{}}` triage in `.tsx` files — deferred to PR-3 (JSX surface).
- BEM-strict naming codemod — deferred to PR-3.
- Type recipe (`.t-*`) adoption — deferred to PR-4.
- CSS file relocation and recipe layer — deferred to PR-5.

## Token additions

Append the following block to the `@theme {}` block in
`apps/desktop/src/styles/tokens.css`, after the existing `--tint-*` block:

```css
/* Scrim — opaque-black overlay/modal backdrops.
   Two intensities: overlay (lighter, for transient overlays like the
   command palette) and modal (heavier, for blocking dialogs). */
--scrim-overlay: rgba(0, 0, 0, 0.45);
--scrim-modal:   rgba(0, 0, 0, 0.55);

/* Edge highlights — 1px white gloss applied as inset top edge or
   outline ring on accent surfaces (primary buttons, branded controls).
   `hover` is the intensified variant used on :hover states. */
--highlight-edge:       color-mix(in oklch, white 30%, transparent);
--highlight-edge-hover: color-mix(in oklch, white 35%, transparent);

/* Neutral tints — N% of fg-primary over transparent.
   Subtle ambient surfaces (ghost-button bg, progress rail base, etc.)
   that have no semantic color attached. Scale is intentionally short —
   neutral surfaces should stay quiet. */
--tint-neutral-subtle: color-mix(in oklch, var(--color-fg-primary)  4%, transparent);
--tint-neutral-soft:   color-mix(in oklch, var(--color-fg-primary) 10%, transparent);
--tint-neutral-medium: color-mix(in oklch, var(--color-fg-primary) 12%, transparent);
```

## Rewrites

Lines refer to the file state on `main` at the time of the audit. Verify
each match before editing — if the line number has shifted, locate by the
literal expression.

### Scrim — 3 sites

| File / line | Before | After |
|---|---|---|
| `workbench.css:782` | `background: rgba(0, 0, 0, 0.45);` | `background: var(--scrim-overlay);` |
| `setup.css:887` | `background: rgba(0, 0, 0, 0.55);` | `background: var(--scrim-modal);` |
| `setup.css:1037` | `background: rgba(0, 0, 0, 0.55);` | `background: var(--scrim-modal);` |

### Edge-highlight — 3 sites

| File / line | Before | After |
|---|---|---|
| `setup.css:468` | `inset 0 1px 0 color-mix(in oklch, white 30%, transparent);` (one layer of `.setup-btn-primary` rest box-shadow stack) | `inset 0 1px 0 var(--highlight-edge);` |
| `setup.css:477` | `inset 0 1px 0 color-mix(in oklch, white 35%, transparent);` (one layer of `.setup-btn-primary:hover` box-shadow stack) | `inset 0 1px 0 var(--highlight-edge-hover);` |
| `setup.css:551` | `0 0 0 1px color-mix(in oklch, white 30%, transparent),` (one layer of `.btn-google` box-shadow stack) | `0 0 0 1px var(--highlight-edge),` |

### Neutral tint — 4 sites (all in `setup.css`)

| File / line | Before (%) | After |
|---|---|---|
| `setup.css:187` | `--color-fg-primary` 12% | `var(--tint-neutral-medium)` |
| `setup.css:513` | `--color-fg-primary` 4% | `var(--tint-neutral-subtle)` |
| `setup.css:591` | `--color-fg-primary` 10% | `var(--tint-neutral-soft)` |
| `setup.css:732` | `--color-fg-primary` 4% | `var(--tint-neutral-subtle)` |

Each value maps to its scale step exactly — zero perceptual delta on any
site in this PR.

## Constraints

- Do not introduce token names beyond the seven listed above.
- Do not reorder or rename existing tokens.
- Multi-shadow stacks (`setup.css:464–469`, `473–478`, `549–553`): preserve
  every other layer in the stack as-is. Only rewrite the targeted layer.
- Do not touch surface-blend mixes (the
  `color-mix(... N%, var(--color-surface-*))` and
  `color-mix(... N%, var(--color-border))` shapes). They are explicitly
  deferred to PR-3.
- Do not add new selectors. Do not move any selector between files.
- Do not touch any `.tsx` file in this PR.

## Success criteria

- `pnpm --filter ru-soam-app compile` clean.
- `pnpm --filter @ru-soam/editor compile` clean.
- `pnpm --filter ru-soam-app lint` clean.
- The following greps return **zero** matches inside scope files:
  - `rgba\(0, ?0, ?0,` (in scope files only — confirms scrim sweep
    complete).
  - `color-mix\(in oklch, white` in scope files (confirms edge-highlight
    sweep complete).
  - `color-mix\(in oklch, var\(--color-fg-primary\)` in scope files
    (confirms neutral-tint sweep complete).
- Surface-blend mixes remain — those are the deferred shape and should
  still be present.

## Watch out for

- `setup.css:887` and `1037` look like duplicate selectors at the file
  level — verify both are intact modal scrims (likely `.unlock-gate-overlay`
  and a sibling) before rewriting. If they are the *same* selector
  redeclared, surface that as a finding rather than silently sweeping both
  to the same token.
- `setup.css:551` substitution sits inside a stacked `box-shadow:` value
  for `.btn-google` (multiple layers separated by commas). Preserve every
  other layer, including any token references introduced by PR-1.
- The neutral-tint values (4%, 10%, 12%) are intentionally non-uniform on
  the scale; do not round to a "nicer" number.

## Reporting

When done, report:
1. Confirmation that the three success-criteria greps return zero matches
   inside scope files.
2. Result of compile + lint commands.
3. Any sites where line numbers had drifted and how you located them.
4. Whether `setup.css:887` and `1037` are the same selector or distinct
   surfaces.
5. Anything you decided to skip and why.
