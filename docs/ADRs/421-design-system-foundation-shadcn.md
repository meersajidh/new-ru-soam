# Design-system foundation: shadcn preset + Base UI + unified base kit

**ID:** ADR-421
**Status:** Accepted
**Date:** 2026-07-07
**Supersedes:** ADR-420 (design-system component boundary — its two-kit / two-Icon structure is reversed here; its *discipline* survives, see D9/D10)
**Superseded by:** —
**Related:** ADR-106 (base/domain layers — the boundary this sits inside), ADR-411 Am1 (bundle-view origin/CSP — the trust surface deliberately **not** collapsed here), ADR-418 (trust tiers + PHI invariant — preserved), ADR-419 (bundle-view tech stack — React+Tailwind, the substrate this standardises on), ADR-413 + Am1 (theming + two-Icon contract — **amended**: 3-axis → named-theme×mode, two-Icon → single multi-source Icon), ADR-414 (RuEdit — untouched). Reconciles O194 (base-pkg extraction — `@basebench/ui` becomes the shadcn `packages/ui`, a large concrete slice), O195 (Layer sweep), O196 (brand rename). Guide: `docs/Guides/design-system.md`. Preset: shadcn `b6tOtw19k` (stakeholder-authored). (The F1–F6 execution tracker, the A2 extraction brief, the primitive inventory, and the two-lane refactor plan were interim implementation-management docs — removed on completion, 2026-07-09; this ADR + the guide are the durable record.)

> Decisions were converged with the stakeholder and accepted 2026-07-07. This ADR fixes the *foundation*; the file-by-file migration lives in the F1–F6 sequence (§Sequence) and the design-system guide governs *how it grows*.

## Implementation status — COMPLETE (2026-07-09)

F1–F6 all landed, each its own green-gated + dogfooded commit; the `view://` origins / CSP / ADR-418 PHI invariant were untouched throughout (D6 held). Deltas from the plan-time sequence and the durable outcome:

