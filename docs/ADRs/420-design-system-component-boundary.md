# Design-system component boundary

**ID:** ADR-420
**Status:** Superseded (by ADR-421, 2026-07-07)
**Date:** 2026-07-06
**Supersedes:** —
**Superseded by:** ADR-421 (Accepted 2026-07-07) — reverses D1 (two-kit) + D4 (two-Icon): one unified `@basebench/ui` both surfaces, single multi-source SVG Icon, shadcn standard substrate. D6 discipline (3-tier / rule-of-three / gallery) is **retained** by ADR-421 D10.
**Related:** ADR-106 (base/domain layers — the boundary this sits inside), ADR-411 Am1 + ADR-419 (bundle-view origin/CSP/tech-stack — why the view surface is separate), ADR-413 Am1 (theming + two-Icon contract), ADR-414 (RuEdit already-owned primitive), ADR-412 (renderer services). Reconciles O194 (base-pkg physical extraction), O195 (Layer sweep), O196 (brand→`basebench` rename). Guide: `docs/Guides/design-system.md`. Inventory: `docs/Design_System_Inventory.md`. Plan: `docs/Design_System_And_Testing_Refactor.md` (Lane A / A2).

> This ADR is the **A2** step of Lane A. A1 (inventory) is done and un-gated;
> A3 (dev gallery route) and the actual code move follow acceptance of this ADR.
> The ADR decides the **boundary and its enforcement** — not a file-by-file move
> list (that lives in the inventory).

## Context

The codebase is ~85% platform / ~35% product. Shared UI primitives are scattered and un-owned: a de-facto shell UI kit accreted under `platform/ui` + `platform/popover` + `platform/menu` + a stray `workbench/middle/ResizeHandle`, and bundle `view-src` re-derives the same shapes by hand (EmptyState in 11 files, Card ×25, Badge ×14, KvRow ×7, plus hand-drawn inline `<svg>` icons bypassing the existing `<Icon>`). Each new Activity re-derives conventions; left alone this compounds into sprawl. A1 quantified this (`docs/Design_System_Inventory.md`).

Two facts frame the decision:

1. **Two render surfaces, physically separate runtimes** (ADR-411 Am1 / ADR-413 / ADR-419). Shell UI runs in the `app://` renderer (trusted, font `<Icon>`, `tokens.css` in-tree). Bundle UI runs in sandboxed `view://<bundleId>` iframes (strict CSP, inline-SVG `<Icon>`, per-bundle Tailwind). A primitive needed on both is implemented once per surface — not shared across the CSP boundary.
2. **The view surface already has an owned boundary.** `@ru-soam/view-kit` is a real workspace package (ViewRoot, `<Icon>`, hooks, `codicon-paths`, `theme.css`) that 14 view-src files import. The shell surface has **no** owned boundary — the kit is colocated but not a package, so nothing stops domain/bundle code reaching into `platform/*` internals.

So the *new* architectural decision is narrow: **an owned, lint-enforced home for the shell UI kit.** The view side is additive growth inside an accepted boundary (ADR-419) and needs no new decision here beyond restating its contribution rules.

This also intersects the deferred ADR-106 extraction ladder: O194 (move the domain-agnostic base out of `apps/desktop/src` into a workspace package — rung 2, deferred until a 2nd domain is real), O195 (Layer-field sweep), O196 (`@ru-soam/*`→`@basebench/*` brand rename). The shell UI kit is unambiguously base-layer and domain-free — it is the smallest, lowest-risk slice of O194.

## Decision

### D1 — Two owned homes, one per render surface

- **View surface → `@ru-soam/view-kit`** (exists). Grow it with the proven-shared fragments from A1 (EmptyState, Card, Badge/Chip, KvRow, Section) and eliminate hand-drawn SVG icons by extending `CODICON_PATHS`. This is **additive within an accepted boundary (ADR-419)** — no new module boundary, and the fragment backfill may proceed independent of this ADR's shell decisions.
- **Shell surface → a new `@basebench/ui` workspace package** (`packages/basebench-ui`). This is the boundary this ADR creates.

