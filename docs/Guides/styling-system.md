# Styling system

Single source of truth for type, spacing, color, and component CSS in
ru-soam. Distilled from the PR-1 through PR-7c consolidation arc
(19 May 2026 audit; see `docs/PRs/PR-styling-*.md` for the
per-PR record).

The short version of every rule is restated in `CLAUDE.md` →
"Conventions" → "Styling system". This guide is the long form: what the
layers are, which token goes where, why a rule exists, and how to add a
new value without breaking the system.

---

## Philosophy

Tailwind v4 owns design tokens. CSS recipe files own composite
shapes. JSX owns structure and state via utilities. Each layer has a job
and the layers do not blend.

Three properties hold across the system:

1. **Scales are closed.** Type has 6 steps; spacing is a fixed
   multiplier; tints have 5 calibrated steps; shadows are 4 named
   roles. Bespoke values are not allowed in components.
2. **rem everywhere.** Every size and gap in tokens is rem-based.
   `:root { font-size: var(--root-font-size, 16px); }` lets a future
   settings UI rescale the entire system at runtime (O165).
3. **Tokens generate utilities.** Every token under `--color-*`,
   `--text-*`, `--spacing`, `--radius-*`, `--shadow-*`, `--font-*` is
   auto-promoted by Tailwind v4 into a utility class. Components consume
   utilities, not raw `var()`.

---

## Layer order

Pick the highest layer that fits the change. Going lower is allowed
only when the higher layers cannot express the value.

| Order | Layer | When to use |
|---|---|---|
| 1 | Tailwind utilities in JSX | Structure, layout, spacing, one-off variants. `flex gap-2 items-center text-fg-muted`. |
| 2 | Semantic type recipes (`styles/type.css`) | Typography role. `.t-h1` / `.t-body` / `.t-caption`. Do not redeclare `font-family + font-size + color` inline. |
| 3 | Component CSS (`MyComponent.css`, colocated) | Multi-property composites that recur. Authored via `@apply`. |
| 4 | Design tokens (`styles/tokens.css`) | The values themselves. Never hardcode in components. Add a token first if a value recurs. |

`workbench.css` and `setup.css` are legacy. Do not add new selectors to
them — new component styles colocate next to the component
(`MyComponent.tsx` + `MyComponent.css`).

---

## Tokens

Tokens live in `apps/desktop/src/styles/tokens.css`. The file has two
parts:

- **`@theme {}` block** — Tailwind v4 promotes every declaration in this
  block to a utility class. `--color-X` → `bg-X` / `text-X` /
  `border-X`. `--text-X` → `text-X`. `--spacing` → `p-N` / `m-N` /
  `gap-N`. `--radius-X` → `rounded-X`. `--shadow-X` → `shadow-X`.
- **`:root { font-size: var(--root-font-size, 16px); }`** — separate
  block. Drives every rem-based token at runtime.

Theme files (`themes/*.css`, `font-sets/*.css`) override `--color-*`
palette tokens per palette × luminance × font-set axis (ADR-413). They
never define structural tokens.

### Color namespace

Every color-bearing token lives under `--color-*` so Tailwind
auto-generates the utility. Bespoke prefixes (`--tint-*`,
`--scrim-*`, `--highlight-*`, `--surface-*`, `--border-{hover,subtle,...}`)
no longer exist as of PR-7c.

| Family | Token shape | Utility shape | Used for |
|---|---|---|---|
| Foreground | `--color-fg-{primary,secondary,muted}` | `text-fg-*` | Default + tier-2 + tier-3 body color. |
| Surface | `--color-surface-{base,panel,elevated,active}` | `bg-surface-*` | The 4 standard surfaces from low to high. |
| Surface (composed) | `--color-surface-{input,input-focus,sunken-soft,sunken-medium,recessed}` | `bg-surface-*` | Form inputs and recessed cells. Opaque blends of panel × base. |
| Semantic | `--color-{accent,info,success,warning,error}` | `text-* / bg-* / border-*` | Brand + status hues. |
| Tints | `--color-tint-{color}-{subtle,soft,medium,strong,bold}` | `bg-tint-*` | N% of a semantic color over transparent. |
| Neutral tints | `--color-tint-neutral-{subtle,soft,medium}` | `bg-tint-neutral-*` | N% of fg-primary over transparent. Ambient ghost surfaces. |
| Scrim | `--color-scrim-{overlay,modal}` | `bg-scrim-*` | Opaque-black overlay (45%) and modal (55%) backdrops. |
| Edge highlight | `--color-highlight-edge{,-hover}` | `bg-highlight-*` (and raw `var()` in `box-shadow:` stacks) | 1px white gloss on accent surfaces. |
| Tinted borders | `--color-border-{hover,subtle,warning-soft,warning-strong}` | `border-border-*` | Hover + warning + faded border variants. Note the verbose `border-border-*` utility prefix. |
| Base border | `--color-border` | `border-border` | The default border color. Stays — was never renamed. |