- **F1–F4 as specified.** Theme-model collapse to named-theme×mode on preset `b6tOtw19k` (F1); one shared token source `packages/basebench-ui/src/tokens.css` both surfaces import, 5 bespoke palette files retired (F2); single inline-SVG multi-source `<Icon>`, Phosphor primary, shell font-codicon dropped (F3); Base UI CSP spike **passed** (needs `<CSPProvider disableStyleElements>` in `ViewRoot` — kills Base UI's inline scroll-lock `<style>` vs `style-src 'self'`) then the S1 primitives re-based onto shadcn/Base UI, `usePopover` + bespoke Popover deleted (F4). Base UI package = **`@base-ui/react`** (not `@base-ui-components/*`).
- **F5 — Card + Badge, not the full fragment set.** The genuine adoption wins landed: shadcn `Card` on the Practice card pages; base `Badge` gained a **`size` scale** (default/sm/xs — the root fix: micro-tags were bespoke only because fixed `h-5`/`text-xs` didn't fit the 2xs/3xs scale) and every non-exception badge/tag/pill across shell + views was swept onto it (domain badges = recipes in the owning bundle's `view-src` — `StatusBadge`, `ClassBadge` — base stays domain-agnostic per ADR-106). **EmptyState / KvRow / Section were NOT extracted** — each has a single home, below rule-of-three; `aspects.tsx`'s local `Section`/`KvRow` are tracked as **O519** (rebuild on the primitive set when that view is next touched). This reflects the governing principle the stakeholder set: **the base primitive IS the standard; a bespoke element must carry a stated reason to stay bespoke; rule-of-three accommodates real exceptions, it does not gate whether a standard may exist.**
- **F6 — gallery as an editor tab, not a route.** A route replaced the whole `<Middle/>` (took over the window); the gallery instead opens as an **editor tab** via a `devtool://design-system` resource (protocol branch in `EditorGroup.renderEditor`), launched by the dev-only command `workbench.developer.openDesignGallery` ("Developer: Open Design System Gallery", `import.meta.env.DEV`-gated, reachable from the command palette). Shell primitives render directly under live mode/font/scale axis toggles. The guide's "view primitives in a real `view://` iframe frame" leg was **deferred (O520)** — post-F3 the view primitives ARE the same base kit, so a dedicated gallery-view bundle is disproportionate; revisit if a view-surface primitive diverges from the shell.
- **Follow-ups:** O518 (Base UI submenu dismisses the modal root on hover — only the vestigial 1-theme Color Theme submenu), O519 (`aspects.tsx` Section/KvRow debt), O520 (gallery view-iframe leg).

## Context

ADR-420 (accepted 2026-07-06, one day prior) established a **home-grown, two-surface** design system: a hand-rolled shell kit (`@basebench/ui`, 13 primitives extracted in S1) and a hand-rolled view kit (`@ru-soam/view-kit`), with a **permanent two-`<Icon>`** rule (font in shell, inline-SVG in views) and a two-tier-per-surface duplication story. It was the right call *given the assumption that we plumb primitives ourselves*.

That assumption changed. Three things came into focus:

1. **A de-facto standard exists.** The **shadcn** model — Tailwind v4 + a fixed **CSS-variable token contract** (`--background`/`--foreground`/`--card`/`--primary`/`--muted`/`--accent`/`--destructive`/`--border`/`--input`/`--ring`/`--radius` + chart/sidebar colors, `.dark` for mode) + headless behavior primitives + copy-paste (own-the-source) components — is now targeted by a whole ecosystem (the shadcn registry, shadcn-studio, tweakcn, dozens of theme sites). shadcn's new **preset** system (`shadcn@latest apply --preset <id>` / `init --preset <id>`) encodes an entire design system (behavior base + style + icon library + light/dark CSS vars + fonts + radius + deps) as a shareable, id-resolved artifact. Conforming our token layer to this contract makes the entire ecosystem — including any preset we author — **drop-in**.

2. **The reasons ADR-420 kept the two surfaces plumbing-separate are weaker than assumed.** The two-`<Icon>` split existed because "font glyphs can't cross into a CSP sandbox." But **inline-SVG works identically on both surfaces**, so a single SVG `<Icon>` erases the split. And the two-kit split conflated two different "surfaces": the **trust/render surface** (shell renderer vs sandboxed view iframes — real, load-bearing, PHI) and the **build/authoring surface** (N Tailwind builds + N hand-rolled kits — incidental, a source of drift). Only the first is load-bearing.

3. **No runtime cost to adopting the standard in the sandbox.** shadcn's stack is **not** runtime CSS-in-JS: themes are pure CSS variables, components are Tailwind-classed source, behavior comes from **headless** primitives (**Base UI**, shadcn's current default) that ship no CSS and position via the **CSSOM** — which CSP `style-src` does not govern (the O513 escape our views already rely on for React `style={{}}`). So the standard is CSP-clean inside `view://` iframes, both themes and components.

The opportunity: **stop plumbing, adopt the standard**, unify the *build/authoring* surface into one base kit both render surfaces consume, and keep the *trust/render* surface exactly as ADR-411/418 define it. This supersedes ADR-420's structure (D1 two-kits, D4 two-Icon) while keeping its **discipline** (3-tier taxonomy, rule-of-three, lint teeth, guide) intact.

**Non-negotiable, restated:** the `view://<bundleId>` iframe origins, their strict CSP (incl. `connect-src 'none'`), and the ADR-418 PHI invariant are **not** touched by this ADR. Sharing component *source* across a workspace package is a build-time fact; each surface still compiles its own bundle into its own origin/process. Source sharing ≠ runtime/trust sharing.

## Decision

### D1 — The token layer is the shadcn CSS-variable contract

`@basebench/ui` ships **one `theme.css`** authoring the shadcn semantic token contract (CSS custom properties + `.dark`), in Tailwind-v4 / OKLCH flavor. All components — shell and view — read those tokens. Because the file *is* the standard contract, any ecosystem theme (our preset, shadcn-studio, registry themes) drops in as a CSS-var block. **tweakcn and other generators are optional authoring aids, not dependencies** — we consume presets/themes directly via the shadcn CLI or by vendoring the CSS-var block.

Our prior bespoke token names (`--color-accent`/`--color-surface`/… and the 5 palette files) are **retired** and rewritten to the contract (F2). This is a token migration, cheap now (early, little to clean up) and standard-conformant thereafter.

### D2 — Theme model: named theme × mode (amends ADR-413)

ADR-413's **three independent axes** (palette × luminance × font-set, each a root class) collapse to **two**:

