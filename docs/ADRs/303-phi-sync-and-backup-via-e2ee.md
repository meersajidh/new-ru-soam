# Multi-device PHI sync and backup via E2EE; LAN P2P as extension

**ID:** ADR-303
**Status:** Accepted
**Date:** 2026-05-13
**Supersedes:** —
**Superseded by:** —
**Related:** ADR-103, ADR-104, ADR-301, ADR-302, ADR-304 _(planned)_, ADR-305 _(planned)_, ADR-501, ADR-502 _(planned)_, ADR-503 _(proposed)_

## Context

ADR-301 commits that the cloud cannot read PHI. ADR-302 commits to a local-first topology where the device's Local Store is the source of truth. Two real-world problems remain:

1. **Data loss on device failure.** A single-device practitioner whose laptop dies with no recent backup loses everything. The "PHI never reaches the cloud" stance, taken in its strictest form, makes this the user's problem and accepts a meaningful loss exposure.
2. **Multi-device for a single practitioner.** The product commits to multi-device use for one practitioner (laptop + desktop, for example). PHI must reach the second device somehow.

A strict reading of ADR-301 forecloses cloud transport altogether. A pragmatic reading recognises that ADR-301's principle is **the cloud cannot read PHI plaintext** — not "no bytes related to PHI ever pass through the cloud's wires". End-to-end encryption preserves the principle: the cloud sees ciphertext, possesses no key, and cannot decrypt. From a regulatory standpoint, ciphertext that the cloud cannot read is not PHI from the cloud's perspective in most frameworks.

The detailed reasoning that produced this decision — including the three options considered and why hybrid landed on the recommended position — is captured separately in [PHI backup and encryption reasoning (reference)](../References/PHI_Backup_And_Encryption_Reasoning.md).

## Decision

### Topology

- **E2EE cloud backup and sync is a platform feature.** Built into the core, available to every install, gated by explicit user consent.
- **LAN P2P sync is an extension** (a bundle, per ADR-104). Optional. When installed and both devices are reachable on the same network, it accelerates cross-device convergence.
- **Cloud sync is always-on when consented.** LAN P2P is opportunistic acceleration, not a fallback path. If LAN P2P is unavailable or peers are not reachable, cloud sync continues uninterrupted.

### Envelope encryption

PHI is encrypted at the **envelope** layer before any transport touches it. Same envelope shape across cloud sync, cloud backup, and LAN P2P.

- **DEK (Data Encryption Key):** generated per object (a session note, an attachment, a record group — granularity is an implementation choice). Random, never reused across objects.
- **KEK (Key Encryption Key):** wraps the DEK. User-managed. The DEK travels alongside the ciphertext, wrapped by the KEK.
- The cloud sees: `{ wrapped_dek, ciphertext, metadata }`. It cannot unwrap the DEK without the KEK; it cannot read the ciphertext without the DEK.
- Transports are envelope-agnostic. The sync worker hands an envelope to a transport; the transport carries bytes.

This separation means the LAN P2P extension does not implement a different crypto story — it carries the same envelopes.

### KEK ownership: user-managed only

The KEK is held by the user. The platform does not hold any form of KEK, master key, escrow, or recovery copy on behalf of the user.

Two supported strategies for KEK management:

#### Strategy A — User-owned KMS

The user nominates a Key Management Service (KMS) account they control. The platform offers KMS provider plugins (Google Cloud KMS, AWS KMS, Azure Key Vault, etc.) following the **user-owned third-party credential pattern** of ADR-305 (planned). The user provides their own KMS credentials; the platform stores them via ADR-304's OS-keychain mechanism.

- **Recovery:** standard KMS account recovery (provider-side).
- **Rotation:** clean. KMS provider handles key rotation; the platform re-wraps DEKs.
- **Access loss:** if the user revokes the platform's KMS access or loses their KMS account, the ciphertext on the platform's cloud becomes undecryptable. This case is named, not hidden.

#### Strategy B — Recovery-code based KEK

The platform generates a KEK locally during onboarding. The user receives a one-time **recovery code** (sufficient to reconstruct or unlock the KEK) which they store outside the platform's reach (password manager, printed copy, etc.).

- **Recovery:** if all devices are lost, the recovery code is the only path back. The user accepts this exposure explicitly during onboarding.
- **Rotation:** harder than KMS. Re-encryption of existing cloud ciphertext is a deliberate operation, not background work.
- **Access loss:** lose the recovery code and all devices simultaneously → ciphertext is gone. Stated explicitly during onboarding.

### Consent gates

No cloud transmission of PHI happens without explicit, durable consent. The consent action is per-strategy:

- **Strategy A consent:** acceptance of KMS-account ownership and the implication that the platform's access to that KMS account is the user's responsibility.
- **Strategy B consent:** explicit acknowledgement of the risks of recovery-code-only key custody, including total-loss scenarios.

### Default state on fresh install

- No cloud sync. PHI lives only in the Local Store.
- The UI surfaces the data-loss risk prominently and persistently until the user makes a key-management decision.
- A user may operate the platform indefinitely in this local-only state, accepting the implication.

### Onboarding gating

The first-run flow forces a decision before any PHI is created:

1. Enable cloud sync (pick Strategy A or B and complete consent), or
2. Explicitly acknowledge local-only with data-loss risk.

The flow does not allow PHI creation while the answer is "unknown". The user can revisit the choice later.

### Second-device bootstrap

When the user adds a second device:

- **Strategy A path:** the new device authenticates to the user's KMS account, fetches the KEK, begins sync.
- **Strategy B path:** the new device pairs with an existing device via a short paired session (QR code, short-lived numeric code, or both). The KEK transfers device-to-device over a freshly authenticated channel. If no existing device is reachable, the user may enter the recovery code on the new device.

In both paths, the platform's cloud is the carrier of envelope ciphertext, not the carrier of keys.

### Sync transport contribution point

The sync worker is platform-owned and transport-agnostic. The platform exposes a **sync transport** contribution point (per ADR-104). The core cloud sync transport is always present; LAN P2P registers as a second transport when installed.

Selection logic (in the sync worker):

- Cloud transport: always active when consented.
- LAN transport: active only when both peers are reachable on the local network and consent for LAN sync is granted. Used in parallel with cloud transport when both are available — LAN delivers convergence faster, cloud delivers durability and devices not on the LAN.
- LAN is not a fallback ordered after cloud; both are active when both apply. This avoids "both devices think LAN is up so neither uses cloud" deadlocks.

### Revocation and opt-out cleanup

A user disabling cloud sync triggers an active cleanup procedure: cloud-side ciphertext is deleted via the platform's deletion API. The deletion is not passive. Confirmation surfaces in the UI.

A user revoking KMS access (Strategy A) is treated as a strong signal: the platform stops attempting to use the KMS, surfaces the consequence (existing ciphertext is undecryptable), and offers to delete the now-unusable cloud ciphertext.

### Upgrade path consent

Enabling cloud sync on a previously local-only install is a **fresh consent moment**. The platform must re-present the strategy choice and the associated risks. There is no silent migration from local-only to cloud-enabled.

### Audit

Every sync push and every key operation emits an audit event. The Cloud Backend cannot audit ciphertext content; the audit ledger originates at Main, before encryption. ADR-502 owns the ledger; this ADR commits to emitting events at the correct points.

### Per-entity keys (clinics)

Clinic-shared Clinical content requires a key model that wraps each DEK to multiple practitioner KEKs. The envelope model from this ADR already supports the multi-recipient shape — the wrap-set just grows beyond size one. The MVP scope (ADR-501) uses wrap-set size one; the Clinic extension (ADR-503, Proposed) grows it.

## Consequences

### Positive

- Disaster recovery and multi-device sync for PHI become possible without violating ADR-301's principle (the cloud cannot read PHI).
- One envelope shape across transports. LAN P2P is a transport, not a separate crypto story.
- Sync transports are pluggable. Future transports (mesh, USB, alternate clouds) land behind the same contribution point.
- Key ownership is user-managed across the board. The platform never holds the KEK in any form, eliminating an entire class of insider-risk and breach-impact scenarios.
- Consent is per-strategy and durable; the user knows what they accepted.

### Negative

- Key management is real complexity. KMS integration, recovery-code generation, paired-session UX, rotation policy — none are small.
- "Lost recovery code and all devices" is an unrecoverable state. Named explicitly in onboarding, but it remains a real risk for Strategy B users.
- Clinic-level key sharing (deferred to ADR-501) is non-trivial and shapes the envelope schema downstream.
- LAN P2P as an extension implies extension-host work eventually; in the interim, the sync transport contribution point exists as platform code that the LAN P2P bundle will plug into when extensions land. Internal-only registration is fine.

### Neutral

- The sync transport contribution point is platform-owned even before any third-party extension model exists. It is internal modularity (per ADR-104's stance) until extensions ship.

## Considered Options

The full analysis is in [PHI backup and encryption reasoning (reference)](../References/PHI_Backup_And_Encryption_Reasoning.md). Summary:

- **A. LAN P2P only + local backup tooling.** Strict reading of ADR-301; no cloud touchpoint. _Rejected_: data-loss exposure for single-device users is too severe.
- **B. E2EE cloud backup/sync only.** Uniform transport, simpler operationally. Live cross-device latency goes through the WAN. _Acceptable fallback._
- **C. Hybrid: E2EE cloud (platform) + LAN P2P (extension), both active when applicable.** Best UX (LAN-fast when available, cloud-durable always). Two transport stacks. _Chosen._
- **Platform-held escrow / recovery key.** Anything where the platform holds a copy of the KEK. _Rejected_: violates the user-managed-key commitment and reintroduces insider risk.

## Open Items

- **O26** — KEK rotation policy. KMS rotation cadence and re-encryption procedure; equivalent for Strategy B (recovery-code-bound KEK rotation is harder).
- **O27** — Backup cadence and granularity. Per-change ciphertext upload, periodic snapshots, or both. RPO vs storage-cost trade-off.
- **O28** — Crash dump and error report scrubbing. PHI may be in process memory at crash; scrubbing is required before any dump leaves the device.
- **O29** — Same KEK/DEK used for live sync and cold backup, or split. Strawman: same. Verify when implementing.
