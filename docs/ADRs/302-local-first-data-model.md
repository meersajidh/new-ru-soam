# Local-first data model: Clinical local-only, Operational cloud-readable

**ID:** ADR-302
**Status:** Accepted
**Date:** 2026-05-13
**Supersedes:** —
**Superseded by:** —
**Related:** ADR-101, ADR-103, ADR-301, ADR-303 _(planned: PHI sync and backup via E2EE)_, ADR-304 _(planned: credential storage in OS keychain)_

## Context

ADR-301 commits the platform to keeping PHI plaintext out of cloud channels through structural separation. ADR-301 says **what** must be true at the channel level; this ADR settles **where** data lives, **what** is eligible to leave the device, and **how** writes flow through the system. Without this, "structural separation" decays into "we mostly don't send PHI".

The platform also has legitimate cloud needs: account state, billing, scheduling logistics, team coordination, audit summaries. These must reach the Cloud Backend for multi-device and multi-entity (clinic) work to function at all.

A separate question that has surfaced through discussion is the **read/write topology** itself: where reads come from, where writes land first, how the cloud relates to the device's view of the world. The platform commits to a **local-first** model for both data classes. The class-level difference is whether cloud sync is allowed for that class, not whether the local store is the source of truth.

## Decision

### Two data classes

The platform recognises two data classes. Every data type belongs to exactly one.

#### Class 1 — Clinical (PHI)

Records that constitute or describe a patient's health information: session notes, assessments, intake forms, attached documents, identifiers tied to clinical context, anything that on inspection reveals a clinical relationship.

- **Cloud plaintext transmission:** not eligible.
- **Multi-device cross-flow:** subject of ADR-303 (E2EE platform feature, LAN P2P extension). PHI moves between devices only as ciphertext that the Cloud Backend cannot read.

#### Class 2 — Operational

Records that describe how the workbench is used, not what the clinical work is: account settings, calendar slots (without clinical content), chat logistics, team membership, billing records, audit metadata, feature preferences.

- **Cloud plaintext transmission:** eligible. The Cloud Backend must read Operational data to act on it (calendars, billing, team coordination).
- **Multi-device cross-flow:** standard plaintext-over-TLS sync to the Cloud Backend; Cloud Backend is the convergence point.

### Local-first for both classes

The **Local Store on the device is the source of truth** for both classes, regardless of cloud sync eligibility.

- **All writes go to the Local Store first.** The renderer reflects the change immediately (optimistic update).
- **Sync-eligible writes are durably enqueued** to a sync queue at the same time as they land in the Local Store. The queue is the WAL analogue: it survives restart, and the sync worker drains it asynchronously.
- **The Cloud Backend is the cross-device convergence point**, not the read path. Reads always come from the local store.
- **Cross-device updates** arrive via the sync worker pulling from the cloud, applying to the local store, and emitting change events.

The Local Store is the authoritative read source. The cloud is one input to the convergence machinery, not the answer the UI waits on.

The general pattern is documented separately in [Local-first pattern (reference)](../References/Local_First_Pattern.md).

### Class-level difference is the sync worker

Both classes share the local-first topology. They differ only in whether the sync worker is allowed to run for the class:

- **Clinical:** plaintext sync worker disabled. The encrypted-envelope sync worker described in ADR-303 may run if the user has consented to cloud backup/sync.
- **Operational:** plaintext sync worker enabled.

Class is a property of the data type, fixed at design time. A record cannot change class per-row. Mixed types are not allowed; a type that holds both clinical and operational fields is split into two types with clean ownership.

### Local Store

The Local Store is owned by the Main process. The Renderer reaches it only through capabilities (ADR-103). No other path exists.

#### Technology

- **Engine:** SQLite via `better-sqlite3` (or a SQLCipher-aware wrapper around it).
- **At-rest encryption:** transparent whole-database encryption (SQLCipher-style). The database file on disk is always ciphertext.
- **Key sourcing:** the database encryption key is fetched at Main startup from the OS keychain (ADR-304 planned). The application has no plaintext key material in source or build artefacts.

The exact wrapper choice (`better-sqlite3-multi-cipher`, a SQLCipher binding, or another) is implementation detail (Open Item O22).

#### Relationship to the envelope encryption in ADR-303

At-rest encryption protects the database file. ADR-303 covers per-record envelope encryption (DEK wrapped by KEK) used for cloud-bound ciphertext. The two are layered: every Clinical row is wrapped in its envelope **and** sits inside the encrypted database file. Operational rows are not envelope-encrypted but still benefit from the at-rest layer.

#### Residency split — the Local Store is two stores (Amended 2026-06-05, O452)

_Amended 2026-06-05 (O452):_ the original "one Local Store" model held only Operational data (prefs). Once Clinical PHI landed in the same file (ADR-505/506 patient tables), the store's at-rest posture became insufficient: its key (`local-store-db-key`) is `raw` in the OS keychain (deliberate per ADR-307 O307f, so Main can open prefs **before** unlock), and the file is **never closed on lock** (Operational data must stay readable while locked). Net result before this amendment: PHI-at-rest was protected by the OS keyring **only** — the passphrase/KEK added zero at-rest protection for PHI, and locking the app did not gate it.

The Local Store is therefore split by **residency class**, mechanically realised as two physical SQLite databases per workspace:

