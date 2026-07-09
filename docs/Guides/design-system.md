# Design-System Guide

**Status:** Active guideline
**Date:** 2026-07-09
**Authority:** ADR-421 (foundation — shadcn preset + Base UI + one unified base kit; supersedes ADR-420). Styling rules this guide sits on top of: `docs/Guides/styling-system.md`. This guide governs *how the system grows*; ADR-421 fixes *what it is*.

> **Read this before building any new view or Activity.** It exists so the next
> ten screens compose from a shared library by default — consistent, discoverable,
> no sprawl — *without* a Storybook. If you are about to hand-write a card, badge,
> dialog, menu, or an inline `<svg>` icon: stop and read §3.

---

## 1. Why this exists (and why not Storybook)

Two forces: shared UI primitives were scattered and un-owned, and each new Activity re-derived its own conventions. Left alone that compounds into sprawl.

Storybook was **rejected** for this architecture (two render *surfaces*, class-axis theming, DI/bridge coupling — full reasoning in ADR-421 Context). But Storybook's *job* still has to be done. That job has three legs; this guide + the gallery + lint together do all three:

| Leg | Mechanism here | Without it… |
| --- | -------------- | ----------- |
| **Discoverability** — see what exists before building new | dev gallery (§5) | you rebuild a `Card` that already exists |
| **Enforcement** — can't hand-roll or reach past the boundary | lint rules (§6) | the guide becomes a suggestion nobody follows |
| **Contribution rule** — when to add vs keep local | promotion rule (§4) | the library bloats into a graveyard of one-offs |

---

## 2. One base kit, two render surfaces (ADR-421 D3/D6)

There is **one** base UI library — **`@basebench/ui`** — on the **shadcn standard** (Tailwind v4 CSS-variable token contract + Base UI headless behavior primitives + a single multi-source inline-SVG `<Icon>`). **Both** render surfaces import from it:

| Surface | Runs in | Origin / CSP | Imports |
| ------- | ------- | ------------ | ------- |
| **Shell** | `apps/desktop/src` renderer | `app://` (trusted) | `@basebench/ui` |
| **View** | bundle iframes | `view://<bundleId>` (sandboxed, strict CSP) | `@basebench/ui` (primitives) + `@ru-soam/view-kit` (view-runtime glue only) |

Two things that are **not** the same and must not be conflated (this is the whole ADR-421 insight):

- **The build/authoring surface is unified.** "The same `Card` in both surfaces" is now **one source** compiled into each build — not two implementations. Author against `@basebench/ui` once.
- **The trust/render surface is untouched.** The `view://<bundleId>` iframe origins, their strict CSP (`script-src 'self'`, `style-src 'self'`, `connect-src 'none'`), and the ADR-418 PHI invariant are byte-for-byte preserved. A view *bundling* `@basebench/ui` source into its own build crosses **no** trust boundary. Source sharing ≠ runtime/trust sharing. Collapsing the origins is out of scope and would need its own ADR-411/418 reversal.

**`@ru-soam/view-kit`** is **not** a second UI kit — it is the thin **view-runtime** package (`ViewRoot`, `useSoamView`, `useViewContext`, the bridge/query hooks) that is meaningful only inside an iframe and *imports* base. Primitives never live there.

**One `<Icon>`, one registry.** A single `<Icon name>` renders **inline-SVG** and resolves glyphs through a multi-source registry (Phosphor primary; Codicon/Fluent mountable, namespaced on collision). Inline-SVG works identically on both surfaces — there is no font-vs-SVG split anymore. Missing glyph → mount/extend the registry; **never** hand-draw `<svg>`.

---

## 3. The three tiers (the anti-sprawl mental model)

Every piece of UI is exactly one of these. Name it before you write it.

### Primitive
Token-only, zero domain knowledge, works on any screen. `Button`, `Input`, `Card`, `Badge`, `Dialog`, `Select`, `Popover`, `DropdownMenu`, `Icon`. **Lives in `@basebench/ui`.** Used **as-standard** — no bespoke wrapper API around a primitive (that is debt). Prop-driven, theme-able via the token contract only (§7).

### Recipe
A *named, fixed composition* of primitives that recurs. Domain-free recipes (a `FormField`, a `NextSessionCard`) live in `@basebench/ui`. **Domain recipes** — a badge/card that encodes a domain concept (session status, event classification) — live in the **owning bundle's `view-src`** (e.g. `StatusBadge`, `ClassBadge`), composed over the base primitive, so the base stays domain-agnostic (ADR-106). A recipe **only composes standard primitives**; it does not re-plumb one.

### Screen
An Activity view — `Roster`, `MeetingRecord`, `SafetyPlanForm`, `MigrationView`. Domain-coupled, DI/bridge/registry-wired. **Stays in its bundle. Never enters the library.**

> The rule in one line: **the base primitive IS the standard.** Screens and recipes compose from it; they do not re-define reusable shapes inline. If a screen defines a `function Card(...)`/`function Badge(...)` locally, that's a promotion candidate (or a domain recipe), not a screen concern.

---

## 4. The standard is the default; the rule of three accommodates exceptions

Adoption is not gated on clustering. Every badge/card/menu/pill uses the base primitive **unless it carries a genuine, stated reason to stay bespoke** ("would we still have this exception if we'd started from this standard? maybe a few, only for a good reason"). The rule of three is how we *accommodate real exceptions and prove a new shape's API* — **not** a gate on whether a standard may exist.

