# Practice Activity: roster + Client/Patient record management

**ID:** ADR-505
**Status:** Draft
**Date:** 2026-05-28
**Layer:** domain
**Supersedes:** —
**Superseded by:** —
**Related:** ADR-504 (canonical record ownership), ADR-405 (activity-bar surfaces), ADR-404 (editor model), ADR-403 (workspace = Entity), ADR-407 (context keys), ADR-104 (contribution model), ADR-105 (lifecycle), ADR-410 (bundle host), ADR-301 (PHI minimization), ADR-302 (local-first store), ADR-307 (PHI lock-gate), ADR-502 (audit ledger), [Product Scope](../Product/Product_Scope.md)

## Context

The [Product Scope](../Product/Product_Scope.md) names **Practice** the central Activity:
"manage the practice roster and each person's record." ADR-504 made `ru-soam.core-domain`
the Main-resident owner of the canonical Client/Patient record and exposed the `record.*`
capability namespace, but deferred the method catalogue and each surface's feature cut to
the per-Activity pass (O197).

This ADR is the first such pass. It scopes the Practice Activity's MVP and, because
Practice is the record's primary editor, defines the first `record.patient` method
surface that ADR-504 left open. It opens the MVP "core loop" (Practice → Sessions →
Schedule); the later loop surfaces get their own 50x ADRs and consume the same record.

The data model is fixed by ADR-403: the **workspace is the Entity (the practice)**;
**Clients are records inside the workspace's Local Store** (the roster), not workspaces.
The reserved context keys `patient.activeId` / `record.active*` (ADR-403/407) already exist
for "which client is in focus." PHI-bearing UI gates on
`!workspace.kekLocked && workspace.setupComplete`.

Scope is held deliberately **lean** (data minimization, ADR-301): the smallest record that
makes a roster useful, additive growth later.

## Decision

### 1. `ru-soam.practice` — Bundle-Host Activity bundle

Practice ships as a first-party bundle (ADR-104) running in the Bundle Host (ADR-410),
contributing the ADR-405 shape:

```jsonc
// illustrative
"contributes": {
  "activityBar.items": [{
    "id": "ru-soam.practice.activity",
    "icon": "$(people)", "label": "Practice",
    "viewContainer": "ru-soam.practice.roster",
    "group": "top", "when": "workspace.entityId"
  }],
  "viewContainers": [{ "id": "ru-soam.practice.roster", "title": "Practice" }]
}
```

Activation is **lazy** (ADR-105 default): the item is visible from the manifest at boot;
bundle code activates on first click or first `record.patient` touch.

### 2. `record.patient` method surface (owned by `core-domain`, ADR-504)

These are the methods ADR-504 deferred to O197; Practice, as first consumer, drives them.
All are PHI-flagged, Main-resident in `core-domain`, and route through the base Local Store
(ADR-302). Signatures illustrative; final shape is `core-domain`'s:

- `create(input): PatientRecord`
- `get(id): PatientRecord | null`
- `list(): PatientSummary[]` — the roster (lightweight projection: id, displayName, status)
- `update(id, patch): PatientRecord`
- `setStatus(id, status)` — status transition (a thin convenience over `update`)
- `subscribe(): stream` — change events for renderer reactivity (rides `store.changed`)

The capability **encapsulates** the record: validation, invariants, and audit-on-write
live behind it (§5/§6), not in the Practice bundle.

### 3. Lean record schema (Clinical PHI)

`core-domain` owns the canonical type; MVP fields:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid | |
| `createdAt` / `updatedAt` | epoch ms | |
| `givenName` / `familyName` | string | `displayName` derived; `familyName` optional |
| `contactPhone` | string? | optional |
| `contactEmail` | string? | optional |
| `dob` | date? | optional |
| `status` | `'active' \| 'inactive' \| 'archived'` | default `active` |

The record is **Clinical class** (ADR-302): local-only, never plaintext to cloud,
envelope-encryptable for sync (ADR-303). No free-form clinical notes here — those belong to
Sessions. This is the deliberate minimum; new fields are additive (capability versioning,
O3).

### 4. UI: roster in the side bar, record in the editor area

- **Roster** — the `ru-soam.practice.roster` view container (Primary Side Bar): the client
  list (`record.patient.list()`) + a "New client" action. Status filter is deferred (§Defers).
