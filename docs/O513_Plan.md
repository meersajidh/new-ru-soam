# O513 — Tailwind-in-view: prove utilities + tighten `style-src`, refresh view-stance docs

> **Build note / execution plan.** Survives `/compact` — read this first on resume.
> Status when written: NOT STARTED. Scope agreed = "prove + pattern" on the `meetings`
> pilot, then discuss pros/cons before deciding full conversion of all views.

## Context

O513 is the last tail of the view-stack migration (O497/A7; ADR-419 + ADR-411 Am1).
Two loose ends:

1. **CSP not fully tightened.** `STRICT_VIEW_CSP` in
   `apps/desktop/electron/main/fp-host/view-protocol.ts` still carries
   `style-src 'self' 'unsafe-inline'`. `script-src` is already the strict `'self'`
   XSS backstop; `style-src` is the last un-tightened directive. The **only** thing
   keeping `'unsafe-inline'` alive is one hand-authored inline `<style>` in the dev
   fixture `bundles/echo-test/view-assets/echo-view.html` (its `<script>` was already
   externalised to `echo-view.js`). All 14 React views already emit **external
   same-host** CSS (`<link crossorigin href="./assets/*.css">`), and React `style={{}}`
   uses the CSSOM (NOT CSP-governed) — so nothing else needs inline styles.

2. **"Tailwind-in-view" is unproven.** `@tailwindcss/vite` is wired into all 3
   per-bundle view configs (`bundles/{ru-soam-practice,ru-soam-schedule,ru-soam-sessions}/vite.views.config.ts`)
   but **inert** — no view imports `tailwindcss`/`@theme`; every view ports plain BEM
   CSS with a `:root` token-fallback block. ADR-419 says views ARE Tailwind-capable
   React apps, but that's never been exercised. Dropping `'unsafe-inline'` without
   proving a real view can use Tailwind utilities (that generate external CSS resolving
   to the live theme) would leave the claim theoretical.

**How it works end-to-end.** The shell's Tailwind entry
(`apps/desktop/src/styles/theme.css` = `@import "tailwindcss"` + `@import "./tokens.css"`
`@theme` block) makes utilities like `bg-surface-base` compile to
`background-color: var(--color-surface-base)`. The value arrives at runtime — the bridge
`applyTheme` sets `--color-*` custom props on the view's `documentElement` (exactly what
today's ported CSS already reads). A view build only needs the same `@import "tailwindcss"`
+ `@theme` declarations present so the right utilities generate (tree-shake: utilities emit
only when a class is seen used).

**Verified current state (read-only):**
- `bundles/*/vite.views.config.ts` all load `tailwindcss()` (inert).
- No `view-src/*.css` uses `@import "tailwindcss"` / `@theme` / `@apply` / `@tailwind`.
- Built React-view HTML = external `<link crossorigin>` CSS, zero inline `<style>`,
  zero `style=` attrs. Only `echo-test/echo-view.html` has inline `<style>`.
- `packages/view-kit/src/` has no CSS yet (bridge-types, codicon-paths, hooks, Icon.tsx,
  index.ts, ViewRoot.tsx).

## Part A — Shared view Tailwind entry (base layer, ADR-106)

`@ru-soam/view-kit` is the clean shared home (a view importing `apps/desktop/src` would
violate the one-way base←domain dep). Small deliberate token duplication now; note **O194**
later unifies shell + view tokens into one base source.

- **NEW** `packages/view-kit/src/tokens.css` — the `@theme { … }` token declarations,
  mirrored from `apps/desktop/src/styles/tokens.css` (surfaces / fg / borders / accent /
  semantic / fonts / radius). Become the pre-theme-flash defaults; runtime values override
  via `applyTheme`.