For a **new shape** not yet in the library, premature extraction is a real risk (abstract from one example, guess the API wrong):

1. **1st use** — inline it in the screen. Done.
2. **2nd use** — copying is *allowed*, as a signal. Leave a `// TODO: promotion candidate`.
3. **3rd use, OR a new Activity needs it** — the shape is proven, not guessed. **Promote to the library and delete every copy.** Deletion is mandatory.

For an **existing** primitive, there is no waiting: use it. **Steady state = zero standing duplication of anything the library covers.** Genuine bespoke exceptions (a grid-cell chip that can't be a fixed-height `Badge`; a chrome-less inline count that isn't a pill; a positioned watermark) are fine — each carries a one-line reason; anything without a reason gets swapped.

Promotion checklist (all must hold):
- [ ] Domain-free (no patient/meeting/schedule knowledge baked in) — else it's a domain recipe in the bundle.
- [ ] Token-only styling (no hard-coded colors/sizes — §7).
- [ ] Prop API covers the ≥3 real call sites without a `variant` explosion. If it needs 6 booleans, it's two primitives.
- [ ] Added to the gallery (§5).
- [ ] All prior copies deleted in the same change.

---

## 5. The gallery (discoverability = the Storybook replacement)

The design-system gallery renders every base primitive in the **real renderer** — real tokens, real DI, real fonts, real Tailwind — under live class-axis toggles (**mode** light/dark, **font-set**, **font-scale**; the theme axis is named-theme, one signature theme today). This is the system's face and the first place to look before building new UI.

**Open it:** command palette → **"Developer: Open Design System Gallery"** (`workbench.developer.openDesignGallery`, dev-only). It opens as an **editor tab** (via the `devtool://design-system` resource) — inside the editor space with the shell chrome intact, not a full-window route.

Rules:
- Every promoted primitive gets a panel. Promotion isn't done until it's in the gallery.
- Show the primitive across the theming axes (that's the whole reason it beats Storybook here — class-axis theming rendered truthfully).
- Dev-only; `import.meta.env.DEV`-gated; never shipped to users.
- View primitives are the same base kit as the shell, so they render truthfully in the gallery directly. Rendering them inside a real `view://` iframe frame (to prove sandbox/CSP reality) is deferred (**O520**) — revisit only if a view-surface primitive ever diverges from the shell.

Source: `apps/desktop/src/workbench/dev-gallery/DesignSystemGallery.tsx`.

---

## 6. Enforcement (the teeth — without this the guide is a suggestion)

Lint rules keep the boundary real (ADR-421 D9):

1. **Boundary import rule.** All UI (shell and view) imports primitives from `@basebench/ui`'s public root; view-runtime glue only from `@ru-soam/view-kit`. No deep-internal imports; no bundle importing another bundle's `view-src`. Extends the ADR-106 one-way import-lint.
2. **No-raw-`<svg>` rule** (both surfaces). Icons come from `<Icon>`; brand logos / bespoke markers opt out with a reasoned `eslint-disable`.
3. **No runtime-CSS-in-JS.** Lint-forbid importing runtime-style-injection libs (styled-components/emotion/Griffel/…) in `view-src` — anything that injects `<style>` via `.textContent` is CSP-hostile in views and would silently regress the invariant. (Base UI is safe: headless, positions via CSSOM `element.style`, which `style-src` does not govern.)

If it isn't lint-enforced, it will rot.

---

## 7. Styling contract (defer to the styling guide)

The design system does not restyle — it consumes the **shadcn CSS-variable token contract** (`--background`/`--foreground`/`--card`/`--primary`/`--muted`/`--accent`/`--destructive`/`--border`/`--input`/`--ring`/`--radius` + `--info`/`--success`/`--warning`; `.dark` for mode). All token/layer/type-scale/`@apply`/BEM rules live in `docs/Guides/styling-system.md` and are binding here. For library primitives specifically:

- **Contract tokens only.** No hard-coded colors, spacing, or font sizes. Use the contract vars / Tailwind utilities over them (`bg-card`, `text-muted-foreground`, `bg-success/10`); never `@theme`-tree-shaken raw `var()` in hand-written CSS (silently paints empty — see the CLAUDE.md gotcha).
- **Both light and dark**, both surfaces.
- Prop-driven variants (cva) over class soup; variants still resolve to tokens, never inline `style={{}}` for theme-able values.
- **One shared token source:** `packages/basebench-ui/src/tokens.css` — both surfaces import it; do not fork per-surface token files.

---

## 8. Quick reference — "I'm about to build a view, what do I do?"

1. Open the gallery (§5). Does the primitive exist? → import it from `@basebench/ui`. Done. Use it **as-standard** (no wrapper).
2. It's a **domain** badge/card (encodes a domain concept)? → a recipe over the base primitive, in your bundle's `view-src`.
3. New generic shape, not there yet? → inline in your screen. On the 3rd use / a new Activity → promote (§4 checklist), delete copies, add to gallery.
4. Need an icon? → `<Icon name="...">`. Missing glyph? → mount/extend the icon registry. **Never** hand-draw `<svg>`.
5. Styling? → contract tokens only, per `styling-system.md`. Never hard-code a color.
6. Tempted to keep something bespoke? → only with a one-line reason (§4). No reason → use the standard.
