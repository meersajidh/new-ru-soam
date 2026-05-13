# Activity-bar surfaces: mechanism and core items

**ID:** ADR-405
**Status:** Accepted
**Date:** 2026-05-13
**Supersedes:** —
**Superseded by:** —
**Related:** ADR-104, ADR-402, ADR-403, ADR-410, ADR-411, ADR-502

## Context

ADR-402 commits the Middle Section's five slots and names the `activityBar.items` contribution point. It does *not* commit which items ship — the catalogue of first-party surfaces (Patients, Sessions, etc.) is a product-scope decision, not an architectural one. Drafting a catalogue inside an architectural ADR risks locking MVP product scope behind the wrong door and treating extrapolation as commitment.

This ADR commits only the *mechanism*: where activity-bar items live in the core / first-party split, how they contribute, how they activate, and which **platform** items the core shell owns. The actual first-party bundle catalogue — what surfaces the platform ships at launch alongside Audit Viewer — is deferred to a product-scoping pass and recorded in a product-scope doc, not an architectural ADR.

The [Core shell vs first-party bundle reasoning](../References/Core_Shell_vs_First_Party_Bundle_Reasoning.md) reference frames the discipline this ADR operationalises for the activity bar specifically.

## Decision

### Item layers

Activity-bar items live in one of two layers:

- **Core shell items** — built into the renderer; not subject to disable/replace; present at every boot. Reserved for surfaces bundles cannot reasonably own.
- **First-party bundle items** — shipped by the platform team but loaded through the same contribution mechanism third-party bundles use. Each item is a bundle (ADR-104) running in the Bundle Host (ADR-410). Disable-able; replaceable by third-party bundles.

The default rule from the reference is: an item lives in core shell if and only if bundles cannot reasonably own it. Three flavours of "cannot": bundles depend on it; the trust boundary forbids it; or it must work before any bundle activates.

### Core-shell items the platform commits

| Item       | Why core                                                                                                  | MVP |
| ---------- | --------------------------------------------------------------------------------------------------------- | --- |
| Bundles    | The bundle manager operates on the registry that bundles register *into*. Bundles cannot be the registry.  | Yes |
| Settings   | Settings shell is the route, tree, search, persistence — the surface bundles register settings pages into. | Yes |
| Recovery   | Recovery scenarios (ADR-306) involve KEK unlock, cloud-ciphertext restoration; not bundle-grantable.       | Yes |
| Onboarding | Empty-workspace surface (per ADR-403). Present before any workspace-scoped bundle could activate.          | Yes |

Per-bundle settings *pages* are contributed by each bundle through a `configuration` contribution point; the Settings core shell renders them. Disabling a bundle removes its settings page; the Settings surface itself is not removable.

The Onboarding item is shown **only** in the empty-workspace state (per ADR-403). The other three core items are always present.

### First-party bundle items

The catalogue of first-party bundle surfaces (the practitioner-facing top-level navigation items beyond Audit Viewer) is **not committed in this ADR**. It is the subject of a separate product-scoping pass that produces a product-scope doc; downstream bundle ADRs reference that doc.

One first-party bundle item is anchored here because it is fixed by an earlier architectural commitment:

- **Audit Viewer** (`ru-soam.audit-viewer`) — committed by ADR-502 §"Visibility to the user", which places the practitioner-facing audit view in MVP scope.

All other first-party bundles arrive via the product-scoping doc when it lands. Each will be a bundle in the sense of ADR-104, running in the Bundle Host (ADR-410), contributing one activity-bar item and one view container by the contribution shape this ADR commits.

### Grouping

Items are grouped top-vs-bottom (matching VSCode):

- **Top** — workspace-scoped items (anchored: Audit Viewer; future first-party bundles per product-scope doc; third-party bundles). Present only when a workspace is loaded.
- **Bottom** — platform-level items (Bundles, Settings, Recovery; Onboarding when in empty-workspace state).

The split is a contribution-time hint (`group: 'top'` / `group: 'bottom'`), not a hard partition.

### Activation events

Each bundle declares activation events such that its activity-bar **item** (icon) appears without activating the bundle. Activation fires on:

- User clicks the activity-bar item.
- A command provided by the bundle is invoked.
- The platform reaches a state the bundle declared interest in (`onEvent:<eventName>` per ADR-105).

