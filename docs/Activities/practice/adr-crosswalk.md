# Practice design journal ↔ canonical ADR crosswalk

**Status:** Living
**Date:** 2026-05-29
**Owner:** Architecture

The Practice Activity is being designed *functionally, from lived clinical workflow* in a
running design conversation. That conversation keeps its **own** decision log,
[`practice-adr-log.md`](practice-adr-log.md) (ADR-0001…0015), plus a synthesis
([`practice-functional-design-draft.md`](practice-functional-design-draft.md)) and a data-model
proposal ([`practice-data-model-codex.md`](practice-data-model-codex.md)).

Those `ADR-00NN` ids are a **design-journal numbering**, *not* the repo's canonical ADR
registry (three-digit, range-based — see [`docs/README.md`](../../README.md)). This file is the
continuity seam: it maps each journal decision onto the canonical surface that carries it, so
nothing drifts or is lost as the design is promoted.

## Method (agreed): journal + promote

- `docs/Activities/practice/` is the **living design journal** — the place the conversation
  happens and open threads accumulate.
- **Settled** journal decisions are **promoted** into canonical authority (ADRs / Product Scope /
  Open Items). Settled-only lands in ADR bodies; **OPEN** threads stay journal + tracked as Open
  Items, never promoted to ADR text prematurely.
- This crosswalk is updated whenever a journal decision is promoted or a new one settles.

## Terminology reconciliation (critical — read first)

The online design conversation had **no access to the approved ADRs**, so it used **"owner" /
"Practice-owned"** in a *residency-agnostic* sense: it means **ownership of the data model and its
CRUD capabilities at the domain layer**, *not* which process stores the bytes.

Mapped onto the committed architecture:

- **Domain data-authority is Main-resident.** [ADR-504](../../ADRs/504-canonical-domain-record-ownership.md):
  `ru-soam.core-domain` owns the canonical Client/Patient record + the `record.*` capability
  namespace as a **Main-resident, PHI-flagged** service on the base Local Store. PHI plaintext
  **never enters the Bundle Host** (ADR-410, third-party-trust zone).
- **Domain UI features ship as Bundle-Host bundles.** The `ru-soam.practice` bundle is the
  record's **editor / consumer UI**, running in the Bundle Host. It owns **no PHI storage**; it
  binds `record.*` capabilities.
- So journal **"Practice owns X"** → **"the Practice *domain* owns the X data model + its CRUD
  capability"** → realized as a **Main-resident `record.*` capability member** that the Practice
  *bundle* consumes. There is **no architectural conflict** — only an overloaded word.

The single residual *design* question (not residency, which is settled) is ownership
**granularity** between `core-domain` and Practice — see **O420**.

## Crosswalk

| Journal ADR | Decision (short) | Canonical landing | Status |
| --- | --- | --- | --- |
| 0001 | Active-client context + Overview-plus-artifacts (Model B): select client → active-client context + Client Overview editor tab; finer artifacts are own tabs; Contextual Aspects bind to client | ADR-505 Amendment 1 (target UI); mechanism = ADR-403/404/407 | Promoted |
| 0002 | Roster *arrangement* (sort/group/filter/search) vs *membership* (own Aspect) | ADR-505 Amendment 1 (Navigation Aspect model) | Promoted |
| 0003 | Record is a function of the client, not the navigation path (deterministic) | ADR-505 Amendment 1; context keys ADR-407 | Promoted |
| 0004 | A lens *primes* the entry-point; never mutates the record | ADR-505 Amendment 1; ADR-407 priming | Promoted |
| 0005 | "Agenda" (Recent/Today/Upcoming) = read/launch projection of Schedule | ADR-505 Amendment 1; spine = ADR-504 O70-residual / O197 | Promoted |
| 0006 | Four Navigation Aspects: **Roster · Agenda · Attention · Intake** | ADR-505 Amendment 1 | Promoted |
| 0007 | Cross-activity model: projection (read) / navigation-launch (forbidden) / command (delegated minor write) / overlay (Practice-owned) | ADR-505 Amendment 1; consistent w/ ADR-504 §5 | Promoted |
| 0008 | **Sessions is a separate Activity**; Practice reads notes as a read-only projection | Product_Scope catalogue (Sessions row) + ADR-505 Amendment 1; Sessions design → ADR-506 (future) | Promoted |
| 0009 | Shell navigation law + global ambient focused-client across Activities | ADR-403/407 (existing mechanism) + ADR-505 Amendment 1 | Promoted (mechanism pre-existing) |
| 0010 | Writes onto a projection = Practice-owned **overlays**, never owner-writes | ADR-505 Amendment 1; ownership granularity → **O420** | Promoted (granularity open) |
| 0011 | Spine resolved: all function-domains stay Activities; Practice is the client-centric reader/launcher | Product_Scope "Duality" + catalogue; ADR-504 O70-residual / O197 | Promoted |
| 0012 | India MVP regulatory frame (MHA 2017 + DPDP 2023 + Telemedicine 2020); local-first = compliance posture | ADR-505 Amendment 1 (grounding); aligns ADR-301/302/501/502 | Promoted (as grounding) |
| 0013 | MVP exclusions (insurance/ABDM/multi-practitioner/client portal) | ADR-505 Amendment 1; aligns ADR-501/513-scope | Promoted |
| 0014 | Consent objects: *structured facts* in **Consent & Legal** aspect; *signed PDFs* in **Documents**; cross-referenced | ADR-505 Amendment 1 (target aspect set); data model → **O420**; Documents Aspect → O197 | Promoted (design open) |
| 0015 | Payments/receipts owned by **Billing**; Practice projects status read-only | **O421** (Billing candidate owning domain + promotion test); Product_Scope note | Tracked (not yet a committed Activity) |

## Open threads (journal) → canonical Open Items

The journal's still-OPEN design threads are tracked canonically so they are not lost:

- **O419** — Practice clinical-aspect design cluster: Risk/Safety keystone (MHA §23 convergence),
  lifecycle/status model (intake→active→on-hold→discharged), Intake pipeline stages, Attention
  obligation set, note-privacy split (progress vs process notes). References O197.
- **O420** — Adjunct-record ownership granularity + residency: core-domain owns the clinical
  adjuncts (profile / circle / consent / lifecycle / risk / document) as `record.*` members
  (Main-resident, per ADR-504); Practice owns **overlays** (its own annotation, ADR-0010). Confirm
  member split + which sit under `record.patient` vs sibling capabilities. References ADR-504/505.
- **O421** — Billing as candidate owning domain (journal 0015) + the ADR-405 promotion test
  (Activity-Bar slot vs other placement). References Product_Scope / O197.

## Build phasing (so the prototype isn't mistaken for slice 1)

The [prototype](practice-proto-handoff/) is the **destination**, not the next commit. The rich
Overview composes projections from Sessions / Schedule / Assessments / Planner / Billing — **none
built yet** — and several aspects (Risk, Intake, lifecycle) are **still OPEN** design.

- **Slice 1 (committed, ADR-505 lean):** roster Navigation Aspect + Client record as a form
  editor input + Overview *frame* with projections stubbed (empty states). No new tables beyond
  `patients` (migration v4).
- **Iterate:** close O419 design threads; add adjunct tables + `record.*` members per O420; fill
  projection Aspects as each owning Activity ships (506+).
