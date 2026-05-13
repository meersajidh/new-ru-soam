# Tenancy model: Clinic (Proposed)

**ID:** ADR-503
**Status:** Proposed
**Date:** 2026-05-13
**Supersedes:** —
**Superseded by:** —
**Related:** ADR-101, ADR-103, ADR-302, ADR-303, ADR-305, ADR-501, ADR-502 _(planned)_

## Status note

This ADR is **Proposed**, not Draft. It captures the intended direction for multi-practitioner tenancy and the constraints that direction must honour. It does not yet commit to detailed mechanisms. ADR-501 (Individual tenancy) is the MVP commitment; this ADR exists so that ADR-501 has somewhere to point its forward-compatibility claims.

When the product roadmap pulls Clinic support in, this ADR is promoted to Draft and the open items below are resolved.

## Context

The product's second user shape is the **Clinic** (also: group, collective, partnership): multiple practitioners working under a shared organisational umbrella, with shared scheduling and billing, and — in some configurations — shared access to clinical records within the entity.

ADR-501 commits an Individual-only tenancy model for MVP and names the seams (Entity boundary, capability scoping, envelope wrap-set shape, Local Store partitioning hooks, audit attribution) so that Clinic tenancy slots in without retrofitting them. This ADR is the eventual filler.

## Intended direction

The Clinic case is implemented by adding a second Entity type alongside Individual. Same Entity boundary, same capability scoping mechanism, same envelope shape. The differences:

### Membership and roles

A Clinic Entity has one or more practitioner members. Each member's relationship to the Entity carries a **role**. Initial taxonomy (not committed):

- **Admin** — entity-level operations: billing, member management, plan changes.
- **Practitioner** — clinical work within the entity.
- **Billing-only** — financial operations without clinical access.
- **Viewer** — read-only access for auditors, supervisors.

Roles map to capability scopes (ADR-103). A practitioner who has Admin in a Clinic Entity can bind admin-scoped capabilities for that Entity; a Viewer cannot.

### Multi-entity practitioners

A practitioner may belong to multiple Entities — their own Individual Entity plus one or more Clinic Entities. At any moment one Entity is **active**; switching is an explicit user action. The active Entity determines:

- visible capability scopes,
- active KEK,
- visible Local Store partition,
- audited Entity for emitted events.

Concurrent multi-entity views are not committed in the initial Clinic shape. They are a possible follow-up.

### Multi-recipient envelope wrap

Each Clinical record owned by a Clinic Entity has its DEK wrapped **once per authorised member** — one wrapped copy per practitioner KEK. The envelope schema from ADR-303 already supports this; the wrap-set grows from size 1 (MVP) to size N.

- Joining adds the new member's KEK to relevant wrap-sets in a background re-wrap pass.
- Leaving stops adding the departing member's KEK to **future** wrap-sets.

### Departing practitioner retains access to records they accessed

Records a departing practitioner has already unwrapped remain accessible to them through their device's DEK cache. The platform does not retroactively unreach already-decrypted content; this matches real-world clinical data custody and avoids cryptographic theatre.

This is a deliberate decision and will be re-stated when this ADR is promoted to Draft. A Clinic that requires stronger leave-time guarantees must accept that they live outside the cryptographic layer (legal contracts, professional codes of conduct).

### No platform-held entity key

The Clinic itself does not have a separate platform-held KEK. Authority over Clinic-owned records is the union of practitioner-held KEKs, wrapped into the envelope. A Clinic with zero practitioners has no authority — by construction.

### Local Store partitioning

For a practitioner who is a member of multiple Entities, the Local Store partitions by Entity. Each Entity's data lives behind a per-Entity at-rest scheme (derived sub-key, or separate DB file — choice deferred). Switching active Entity unlocks that partition.

This makes cross-Entity leakage on a single device structurally impossible, not just policy-enforced.

### Cloud Backend representation

Each Entity is a separate Cloud Backend tenant — same shape as ADR-501, just with N>1 members per Clinic tenant. Billing, quotas, Operational data, audit ledger entries (ADR-502 planned) all scope to the Entity.

### Cross-entity flows

Cross-entity Clinical sharing remains the dedicated, consented document sharing flow (ADR-301 + ADR-306). Tenancy does not change that. A practitioner referring a patient from their Clinic to another Clinic exports an artefact; the receiving Clinic imports through its own consented flow. The data is delivered, not co-owned.

## Why this is captured now even though Clinic is not in MVP

ADR-501 makes forward-compatibility claims that depend on Clinic-tenancy decisions being shaped in a particular way. Without this ADR, those claims are unanchored. With it, the seams in MVP code can be reviewed against a concrete intended shape — even if that shape is not yet built.

## Open Items (anticipated)

- **O43** — Role taxonomy. Initial set above is illustrative.
- **O44** — Cross-entity referral flow detail beyond what ADR-306 provides.
- **O45** — Entity-type migration: a sole practitioner becomes a Clinic, or vice versa. Operational ownership, Clinical ownership, billing, audit all need a transition story.
- **O46** — Local Store per-Entity partitioning mechanism. Sub-keyed encryption within one DB file, separate DB files per Entity, or another scheme.
- **O47** — Concurrent multi-Entity views. Not in initial Clinic shape; revisit if pressure justifies.

These items are not active until this ADR is promoted to Draft. They are listed here so the shape of the work is visible.
