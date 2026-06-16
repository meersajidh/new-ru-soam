# PHI boundary enforced architecturally, not by UX convention

**ID:** ADR-301
**Status:** Final
**Date:** 2026-05-12
**Supersedes:** —
**Superseded by:** —
**Refined by:** ADR-313 (consented provider-PHI gradient + PHI Safety Score — narrows one carve-out for PHI to the *user's own* third-party provider; this ADR's core invariant against *our* cloud stays Final and intact)
**Related:** ADR-313

## Context

The system must guarantee Protected Health Information (PHI) never reaches the cloud.

Two broad enforcement strategies are possible:

1. Trust the practitioner to classify each outbound message correctly before it leaves the device.
2. Make incorrect placement structurally impossible by separating the channels and stores that carry PHI from those that do not.

Option 1 relies on practitioner discipline every time. A single misclick leaks PHI. The cost of leakage in a mental health context is severe — clinical, legal, and reputational.

## Decision

PHI placement is enforced structurally, not through per-message UX classification.

- The **Local Store** is the only place PHI is written. It is the canonical record of clinical content.
- **Cloud channels** (chat, scheduling) are scoped by product design to **Operational Data only**. The chat surface is not capable of carrying clinical content — there is no PHI input path into a chat flow.
- **Clinical content sharing** uses dedicated document/note sharing flows with an explicit consent step. Clinical sharing is not a general-purpose messaging feature.

The wrong thing must be structurally impossible, not merely discouraged.

## Consequences

### Positive

- A single misclick cannot leak PHI to the cloud.
- The trust boundary is visible in the architecture, not buried in UI copy.
- Future contributors inherit the constraint by reading the code, not by reading policy documents.

### Negative

- Chat cannot be used as an ad-hoc channel for clinical discussion, even when convenient.
- Clinical sharing requires its own UX surface and consent flow rather than reusing chat.
- Practitioners switching from PHI-permissive tools may experience this as friction until the dedicated flows feel native.

## Considered Options

- **Per-message classification prompt** — Intercept outbound messages, ask practitioner to classify as PHI or operational before sending. _Rejected_: enforcement relies on practitioner discipline every time; a single misclick leaks PHI to the cloud.
- **End-to-end encryption (BYOE)** — Encrypt before sending via a managed chat provider so the server sees only ciphertext. _Parked_: viable for a later phase if clinical content in chat becomes a hard requirement, but adds key management complexity (especially for the web client) and is not needed if chat is scoped narrowly.
- **Structural separation** _(chosen)_ — Chat is logistical-only by product definition. PHI never enters a chat flow. The architecture makes the wrong thing structurally impossible, not just discouraged.
