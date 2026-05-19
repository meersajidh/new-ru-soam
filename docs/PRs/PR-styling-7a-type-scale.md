# PR-7a — Styling consolidation: type scale + rem foundation

First of three PRs that establish a single source of truth for type and
spacing. PR-7a adds the foundation — new tokens, h1-h6 reset, root
font-size declaration — without touching any existing consumer. Visual
impact is intentionally **zero** (or near-zero); the wins come in PR-7b
(sweep CSS) and PR-7c (sweep JSX).

## Goal

Land the new design-system primitives so PR-7b can route component CSS
through them:

1. **Type scale** — 6 steps in rem, with line-height and letter-spacing
   baked into the `--text-*` tokens (Tailwind v4 modifier syntax).
   Tailwind's default text tokens are explicitly disabled so the scale
   is closed.
2. **Spacing token** — Tailwind v4's `--spacing` (singular, 0.25rem),
   used by Tailwind to generate `p-N`, `m-N`, `gap-N` etc. utilities
   automatically.
3. **Root font-size declaration** — `:root { font-size: var(--root-font-size, 16px); }`
   so a future settings UI can rescale the entire system at runtime.
4. **Heading element reset** — `h1`–`h6` lose browser-default size, weight,
   line-height, margin. From this point on, every heading needs a recipe
   class (or utility composition) to be styled — verified safe because
   every current `<h1>` / `<h2>` in JSX already has a `className`.

PR-7a is intentionally CSS-only. No `.t-*` recipe rewrite, no consumer
sweep, no JSX change.

## Scope

- `apps/desktop/src/styles/tokens.css` — add the 6 `--text-*` tokens and
  the `--spacing` token inside `@theme`. Add `:root { font-size: ... }`
  below `@theme`.
- `apps/desktop/src/index.css` — add the h1–h6 reset.
- `apps/desktop/CLAUDE.md` — extend the "Styling system" section.
- `docs/Open_Items.md` — add **O165** for the future root-font-size
  prefs capability.

Out of scope (PR-7b):
- Rewriting `type.css` with `@apply` and the new naming
  (`.t-display` → `.t-h1`, `.t-title` → `.t-h2`, etc.).
- Sweeping `workbench.css` / `setup.css` / `WorkspaceTileGrid.css` /
  `packages/editor` styles to use `@apply` with the new scale.
- Renaming `--space-N` → Tailwind utility usage at consumer sites
  (43 references survive untouched in this PR).

Out of scope (PR-7c):
- JSX recipe-class application.

## Token additions — `tokens.css`

Append inside the existing `@theme {}` block (after the surface tokens
introduced in PR-4 and before the closing brace):

```css
/* Disable Tailwind's default text scale so only the project's 6 steps
   resolve. Any `text-3xl` etc. references become a no-op — flag in review. */
--text-*: initial;

/* Type scale — 6 steps, rem-based. Line-height and letter-spacing baked
   into each step via Tailwind v4 modifier-token syntax. Steps:
       xs / sm / base / lg / xl / 2xl
   The project's body default is `text-sm` (13px), not `text-base` (16px),
   because the app is dense-information UI. */
--text-xs:   0.75rem;                   /* 12px @ root 16 */
--text-xs--line-height: 1.4;

--text-sm:   0.8125rem;                 /* 13px — body default */
--text-sm--line-height: 1.55;

--text-base: 1rem;                      /* 16px */
--text-base--line-height: 1.5;

--text-lg:   1.25rem;                   /* 20px */
--text-lg--line-height: 1.4;
--text-lg--letter-spacing: -0.005em;

--text-xl:   1.5rem;                    /* 24px */
--text-xl--line-height: 1.3;
--text-xl--letter-spacing: -0.012em;

--text-2xl:  2rem;                      /* 32px — hero / display */
--text-2xl--line-height: 1.15;
--text-2xl--letter-spacing: -0.025em;

/* Spacing — rem-based, Tailwind v4 singular form.
   Drives auto-generation of p-N / m-N / gap-N utilities (each step is
   N × 0.25rem). Replaces the old `--space-N` family in PR-7b. */
--spacing: 0.25rem;
```

Then, outside `@theme`, between the `@theme {}` closing brace and the
existing `:root { ... }` block that defines `--space-N` / `--radius-*`,
**insert a new declaration** before the existing `:root`:

```css
/* Root font-size — drives every rem-based value in the system. A future
   settings UI can rescale the whole system by overriding --root-font-size
   at the document root. Tracked as O165. */
:root {
  font-size: var(--root-font-size, 16px);
}
```

(The existing `:root { --space-1: 4px; ... }` block stays — its tokens
are still consumed by 43 sites until PR-7b sweeps them.)

## Heading reset — `index.css`

Add this block after the existing `body { margin: 0; }` rule:

```css
/* Heading-element reset. From PR-7a onward, the type scale and recipe
   classes are the single source of truth for heading appearance.
   Verified at PR-7a authoring: every <h1>/<h2> in app + editor JSX
   carries a className, so removing browser defaults causes no
   regression. */
h1, h2, h3, h4, h5, h6 {
  font-size: inherit;
  font-weight: inherit;
  line-height: inherit;
  margin: 0;
}
```

## CLAUDE.md — extend the "Styling system" section

Under the existing "**Hard rules:**" list in the Styling system section,
**replace the rule that begins "Semantic tints via tint tokens"** — no,
leave that as-is. Instead, **add three new bullets** at the appropriate
positions:

After the "No raw color literals" rule, add:

