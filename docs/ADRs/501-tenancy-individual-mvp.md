# Tenancy model: Individual (MVP)

**ID:** ADR-501
**Status:** Accepted
**Date:** 2026-05-13
**Supersedes:** —
**Superseded by:** —
**Related:** ADR-101, ADR-103, ADR-302, ADR-303, ADR-305, ADR-502 _(planned: audit and consent ledger)_, ADR-503 _(proposed: clinic tenancy)_

## Context

The product serves two distinct user shapes — individual practitioners and clinics. The MVP scopes to **individuals only**. Clinic tenancy is a Proposed direction (ADR-503), not committed work.

Even with only one shape in play, a tenancy model needs to exist explicitly. Cross-cutting concerns — capability scope (ADR-103), Operational data ownership (ADR-302), key model (ADR-303), credential ownership (ADR-305), audit attribution (ADR-502 planned), billing scope (when the Cloud Backend lands) — all need a defined boundary. Without one, "single user" assumptions leak into every feature and become expensive to lift when the Clinic case arrives.

This ADR commits an explicit single-tenant model that is shaped so the Clinic extension slots in without retrofitting the model itself.

## Decision

### Entity

Every install belongs to exactly one **Entity**. In the MVP, every Entity is of type **Individual**.

- An Individual Entity has exactly one practitioner: the user themselves.
- The practitioner is the entity's only principal. Admin and practitioner roles collapse into one identity.
- Operational data ownership is at the Entity level; for an Individual that is identical to "this practitioner's data".
- Clinical data ownership is the practitioner's.

The Entity boundary is named even though it is trivial in this scope. The names (entity-scoped, entity-owned, entity-audited) are what later allow ADR-503 to add Clinic Entities without rewriting the model.

### Capability scoping

Capabilities (ADR-103) are entity-scoped by default. With one entity, the scoping resolution is trivial — there is one set of scopes, applied to the one entity. The discipline is established: bundles consume entity-scoped capabilities even in MVP. They do not bind directly to a "global" or "untyped" scope.

A bundle author who writes `bindCapability('local.notes', '1.0')` in MVP gets a binding scoped to the single Individual Entity. The same line of code in a later Clinic install binds to the active Clinic Entity. The bundle does not change.

### Local Store

Single partition. The Local Store (ADR-302) holds this Entity's data, encrypted with the device's DB key (ADR-304). No per-entity sub-partitioning is needed in MVP.

The Local Store schema is **forward-compatible** with multi-entity partitioning: every record carries an `entity_id` column even in MVP, populated with the Individual Entity's ID. This costs near-nothing in storage and removes the cost of a schema migration when Clinic tenancy arrives.

### Key model

The practitioner's KEK (Strategy A or B, per ADR-303) protects all their data.

- Every Clinical record's DEK is wrapped with the single practitioner KEK. The envelope's `wrapped_dek` field carries one wrapped copy.
- The wrap-set shape is the **same** as the multi-recipient shape from ADR-303 — the set just has size one. The envelope schema does not change between MVP and Clinic tenancy.

This is the load-bearing forward-compatibility decision. The cryptographic shape stays constant; Clinic tenancy adds members to the wrap-set, not a different envelope.

### Cross-entity flows (referrals, transfers)

The only multi-tenant touchpoint in MVP is **sending clinical content to another entity** — for example, referring a patient to another practitioner, or sending a discharge summary to a clinic the practitioner does not belong to.

Per ADR-301, this flow is the dedicated, consented document sharing flow. It is **not** a tenancy merge:

- The sending practitioner exports an encrypted artefact (envelope, manifest, per ADR-306 §"Local backup file format").
- The receiving party receives it through their own platform install and decrypts using their KEK with a fresh consent step.
- The two entities remain separate. The data is delivered, not co-owned.

MVP supports the export side natively (per ADR-306 scenario 8). The receiving side is the same scenario 9 import flow. No tenancy machinery is required for the receiver to be a different entity.

### Cloud Backend representation

The Cloud Backend (when it lands; currently stubbed per ADR-101) holds each Entity as a tenant. In MVP every tenant is an Individual. The Backend's per-tenant data isolation is the same mechanism it will use later for Clinics; no schema change is anticipated at that layer.

### What MVP does not include

The following are explicitly out of scope for ADR-501. They are subject of ADR-503 (Proposed):

- Multi-practitioner entities (Clinics).
- Role taxonomy beyond "the practitioner".
- Membership lifecycle (join, leave, role change).
- Multi-recipient wrap-set management at runtime.
- Active-entity switching for multi-entity practitioners.
- Per-entity Local Store partitioning.
- Clinic-shared Flow A credentials.

The MVP code paths must not preclude these. The forward-compatibility commitments above are how that preclusion is avoided.

## Consequences

### Positive

- The tenancy boundary exists explicitly from day one. Audit, scope, ownership, and billing all reference the same word (Entity).
- The envelope shape, capability scope shape, and Local Store schema are forward-compatible with Clinic tenancy. Adding ADR-503 will not require rewriting any of them.
- MVP code is simple: one Entity, one practitioner, no churn.
- Cross-entity referrals work through existing export/import mechanics — no separate flow.

### Negative

- Slight upfront cost in MVP: bundles consume entity-scoped capabilities even though there is only one entity. Trivial but pedantic.
- The `entity_id` column carries a constant in MVP — a small redundancy that pays off when the column starts varying.

### Neutral

- The Cloud Backend stub now has a named shape for tenants (Entity-per-tenant). The stub remains stubbed; only the shape commits.

## Considered Options

- **No tenancy model in MVP** — _Rejected_: "single user" assumptions leak into every feature. Lifting them later is expensive and bug-prone.
- **Full multi-entity model in MVP** — _Rejected_: out of scope. Adds membership and role machinery that no MVP feature uses.
- **Individual-only model with explicit forward-compatibility seams** _(chosen)_ — Tenancy boundary is named; envelope, capability, and storage shapes are constant; ADR-503 adds members without changing them.

## Open Items

_(No items unique to MVP individual tenancy. Open items related to multi-entity, role taxonomy, and membership lifecycle live with ADR-503 once it advances from Proposed to Draft.)_