| Residency | Holds | Key | Open while locked? |
|-----------|-------|-----|--------------------|
| **`operational`** (default) | Operational data (prefs, workspace settings, the audit ledger) | `local-store-db-key`, `raw` in keychain (O307f unchanged) | Yes — bootstrap + audit need it |
| **`protected`** | Clinical PHI | random per-workspace key, **KEK-wrapped** (ADR-307) | **No** — opened on unlock, closed on relock/auto-lock |

Mapping to the two data classes is fixed: **Clinical → `protected`**, **Operational → `operational`**. The `protected` store is opened only while the workspace is unlocked (its key is unwrappable only with the in-memory KEK), so locking the app genuinely gates PHI at rest, and same-user code reading a locked/cold workspace cannot decrypt PHI.

**Base/domain boundary (ADR-106).** The two-store mechanism and the residency classes are **base** — base provides a generic "KEK-gated protected store" with no knowledge of *what* a domain keeps there. The decision that a particular table holds PHI and therefore needs `protected` residency is a **domain** declaration: a bundle's manifest tags its owned tables `residency: 'protected'`. Base never names "PHI". A domain with no such need declares nothing and gets only the `operational` store; the `protected` store and its KEK-wrapped key are **provisioned lazily**, only when at least one active migration set declares `protected` residency.

**Audit ledger stays `operational`.** The `audit_log` table remains in the `operational` store so it is readable and appendable while locked, and so a PHI write (which emits an audit entry) does not require the audit ledger to be in the locked store. This holds the existing invariant that **audit metadata is PHI-free** (record identifiers are opaque UUIDs; event/detail fields carry no clinical content — see ADR-502 / §Audit classification). A bundle must not place PHI in an audit `detail` field.

### Renderer view

The Renderer does not see store boundaries. It binds capabilities; capabilities resolve to Local Store reads (always) and writes (always; sync happens behind the scenes). The Renderer is ignorant of the Cloud Backend's existence (ADR-103).

### Operational side-door

A type marked Operational must not become a place to smuggle clinical content under a logistics label. The classification is reviewed at type design. A note titled "session-prep checklist" that contains clinical observations is mis-classified.

The mechanism for enforcing this is partly social (type review) and partly mechanical (Operational types should not have free-form text fields large enough to encode clinical content invisibly). The exact policy depends on the user terms-of-service and consent framing — see Open Item O25.

### Audit classification

Audit records — who accessed what PHI, when — may themselves carry sensitive references. Their classification (Clinical vs Operational, what may leave the device) is deferred to ADR-502 (audit and consent ledger).

## Consequences

### Positive

- Single read/write topology across the platform. The renderer never branches on "is this offline-cacheable", "is this synced", "is this canonical here or there". Reads come from local; writes go to local; sync happens behind the scenes.
- Offline support is the default, not a feature. The sync worker is what is optional, not the local store.
- "Does this data leave the device in plaintext?" has a single answer per type, not per record.
- The Local Store has one owner (Main), one access path (capabilities), one trust scope (local-privileged), and one at-rest protection (encrypted DB file).
- The architecture matches HIPAA-style audit questions: where does this category live, what authority touches it.

### Negative

- Sync queue durability, replay-on-restart, and conflict resolution are real engineering work. Out of scope here, but they show up in ADR-303 and Open Item O23.
- The "side-door" mis-classification risk is real and depends on policy decisions outside engineering. Tracked in O25.
- Splitting a tempting mixed type costs design effort up front. The alternative — letting it stay mixed — is the failure mode this ADR exists to prevent.

### Neutral

- Both classes share infrastructure: Local Store, sync queue, conflict machinery. The class flag determines which sync transport may carry a write, not whether the topology applies.

## Considered Options

- **Single store with field-level classification** — _Rejected_: every read becomes a redaction problem. Easy to leak. Equivalent at the data layer to the per-message classification rejected in ADR-301.
- **Cloud-canonical Operational with local cache** — _Rejected as framing_: makes Operational reads dependent on cloud availability and forces two read topologies in the renderer. Local-first across both classes is cleaner.
- **All-local, no cloud sync at all** — _Rejected_: blocks multi-device and multi-entity (clinic) work the product needs for Operational state.
- **All-cloud with end-to-end encryption (no local-first)** — _Rejected_: makes the application unusable offline; loses the latency wins of local reads; loses single-source-of-truth on the device.
- **Local-first for both classes; cloud-eligible by type** _(chosen)_ — Single topology, single read path, single policy knob per type. Composes with ADR-303 (encrypted envelopes for Clinical sync) without changing the model.

## Open Items

- **O22** — Local Store wrapper choice. Direction committed: SQLite + transparent at-rest encryption + key from OS keychain. Specific wrapper (`better-sqlite3-multi-cipher` vs SQLCipher binding vs other) deferred to implementation.
- **O23** — Operational sync conflict-resolution mechanism (CRDT, OT, snapshotted last-write-wins, custom). Trade-offs depend on collaboration semantics needed for clinic-level features.
- **O24** — PHI export/import flow shape (ADR-301's "dedicated document sharing flow"). May be absorbed into ADR-303's envelope mechanics or live as a separate flow.
- **O25** — Operational side-door enforcement policy. Depends on user terms-of-service and consent framing. Re-open when those decisions land.
- **O452** — PHI-at-rest residency split (this amendment). Core mechanism (`protected` store + KEK-wrapped key + close-on-lock) lands as slice O452-A; dev-tooling inspection of the `protected` store (O452-B), KEK-rotation re-wrap of its key (O26), prod migration of existing PHI out of the `operational` DB, and per-table PHI granularity are deferred. Key hierarchy + storage layout for the protected-store key live in ADR-307.