The same visual primitive existing once in each home (e.g. a `Card` in both) is **not** duplication to eliminate — the surfaces are separate runtimes with different CSP, icon, and theme-delivery mechanics (ADR-411 Am1). Do not attempt to share a component across the boundary.

### D2 — `@basebench/ui` is the first concrete slice of O194, born brand-correct

The shell kit extraction is scoped as **rung-2 down-payment on O194**: it proves the extraction mechanics (own `tsconfig` project ref, `vite` handling, import-lint, mass import rewrite for the moved primitives) on a small, domain-free, low-blast-radius surface — *before* the full base move O194 defers. It does **not** complete O194; `apps/desktop/src` base code stays put until a 2nd domain justifies the mass move.

The package is created under the **final `@basebench/*` scope**, not `@ru-soam/ui`. Rationale: it is new code with no existing call sites, so it can be born correctly at **zero rename cost**; naming it `@ru-soam/ui` now would only add churn to O196 later. This means a transitional mix (`@ru-soam/editor`, `@ru-soam/view-kit` alongside `@basebench/ui`) — accepted, and it signals the O196 direction. O196 still owns renaming the *existing* `@ru-soam/*` packages and identifiers; this ADR does not touch them.

### D3 — Initial extraction set (shell)

Extract into `@basebench/ui` the **13 clean primitives** (domain-free, token-only, no package→app back-edge): `Button`, `FormField`, `TextInput`, `Dialog`, `PageShell`, `Popover` + `usePopover`, `Select`, the **font** `<Icon>` + `icon-registry`, and utilities `cn()` + `useModalKeys`. Behavior-preserving move: keep public APIs and class names identical; rewrite importers to the package specifier.

`PageShell` + `Select` are §2b single-consumer today but **generic and domain-free** (`Select` builds on `Popover`, already moving), reuse anticipated soon — deliberate documented deviation from strict rule-of-three (generic + imminent, not a general speculative-extraction license). Screens and one-offs (A1 §2d/§3c) never enter either home.

**Amendment (2026-07-06, discovered in S1 execution):** two of the original 15 named primitives back-depend on app DI and are carved out of the clean move:
- **`ResizeHandle` → deferred to slice S1b, committed to a split.** It consumes `LayoutService` + the `prefs` capability (3 Part consumers). The drag mechanics are a genuine generic primitive, but the service/persistence binding is app composition. Split into a pure `<ResizeHandle onResize min max>` in `@basebench/ui` + an app-side wrapper (`LayoutResizeHandle`) that binds `LayoutService`/prefs. It is a **refactor, not a move** — its drag behavior (incl. the drag-shield gotcha) + prefs persistence must be **dogfooded live**, so it earns its own slice rather than muddying S1's behavior-preserving mechanics proof.
- **`ContextMenu` → deferred, reclassified as menu-service-internal (NOT a shared primitive).** Single consumer (`MenuHost`); needs `IMenuService`/`ResolvedMenuItem` types back from `menu-service` (stays in app). Under the §3 three-tier taxonomy it fails "Primitive" (cannot stand without the menu contract) — it is the render-half of the menu *service*, i.e. Screen/service-tier. A1 mis-slotted it. Stays in app beside `menu-service`; revisit only on a 2nd render-consumer **or** when `menu-service` itself extracts to base (contract types go base too, and `ContextMenu` rides along cleanly). Dragging the menu contract into the UI kit for one caller = net-negative.

Net S1 = the 13 clean primitives; boundary stays clean with zero back-edge.

### D4 — Two-Icon contract is permanent