- **Named theme** — a curated identity that **bakes palette *and* font pairing** together (shadcn presets carry both). Applied as one class / one CSS-var block.
- **Mode** — light/dark, the `.dark` class toggle (shadcn's mechanism), *within* the active theme.

Font-set stops being an independent axis; it is part of a theme's identity. **One signature theme ships first** (the stakeholder preset `b6tOtw19k`); the mechanism supports adding named themes later at zero structural cost (drop in another preset's CSS-var block). The separate `ThemeService` + `FontService` merge into one service over `{ theme, mode }`; the renderer→view appearance bridge snapshot simplifies to those two.

### D3 — One unified base UI kit, both surfaces (reverses ADR-420 D1)

`@basebench/ui` is the **single base-layer UI package** and is structured as the shadcn **`packages/ui`** workspace (its own `components.json`, `theme.css` = shadcn `globals`, `components/ui/*`, deps). It provides **components + Icon + theme.css + Tailwind preset**. **Both** the shell (`app://` renderer) **and** every bundle **view (`view://` build)** import from it (domain→base is the allowed ADR-106 direction).

This is **build/source unification only.** Each surface still runs its own build into its own origin (§D6). "The same `Card` in both surfaces" is no longer two implementations — it is **one source** compiled into each build.

### D4 — Behavior primitive: Base UI (shadcn default)

Interactive primitives (Select, Popover, Menu, Dialog, Tooltip, Combobox, …) are built on **Base UI** (`@base-ui-components/react`) — shadcn's current default and what the preset targets. Base UI is **headless** (ships no CSS), styled via our Tailwind + tokens, and positions floating elements via the **CSSOM** (`element.style`), which is **not** governed by CSP `style-src` — so it renders correctly under the strict `view://` CSP. **Radix is not adopted** (earlier lean corrected). Base UI packages bundle per-build, tree-shaken per component used.

> **Gate:** before F4 leans on Base UI, one interactive Base UI component (e.g. Select or Popover) is proven to render **and position** inside a real `view://` iframe under `STRICT_VIEW_CSP`. Prove, don't assume (§Integration).

### D5 — One Icon, multi-source SVG registry (reverses ADR-420 D4)

A **single `<Icon name>`** component lives in `@basebench/ui`, renders **inline-SVG**, and resolves glyphs through a **multi-source registry** — several icon sets mounted simultaneously (namespaced on collision), swappable at any time. **Phosphor is the primary source**; **Codicon and Fluent (or any set) remain mountable**. Inline-SVG works identically on both surfaces, so the two-`<Icon>` rule (ADR-420 D4 / ADR-413 Am1) is **dissolved**; the shell drops its font-codicon. The registry decouples "which glyph set" from every call site — swapping sources is data, not code.

### D6 — The trust/render surface is untouched (explicit non-goal)

This ADR unifies **build and source**, **not** origins. Preserved verbatim: sandboxed per-bundle `view://<bundleId>` iframes, `STRICT_VIEW_CSP` (`script-src 'self'`, `style-src 'self'`, **`connect-src 'none'`**, etc.), the ADR-418 trust tiers, and the PHI invariant. A view bundling `@basebench/ui` source into its own build crosses **no** trust boundary. Any proposal to collapse the iframe origins is out of scope and would require its own ADR-411/418 reversal with explicit PHI analysis.

### D7 — Ecosystem-adoption policy: own the source, vet each dependency

- **Own the source.** Ecosystem components (shadcn / shadcn-studio, MIT) are **vendored** into `@basebench/ui` — copy-paste, not a runtime framework dependency. Consistent with the copy-paste ethos and with ADR-420's own-the-source stance.
- **No runtime CSS-in-JS, ever, in the view surface.** Anything that injects `<style>` via `.textContent` is CSP-hostile in views. shadcn's stack does not; new deps must be checked.
- **Per-component dependency vetting.** A block pulling extra deps (Motion/animation, charts, carousels) is adopted **individually** only after confirming it (a) injects no CSP-blocked styles (CSSOM `.style` and SVG are fine; `<style>`-textContent is not) and (b) opens no network (`connect-src 'none'`). Headless-behavior + Tailwind-class is the safe shape.
- **Target Tailwind v4 / OKLCH.** Convert any v3-era theme block or component on import.
- **Licenses:** shadcn/ui + shadcn-studio MIT, Base UI MIT, Phosphor MIT, preset system MIT/Apache-2.0 — all permissive, vendor-friendly.

### D8 — View-runtime stays a separate, view-only package

