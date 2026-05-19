# PR-7c — Styling consolidation: token namespace migration

Final PR of the styling consolidation (for now). Migrates the
tint / scrim / edge-highlight / tinted-border / surface-input / surface-sunken
tokens from their bespoke namespaces (`--tint-*`, `--scrim-*`, etc.) into
the canonical `--color-*` namespace so Tailwind v4 auto-generates
utilities for each of them. Then sweeps every remaining raw `var(--tint-*)`
/ `var(--scrim-*)` / `var(--border-*)` / `var(--surface-*)` access in
component CSS to `@apply <utility>` composition.

After PR-7c, **no raw `var(--token)` access in `@apply`-eligible
declarations** anywhere in component CSS. Every color-bearing property
flows through a utility.

## Token renames (37)

Rename in `apps/desktop/src/styles/tokens.css`. Every consumer
reference (`var(--old-name)`) must be updated to `var(--new-name)` —
but in this PR most consumers will be replaced with `@apply <utility>`
instead, so the `var(--new-name)` form mainly survives for sites that
sit inside `calc()`, `box-shadow:` multi-layers, etc., where `@apply`
isn't expressible.

### Tints (`--tint-*` → `--color-tint-*`)

| Old | New |
|---|---|
| `--tint-accent-subtle` | `--color-tint-accent-subtle` |
| `--tint-accent-soft` | `--color-tint-accent-soft` |
| `--tint-accent-medium` | `--color-tint-accent-medium` |
| `--tint-accent-strong` | `--color-tint-accent-strong` |
| `--tint-accent-bold` | `--color-tint-accent-bold` |
| `--tint-info-subtle` | `--color-tint-info-subtle` |
| `--tint-info-medium` | `--color-tint-info-medium` |
| `--tint-info-strong` | `--color-tint-info-strong` |
| `--tint-info-bold` | `--color-tint-info-bold` |
| `--tint-success-subtle` | `--color-tint-success-subtle` |
| `--tint-success-soft` | `--color-tint-success-soft` |
| `--tint-success-medium` | `--color-tint-success-medium` |
| `--tint-success-strong` | `--color-tint-success-strong` |
| `--tint-success-bold` | `--color-tint-success-bold` |
| `--tint-warning-subtle` | `--color-tint-warning-subtle` |
| `--tint-warning-soft` | `--color-tint-warning-soft` |
| `--tint-warning-medium` | `--color-tint-warning-medium` |
| `--tint-warning-strong` | `--color-tint-warning-strong` |
| `--tint-error-subtle` | `--color-tint-error-subtle` |
| `--tint-error-medium` | `--color-tint-error-medium` |
| `--tint-error-strong` | `--color-tint-error-strong` |
| `--tint-neutral-subtle` | `--color-tint-neutral-subtle` |
| `--tint-neutral-soft` | `--color-tint-neutral-soft` |
| `--tint-neutral-medium` | `--color-tint-neutral-medium` |

### Scrim (`--scrim-*` → `--color-scrim-*`)

| Old | New |
|---|---|
| `--scrim-overlay` | `--color-scrim-overlay` |
| `--scrim-modal` | `--color-scrim-modal` |

### Edge highlight (`--highlight-*` → `--color-highlight-*`)

| Old | New |
|---|---|
| `--highlight-edge` | `--color-highlight-edge` |
| `--highlight-edge-hover` | `--color-highlight-edge-hover` |

### Tinted borders (`--border-*` → `--color-border-*`)

| Old | New |
|---|---|
| `--border-hover` | `--color-border-hover` |
| `--border-warning-soft` | `--color-border-warning-soft` |
| `--border-warning-strong` | `--color-border-warning-strong` |
| `--border-subtle` | `--color-border-subtle` |

(Yes, this generates `border-border-{hover|subtle|warning-*}` utility
names — verbose but unambiguous. Accepting that trade-off.)

### Surface variants (`--surface-*` → `--color-surface-*`)

| Old | New |
|---|---|
| `--surface-input` | `--color-surface-input` |
| `--surface-input-focus` | `--color-surface-input-focus` |
| `--surface-sunken-soft` | `--color-surface-sunken-soft` |
| `--surface-sunken-medium` | `--color-surface-sunken-medium` |
| `--surface-recessed` | `--color-surface-recessed` |

## Consumer sweep policy