### Tint scale calibration

Tints are 5-step: `subtle → soft → medium → strong → bold`. **The %
value differs per color** — strong on `--color-accent` is 55%, strong
on `--color-info` is 40%, strong on `--color-warning` is 60%. Each step
expresses perceptual weight ("how loud is this tint"), so the % is
calibrated against the hue, not pinned to a fixed value across the
palette.

When introducing a new step, calibrate visually against the existing
steps for that color. Do not copy the % from another color's step.

### Type scale (6 steps, closed)

Defined inside `@theme {}` with Tailwind v4 modifier syntax — each step
declares `--text-{step}`, optionally `--text-{step}--line-height`, and
for the larger steps `--text-{step}--letter-spacing`. The baked LH/LS
take over when the utility is used.

| Step | Size | LH | LS | Role |
|---|---|---|---|---|
| `text-xs` | 0.75rem (12) | 1.4 | — | Captions, labels, badges, mono. |
| `text-sm` | 0.8125rem (13) | 1.55 | — | Body default. |
| `text-base` | 1rem (16) | 1.5 | — | Larger body / dense headings. |
| `text-lg` | 1.25rem (20) | 1.4 | −0.005em | `.t-h3`. |
| `text-xl` | 1.5rem (24) | 1.3 | −0.012em | `.t-h2`. |
| `text-2xl` | 2rem (32) | 1.15 | −0.025em | `.t-h1` / display. |

`--text-*: initial;` immediately precedes the steps to disable
Tailwind's default text scale — `text-3xl` and larger are no-ops. The
six steps are the only sizes.

When a design needs a size between two steps, round per:
**aesthetic fit first, logical proximity second, default down on ties.**
(See PR-7b for the full rounding table for px-to-step migration.)

### Spacing scale

`--spacing: 0.25rem;` drives Tailwind's `p-N` / `m-N` / `gap-N`
utilities. `N × 0.25rem`. Fractional multipliers (`.5`) supported but
used sparingly — default to whole multipliers per the "fixed scale,
default down" rule.

The old `--space-N` px tokens were deleted in PR-7b. Do not reintroduce
them.

### Radius

`--radius-sm: 0.25rem;` and `--radius-md: 0.5rem;` live in `@theme {}`.
Use `rounded-sm` / `rounded-md`. Other radii are not on the scale; if
you need one, add a token first.

### Shadows

| Token | Utility | Role |
|---|---|---|
| `--shadow-rest` | `shadow-rest` | Default elevation on cards/buttons. |
| `--shadow-card` | `shadow-card` | Card surface lift. |
| `--shadow-overlay` | `shadow-overlay` | Floating menu / command palette. |
| `--shadow-modal` | `shadow-modal` | Dialogs. |

Raw `box-shadow: ... rgba(0,0,0,*)` is forbidden in components.

### Font sets

`--font-{sans,mono,display}` resolve per active font-set (ADR-413).
Body inherits `--font-sans` from `.workbench` / `.setup-page` —
component rules do not need to redeclare it. Override only for `mono`
or `display` via `@apply font-mono` / `@apply font-display`.

---

## Type recipes

`styles/type.css` is the single source of truth for typography roles.
Recipes compose Tailwind utilities via `@apply`. Components use them
directly and override per-variant where design demands (e.g. a button
that uses `.t-body-strong` but needs tighter line-height).

| Recipe | Role |
|---|---|
| `.t-h1` | Hero / display — wordmark, splash, page-defining headlines. |
| `.t-h2` | Section titles — modal titles, route titles, banner titles. |
| `.t-h3` | Sub-section / group titles inside a card or panel. |
| `.t-body` | Default block of UI text. |
| `.t-body-strong` | Body with medium weight. |
| `.t-description` | Body-tier explanatory copy under a heading (fg-secondary). |
| `.t-caption` | Small uppercase/lowercase metadata, labels, badges. |
| `.t-mono` | Monospaced numeric / code data. |
| `.t-mono-inline` | Short inline code/key tokens inside body paragraphs. |