- **Client record** — opens as an **editor input in the Editor Area** (ADR-404): a
  **form-based** editor (demographics/contact/status), not a prose `BaseEdit` editor. This
  is the platform's first non-prose editor input kind; it composes the ADR-404 generic
  container, not RuEdit/BaseEdit. Opening a client supports tabs (multiple clients open),
  matching the list→editor idiom.

### 5. Context keys + active scope

Opening a client sets, per ADR-403/407: `patient.activeId`, `record.activeKind = 'patient'`,
`record.activeId`. These are the inputs other surfaces' `when` clauses and projection
Aspects (O197) consume. Practice writes the domain `patient.*` / `record.*` namespaces it is
entitled to (ADR-106/407).

### 6. Validation + audit

- **Validation** is a contribution (ADR-104 "validation as a contribution"): the rule
  (e.g. `givenName` required, contact-format) is declared once, consumed at the Renderer for
  live feedback and **enforced in `core-domain` on write**.
- **Audit-on-write** (ADR-502): `create` / `update` / `setStatus`, and record **view**, emit
  audit entries at the `record.patient` capability boundary in `core-domain` — one site, not
  per-consumer. (This is the first real PHI surface to exercise the ledger beyond the stub.)

## Defers (named targets)

- **Documents Aspect** (client PHI files) → a later O197 pass; consumes `record.patient`.
- **Session / Assessment / Schedule / Planner linkage** → those Activities' own ADRs (506+).
- **Projection Aspects** ("this client's sessions" on Practice) → O197, once Sessions exists
  (this is the O70 residual per ADR-504).
- **Roster search / filter / sort / bulk ops / merge-dedupe / import-export** → Practice v2 (O197).
- **Custom / configurable demographic fields, address, emergency contact, pronouns,
  referral source** → post-MVP additive.
- **Client/Patient label** — already handled: configurable via `ProductConfigService`
  (ADR-106 / Product Scope); the type and namespace stay `patient`/`record`.

## Consequences

### Positive

- The first usable clinical surface; begins closing ADR-405 §Negative's "empty workbench at
  launch" risk.
- Exercises the ADR-504 ownership model end-to-end (Bundle-Host consumer → Main-resident
  PHI-flagged capability → base Local Store), validating it before Sessions/Schedule pile on.
- Establishes the **per-Activity ADR template** for 506+ (catalogue → bundle ADR → build).
- Audit + lock-gate get their first real (non-stub) PHI workout.

### Negative

- A lean schema will grow; each additive change touches the `record.patient` contract
  (versioning, O3). Accepted — additive growth beats speculative fields.
- Introduces the **first form-based editor input** in the Editor Area (ADR-404); the editor
  model has only hosted prose so far. Bounded new work, but new.
- Real PHI now flows where only a stub did — the lock-gate, audit, and at-rest paths must be
  correct, not merely wired.

### Neutral

- Practice is the record's **editor**, `core-domain` is its **owner** (ADR-504) — distinct
  roles, same capability. Disabling/replacing the Practice bundle does not remove the record.

## Considered Options

- **Roster in side bar + record as an Editor-Area editor** _(chosen)_ — matches the
  list→editor idiom; the record is a first-class openable artefact; supports multiple clients
  open as tabs; aligns with Sessions/notes, which will need the editor area.
- **Master–detail entirely in the Primary Side Bar** — _Rejected_: bypasses the editor area,
  can't open two clients, and reads worse once Sessions attaches notes to the open client.
- **Fuller intake schema now** — _Rejected_: more PHI and form surface than MVP needs; against
  ADR-301 minimization. Deferred to additive growth.
- **Practice owns the record (no `core-domain`)** — _Rejected_ in ADR-504 (couples every
  Activity to the Practice UI; record dies if Practice is disabled).

## Open Items

- **O197** — residual Practice v2 (search/filter/sort/bulk/import-export), the Documents
  Aspect pass, and the projection Aspects (O70 residual).
- **O3** — capability versioning applies to `record.patient` as the schema grows.
- The form-based editor input kind consumes ADR-404; no new contribution point is needed
  (the editor model is already a generic container). Flagged for the build brief, not an
  open item.

> Implementation is a later phase with its own brief: the `core-domain` `record.patient`
> capability + schema + audit/validation wiring, and the `ru-soam.practice` bundle (roster
> view + form editor). This ADR commits the scope only.