Item visibility comes from manifest contributions read at boot by Main (per ADR-410). Bundle code does not run until first activation event fires. Cold start stays fast regardless of installed-bundle count.

### Manifest contribution shape

A bundle contributes an activity-bar item through the `activityBar.items` contribution point:

```json
// illustrative
"contributes": {
  "activityBar.items": [
    {
      "id": "ru-soam.audit-viewer.activity",
      "icon": "$(shield-history)",
      "label": "Audit",
      "viewContainer": "ru-soam.audit-viewer.container",
      "group": "top",
      "when": "workspace.entityId"
    }
  ],
  "viewContainers": [
    {
      "id": "ru-soam.audit-viewer.container",
      "title": "Audit Viewer"
    }
  ]
}
```

Each activity-bar item targets exactly one `viewContainer.id`. Each `viewContainer` is mounted into the Primary Side Bar slot when its activity item is selected. `when`-clause shape lands in ADR-407.

The schema is illustrative; the manifest's full schema is Open Item under ADR-104 (O5).

### Cross-bundle data sharing — not committed here

When first-party bundles arrive that share domain types (a Task referencing a Patient, etc.), the question of who owns the canonical record type matters. A foundational-bundle approach (separate `core-domain` bundle owning records and exposing capabilities) trades replaceability granularity against coordination overhead.

This ADR does **not** commit a model. The question lands when the product-scoping doc names the first first-party bundle that consumes a record type owned by another bundle. Open Item O69 (kept).

### Empty-workspace activity bar

In the empty-workspace state (per ADR-403): only the bottom group (Bundles, Settings, Recovery) plus the Onboarding item appears. Workspace-scoped items — anchored Audit Viewer and any future first-party or third-party bundle items — are hidden.

### What this ADR does not commit

- The set of first-party bundles beyond the ADR-502-anchored Audit Viewer. Deferred to the product-scoping doc.
- The contents of any view container. Lives in each bundle's design.
- Canonical domain type ownership. Open Item O69.
- The manifest schema. ADR-104 (O5).
- Activity-bar styling, iconography, ordering rules within a group. Visual design.

## Consequences

### Positive

- Architectural ADR does not lock product scope. The catalogue of first-party surfaces is decided where it belongs — in a product pass — not extrapolated by architecture.
- Core/bundle split discipline is named at the activity-bar level without depending on which bundles get written.
- The four core-shell items are anchored by the "cannot reasonably be a bundle" rule, traceable individually.
- Audit Viewer is named as a first-party bundle because ADR-502 anchors it; no other first-party bundle is named, because no other is anchored.

### Negative

- Downstream ADRs (e.g., ADR-411 view hosting, ADR-407 context keys) cannot use a concrete first-party bundle as an example without circular reference. They use Audit Viewer or stay illustrative until the product-scope doc lands.
- The "empty workbench at launch" risk is real: with zero first-party bundles installed, the user sees only Bundles / Settings / Recovery / Onboarding plus Audit Viewer. The product-scoping doc must close this gap before launch.

### Neutral

- The activity bar grows additively as first-party bundles arrive — no ADR amendment needed each time.

## Considered Options

- **Commit a full first-party catalogue (Patients, Sessions, Calendar, Tasks, Library, Audit Viewer) in this ADR** — _Rejected_: extrapolates product scope into architecture, locks MVP behind unvalidated assumptions, mixes mechanism with content.
- **Defer the entire activity-bar mechanism until the catalogue is known** — _Rejected_: blocks ADR-402's contribution shape, blocks the core/bundle split discipline, leaves downstream UI ADRs without a stable mechanism reference.
- **Commit mechanism + the four core-shell items + the ADR-502-anchored Audit Viewer; defer everything else to product scope** _(chosen)_ — Names what architecture can commit, defers what only product can decide. Each named item has a citation.

## Open Items

- **O69** — Canonical domain type ownership. Foundational `ru-soam.core-domain` bundle vs per-bundle ownership. Decide when the first first-party bundle that consumes a record from another bundle lands.
- **O70** — Degraded state when a first-party bundle is disabled and another bundle holds references to its records. Applies once cross-bundle references exist.
- **O71** — Platform item discoverability — Bundles / Settings / Recovery surface in activity bar + command palette + menu. Ensure no single discoverability path.
- **O72** — Product-scope doc location and lifecycle: where the first-party bundle catalogue is recorded, who owns it, how it links back to downstream bundle ADRs.