```markdown
- **No raw size or spacing literals.** Type size and line-height come
  from the 6-step scale (`text-xs` / `text-sm` / `text-base` /
  `text-lg` / `text-xl` / `text-2xl`); spacing comes from Tailwind's
  `--spacing`-driven utilities (`p-N`, `m-N`, `gap-N`). No `font-size:
  Npx`, `padding: Npx`, `gap: Npx` in component CSS. Letter-spacing for
  display tiers is baked into the scale tokens; do not redeclare it.
```

After the "No inline `style={{}}` for theme-able properties" rule, add:

```markdown
- **`@apply` for component CSS.** Component rules compose from Tailwind
  utilities via `@apply`, not raw CSS properties. Only shape — `border`,
  `border-radius`, `padding`, `background`, `box-shadow`, `transition`
  — is allowed as token-backed `var(...)`; type and spacing must route
  through the utility layer.
```

After the existing "Semantic tints via tint tokens" rule, add:

```markdown
- **Type scale is closed.** The 6 steps are the only sizes. Bespoke
  `font-size` values in components are forbidden. When a design needs
  a size between two steps, round per the rule:
  *aesthetic fit first, logical proximity second, default down on ties.*
  Display surfaces use `text-2xl`; headings use `.t-h1` / `.t-h2` /
  `.t-h3` recipes (introduced in PR-7b).
- **rem everywhere.** All sizes and spacing in tokens are rem-based.
  `:root { font-size: var(--root-font-size, 16px); }` lets a future
  settings UI rescale the whole system at runtime (O165).
```

Replace the "Anti-patterns to reject in review" list with this expanded
version (adds three entries; keep the existing five):

```markdown
**Anti-patterns to reject in review:**

- New entries in `workbench.css` or `setup.css`.
- `style={{ display: 'flex', gap: ... }}` — use utilities.
- `color-mix(... N%, transparent)` outside `tokens.css`.
- `font-family: var(--font-sans); font-size: 13px;` — use `.t-body`.
- New `*.css` file that is not colocated with a component.
- `font-size: Npx` or `line-height: <number>` in component CSS — use
  `@apply text-{xs|sm|base|lg|xl|2xl}`.
- `padding: Npx` / `margin: Npx` / `gap: Npx` literal in component CSS
  — use `@apply` with Tailwind spacing utilities.
- `<h1>`–`<h6>` without a recipe class (and not inside a ProseMirror
  document, which is styled by `.ru-edit-host .ProseMirror hN`) —
  defaults are reset; the element will render at body size.
```

## Open Item — `docs/Open_Items.md`

Append a row to the index table (after the last entry, O164). Use the
next free ID — **O165** (verified against the existing index; O165 is
unused).

```markdown
| O165 | Root font-size prefs capability                  | IP / ADR-413                 | Open     | Phase 12 (Settings)   | PR-7a (19 May 2026) added `:root { font-size: var(--root-font-size, 16px) }` so the type and spacing scales are user-rescalable. The prefs capability + UI control + persistence + cap binding are not yet wired. Lands with the Phase 12 Settings surface (or earlier if a separate user-control phase ships first). |
```

## Constraints

- Do not modify `type.css` in this PR — its rewrite is PR-7b's scope.
- Do not modify `workbench.css`, `setup.css`, `WorkspaceTileGrid.css`,
  or any file under `packages/editor/src/styles/`.
- Do not touch any `.tsx` or `.ts` file.
- Do not remove or rename the existing `--space-N` tokens; they are
  still consumed by 43 sites and stay until PR-7b sweeps them.
- Do not delete the existing `.t-*` recipes; PR-7b rewrites them.

## Success criteria

- `pnpm --filter ru-soam-app compile` clean.
- `pnpm --filter @ru-soam/editor compile` clean.
- `pnpm --filter ru-soam-app lint` clean.
- The four new tokens are visible in DevTools at the document root:
  `--text-xs` through `--text-2xl` and `--spacing`.
- Tailwind utilities `text-xs`, `text-sm`, `text-base`, `text-lg`,
  `text-xl`, `text-2xl` resolve to the project's custom values, not
  Tailwind's defaults. Verify with one synthetic snippet — see "Watch
  out for" below.
- A `text-3xl` reference (if any pre-existed in the codebase) is now
  a no-op. Grep `text-3xl|text-4xl|text-5xl` across `apps/desktop/src`
  and `packages/editor/src` — surface in report if any matches exist
  (they will need rewriting in PR-7c).

## Watch out for

- The `--text-*: initial;` line disables Tailwind's default text scale.
  After this line, **only** the six tokens defined below it resolve. If
  Tailwind's compiled CSS shows any `text-{md|3xl|4xl|...}` rule
  still, the `--text-*: initial;` is in the wrong position or wrong
  syntax — re-check.
- The h1-h6 reset uses `inherit`, not `unset` — `inherit` ensures the
  heading takes the parent's font-size if no class applies, which is
  exactly the desired fallback. Do not change to `unset` (would
  restore browser defaults).
- The new `:root { font-size: var(--root-font-size, 16px); }` block is
  **separate** from the existing `:root { --space-1: 4px; ... }` block.
  Keep them as two separate `:root` rules so the diff is small and the
  intent of each is clear. Merging them is acceptable but not required.

## Reporting

When done, report:
1. Compile + lint results.
2. Confirmation that `--text-*: initial;` successfully disables Tailwind's
   default text scale (e.g. by inspecting generated CSS for absence of
   `text-3xl` rules, or by other check the implementer chooses).
3. Any `text-3xl|text-4xl|text-5xl|text-6xl` usages found in the
   codebase — list file:line so PR-7c can rewrite them.
4. The new Open Item entry — confirm O165 is the next free ID after
   re-checking the index.
