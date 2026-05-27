# Two-layer architecture: domain-agnostic base + domain layer

**ID:** ADR-106
**Status:** Accepted
**Date:** 2026-05-27
**Supersedes:** —
**Superseded by:** —
**Related:** ADR-102, ADR-103, ADR-104, ADR-105, ADR-403, ADR-407, ADR-413, ADR-501, ADR-503

## Context

ADR-102 scopes the Renderer to a composition shell; ADR-103/104/105 give it the
extension machinery (capabilities, contributions, activation lifecycle) by which
features compose rather than accrete in core. The codebase already reflects this:
`apps/desktop/src/platform/*` is a clean, domain-agnostic workbench platform
(commands, context-keys, theming, fonts, layout, keybindings, status bar, services,
notifications, editor primitive, update). No mental-health concept lives in any of
those modules.

This raises a latent question the project has not committed to: **is the
mental-health character of the product a property of the base, or a layer on top of
it?** The intent is the latter. The same base — centralized local-first workbench,
bundles plugging into declared extension points — should be reusable for other
domains (e.g. an education workbench for students, a workbench for legal
practitioners) without forking the platform.

Today the boundary is implicit, and a few domain assumptions have already leaked
into the base:

- `platform/workspace/workspace-service.ts` hard-codes
  `WorkspaceEntityType = 'individual' | 'clinic'` — `clinic` is a domain tenancy
  concept (ADR-501/503) embedded in a platform service.
- Base shell components carry product copy ("For mental health practice",
  "PHI stored locally").
- Context-key namespaces `patient.*` / `record.*` are documented as
  **platform-reserved**, but they are domain vocabulary, not platform vocabulary.

These leaks are small **now** because the domain layer barely exists (the only
bundles are `echo-test` / `echo-lazy`; the only package is `@ru-soam/editor`). The
cost of formalizing the boundary rises monotonically once clinical surfaces ship.
This is the cheapest moment to name and enforce it.

The risk being managed is **calcification** — domain assumptions diffusing into the
base until extraction becomes expensive. The mechanism of physical separation
(folder → published package → separate repo) is a secondary, deferrable concern; it
reduces no calcification risk on its own. What prevents calcification is the
*discipline*: a named, enforced, one-way dependency boundary.

## Decision

The system is structured as **two layers**:

- **Base layer** — the domain-agnostic workbench platform. Composition shell
  (ADR-102), the capability / contribution / lifecycle machinery (ADR-103/104/105),
  the Parts and slots (ADR-401/402), commands and context-keys (ADR-406/407), the
  editor primitive (ADR-414) and snippet *engine* (ADR-416), theming and fonts
  (ADR-413), generic workspace / identity / subscription, and the secure local-store
  *capability*. Knows nothing about mental health.
- **Domain layer** — mental-health specifics. Ships as bundles + domain
  configuration that consume the base through its declared extension points. Owns
  PHI schemas, clinical editor types, snippet *content*, tenancy model, entitlement
  policy, product copy/branding, and the clinical context-key namespaces.

### A product-wide axis, orthogonal to trust zones

This layering is a second axis, distinct from the trust zones of ADR-101:

- **Axis 1 (ADR-101):** trust zones — Renderer / Main / Cloud Backend. *Vertical.*
- **Axis 2 (this ADR):** base / domain. *Horizontal.*

They are orthogonal and they cross. The base/domain split applies **product-wide**,
not only to the client. The (future) Cloud Backend splits the same way: a server
**base** (identity, subscription / entitlement, generic workspace / entity, sync
transport) and a server **domain** (clinical collaboration use cases, domain
workspace/entity semantics, PHI). The one-way rule below holds within each zone:
server base must not import server domain, exactly as client base must not import
client domain.

The Cloud Backend is a placeholder today (Phase 11/12); only the client layer is
implemented now. This ADR states the invariant symmetrically so the server inherits
it by construction when it lands, rather than re-deriving the boundary later.

### One-way dependency rule

> **The base layer MUST NOT import from the domain layer.** The domain layer extends
> the base **only** through declared extension points — capabilities (ADR-103),
> contributions (ADR-104), reserved context-key namespaces (ADR-407), theme/icon
> data contributions (ADR-413), and a domain product-configuration module.