Only **primitives + Icon + theme** unify into `@basebench/ui`. The **view-runtime glue** that is meaningful *only* inside an iframe — `ViewRoot`, `useSoamView`, `useViewContext`, the bridge/query hooks — stays a thin **view-only** package (today `@ru-soam/view-kit`; its primitives migrate out into base, its runtime glue remains and *imports* base). The shell keeps its DI/registry services in-app. Net: a bundle imports only `@basebench/*` and gets everything it needs to render.

### D9 — Enforcement (retuned from ADR-420 D5)

- **Boundary-import rule.** All UI (shell and view) imports from `@basebench/ui`'s public root; no deep-internal imports; no bundle importing another bundle's `view-src`. The prior "shell uses `@basebench/ui` / view uses `@ru-soam/view-kit`" split rule is replaced by "**both surfaces use `@basebench/ui` for primitives**; view-runtime glue only from the view-runtime package." Extends the ADR-106 one-way import-lint.
- **No-raw-`<svg>` in `view-src`** (kept from ADR-420 D5.2; extend to shell too) — icons come from `<Icon>`; brand logos/bespoke markers opt out with a reasoned `eslint-disable`.
- **No runtime-CSS-in-JS import** (new) — lint-forbid importing known runtime-style-injection libs (styled-components/emotion/Griffel/etc.) in `view-src`, so the CSP-clean invariant can't silently regress.

### D10 — Discipline guide survives ADR-420 intact

The 3-tier taxonomy (Primitive / Recipe / Screen), rule-of-three promotion with mandatory delete-on-promote, token-only styling (honoring `docs/Guides/styling-system.md`), and the `/dev/design-system` gallery route remain **binding** and are carried forward from ADR-420 D6 into `docs/Guides/design-system.md`. This ADR changes the *structure and substrate* (one kit, shadcn standard, Base UI, one Icon); the guide still governs *how it grows* — updated to name the single home and the shadcn/preset workflow.

## Integration constraints (real work, not blockers)

1. **Fonts self-hosted.** Preset fonts normally arrive via `next/font` or a CDN; `view://` iframes **cannot** load CDN fonts (`font-src 'self' data:` — documented CSP gotcha). The preset's fonts are **self-hosted / inlined** into each origin (we already do this for Inter Tight via `view-fonts.ts`). F1/F2 integration step.
2. **CLI: `apply`, not `init --monorepo`; controlled, handed to the stakeholder.** `init --monorepo` scaffolds shadcn's *own* greenfield `apps/web + packages/ui` — we have our layout. We hand-configure `@basebench/ui/components.json` and run **`shadcn@latest apply --preset b6tOtw19k`** against it, **inspecting the diff** (it writes `components.json`, base `theme.css`, `packages/ui` deps, `components/ui/*`) — it must not touch the view builds' vite/electron/tailwind wiring. Because that command **adds dependencies and writes source**, the stakeholder runs it (install/git ownership), not the agent.
3. **Base UI CSP spike** (D4 gate) before F4.

## Sequence (each = own slice/commit, static-green, dogfooded; origins untouched throughout)

| Ph | Work | Amends |
|----|------|--------|
| **F1** | Theme-model collapse: adopt preset `b6tOtw19k` → named-theme×mode; merge `ThemeService`+`FontService` → one `{theme,mode}` service; self-host preset fonts; retune renderer→view appearance snapshot. Dogfood theme + light/dark on shell **and** a view. | ADR-413 |
| **F2** | `@basebench/ui` becomes the shadcn `packages/ui`: `theme.css` = shadcn CSS-var contract; shared Tailwind preset; reconcile `tokens.css` ↔ view-kit `theme.css` → one theme both surfaces import; retire the 5 bespoke palette files. | ADR-419/420, O194 |
| **F3** | Unify Icon: single inline-SVG `<Icon>`, multi-source registry, **Phosphor primary** (codicon/Fluent mountable); drop shell font-codicon; retune lint (no-raw-svg both surfaces). | ADR-413 Am1, 420 D4 |
| **F4** | **Base UI spike** (CSP gate) → vendor shadcn/Base UI interactive primitives into `@basebench/ui`; both surfaces import base; migrate the 13 committed S1 primitives onto the standard (re-base). | ADR-411/419/420 |
| **F5** | **(was S4b)** Static fragments — EmptyState, Card, Badge/Chip, KvRow, Section — in `@basebench/ui`, shadcn-styled, token-only; migrate ~14 views + shell call-sites; delete per-bundle/per-surface copies. | — |
| **F6** | `/dev/design-system` gallery — unified kit under theme × mode toggles; view primitives shown in a real `view://` iframe frame. | — |

