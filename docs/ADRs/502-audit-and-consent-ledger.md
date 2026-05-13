# Audit and consent ledger

**ID:** ADR-502
**Status:** Accepted
**Date:** 2026-05-13
**Supersedes:** —
**Superseded by:** —
**Related:** ADR-101, ADR-103, ADR-301, ADR-302, ADR-303, ADR-304, ADR-305, ADR-306, ADR-501, ADR-503

## Context

Multiple prior ADRs commit to emitting audit events but do not define the ledger they emit into:

- ADR-303 commits that every sync push and key operation emits an audit event, before encryption.
- ADR-306 commits that every recovery flow step emits an audit event.
- ADR-304 commits that credential operations emit audit events.
- ADR-301 implies that clinical content access should be traceable.
- ADR-501 names the Entity as the unit of audit scope.

Without a defined ledger, these emissions become scattered log files, each with its own format, retention, and visibility. The point of auditing — being able to reconstruct who did what to which clinical artefact when — is lost the moment those concerns diverge.

A mental-health workbench carries audit weight that exceeds standard application logging:

- Clinical record access is professionally and legally meaningful.
- Consent decisions are not log lines — they are durable records that the platform may have to produce on demand.
- PHI access patterns are themselves sensitive (the audit content can be PHI-adjacent).

The ledger must therefore be a first-class, tamper-evident, class-aware store, not a logging library wrapped in a struct.

## Decision

The platform adopts a unified **audit and consent ledger**: an append-only event log with class-aware storage, tamper evidence, and explicit consent semantics.

### Scope

Ledger entries are emitted for:

- **Clinical record access** — read, write, sync push, sync pull, export, import. Includes record identifier and operation, not record content.
- **Key operations** — KEK wrap, unwrap, rotation, migration step boundaries (per ADR-303).
- **Recovery flows** — capability invocations from ADR-306 (paired-session bootstrap, restore-from-cloud, restore-from-backup, etc.).
- **Credential operations** — set, get, delete for any entry in the CredentialStore (per ADR-304). Records that an operation happened; never the credential value.
- **Consent decisions** — every explicit consent or revocation the user gives (cloud sync, KEK strategy, third-party provider, clinical sharing, etc.).
- **PHI-scoped capability use** — when a bundle invokes a PHI-touching capability. Binding alone is not audited (binds may be frequent and uninformative); only the actual use of the capability against PHI generates a ledger entry.
- **Membership changes** — when Clinic tenancy lands (ADR-503).

Ledger entries are emitted at the point closest to the operation, **before** any encryption that would otherwise obscure context. Emission is the responsibility of the capability or service performing the operation, not a wrapper layer.

### What never goes in the ledger

- **PHI plaintext content.** The ledger may carry record identifiers and operation types; it does not carry note bodies, transcript text, or anything that would smuggle PHI into the audit layer.
- **Credential plaintext.** A "set credential" entry records that a credential was set, not the value.
- **Free-form user text.** Consent records use enumerated kinds, not arbitrary strings; arbitrary strings invite leakage.

### Storage: two-tier, class-aware

The ledger has two homes that mirror the Operational/Clinical split:

#### Tier 1 — Device-local ledger (rich)

- Lives in the Local Store (ADR-302) under at-rest encryption.
- Holds the full, rich entry: operation type, record identifier, principal, device identifier, timestamp, ledger-entry hash chain.
- Carries entries for both Clinical-touching operations and Operational events.

#### Tier 2 — Cloud-mirrored ledger (Operational subset)

- Lives in the Cloud Backend (when it lands; stubbed per ADR-101) under standard Operational data protection.
- Holds only entries that are **safe to expose to the cloud in plaintext**: Operational-class events, consent records, billing-relevant counts, key-operation metadata (without keys), aggregate access counts.
- Does **not** mirror Clinical-record-access entries from Tier 1 in identifying form. Clinical-access entries reach the cloud (if at all) only via the same envelope encryption as the data itself (ADR-303). The cloud sees these as ciphertext.

The class split applies: a ledger entry is itself Operational or Clinical-adjacent, and that classification gates whether it reaches the cloud in plaintext.

### Tamper evidence

Local ledger entries are chained: each entry includes the hash of the previous entry's payload. A missing or modified entry breaks the chain at a detectable point. Periodic chain checkpoints are anchored — initial mechanism: the latest chain head is included in the next cloud-mirrored ledger emission, so the cloud-side ledger acts as a witness that local chains cannot retroactively be reordered without detection.

This is **tamper evidence**, not **tamper prevention**. A practitioner with admin access to their own device can still re-create a ledger from scratch; the platform makes such fabrication detectable by external review, not impossible.

### Consent records