`<h1>`–`<h6>` are reset in `index.css` (font/weight/line-height/margin
all `inherit`/`0`). Every heading in JSX must carry a recipe class or
utility composition — bare `<h1>` renders at body size. ProseMirror
documents are the one exception: `.ru-edit-host .ProseMirror hN`
selectors style headings inside the editor.

---

## Component CSS authoring

### Location

Component CSS colocates next to its component:
`MyComponent.tsx` + `MyComponent.css`, imported by the component
module. `workbench.css` and `setup.css` are legacy; do not extend
them.

### Reference target

Every component CSS file that uses `@apply` must declare:

```css
@reference "./theme.css";
```

(Adjust the relative path.) `theme.css` imports `tailwindcss` +
`tokens.css` and nothing else.

**Do not `@reference "index.css"`** — `index.css` imports component CSS
back, the recursion OOMs the Tailwind v4 plugin (observed 2026-05-19;
~2GB heap before crash). `theme.css` exists specifically to break that
cycle.

### `@apply` policy

Component rules compose from Tailwind utilities via `@apply`, not raw
CSS properties. Only **shape** is allowed as token-backed `var(...)`:
`border`, `border-radius`, `padding`, `background`, `box-shadow`,
`transition`. Type and spacing must route through the utility layer.

A rule that ends up entirely composed of `@apply` is a recipe. A rule
that ends up with only shape primitives is fine. A rule that ends up
empty after the sweep is deleted.

```css
/* good */
.my-button {
  @apply text-sm font-medium text-fg-primary bg-surface-elevated rounded-sm px-3 py-2;
  border: 1px solid var(--color-border);
  transition: background 120ms ease;
}

/* bad — raw type/spacing */
.my-button {
  font-family: var(--font-sans);
  font-size: 13px;
  padding: 8px 12px;
  background: var(--color-surface-elevated);
}
```

### What stays as raw `var(...)`

Not every token has a utility. Keep these raw when they sit inside
composite expressions (`box-shadow:` stacks, `calc()`, gradient stops)
where `@apply` cannot reach:

- Tints inside multi-layer `box-shadow` stacks — `inset 0 1px 0 var(--color-highlight-edge), ...`.
- `calc(... * var(--glow-mul))` for animated glows — untouched by every PR.
- `repeating-linear-gradient(...)` stops.

Standalone declarations (`background: var(...)`, `color: var(...)`,
`border-color: var(...)`) always go via `@apply`.

### Naming — BEM-strict

- `block` — `.statusbar-entry`.
- `block__element` — `.statusbar-entry__label`.
- `block--modifier` — `.statusbar-entry--ok`.

State modifiers use the doubled-class form
(`.block.block--modifier`) when a competing `:hover` rule with the
same specificity would otherwise win the cascade race:

```css
.statusbar-entry:hover { /* (0,2,0) */ }
.statusbar-entry.statusbar-entry--ok { /* (0,2,0), source-order wins */ }
```

The naive `.block--modifier` form is fine when no competing same-
specificity rule exists. PR-6 documents the 14 sites and which flavour
each uses.

`is-*` prefixes are forbidden for component-local state — they were
removed in PR-6. Global state (e.g. `is-open` on a portal root,
managed outside the component) may use the `is-*` form, but prefer
modifiers when state is component-local.

---

## JSX and inline `style={{}}`

Inline `style={{}}` is reserved for **runtime values the styling
system cannot know**:

- Computed flex ratios (`{ flex: node.ratio }`).
- Per-instance avatar backgrounds.
- Animation progress driven by JS (strength meter bar color/width).

Everything else — gap, margin, display, opacity, theme-able colors,
known layout primitives — goes through Tailwind utilities in
`className`. PR-5 documents the 7 runtime sites that are allowed to
remain.

```tsx
/* good — runtime values only */
<div style={{ flex: node.ratio }} />
<div className="flex flex-col gap-3" />

/* bad — theme-able values inline */
<div style={{ display: 'flex', gap: 'var(--space-3)' }} />
```

---

## Adding a new token

1. Identify the family (color, type, spacing, radius, shadow). Confirm
   the existing scale cannot express the value.