For each `var(--OLD)` reference in component CSS:

1. **If it sits in a standalone declaration** (`background: var(...)`,
   `border-color: var(...)`, `color: var(...)`), **replace with
   `@apply <utility>`**:

   - `background: var(--tint-accent-subtle);` → `@apply bg-tint-accent-subtle;`
   - `border: 1px solid var(--border-warning-strong);` → `@apply border border-border-warning-strong;` (note: `border` alone sets 1px solid; the second `border-border-warning-strong` sets the color)
   - `border-color: var(--border-hover);` → `@apply border-border-hover;`
   - `background: var(--scrim-modal);` → `@apply bg-scrim-modal;`
   - `background: var(--surface-input);` → `@apply bg-surface-input;`

2. **If it sits inside a `box-shadow:`, `calc()`, gradient stop, or
   multi-layer composite**, the `@apply` form is not expressible —
   **keep raw `var(...)` and update the name** to the new namespace:

   - `box-shadow: 0 0 0 4px var(--tint-warning-subtle), ...` → `box-shadow: 0 0 0 4px var(--color-tint-warning-subtle), ...`
   - `inset 0 1px 0 var(--highlight-edge)` → `inset 0 1px 0 var(--color-highlight-edge)`

3. **Combine** with existing `@apply` directives on the same rule
   when possible. A rule that previously had `@apply text-sm
   text-fg-secondary; background: var(--tint-warning-soft);` becomes
   `@apply text-sm text-fg-secondary bg-tint-warning-soft;` (single
   line).

## Files in scope

- `apps/desktop/src/styles/tokens.css` — token rename (37 changes).
- `apps/desktop/src/styles/workbench.css` — consumer sweep.
- `apps/desktop/src/styles/setup.css` — consumer sweep.
- `apps/desktop/src/workbench/middle/WorkspaceTileGrid.css` — consumer sweep.

Out of scope:
- `theme.css` — already imports `tokens.css`; the new utilities resolve automatically.
- JSX recipe-class application (e.g. replacing `.setup-title` with `.t-h2` in JSX) — deferred to PR-8 cleanup.
- Theme files (`themes/*.css`, `font-sets/*.css`) — these only override `--color-*` palette tokens, not affected.
- Dead-CSS cleanup (the `.ru-snippet-placeholder--picklist.is-open` orphan from PR-6) — deferred to PR-8.

## Constraints

- Verify each consumer site can be expressed as `@apply` before
  rewriting. If the `var()` sits in a `box-shadow:` stack, `calc()`,
  gradient stop, or other composite where `@apply` doesn't reach,
  **keep raw and just rename the token**. Do not break out a separate
  declaration to enable `@apply`.
- Multi-class `@apply` lines stay on one line where length allows
  (~100 char soft cap). Wrap to multiple `@apply` directives only if
  readability demands.
- Do not rename tokens or sweep consumers outside the 37 listed above.
- Animated `calc(... * var(--glow-mul))` expressions are untouched.

## Success criteria

- `pnpm --filter ru-soam-app compile` clean.
- `pnpm --filter @ru-soam/editor compile` clean.
- `pnpm --filter ru-soam-app lint` clean.
- App boots; `just dev-desktop` (already running — Opus will reconnect via agent-browser; do NOT restart) renders workspace picker + setup wizard without HMR overlay errors.
- The four following greps return **zero** matches across `apps/desktop/src` (excluding `tokens.css` definitions):
  - `var\(--tint-[a-z]` (all `--tint-*` consumers now use `--color-tint-*` or `@apply`)
  - `var\(--scrim-[a-z]`
  - `var\(--highlight-edge`
  - `var\(--border-(hover|warning-(soft|strong)|subtle)\)` (the rename only — `var(--color-border)` is the existing base token and STAYS)
  - `var\(--surface-(input|sunken|recessed)`

## Reporting

When done, report:
1. Compile + lint.
2. Five success-criteria grep counts (all expected zero).
3. Total touch count: token renames (37) + consumer rewrites (~45).
4. List of sites where `var()` was kept raw (inside `box-shadow` stack
   etc.) — flag for context.
5. Any rule where the sweep was non-obvious (e.g. `border: 1px solid
   var(--border-warning-strong)` becoming `border border-border-warning-strong`
   was ambiguous and you picked a different form).

Do not run `just dev-desktop` or git.
