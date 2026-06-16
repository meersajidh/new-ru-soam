# Product Scope — First-Party Activity Catalogue

**Status:** Draft (living document)
**Owner:** Product
**Date:** 2026-05-28
**Layer:** domain (`ru-soam`) — see [ADR-106](../ADRs/106-domain-agnostic-base-and-domain-layer.md)
**Related:** ADR-405 (activity-bar surfaces), ADR-402 (middle-section slots), ADR-408 (panel content), ADR-404 (editor model), ADR-403 (workspace = Entity), ADR-407 (context keys), ADR-502 (audit ledger), ADR-104 (contribution model), ADR-410 (bundle host)

## Purpose

ADR-405 commits the activity-bar *mechanism* and the four core-shell items
(Bundles, Settings, Recovery, Onboarding), and anchors exactly one first-party
bundle (Audit Viewer, via ADR-502). It explicitly defers the **catalogue** of
practitioner-facing surfaces to a product-scoping pass. This document is that
catalogue.

It records **which** first-party surfaces ship, what role each takes in the
workbench, and under what names. It does **not** design them: the internal feature
scope of each surface, its data model, and its view contents are deferred to a
per-surface scoping pass + a bundle ADR (see [Lifecycle](#lifecycle--ownership) and
O197).

This is a domain-layer (`ru-soam`) artifact. The base layer (`basebench`) knows
nothing about this catalogue.

## Vocabulary: Activity and Aspect

The workbench middle section (ADR-402) has five slots: **Activity Bar · Primary Side
Bar · Secondary (Auxiliary) Side Bar · Editor Area (Work Area) · Panel**. The model
follows VS Code's intent — *"the Activity Bar is a core navigation surface"* — and
renames its mechanism (a *View Container* holds *Views*) into the functional domain:

- **Aspect** — the uniform view primitive (VS Code's *View*), renamed to the
  functional domain so design reasons in clinical-workflow terms, not technical ones.
  It is **one** thing, not a per-location kind. An Aspect plays one of **two functional
  roles by axis**, and the **slot it sits in encodes its role**:
  - **Navigation Aspect** — sits in the **Primary Side Bar**, **tightly coupled to the
    Activity Bar** (selecting an Activity opens its navigation Aspects here). The
    drill-in lists/trees you pick from; a selection opens in the **Work Area**. (e.g.
    the roster list under Practice; Explorer's Folders/Outline/Timeline in VS Code.)
  - **Contextual Aspect** — sits in the **Secondary Side Bar** or **Panel** (ADR-402 /
    ADR-408), **bound to the active Work-Area entity/action**. The things you *see
    about what's open*.
- **Activity** — a **navigation surface** item in the Activity Bar: a top-level domain
  you move *between*, not merely a container that groups children. Contributes an
  `activityBar.items` entry + a Primary Side Bar `viewContainer` (the ADR-405 shape),
  workspace-scoped (`group: 'top'`, `when: workspace.entityId`). The things you
  *navigate to*.

### Classification rule — start as Aspect, promote to Activity

Anything a practitioner *carries out* starts as an **Aspect**. It earns a top-level
Activity slot only with a **compelling case**: a distinct sub-space of actions large
enough that you navigate *to* it as its own domain. If it is small (a granular state
transition like a task `open → done`), or something you mainly *read in the context
of* another entity, it stays an Aspect.

> **The default is Aspect. "Promotion" to Activity requires justification.**

**Promotion is an abstraction lift, not a slot relocation.** A Contextual Aspect that
grows broad / important / frequent enough graduates into its own navigation domain — an
Activity with its own Primary Side Bar (and, in turn, its own Navigation Aspects). The
test is functional: the granularity of the action, the breadth that must be visible at
once, and the importance / frequency of the action — i.e. the user experience — decide
whether something stays an Aspect or has lifted to an Activity. This keeps the Activity
Bar to genuine top-level domains and avoids bloat.

**Duality.** An Activity routinely *projects* a Contextual Aspect of itself into
another context. **Sessions** is an Activity, but "this client's sessions" is a
Contextual Aspect shown on **Practice**; **Audit Viewer** is an Activity (anchored),
but "audit entries for this record" is a Contextual Aspect of any record. A Contextual
Aspect is often just an Activity's data scoped to the active entity, rendered in the
Secondary Side Bar or Panel.

## MVP Activity catalogue

Top-level domains (Activity Bar → Primary Side Bar). All MVP *catalogue*; per the
product decision, each Activity's internal feature scope is cut to an MVP slice in a
later per-Activity pass (O197) — naming an Activity here does not commit its full
feature set.

| Activity | Bundle id | What the practitioner does | Owns / references |
| --- | --- | --- | --- |
| **Practice** | `ru-soam.practice` | Manage the practice roster and each person's record (demographics, contact, status). The central entity surface. Scoped in [ADR-505](../ADRs/505-practice-activity.md). | Primary **editor** of the Client/Patient record; the canonical record is **owned** by `core-domain` (ADR-504, see [O69](#cross-surface-data--o69)) |
| **Sessions** | `ru-soam.sessions` | The clinical encounter spine: owns the **Client Meeting** (the client appointment seen clinically — [ADR-508](../ADRs/508-sessions-client-meeting.md)) + progress notes, transcriptions, reports (composes `RuEdit`/ADR-414 + note types/ADR-404). Includes online meetings via a `MeetingProvider` port (Meet/Zoom). | **owns** Client Meeting; refs Client/Patient |
| **Schedule** | `ru-soam.schedule` | View and book on the practitioner's calendar — a **storeless UI over a calendar provider** ([ADR-507](../ADRs/507-schedule-activity.md), takes up ADR-310). The provider (Google now; MS/Apple/cal.com later) is the **master of events**; the clinical subset is persisted by Sessions. | refs provider (master); refs Client/Patient via Sessions |
| **Assessments** | `ru-soam.assessments` | Administer standardized measures (e.g. PHQ-9, GAD-7) and track outcomes over time. | refs Client/Patient (± Session) |
| **Planner** | `ru-soam.planner` | Plan forward across horizons: near-term tasks/follow-ups **and** longer-horizon treatment goals/objectives (the former Tasks + Treatment Plans, merged). | refs Client/Patient |
| **Catalog** | `ru-soam.catalog` | Browse and maintain reusable, non-client assets: templates, worksheets, psychoeducation materials, and clinical snippet *content* (domain content for the base snippet engine, ADR-416 / ADR-106). | — (reusable; not client-bound) |
| **Audit Viewer** | `ru-soam.audit-viewer` | Review the practitioner-facing audit/consent log. Anchored by ADR-502; not deferred. Note: also projects as an Aspect ("audit for this record"). | refs audit ledger |

Bottom-group platform items (Bundles, Settings, Recovery, Onboarding) are core-shell,
not Activities — owned by ADR-405, out of this catalogue.

**Schedule / Sessions split (ADR-507 / ADR-508, 2026-06-16).** Scheduling is two Activities, not
one: **Schedule** is a storeless UI over a calendar *provider* (the provider is the master of events);
**Sessions** owns the persisted **Client Meeting** — the clinical subset of the calendar, discovered
either app-side or provider-side (Calendly/Google) and resolved to a roster client. A client appointment
is a *link*, not a move: the event stays on the provider's calendar and gains a Client Meeting in Sessions.

**PHI Safety Score (ADR-313).** Because practitioners arrive with client PHI already in their calendar
provider, the PHI boundary is treated as a *destination*: absolute against **our** cloud (ADR-301,
unchanged), and a consented, audited, **default-off**, score-driven **interim** gradient against the
**user's own** provider. The **PHI Safety Score** is the first-class, gradient-closing engine that
measures and nudges that migration. Scale design = O483.

## Aspects (Contextual)

**Contextual Aspects** (Secondary Side Bar / Panel), bound to the active Work-Area
entity/action. Per the classification rule, most contextual/dimensional information
lands here rather than on the Activity Bar. (Navigation Aspects — the Primary Side Bar
lists each Activity owns — are scoped inside that Activity's own bundle ADR, not
catalogued here.)

| Aspect | Role | Bound to | Notes |
| --- | --- | --- | --- |
| **Documents** | Client-bound PHI files: consent forms, releases, uploads. | active Client/Patient (and their Sessions) | Deliberately *not* an Activity and *not* part of Catalog — Catalog is reusable non-client assets; Documents are per-client PHI instances. Surfaced in the Secondary Side Bar / Panel when a client is open. Document-type ownership TBD (O197); consumes the canonical record via `record.*` (ADR-504). |

Further Aspects (e.g. this-client's sessions, assessment history, related audit
entries, client-scoped tasks) are identified during per-Activity scoping (O197) as
projections of the Activities above. Not enumerated here to avoid over-designing.

## Terminology: Client vs Patient

The person receiving care is labelled **configurably**: the practitioner chooses
"Client" or "Patient" in Settings. This is a domain product-configuration value
(surfaced through the `ProductConfigService` seam, ADR-106) consumed by every surface.

- The choice is **UI copy only**. The reserved context-key namespace stays
  `patient.*` (ADR-407) regardless, and the persisted record type is unchanged.
- Default label: **Client** (field-standard for mental-health/therapy practice).

## Cross-surface data & O69

Almost every Activity and the Documents Aspect references the Client/Patient record
(Sessions, Schedule, Assessments, Planner, Documents all do). Cross-bundle record
sharing is therefore pervasive from MVP day one — this triggers **O69** (canonical
domain-type ownership), which ADR-405 left open until "the first first-party bundle
that consumes a record owned by another bundle" landed. That condition is now met.

**Ratified in [ADR-504](../ADRs/504-canonical-domain-record-ownership.md).** A
foundational domain component — `ru-soam.core-domain` — owns the canonical
Client/Patient record (and other shared types as they appear) and exposes it as the
`record.*` capability namespace (first member `record.patient`). Activity/Aspect
surfaces consume through that capability rather than each re-declaring the type.
Rationale: with this many cross-referencing surfaces, per-bundle ownership produces a
reference tangle and an undefined degraded state when an owning bundle is disabled (O70).

ADR-504 refines this: `core-domain` is a **Main-resident** domain service (PHI-flagged,
on the base Local Store), **not** a Bundle-Host bundle — keeping PHI plaintext out of the
third-party-trust process (ADR-410). The user-facing roster UI remains the separate
**Practice** Activity, which consumes `record.*` rather than owning the record.

## Lifecycle & ownership

- **This doc is the catalogue source of truth.** It is product-owned and living: new
  surfaces are added here first (defaulting to Aspect, promoted to Activity only on a
  compelling case), then designed.
- **Per-surface design lives in a bundle ADR**, not here. Each Activity (and any
  Aspect substantial enough to warrant it) gets a domain-range ADR (500–599) covering
  its data model, view contents, and feature scope, referencing this catalogue. The
  per-surface MVP feature cut + the bundle-ADR series is tracked as **O197**.
- **Downstream references point here**, not the other way around: a bundle ADR cites
  this doc for "why this surface exists / what it's called / Activity vs Aspect"; this
  doc does not depend on any bundle ADR.
- The activity bar grows additively (ADR-405) — adding a future Activity needs a row
  here + a bundle ADR, no amendment to ADR-405.

## Open items

- **O69** — canonical domain-type ownership. **Resolved by [ADR-504](../ADRs/504-canonical-domain-record-ownership.md):**
  `ru-soam.core-domain` Main-resident service owns the record, exposes `record.*`.
- **O70** — degraded state when an owning bundle is disabled while others hold refs.
  **Resolved by design in ADR-504** (record is Main-resident always-on, not a peer
  bundle). Residual cross-Activity projection fallbacks → O197.
- **O197** — per-surface MVP feature scoping + the per-bundle ADR series, including
  which projected Aspects each Activity warrants. Done per surface ahead of building it.
- **O72** — resolved by this document (catalogue location, vocabulary, lifecycle).
- **O421** — **Billing** is a *candidate* owning domain raised by the Practice functional-design
  journal (self-pay payments/receipts; Practice projects payment status read-only). **Not** in the
  catalogue above until it passes the ADR-405 promotion test (Activity-Bar slot vs other
  placement) and gets a bundle ADR. Tracked, not committed. **See proposed amendment A1 below**
  (the Practice IA recommends confirming it, else the Payment projection has no owner).

## Amendments raised by the Practice IA (2026-06-05) — proposed, debate before promoting

Raised by `docs/Activities/practice/practice-information-architecture.md` (§2) and ADR-505
Amendment 4. Recorded here as proposals; promote into the catalogue above once decided.

- **A1 — Confirm Billing as an MVP Activity (resolve O421).** The Client Overview projects a
  Payment card in all three view modes; a read-only projection needs a real owner. Smallest viable
  Billing = a per-client payments ledger (self-pay, no insurance, ADR-0013). Until confirmed, the
  Payment card stays permanently **Mock**. *Decision pending.*
- **A2 — Lifecycle stage is a cross-Activity ambient facet.** Stage stays **owned** by
  `record.patient` (ADR-505 Am3) but is exposed on the **ambient focused-client** context
  (ADR-0009 / ADR-505 §4.2) so sibling Activities (Sessions, Schedule) can read "this client is
  `intake_in_progress` vs `active`." Read-only exposure, not new ownership.
- **A3 — Overview "view mode" (dense / focused / timeline) is a first-class preference axis**,
  analogous to the Activity-Bar density pref — renderer-only, persisted, no Activity-Bar change.
  Tracked O-VIEWMODES.