## Considered options

**Supersede ADR-420 vs amend it.** Chosen: supersede. Two of ADR-420's core decisions (D1 two-kits, D4 two-Icon) are reversed and its substrate changes (hand-rolled → shadcn standard); a chain of amendments would obscure the new baseline. Its discipline (D6) and its "kit is the first O194 slice" insight (D2) are carried forward explicitly (D3/D9/D10), so nothing of value is lost.

**Behavior primitive — Base UI vs Radix.** Chosen: Base UI. It is shadcn's current default and the preset target, maximising drop-in ecosystem fit; both are headless + CSSOM-positioned + CSP-clean, so the tie-breaker is ecosystem mainline. (Earlier draft leaned Radix; corrected.)

**Token layer — shadcn contract vs keep bespoke names.** Chosen: adopt the contract. Bespoke names would forfeit the entire ecosystem (presets, themes, blocks) for no benefit; the migration is cheap now.

**Theme model — named themes vs keep 3 free axes.** Chosen: named theme × mode. Curated identities give consistency and match the preset/shadcn `.dark` model; independent axes produced combinatorial sprawl with no product value. One signature theme first, mechanism open.

**Icon — one SVG registry vs keep two.** Chosen: one. The two-Icon rule rested on "font can't cross the sandbox"; inline-SVG crosses fine, so the split had no remaining justification. Multi-source registry additionally decouples the glyph set from call sites.

**Theme authoring — direct preset vs tweakcn.** Chosen: direct shadcn preset (`apply --preset`). tweakcn is a generator whose *output* is a preset/CSS-var block we can already consume directly; no dependency needed.

**Collapse the render surfaces (origins) too.** Rejected / out of scope. Merging shell and view origins removes the PHI exfiltration barrier (`connect-src 'none'` on views), bundle isolation, and the untrusted-bundle rung (ADR-411/418) — a core security regression. Only the build/authoring surface unifies (D3/D6).

## Consequences

**Positive.**
- Standard substrate: the whole shadcn ecosystem (presets, themes, blocks) is drop-in; new Activities compose from a single, discoverable, standard home.
- Far less bespoke plumbing — we own components (copy-paste) but not a token system or an icon-font pipeline.
- One design system to author against (build/source unified); zero cross-surface drift.
- Advances **O194** concretely: `@basebench/ui`-as-`packages/ui` is a large real slice of the base extraction.
- Better a11y/interaction baseline (Base UI) than hand-rolled.

**Negative / cost.**
- **Re-bases the 13 committed S1 primitives** onto the standard — some S1 hand-rolled work is superseded (expected; early timing minimises it).
- Token + 5-palette migration to the shadcn contract (one-time; retires the multi-palette variety in favour of one signature theme).
- Per-component dependency vetting is an ongoing discipline (D7).
- New Base UI runtime dep bundled per view build (tree-shaken); a Base UI CSP spike must pass before F4 (low risk, but a gate).
- The 3-axis theming users could previously mix is reduced to curated themes (deliberate product call).

**Neutral.**
- RuEdit untouched (`@ru-soam/editor`, ADR-414).
- View-runtime package persists (D8) — only its primitives migrate.
- O195 Layer-field: `@basebench/ui` classifies `Layer: base` when that sweep runs; O196 rename direction unchanged.
- Trust/render surface (ADR-411/418, CSP, PHI) byte-for-byte unchanged.

## Open items

- **O516 / Lane A** — this ADR authorises F1–F6. On acceptance, execute in order, each its own green-gated commit.
- **Base UI CSP spike** — prove one interactive Base UI primitive under `STRICT_VIEW_CSP` in a real `view://` iframe before F4.
- **Preset font self-hosting** — extend `view-fonts.ts`-style inlining to the preset's font pairing.
- **`components.json` for the two-surface layout** — hand-configure for `@basebench/ui`; confirm `apply --preset` targets it cleanly without touching view builds.
- **Multi-theme later** — adding named themes beyond the signature one (drop-in preset blocks) is un-gated future work.
- **Reconcile on O194 rung-2** — when the full base move lands, `@basebench/ui` is already the `packages/ui`; decide sibling vs fold for any remaining base modules then.
- **A3 gallery (F6)** — `/dev/design-system`, dev-only, theme×mode toggles, view primitives in a real iframe frame.
