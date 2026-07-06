# Design-System Guide

**Status:** Active guideline
**Date:** 2026-07-06
**Tracking:** O516 (Lane A). Inventory: `docs/Design_System_Inventory.md`. Scope/sequence: `docs/Design_System_And_Testing_Refactor.md`. Styling rules this guide sits on top of: `docs/Guides/styling-system.md`.

> **Read this before building any new view or Activity.** It exists so the next
> ten screens compose from a shared library by default — consistent, discoverable,
> no sprawl — *without* a Storybook. If you are about to hand-write a card, badge,
> empty-state, key-value row, or an inline `<svg>` icon: stop and read §3.

---

## 1. Why this exists (and why not Storybook)

Two forces (see the refactor doc): shared UI primitives were scattered and un-owned, and each new Activity re-derived its own conventions. Left alone that compounds into sprawl.

Storybook was **rejected** for this architecture (two render surfaces, class-axis theming, DI/bridge coupling — full reasoning in the refactor doc §2). But Storybook's *job* still has to be done. That job has three legs, and this guide + the gallery route + lint together do all three — Storybook only ever did the first, poorly here:

| Leg | Mechanism here | Without it… |
| --- | -------------- | ----------- |
| **Discoverability** — see what exists before building new | dev gallery route `/dev/design-system` (A3) | you rebuild a `Card` that already exists |
| **Enforcement** — can't hand-roll or reach past the boundary | lint rules (§6) | the guide becomes a suggestion nobody follows |
| **Contribution rule** — when to add vs keep local | promotion rule (§4) | the library bloats into a graveyard of one-offs |

---

## 2. The two render surfaces (know which one you're on)

The design system is split by render surface. This split is architectural (ADR-411/413/419), not incidental. Every primitive belongs to exactly one surface.

| Surface | Runs in | Origin / CSP | Icons | Theme delivery | Library home |
| ------- | ------- | ------------ | ----- | -------------- | ------------ |
| **Shell** | `apps/desktop/src` renderer | `app://` (trusted) | **font** codicon `<Icon>` | `tokens.css` + palette classes in-tree | `@basebench/ui` *(shell kit — pending A2 ADR)* |
| **View** | bundle iframes | `view://<bundleId>` (sandboxed, strict CSP) | **inline-SVG** codicon `<Icon>` | per-bundle Tailwind importing `@ru-soam/view-kit/theme.css` | `@ru-soam/view-kit` *(exists)* |

**There are two `<Icon>` components on purpose** (ADR-413 Am1: font in the shell, inline-SVG in sandboxed iframes). Do **not** try to unify them. Import the one for your surface.

Never import across the boundary: a `view://` bundle does not import shell UI, and vice versa. A primitive needed on both surfaces is implemented twice (once per home) — that is correct, not duplication (§3 clarifies the difference).

---

## 3. The three tiers (the anti-sprawl mental model)

Every piece of UI is exactly one of these. Name it before you write it.

### Primitive
Token-only, zero domain knowledge, works on any screen. `Button`, `TextInput`, `Card`, `Badge`, `Chip`, `EmptyState`, `Icon`. **Lives in the library.** Prop-driven, theme-able via tokens only (§7).

### Recipe
A *named, fixed composition* of primitives that recurs. `KvRow`, `Section` header block, `NextSessionCard`. Still domain-free — a `KvRow` doesn't know what a patient is. **Lives in the library once it repeats** (§4). This is the tier people smear into screens; watch it.

### Screen
An Activity view — `Roster`, `MeetingRecord`, `SafetyPlanForm`, `MigrationView`. Domain-coupled, DI/bridge/registry-wired. **Stays in its bundle. Never enters the library.**

> The rule in one line: **screens compose from the library; they do not define reusable shapes inline.** If a screen defines a `function Card(...)`/`function Badge(...)` locally, that's a promotion candidate, not a screen concern.

---

## 4. The promotion rule (rule of three)

Duplication is a code smell — but **premature extraction is a worse one.** Abstract from a single example and you guess the API wrong, then every future caller fights the wrong shape. So we let real usage prove the shape before promoting:

1. **1st use** — inline it in the screen. Done.
2. **2nd use** — copying is *allowed*, as a signal. Leave a `// TODO: promotion candidate` if obvious.
3. **3rd use, OR a new Activity needs it** — the shape is now *proven*, not guessed. **Promote to the library and delete every copy.** Deletion is mandatory, not optional.

**Steady state = zero standing duplication of anything the library covers.** The only duplication that may ever exist is ≤2 unpromoted copies acting as the promotion trigger. After promotion, lint (§6) blocks re-duplicating a covered primitive.

Cross-surface note: the *same visual thing* implemented once in `@basebench/ui` and once in `@ru-soam/view-kit` is **not** duplication to eliminate — the two surfaces are physically separate runtimes (§2). Don't try to share a component across the CSP boundary.

Promotion checklist (all must hold):
- [ ] Domain-free (no patient/meeting/schedule knowledge baked in).
- [ ] Token-only styling (no hard-coded colors/sizes — §7).
- [ ] Prop API covers the ≥3 real call sites without a `variant` explosion. If it needs 6 booleans, it's two primitives.
- [ ] Added to the gallery route (§5) with its axis toggles.
- [ ] All prior copies deleted in the same change.

---

## 5. The gallery route (discoverability = the Storybook replacement)

`/dev/design-system` — a dev-only TanStack route rendering every library primitive in the **real renderer**: real theme/DI/fonts, real Tailwind, live axis toggles (palette × luminance × font-set). This is the design system's face and the first place to look before building new UI.

Rules:
- Every promoted primitive gets a panel. Promotion isn't done until it's in the gallery.
- Show the primitive across the theming axes (that's the whole reason it beats Storybook here — class-axis theming rendered truthfully).
- Dev-only; not shipped to users, not a route users can reach.
- The gallery renders shell primitives directly. View primitives (`@ru-soam/view-kit`) render inside a real `view://` iframe frame in the gallery so their sandboxed/CSP reality is truthful — not faked in the `app://` tree.

---

## 6. Enforcement (the teeth — without this the guide is a suggestion)

Two lint rules keep the boundary real. Land them with the A2 extraction:

1. **Boundary import rule.** Primitives are imported *only* from their library home (`@ru-soam/view-kit` for views, `@basebench/ui` for shell). No relative paths into a package's internals; no bundle importing another bundle's `view-src`. Extends the ADR-106 one-way-dependency lint already enforced.
2. **No-raw-fragment rule (incremental).** Flag hand-written inline `<svg>` in `view-src` — icons must come from `<Icon>` (extend `CODICON_PATHS` if a glyph is missing; never hand-draw). Grow an allowlist of "you re-invented a covered primitive" patterns as the library covers them.

If it isn't lint-enforced, it will rot. A guideline with CI teeth is a design system; one without is a wiki page.

---

## 7. Styling contract (defer to the styling guide)

The design system does not restyle — it consumes tokens. All token/layer/type-scale/`@apply`/BEM rules live in `docs/Guides/styling-system.md` and are binding here. Specifically for library primitives:

- **Tokens only.** No hard-coded colors, spacing, or font sizes in a primitive. Use palette-file tokens (`--color-surface-active`, etc.), never `@theme`-tree-shaken raw `var()` in hand-written CSS (that silently paints empty — see the CLAUDE.md gotcha).
- **Both light and dark**, both surfaces.
- Prop-driven variants over class soup; but variants still resolve to tokens, never inline `style={{}}` for theme-able values.

---

## 8. Quick reference — "I'm about to build a view, what do I do?"

1. Open `/dev/design-system`. Does the primitive exist? → import it. Done.
2. Not there, but you can see it'll recur? → build it inline in your screen for now (tier: screen-local). Don't pre-promote.
3. This is the 3rd time you (or another Activity) needs it? → promote (§4 checklist), delete copies, add to gallery.
4. Need an icon? → `<Icon name="...">`. Missing glyph? → add to `CODICON_PATHS`. **Never** hand-draw `<svg>`.
5. Styling? → tokens only, per `styling-system.md`. Never hard-code a color.
6. Unsure if it's a primitive, recipe, or screen? → §3. When in doubt, keep it screen-local; promotion is cheap later, un-abstracting a wrong primitive is not.
