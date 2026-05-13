# Workbench shell anatomy

**ID:** ADR-401
**Status:** Accepted
**Date:** 2026-05-13
**Supersedes:** —
**Superseded by:** —
**Related:** ADR-102, ADR-104, ADR-402, ADR-403, ADR-410, ADR-412

## Context

A workbench window has to compose a non-trivial number of UI regions (title bar, side bars, editor area, panel, status bar, etc.) into a single layout that the user can resize, hide, and persist. VSCode's answer to this is two abstractions: a single `Layout` orchestrator that arranges everything into a `SerializableGrid`, and a `Part` base class that every major UI region extends. Every part has a known anatomy (titleArea / contentArea / optional header / footer) and self-registers with the layout service.

This shape works because it absorbs three forces at once: layout *composition* (where things sit), layout *persistence* (how the user's arrangement is remembered), and *contribution* (how new regions plug in without the layout knowing about them ahead of time). Without an explicit Part abstraction, those concerns scatter across whatever component happens to host each region, and the contribution model (ADR-104) has no consistent surface to attach to.

Ru-soam's workbench has the same forces. The first-party bundles (Patients, Sessions, Calendar, etc., per the [core shell vs first-party bundle reasoning](../References/Core_Shell_vs_First_Party_Bundle_Reasoning.md)) will contribute views into side-bar regions; the layout will need to remember whether the user docked the panel at 30% or 60%; new regions (the recovery view, the audit viewer) will arrive without the shell anticipating each of them.

This ADR commits the **shell anatomy** — the root structure and the Part abstraction — so subsequent ADRs (402 middle section, 405 activity-bar surfaces, 408 panel content, 409 status bar) have a stable foundation to build on. Detailed composition of the middle section is **out of scope here**; it lives in ADR-402.

## Decision

### Root layout: vertical stack

A workbench window is composed of four stacked **regions**, top to bottom:

```
┌───────────────────────────────────────────────────────────────┐
│  Title bar              (window chrome, title, window menu)   │
├───────────────────────────────────────────────────────────────┤
│  Banner                 (optional; sync state, lock state,    │
│                          recovery notices, update prompts)    │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  Middle section         (activity bar / side bars /           │
│                          editor area / panel — see ADR-402)   │
│                                                               │
├───────────────────────────────────────────────────────────────┤
│  Status bar             (entries, contributed left and right) │
└───────────────────────────────────────────────────────────────┘
```

The root is a vertical grid. The middle section is itself a grid (laid out in ADR-402). The banner is *conditional* — present only when at least one banner-contributing event is active; absent otherwise. The status bar is always present.

This matches VSCode's root structure with one addition: the explicit banner region. VSCode treats banners as ad-hoc overlays; ru-soam commits a region for them because sync state, lock state, and recovery prompts (ADRs 302 / 303 / 306) are first-class enough to deserve a stable home.

### Part abstraction

Every major UI region — the title bar, banner, activity bar (in ADR-402), side bars, editor area, panel, status bar — is a **Part**. A Part is a typed object that the workbench layout knows how to render and arrange.

A Part has:

- a stable **id** (used for persistence and for `when`-clause references later).
- a **slot** (which region of the root or middle grid it lives in).
- a **content area** — the Part's body, where the actual UI renders.
- an optional **title area** — small region for the Part's label and Part-level actions.
- an optional **header / footer area** — for tab strips, breadcrumbs, action bars.
- a **visibility** state and a **size** state, both persisted to workspace state (ADR-403).
- a **dispose** method (per the [disposable pattern](../Guides/disposable-pattern.md)).

Parts do not own their slot — they are *placed into* slots by the layout service. A Part can move slots (e.g., the activity bar can be configured top, bottom, or sided), and its identity travels with it.

### Layout service

A renderer-internal service — `LayoutService` (provisional name) — owns the Part registry, the slot-to-Part mapping, and the persistence of visibility and size. It is a renderer service, not a capability across the IPC boundary: layout is view state, and ADR-102 commits view state to the renderer.

The service exposes:

- `registerPart(part)` and `disposePart(id)` — Part lifecycle.
- `moveToSlot(partId, slot)` — relocate a Part.
- `setVisibility(partId, visible)` — show / hide; persisted.
- `setSize(partId, sizeSpec)` — resize; persisted.
- events: `onDidChangeLayout`, `onDidChangePartVisibility`.

The service is consumed only inside the renderer. Bundles do not consume the LayoutService directly — they contribute *into* slots through the contribution model (ADR-104), and the service's machinery handles the placement. This keeps bundles ignorant of layout internals.

### Persistence

Layout state — which Parts are visible, sizes, slot assignments — is persisted to workspace-scoped layout state (per ADR-403). It is **device-local by default**: a practitioner's screen-real-estate preference on a laptop is not necessarily the same as on a desk monitor. Synchronisation of layout state is an Open Item (O55, surfaced in ADR-403) but the default is local-only.

Workspace open re-applies the saved layout. A new workspace gets the platform default layout.

### Window chrome

Electron offers a choice: native window chrome (OS-drawn title bar, traffic lights, menu) or frameless (the app draws its own title bar, including window controls). VSCode uses a custom title bar to integrate the menu and tabs more tightly.

This ADR **does not commit** the chrome choice; it commits only the *existence* of a title-bar region as a Part. The chrome decision is a UX call (Open Item O57). Whichever way the choice lands, the title-bar Part remains, and other Parts do not need to know.

### Banner region

The banner is a single shared region that displays at most one notice at a time, prioritised. Contributing events include:

- platform-level lock state (e.g., KEK unlock required but not yet supplied).
- sync state errors (cloud reachable but auth expired).
- recovery prompts (a recovery scenario has been detected per ADR-306).
- update-ready prompts (when an update is downloaded and pending).
- maintenance / outage broadcasts (when the Cloud Backend signals one).

Banner contributions go through a typed banner-service. Bundles can contribute banners through a contribution point (subject to the contribution catalogue, ADR-104 Open Item O7). Banner content is **declarative** (kind, severity, primary action, dismissible), not freeform HTML — bundle-rendered banners would let third parties present misleading platform-styled notices.

### Empty-workspace shell

A window with no Entity loaded (per ADR-403's empty-workspace state) still has the full root layout, but:

- Side-bar Parts that depend on workspace-scoped bundles are not rendered.
- The editor area renders the onboarding / unlock surface as a special Part.
- The activity bar and status bar render only the platform-level items.

The shell is never blank. The user always sees the window with at least a title bar, the onboarding surface, and a status bar.

### What this ADR does not commit

- The internal grid library / engine. Likely candidates: a custom analogue of VSCode's `SerializableGrid`, the `allotment` library, plain CSS grid with imperative resize logic. Decision is Open Item O58.
- The middle-section composition (slots, side-bar count, panel placement). Lives in ADR-402.
- The activity-bar items, the side-bar contents, the editor area's content model. Live in ADR-405 / ADR-404.
- The renderer's service-registration mechanism (singleton-DI, hook-based provider, etc.). Lives in ADR-412.

## Consequences

### Positive

- One word — Part — for every region the workbench composes. Layout, persistence, and contribution attach to it consistently.
- The root layout is small, named, and easy to whiteboard.
- The banner region is explicit, so platform-level cross-cutting notices have a defined home.
- Bundles contribute *into slots* through the contribution model; they do not learn the layout's internals.
- Layout state is local-first and workspace-scoped, matching the rest of the platform.

### Negative

- The Part abstraction is upfront vocabulary that doesn't pay off until the second region exists. With one region (the editor) we could avoid it; from the second region onwards it earns its keep.
- Custom chrome (if Open Item O57 lands that way) is a real maintenance cost — window controls, drag regions, fullscreen behaviour vary per OS. Mitigated by sticking with native chrome unless a UX need surfaces.

### Neutral

- The shell remains a renderer-internal concern. No new IPC contracts, no new capability surfaces. The platform's existing trust model is untouched.

## Considered Options

- **No explicit Part abstraction; each region is a bespoke component** — _Rejected_: layout state, persistence, and contribution wiring scatter. The contribution model loses a stable attachment point.
- **One flat region container; no nested grids** — _Rejected_: middle-section composition (activity bar + side bars + editor + panel) wants nested grids; flattening produces awkward sibling relations.
- **VSCode-style Part + root-vertical-grid, banner as explicit region** _(chosen)_ — Reuses the abstraction that solved the same problem at scale; adds the banner region to match the platform's first-class lock / sync / recovery semantics.

## Open Items

- **O57** — Window chrome decision (native vs custom frameless). UX call; affects title-bar Part implementation only.
- **O58** — Grid engine / library choice for the root and nested layouts. Custom, `allotment`, plain CSS, or other.
- **O59** — Banner contribution scope. Platform-only at first; consider opening to bundles in a later contribution catalogue revision. Open Items for ADR-104 (O7) overlap.