2. Add the declaration inside `@theme {}` in `tokens.css`. Use the
   canonical namespace prefix — `--color-*` for any color-bearing
   value, `--text-*` for type, etc. If you need a tint, calibrate the
   % visually against existing steps for that hue.
3. Verify the utility resolves: `bg-{name}` / `text-{name}` /
   `border-{name}` should auto-generate. If not, the namespace is
   wrong — Tailwind only promotes tokens under the recognised prefixes.
4. Use the utility in components via `@apply` or in JSX. Never access
   the new token as raw `var(--name)` unless it sits inside a
   composite expression.
5. If the token represents a new design concept (not just a missing
   step on an existing scale), update this guide and `CLAUDE.md`.
   Architectural changes to the styling system require an ADR.

---

## Adding a new component CSS file

1. Colocate: `apps/desktop/src/path/to/MyComponent.tsx` +
   `MyComponent.css`.
2. Import the CSS from the component module.
3. Declare `@reference "./theme.css";` (adjust relative path).
4. Compose all type, spacing, and color via `@apply`. Use raw
   `var(--color-*)` only inside `box-shadow` stacks or other
   composites.
5. Name selectors BEM-strict. Use the doubled-class form for state
   modifiers if a competing `:hover` exists.
6. Do not add the selector to `workbench.css` or `setup.css`. Those
   files are frozen.

---

## Review checklist (anti-patterns)

Reject in review:

- New entries in `workbench.css` or `setup.css`.
- `style={{ display: 'flex', gap: ... }}` — use utilities.
- `color-mix(... N%, transparent)` outside `tokens.css`.
- `font-family: var(--font-sans); font-size: 13px;` — use `.t-body`.
- New `*.css` file that is not colocated with a component.
- `font-size: Npx` or `line-height: <number>` in component CSS —
  use `@apply text-{xs|sm|base|lg|xl|2xl}`.
- `padding: Npx` / `margin: Npx` / `gap: Npx` literal in component
  CSS — use `@apply` with Tailwind spacing utilities.
- `<h1>`–`<h6>` without a recipe class (and not inside a ProseMirror
  document). Defaults are reset; the element will render at body size.
- `var(--space-N)` reference — token was deleted in PR-7b.
- `var(--tint-*)` / `var(--scrim-*)` / `var(--highlight-*)` /
  `var(--border-{hover,subtle,warning-*})` / `var(--surface-{input,sunken-*,recessed})`
  reference — these were renamed to `--color-*` in PR-7c. Use the
  utility instead.
- `.is-{state}` selector for component-local state — use the BEM
  modifier form.
- `@reference "../index.css"` or any path that eventually re-imports
  the component CSS — use `@reference "./theme.css"`. Recursion OOMs
  the Tailwind v4 plugin.
- Raw `rgba(0,0,0,*)` shadow — use a `--shadow-*` token via
  `@apply shadow-*`.
- Hardcoded hex / `oklch(...)` / `rgba(...)` color literal outside
  `tokens.css` and theme/font-set files. Brand-mandated colors (e.g.
  the Google sign-in pill) are the one exception and live in a
  clearly-named isolated module.

---

## Migration history

The system reached its current shape across nine PRs landed 19 May 2026:

| PR | Scope |
|---|---|
| PR-1 | Semantic tint tokens (`--tint-*`) + shadow sweep. |
| PR-2 | Scrim, edge-highlight, neutral-tint tokens. |
| PR-3 | Tinted-border tokens + accent surface-blend cleanup. |
| PR-4 | Surface-over-surface mixes (input + sunken + recessed). |
| PR-5 | Inline `style={{}}` triage; 14 of 21 sites migrated. |
| PR-6 | BEM-strict naming codemod; `is-*` → `--modifier` with doubled-class form where specificity demands. |
| PR-7a | Type scale + rem foundation + `--text-*: initial;` closes the scale + `<hN>` reset. |
| PR-7b | Type + spacing sweep via `@apply`; `--space-N` deleted; `type.css` rewritten. |
| PR-7c | Token namespace migration to `--color-*`; consumers swept to utilities. |

Cumulative end state: zero static color literals outside `tokens.css`;
zero `style={{}}` for non-runtime values; zero bespoke
`font-size`/`padding`/`margin`/`gap` in component CSS; the recipe layer
is the single source of truth for type; BEM-strict naming;
`@apply` composition for every shape declaration; runtime root
font-size foundation for the future settings rescale (O165).

Architectural changes to the styling system require an ADR.