The shell font `<Icon>` (`@basebench/ui`) and the view inline-SVG `<Icon>` (`@ru-soam/view-kit`) are **permanently separate** by construction (ADR-413 Am1: font glyphs can't cross into a CSP-restricted sandbox; SVG paths are what the iframe gets). A future reader must not "unify" them. `CODICON_PATHS` is the shared *data* (glyph path table), not a shared component.

### D5 — Enforcement (the boundary's teeth)

Two lint rules land **with** the extraction — the boundary is not real until CI enforces it:

1. **Boundary-import rule.** Shell primitives are imported only from `@basebench/ui`; view primitives only from `@ru-soam/view-kit`. No relative paths into a package's internals; no bundle importing another bundle's `view-src`; no `app://` shell importing view-kit or vice versa. Extends the existing ADR-106 one-way-dependency import-lint.
2. **No-raw-fragment rule (incremental).** Flag hand-written inline `<svg>` in `view-src` (icons must come from `<Icon>`; extend `CODICON_PATHS` for a missing glyph). Grow an allowlist of "you re-invented a covered primitive" patterns as the library covers them.

### D6 — Contribution discipline is the guide, not this ADR

The 3-tier taxonomy (Primitive / Recipe / Screen), rule-of-three promotion (with mandatory delete-on-promote → zero standing duplication of library-covered shapes), token-only styling, and the A3 gallery route live in `docs/Guides/design-system.md` and are binding. This ADR fixes the *structure*; the guide governs *how it grows*.

## Considered options

**Shell-kit home — chosen: new `@basebench/ui` package.**
- *Alt A — leave under `platform/*`, add import-lint only.* Rejected: `platform/*` is inside `apps/desktop/src` (domain-adjacent); an import-lint fence without a package doesn't give the base/domain one-way boundary, and doesn't advance O194. A fence with no wall.
- *Alt B — name it `@ru-soam/ui` now, rename in O196.* Rejected: pays O196 rename churn for a brand-new package that can be born correct for free; contradicts the guide + CLAUDE.md pointer already naming `@basebench/ui`.
- *Alt C — fold shell kit into a single `@basebench/core-shell` (full O194 rung-2) now.* Rejected: O194's mass move is deferred for good reason (owns all four `vite.*.config.ts`, route-gen, project refs, huge import rewrite). Doing it to land a UI kit couples a small win to a large risky move. D2's slice de-risks O194 instead of forcing it.

**View fragments — chosen: grow existing `@ru-soam/view-kit`.** No alternative seriously considered; the boundary exists and is accepted (ADR-419). The only question was *whether* to backfill, answered by A1's duplication counts.

**Icon unification — chosen: keep two, share only the path data.** Rejected unifying: physically impossible across the CSP boundary without shipping a font into the sandbox (regresses ADR-413 Am1 / ADR-411).

## Consequences

**Positive.**
- One owned, discoverable, lint-enforced home per surface; the next Activity composes from it by default.
- Duplication is structurally bounded (D5 rule 2 + guide rule-of-three), not just discouraged.
- O194 is de-risked: the extraction mechanics are proven on a small surface, and O196's direction is signalled by the new package's scope.
- Tier-2 component/DOM tests (O517 convergence) unblock — extracted presentational primitives test clean in jsdom with minimal mocks.

**Negative / cost.**
- Transitional package-scope mix (`@ru-soam/*` + `@basebench/*`) until O196 converges. Documented, deliberate.
- A moderate import rewrite for the ~11 moved shell primitives (mechanical, behavior-preserving).
- The A3 gallery route must render view primitives inside a real `view://` iframe frame to stay truthful (not faked in the `app://` tree) — modest extra wiring.

**Neutral.**
- RuEdit is untouched — already owned by `@ru-soam/editor` (ADR-414); `RuEditView`/`RuEditToolbar` stay as thin `platform/ru-edit` adapters.
- O195 Layer-field: the two UI packages classify `Layer: base` when that sweep runs.

## Open items

- **O516/A2** — this ADR + the extraction it authorizes. On acceptance: create `@basebench/ui`, move D3 set, land D5 lint, backfill view-kit fragments, kill hand-drawn icons.
- **Reconcile on O194 rung-2** — when the full base move happens, `@basebench/ui` either stays a sibling of `@basebench/core-shell` or folds in; decide then, not now.
- **A3 gallery route** — `/dev/design-system`, dev-only, live axis toggles, view primitives in a real iframe frame. Separate un-gated step after extraction.