- **NEW** `packages/view-kit/src/theme.css` — `@import "tailwindcss";` + `@import "./tokens.css";`
  (mirrors the shell's reference-only entry). Do NOT transitively import component CSS — the
  shell guide warns `@reference` recursion OOMs the Tailwind plugin.
- **Alias** so views can `@import "@ru-soam/view-kit/theme.css"`: add one exact-string alias
  entry (`'@ru-soam/view-kit/theme.css'` → the file path) in each
  `bundles/*/vite.views.config.ts`, alongside the existing `@ru-soam/view-kit` JS alias. The
  current exact alias maps only the bare specifier, so it won't match the subpath.
- **Watch-out:** Tailwind v4 auto-detects source files in the build graph; if utilities used
  only in `.tsx` fail to emit when the entry CSS lives in view-kit, add an `@source` directive
  pointing at `view-src`. Verify in the pilot.

## Part B — Convert the `meetings` pilot to Tailwind (the working reference)

`bundles/ru-soam-sessions/view-src/meetings.{tsx,css}` (275 tsx / 388 css).

- `meetings.css` → drop the `:root` token-fallback block + BEM rules; replace with
  `@import "@ru-soam/view-kit/theme.css";` plus a few `@apply` recipes only for composites
  that recur (styling-guide `@apply` policy) and any truly-custom CSS (keyframes, etc.).
- `meetings.tsx` → convert `className` BEM classes to Tailwind utilities (`flex gap-2`,
  `bg-surface-panel`, `text-fg-secondary`, `rounded-sm`, …). Bar = **visual parity**.
- No behaviour change (caps/verbs/`<Icon>`/states unchanged). Build regenerates
  `view-assets/meetings.{html,css,js}` (already gitignored).
- Other 13 views untouched (their ported CSS keeps working under `style-src 'self'`).

## Part C — Tighten the CSP

- **NEW** `bundles/echo-test/view-assets/echo-view.css` — move the inline `<style>` block
  from `echo-view.html` verbatim.
- **EDIT** `echo-view.html` — replace the `<style>…</style>` with
  `<link rel="stylesheet" href="view://echo-test/echo-view.css">` (same-host external, served
  by the existing `net.fetch` branch with the CRP header, exactly like `echo-view.js`).
- **EDIT** `apps/desktop/electron/main/fp-host/view-protocol.ts` — `STRICT_VIEW_CSP` style-src
  `'self' 'unsafe-inline'` → `'self'`; update the two doc comments that call it "transitional
  pending O513" (the `STRICT_VIEW_CSP` JSDoc ~L73-79 and the file-header CSP note) to state
  style-src is now the tightened `'self'` backstop, O513 resolved.

## Part D — Docs sweep (reflect current view stance: real origin, strict CSP, per-bundle Tailwind)

- **`docs/Guides/styling-system.md`** — primary. §466-472 "Color constraints" says views are
  opaque-origin, `@theme` tokens absent, "never reference renderer Tailwind utilities" —
  **stale**. Rewrite to: real per-bundle origin (ADR-411 Am1); views run their own per-bundle
  Tailwind v4 build; maturity CSS/JS now served as **external `_seam/` files** (not injected
  `<style>`), so `VIEW_MATURITY_CSS` itself still may not use `@theme` utilities (platform-injected,
  outside the view's build) but views themselves may. Add a **"Tailwind in bundle views"**
  authoring subsection (import `@ru-soam/view-kit/theme.css`; compose via utilities/`@apply`;
  tokens resolve to runtime `applyTheme` vars; `meetings` is the reference view). Fix §478-484
  relative-`@reference` note if needed.
- **`docs/ADRs/411-view-hosting-for-bundles.md`** — append a short **Amendment 2** (status coda
  to Am1): migration complete — legacy vanilla tier removed, **single strict tier**,
  `style-src 'self'` (O513 done), views Tailwind-capable per the styling guide. Leave Am1's
  coexistence narrative as the historical record.
- **`docs/ADRs/419-bundle-view-tech-stack.md`** — update the stale "opaque origin" phrasings
  (~§20, §65) to real-origin-per-Am1; add a one-line status note that the strict single-tier CSP
  + per-bundle Tailwind build shipped (O511/O513), `meetings` = Tailwind reference.
- **`docs/Guides/architecture-two-axes.md`** §82 — table cell "opaque origin" → "real per-bundle
  origin (ADR-411 Am1)".
- **`CLAUDE.md`** — Architecture Log "View / iframe contract (CORE)" bullet: "sandboxed
  opaque-origin iframes" → real per-bundle origin + strict CSP + per-bundle Tailwind; note the
  several opaque-origin **Dev Gotchas** are now historical (annotate, don't delete — they explain
  past reasoning).
- **`docs/Open_Items.md`** — flip **O513 → Resolved**.
- **Memory** — update `project_view_stack_migration` + `MEMORY.md` index (O513 done; Tailwind
  pattern established; docs refreshed).

## Verification

1. `pnpm --filter ru-soam compile && pnpm --filter @ru-soam/editor compile` (whole workspace incl.
   view-src via solution refs) + `pnpm --filter ru-soam lint`. **view-src tsc needs
   `--incremental false`** (a stale `.tsbuildinfo` can report EXIT:0 while real errors exist —
   known gotcha).
2. `node scripts/build-views.mjs` (production) succeeds; inspect built `view-assets/meetings.html`
   — external `<link crossorigin>` CSS, **no inline `<style>`**.
3. Full `just dev-desktop` restart (Main change → `view-protocol.ts`; build-script/config edits
   are boot-singletons, NOT hot-picked-up).
4. Dogfood via CDP (`:9333`, unlock passphrase `sajid.rusoam`, raw-iframe `suppress_origin=True`):
   - **meetings** (`view://ru-soam-sessions`) — visual parity, **Tailwind utilities applied**,
     colors match the live theme; **switch theme** → utility colors update (proves utilities
     resolve to runtime `applyTheme` vars, not baked defaults); external CSS loads; console clean.
   - **echo-view** — renders fully styled from external `echo-view.css`; **inline-`<style>` probe
     BLOCKED** by `style-src 'self'` (console refusal) — style backstop now live; React `style={{}}`
     (CSSOM) still works.
   - A non-migrated view (e.g. Practice `roster`) still renders under the tightened CSP.
5. Then **discuss pros/cons** of the Tailwind pattern (churn vs consistency; token-duplication vs
   O194; `@apply` recipe density) → decide whether to proceed to **full conversion of all 14 views**
   (deferred scope) as a follow-up.

## Out of scope (this pass)
- Full conversion of the other 13 views to Tailwind — deferred pending the post-pilot discussion.
- O194 (unify shell + view tokens into one base source) — note only.
- O512 (untrusted TP-Host CSP tier) — separate, deferred to rung-H.

## Key references
- `docs/View_Stack_Migration_Plan.md` — parent A7 plan (O513 watch-out at bottom).
- `docs/References/View_Sandbox_Origin_And_CSP_Reasoning.md` — real-origin + CSP reasoning.
- `docs/ADRs/411-view-hosting-for-bundles.md` Am1 — real origin + trust-tiered CSP.
- `docs/ADRs/419-bundle-view-tech-stack.md` — React + Tailwind view stack.
- `apps/desktop/src/styles/{theme.css,tokens.css}` — shell Tailwind entry pattern to mirror.