Consent decisions are a distinct **kind** of ledger entry, with stronger guarantees:

- Every consent decision (cloud sync enable, KEK strategy choice, provider activation, clinical sharing approval, etc.) emits a Consent entry.
- The entry includes the consent kind (enumerated), the user's identifier within the Entity, a timestamp, and a hash of the consent UI text shown at the time. The text hash makes the specific wording reproducible later.
- Consent revocations are themselves Consent entries with kind `revoke`. The ledger always retains both the original consent and the revocation; revocation is additive, not destructive.
- Consent entries are cloud-mirrored (Tier 2) because they are needed for legal/compliance review and are themselves Operational in nature.

### Visibility to the user

The practitioner has a view that lets them browse their own ledger. The view supports filtering by record, by operation kind, by time. The view is part of the workbench shell, not a developer-only artefact. It is in MVP scope (per ADR-501), so the practitioner sees their audit from day one. Clinic-level audit views (when ADR-503 lands) follow the same shape, scoped to the Entity, with role-gated access.

### Retention

Default retention is **long** — clinical records have years-long relevance and so does the audit of access to them. Specific retention values are an Open Item; the principle is "long enough that the ledger is useful when needed", not "shortest that satisfies storage budget".

Retention applies to both tiers. Local Store can prune chain segments older than the retention window once their cloud-mirrored counterparts (Tier 2) have anchored them; aggressive pruning is not the default.

### Export for compliance review

A user (or, with Clinic tenancy, an Admin) may export a ledger range for external compliance review. The export is a structured artefact (JSON or similar) containing the entries with their hash chain. The platform signs the export so the receiving party can verify integrity.

A ledger export is classified as **Operational with a sensitivity tag** — it reveals PHI access patterns but contains no PHI plaintext. Its delivery channel is the normal Operational-export path (e.g., download from the workbench, or email to a compliance reviewer the user nominates), gated by an explicit consent prompt that surfaces the sensitivity. It is **not** routed through ADR-301's dedicated Clinical sharing flow, which is for content; the ledger is about access. The sensitivity tag is what causes the consent prompt and the audit emission for the export action itself.

### Emission discipline

Audit emission is the responsibility of the operation site, not a cross-cutting wrapper. The platform provides a typed emission API; callers invoke it before performing the operation (so a failure to emit blocks the operation, not the reverse). This makes silent unaudited operations a compile-time omission, not a runtime drift.

## Consequences

### Positive

- One ledger; one shape across all audited operations.
- Class-aware storage preserves the PHI boundary even in the audit layer.
- Tamper evidence is real: a chain break is detectable, anchored periodically against the cloud as witness.
- Consent decisions are first-class durable records with reproducible wording.
- The user sees their own ledger from day one; auditing is not opaque to them.
- Capability use is audited, not capability bind; the ledger stays meaningful instead of noisy.

### Negative

- Real engineering work: chain construction, anchor mechanism, two-tier storage, emission discipline, browser view.
- "Emit before operation" discipline is easy to forget in new code. Lint may help (TBD).
- Long retention has storage implications, especially for frequent events. Sampling or aggregation may be needed for some event kinds.

### Neutral

- The ledger grows linearly with use. This is intentional; growth is the property that makes audit useful.

## Considered Options

- **No ledger; standard application logging** — _Rejected_: logs are not durable, not tamper-evident, not class-aware, not consent-bearing.
- **Cloud-only audit ledger** — _Rejected_: the cloud sees ciphertext for Clinical data; it cannot audit operation context without the data being decryptable to it, which violates ADR-301.
- **Local-only audit ledger** — _Rejected_: a device loss erases the ledger. Audit needs durability beyond the device.
- **Bind-and-use audit (every capability bind logged)** — _Rejected_: produces noise that drowns the signal. Audit only at actual PHI-touching use.
- **Two-tier, class-aware, hash-chained, consent-bearing ledger with use-only audit** _(chosen)_ — Matches the class split; the audit layer inherits the platform's PHI discipline; entries stay informative.

## Open Items

- **O48** — Hash-chain mechanism: simple linked hashes, Merkle tree per anchor window, or signed-batch scheme. Performance vs verifiability trade-off.
- **O49** — Retention policy values per event kind. High-frequency events may justify aggregation or sampling; clinical-access events likely retain in full.
- **O50** — Ledger export format. JSON, JSON-LD, a domain-specific schema. Must round-trip through external compliance reviewers.
- **O51** — Emission lint rule. Catch new PHI-touching capability handlers that omit ledger emission. Similar shape to other lint commitments (O13, O21).
- **O52** — Consent UI text hashing: capture the exact wording shown at the moment of consent. Mechanism (rendered-text hash, source-template hash) and storage location.