The dependency arrow points one way: domain → base, never base → domain. This is
enforced by lint (`no-restricted-imports` in `apps/desktop/eslint.config.js`,
the same mechanism that enforces ADR-202's trust-zone boundary), not by convention.
A base module that needs domain-specific behaviour receives it through an extension
point — it never reaches for a domain module by import.

### Layer taxonomy

| Concern | Base (domain-agnostic) | Domain (mental health) |
| --- | --- | --- |
| Shell / Parts / slots | ✅ generic layout | activity-bar/editor/panel **items** as contributions |
| Commands, context-keys | ✅ dispatch + `when` machinery | clinical command ids; `patient.*`/`record.*` keys |
| Editor | ✅ editor primitive (ADR-414); `RuEdit` → **`BaseEdit`** | clinical editor types composing the primitive |
| Snippets | ✅ expansion **engine** (ADR-416, generic-vocabulary) | clinical snippet **content** / definitions |
| Local store | ✅ encrypted-store **capability** | PHI **schema** on top of it |
| Workspace | ✅ generic workspace = Entity (ADR-403) | tenancy model (`individual`/`clinic`) |
| Identity / subscription | ✅ identity, session, subscription tier, entitlement-check **mechanism** | entitlement **policy** (feature→tier map); domain identity **proofing** (licensed-therapist verification) |
| Theming | ✅ themeable shell + token system | shipped palette, icons, product copy |
| Networking | ✅ brokered `app://` + sync transport (ADR-203) | clinical sync/share flows |

Boundary calls that recur:

- **Encrypted local store** is a base capability ("encrypted local-first store");
  the **PHI record schema** is domain. The base ships the vault; the domain ships
  what goes in it.
- **Workspace = Entity** (ADR-403) stays generic in the base. The **tenancy model**
  (`individual` / `clinic`, ADR-501/503) is domain — the base `WorkspaceEntityType`
  union must not enumerate domain tenancy values.
- **Identity / subscription / entitlement** — identity, session, subscription tier,
  and the entitlement-check *mechanism* are base (generic SaaS platform concern,
  client and server). What is domain: the *policy* mapping features to tiers, and
  domain-specific identity *proofing* (verifying a licensed therapist differs from
  an enrolled student or a bar member). Mechanism base, policy + proofing domain.
- **Snippets** — the expansion *engine* (trigger, placeholder walk, atomic nodes;
  ADR-416's "no `Smart*`" generic-vocabulary policy) is base; clinical snippet
  *content* is a domain contribution. Same mechanism/data split as theming.
- **Editor primitive** — the primitive is base, but its current `RuEdit` / `Ru*`
  naming carries product brand into the base and is renamed to **`BaseEdit`**
  (deferred to O196 — load-bearing rename). Clinical editor *types* that compose it
  are domain.
- **Branding** — the base is themeable and string-externalizable; product name,
  copy, and palette ship from the domain layer. No mental-health literal in base.

### Context-key namespace ownership (correction)

The base reserves `workbench.*` and `editor.*`. The domain layer owns `patient.*`
and `record.*`. This corrects the prior documentation that listed the clinical
namespaces as platform-reserved (ADR-407 / CLAUDE.md Conventions).

### Base naming: `basebench`

The base layer is named **`basebench`** — a product-neutral identity, distinct from
the mental-health product brand **`ru-soam`** (which is domain). The base must not
be branded with the domain product's name.

- Base package scope: `@basebench/*` (e.g. `@basebench/editor`, and the rung-2
  core-shell package — see ladder below). Not `@ru-soam/*`.
- Base capability bridge global: `window.basebench` (renamed from `window.soam`,
  ADR-202).
- View bridge tag: `__basebenchView` (renamed from `__soamView`, ADR-411).
- Editor primitive: **`BaseEdit`** (renamed off `RuEdit` / the `Ru*` brand,
  ADR-414); renderer integration dir `platform/ru-edit/` → `platform/base-edit/`.

These identifiers are **load-bearing** — `window.soam` is the entire renderer
capability surface and the `@ru-soam/*` scope threads through every import,
`tsconfig` path, and Vite alias. The brand→`basebench` rename is therefore a heavy
sweep tracked as **O196**, staged with the rung-2 extraction (O194), **not** part of
the Phase-A cheap cleanup. Phase A relocates only product *copy strings* to the
domain layer.

The app-level product identity (electron-builder `appId` / `productName`, app icon,
store listing) stays `ru-soam` — that is the domain product and is correctly
branded. Only the *reusable base* identifiers are neutralized.

### Documentation layering

The ADR corpus and supporting docs (Guides, References, Proposals) carry the same
axis. It is recorded as **metadata, not by renumbering**:

- Each ADR gains a frontmatter field `Layer: base | domain | cross`. IDs and file
  locations stay frozen — renumbering would rot every cross-reference (ADR↔ADR,
  Implementation_Plan, Open_Items, CLAUDE.md) for no benefit. `cross` covers genuine
  straddlers (e.g. a domain constraint that shaped a base mechanism).
- `docs/README.md` gains a **by-layer index** derived alongside the existing topic
  TOC — two views over one corpus. ADR number *ranges* remain topical (foundation /
  security / data / workbench / domain); layer is orthogonal to range.
- New ADRs are classified at creation.

First-cut classification (seeds, not final — the sweep refines):

- **Base:** 101–105, 201–203, 304, 308, 309, 401–416 (editor/snippet engines,
  shell, commands, theming), 403 (workspace = Entity).
- **Domain:** 301, 310, 501, 502, 503, and the PHI semantics within 302 / 303 / 307.
- **Cross:** 302 / 303 / 307 where a base store/crypto mechanism and a domain (PHI)
  rule are entangled in one ADR.

The full back-classification of all existing ADRs + guides/refs is a bounded
mechanical sweep deferred to **O195** — it must not block the code-layer work.

### Separation mechanism — a ladder, not this decision

Physical separation is staged. Each rung is reversible up to the next; only the last
is sticky. **This ADR commits rung 1 only.**

1. **Folder + import-lint** *(committed now)* — base and domain are distinct,
   lint-enforced zones in one repo. The discipline that prevents calcification.
2. **Published workspace package** — promote the base to a versioned, semver'd
   workspace package (`@basebench/core-shell`) with a stable public API.
   **Trigger:** a second domain becomes real.
3. **Separate repository** — base lives in and publishes from its own repo.
   **Trigger:** a separate team or release cadence owns the base. Explicitly resisted
   pre-need: it forks the load-bearing native-module packaging pipeline (ADR-204
   Amendment 3) and doubles release/CI cost for zero isolation benefit while one team
   ships one product.

The physical extraction to rung 2 (`packages/core-shell`) is tracked as **O194** —
deferred, not part of this decision.

## Consequences

### Positive

- The base/domain boundary is named and enforced, not implicit — domain concepts
  cannot diffuse into the platform through casual feature work.
- The base is positioned for reuse in other domains (education, legal) without a
  platform fork.
- Formalized at the cheapest possible moment: the domain layer is near-empty, so the
  one-time leak cleanup is a union type, a copy-string module, and a doc correction.
- The escalation path (publish → separate repo) stays open without being paid for
  speculatively; discipline now keeps the option cheap later.

### Negative

- New domain features must route through an extension point rather than editing base
  modules directly — the same discipline ADR-102 already imposes, now extended to the
  layer axis.
- A `domain/` home and an import-lint zone add structure that contributors must learn.
- Some judgement calls ("is this base or domain?") will recur at the boundary; the
  taxonomy table is guidance, not an exhaustive oracle.

### Neutral

- This ADR commits only the *logical* boundary and rung 1 of the *physical* ladder.
  Whether and when the base becomes a published package or a separate repo is left to
  the documented triggers, not decided here.
- The boundary largely ratifies the existing structure (`platform/*` is already
  domain-agnostic); the change is making it explicit and enforced plus relocating a
  small number of leaks.

## Considered Options

- **Convention only (no lint)** — _Rejected_: relies on reviewer vigilance every
  time; the calcification failure mode is exactly what "we'll be careful" does not
  prevent. The repo already enforces its other architectural boundary (ADR-202) by
  lint; consistency argues for the same here.
- **Publishable package now (rung 2 immediately)** — _Rejected for now_: a published
  API needs a frozen semver contract, but there is no second consumer to validate it
  against — the contract would be a guess that churns when a real consumer arrives.
  Deferred to O194 with a concrete trigger.
- **Separate repository now (rung 3 immediately)** — _Rejected_: maximum overhead
  (two release pipelines, cross-repo dev loop, forked native-module packaging) for
  zero isolation benefit at one-team / one-product scale. Hard to reverse; taken only
  on real need.
- **Lightweight now, escalate on trigger** _(chosen)_ — Buy the discipline
  (enforced one-way boundary + leak cleanup) at ~5% of the cost; defer the mechanism
  (publish / repo split) behind named triggers. Captures the anti-calcification
  benefit immediately while keeping escalation cheap and optional.
