# Data encryption, key management, and recovery

Operational companion to ADR-302, ADR-303, ADR-304, and ADR-306. This guide tells a developer what each piece looks like step by step. It does not re-argue the decisions — for that, see the related ADRs and the [PHI backup and encryption reasoning](../References/PHI_Backup_And_Encryption_Reasoning.md) reference.

Scope:

- The encryption model the platform uses (envelope encryption + at-rest layering).
- How keys are managed in practice (both strategies, both bootstrap paths).
- The recovery flows, scenario by scenario, in enough detail to implement against.

---

## 1. Encryption model

### 1.1 Envelope encryption (the core pattern)

Every Clinical record that may be transmitted is wrapped in an **envelope**:

```
plaintext       ──(AES-256-GCM, DEK)──>      ciphertext
DEK             ──(wrap, KEK)──────────>     wrapped_dek

envelope = {
  schema_version: int,
  wrapped_dek:    bytes,
  ciphertext:     bytes,
  metadata:       { record_type, version_vector, ... non-PHI }
}
```

Key terms:

- **DEK** (Data Encryption Key): per-record, random, never reused.
- **KEK** (Key Encryption Key): wraps each DEK. User-managed (see Section 2).

What this gives:

- The cloud holds `{ wrapped_dek, ciphertext, metadata }` and can do nothing with either half without the KEK.
- Rotation only requires re-wrapping DEKs, not re-encrypting payloads.
- Multi-recipient access (clinic sharing, ADR-503 Proposed) is "wrap the same DEK with multiple KEKs". MVP scope (ADR-501) uses wrap-set size one.

Granularity: per-record DEK by default. Some types may upgrade to per-row DEKs (very large transcripts) or downgrade to per-day DEKs (high-volume telemetry). The DEK strategy is a per-record-type choice; the envelope shape does not change.

### 1.2 At-rest encryption (Local Store)

Separate, layered. The Local Store database file is encrypted as a whole using SQLite's transparent encryption (SQLCipher-compatible wrapper around `better-sqlite3`). The database key:

- Lives in the OS keychain under `local-store-db-key` (ADR-304).
- Is fetched at Main startup; the application holds it only in process memory while the DB is open.
- Is **distinct from any KEK**. The DB key protects the file at rest from local disk-read attacks; it is not used for envelope wrapping.

Combined effect for a Clinical record on disk:

```
disk bytes  ──(DB at-rest decrypt)──>  envelope  ──(KEK unwrap → DEK → decrypt)──>  plaintext
```

Two layers, two key materials, two failure modes that are detected independently.

### 1.3 Transports

Envelopes are transport-agnostic. The sync worker hands an envelope to a registered transport (cloud HTTPS, LAN P2P) and the transport carries bytes. Transports do not see plaintext and do not see DEKs in unwrapped form.

This is why ADR-303 puts LAN P2P as an extension: a transport is a plug-in to the sync worker, not a separate crypto story.

---

## 2. Key management

### 2.1 KEK ownership is user-only

The platform never holds the KEK in any form — no escrow, no split-secret, no "just in case". This is non-negotiable; it is the property that lets ADR-301 hold under cloud sync.

### 2.2 Strategy A — User-owned KMS

#### Setup

1. User selects "Use a KMS account I control".
2. User picks a KMS provider plugin (Google Cloud KMS, AWS KMS, Azure Key Vault, …) per ADR-305 Flow A.
3. User enters their KMS credentials. Stored in OS keychain under `kms-credentials` (ADR-304).
4. Platform creates (or selects) a key in the user's KMS — this is the KEK.
5. Platform performs a test wrap/unwrap to validate access.
6. Consent gate (ADR-303) is recorded.

#### Wrap and unwrap

- **Wrap**: at write time, the platform asks the user's KMS to wrap a freshly generated DEK. The wrap operation runs in main, against the user's KMS, using their credentials.
- **Unwrap**: at read or sync time, the platform asks the user's KMS to unwrap. The unwrapped DEK is held briefly in main's process memory; never persisted; not exposed to the renderer.

#### Rotation

The user (or KMS provider, if configured) rotates the KMS key. The platform's response:

1. Detect that the active KEK version has changed.
2. For each Clinical record whose envelope was wrapped with an older key version, re-wrap on next read.
3. Push re-wrapped envelopes through the sync worker.

Rotation is a background operation. Reads continue to work with old wrapped envelopes as long as the KMS still recognises the old version.

#### Failure modes

- **KMS unreachable**: capability calls return a degraded state. The user sees "cloud sync is offline" rather than data loss. Local data continues working from in-process DEK cache.
- **KMS authorization revoked**: scenario 5 of ADR-306. The platform stops trying, surfaces the consequence.

### 2.3 Strategy B — Recovery-code-based KEK

#### Setup

1. User selects "Use a recovery code only".
2. Platform generates a KEK locally (random 256-bit).
3. Platform derives a wrap-key from a freshly-generated recovery code (sufficient entropy; see implementation notes). The recovery code wraps the KEK.
4. The wrapped KEK is stored in the cloud (Cloud Backend recovery store) and locally.
5. The KEK plaintext is held in the OS keychain under `kek-material` for runtime use.
6. The recovery code is displayed to the user once. They must record it.
7. Consent gate (ADR-303) is recorded — explicit acknowledgement that loss of code + all devices is unrecoverable.

#### Use at runtime

The KEK is in keychain on each authorized device. Wrap/unwrap is local. No network call required for normal operation, which is faster than Strategy A but lacks the user-side audit a KMS provides.

#### Rotation

Harder than KMS. To rotate:

1. Generate a new KEK.
2. Re-wrap every existing DEK with the new KEK across all online devices and the cloud.
3. Generate a new recovery code; wrap the new KEK with it.
4. Display the new recovery code; user records.
5. Invalidate the old recovery code + wrapped KEK.

Rotation is a deliberate user action, not background work.

### 2.4 Second-device bootstrap

When the user adds a new device, the new device needs the KEK.

#### Strategy A path

1. New device authenticates to the user's KMS account (using stored credentials or fresh entry).
2. KMS hands back the ability to unwrap.
3. New device fetches an envelope, performs unwrap, confirms.

No key material transfers between devices in either direction.

#### Strategy B path

Two sub-paths:

**Paired session (preferred)**:

1. Existing device displays a short-lived numeric code (or QR).
2. New device enters the code.
3. Devices establish an authenticated channel (ephemeral key agreement).
4. Existing device sends the KEK over the channel.
5. New device stores KEK in keychain. Channel closes.

**Recovery code entry (fallback)**:

1. New device prompts for the recovery code.
2. New device fetches the cloud-stored wrapped KEK.
3. Recovery code unwraps it locally.
4. New device stores KEK in keychain.

If the user has only the recovery code and no existing device, the fallback path is the only option. The platform surfaces this clearly.

### 2.5 Migration between strategies

Detail per ADR-306 §"Migration between KEK strategies":

1. **Generate** a new KEK under the target strategy.
2. **Re-wrap** existing DEKs with the new KEK on each online device. Each device performs unwrap with the old KEK, then wrap with the new.
3. **Push** the re-wrapped envelopes to the cloud. The cloud now holds two copies per envelope, distinguishable by KEK version metadata.
4. **Confirm** all online devices have completed step 2.
5. **Delete** old-KEK-wrapped envelopes from the cloud via the cloud deletion API.
6. **Old recovery code / KMS key** is now invalid for new operations; if relevant, the platform invalidates it.

Mid-migration state is fully recoverable: the cloud retains both copies; aborting the migration leaves the user able to continue with the old KEK.

A migration cannot start unless every authorized device is reachable, or the user explicitly authorizes proceeding without an offline device (the offline device will need to re-bootstrap when it comes back online).

---

## 3. Recovery flows

Each scenario from ADR-306's catalogue, expanded.

### Scenario 1 — Lost device; another device still online

1. User signs into the platform on a new device.
2. Existing device approves the new device via paired session (Section 2.4).
3. Sync worker on new device pulls envelopes from cloud and/or LAN.
4. Convergence completes; new device is functional.

Loss: anything that was on the lost device and had not yet synced at the moment of loss. Usually small.

### Scenario 2 — Lost device; no other device; cloud sync was enabled

1. User installs the platform on a new machine.
2. User authenticates to the Cloud Backend.
3. User unlocks the KEK:
   - Strategy A: re-authenticate to KMS.
   - Strategy B: enter the recovery code.
4. Platform pulls envelopes from the cloud, unwraps DEKs, decrypts, populates Local Store.
5. Functional.

Loss: anything not yet synced at moment of loss.

### Scenario 3 — Lost device; no other device; local-only

1. User installs the platform on a new machine.
2. If a backup file exists: invoke `recovery.restoreFromBackupFile`. See Section 4.
3. Otherwise: the platform is in fresh-install state. Local PHI from the lost device is gone.

Loss: depends on backup recency. With no backup: everything.

### Scenario 4 — Windows password reset; DPAPI keychain dead

1. Platform boots, attempts to read a known keychain entry.
2. `safeStorage` returns "cannot decrypt".
3. Platform routes to `recovery.handleDpapiLoss`.
4. Detection: confirms multiple known entries fail to decrypt (rules out a single-entry corruption).
5. Routing:
   - If cloud sync was on: this is now scenario 2 on the same machine. The Local Store cannot be opened (DB key in keychain is gone), so the platform reinitialises and restores from cloud.
   - If local-only: scenario 3.
6. After restore, the platform re-establishes keychain entries with the new DPAPI state.

The Local Store file on disk is not deleted before recovery completes. The user has an off-ramp if they later restore Windows credentials (unusual but possible).

### Scenario 5 — KMS access lost

1. Sync worker calls KMS unwrap; receives an authorization error.
2. Platform routes to `recovery.handleKmsAccessLoss`.
3. The user is informed: cloud ciphertext is undecryptable until KMS access is restored. Existing online devices keep working using cached DEKs.
4. Options surfaced:
   - Restore KMS access externally (provider-side). Platform re-detects on next sync attempt.
   - Migrate to a new KEK strategy (Section 2.5), accepting that cloud ciphertext encrypted under the lost KEK is unrecoverable.
   - Delete the cloud-side ciphertext via the deletion API and start fresh.

Loss: depends on the path chosen.

### Scenario 6 — Recovery code lost + all devices lost

The platform cannot help. The recovery flow is:

1. User attempts to install on a new device.
2. Platform asks for the recovery code or for an existing device.
3. Neither is available.
4. Platform surfaces: "There is no path to recover this account's clinical data. Onboarding flagged this risk."
5. User options: start over (fresh account, no recovered data), or contact support for non-recoverable-data acknowledgement.

The platform does not pretend.

### Scenario 7 — Local Store corruption

1. Platform attempts to open the SQLite file; integrity check fails or open fails.
2. Routes to corruption flow.
3. If cloud sync was on: reinitialise local store, restore from cloud (scenario 2 mechanics on the same device).
4. If local-only: prompt for backup file; if user has one, restore (scenario 3). Otherwise reinit empty.

The corrupted file is preserved on disk under a `corrupt-<timestamp>` name in case manual recovery is later possible. Not deleted automatically.

### Scenario 8 — Voluntary local backup export

1. User invokes `recovery.exportBackupFile`.
2. Platform serialises Clinical records into envelopes (existing envelope shape).
3. Wraps in a backup file (header + manifest + payload, Section 4).
4. Writes to user-chosen destination.
5. Logs an audit entry (ADR-502 planned).

The export does not include credentials or keys. Restoring requires the user's KEK (Strategy A or B), exactly like cloud restore.

### Scenario 9 — Local backup import

1. User invokes `recovery.restoreFromBackupFile` and points at a backup file.
2. Platform validates the manifest signature.
3. KEK unwraps the envelopes.
4. Records merge into Local Store; conflict resolution per ADR-302/303.

If the user's current KEK does not match the one the file was encrypted under (typical after a migration), the import prompts for the prior KEK (KMS access to the old key version, or the prior recovery code).

---

## 4. Backup file format

```
+-------------------------+
| Header (cleartext)      |
|   format_version: u16   |
|   envelope_schema: u16  |
|   source_device_id      |
|   created_at            |
|   manifest_sig (HMAC)   |
+-------------------------+
| Manifest (cleartext)    |
|   record_types[]        |
|   record_counts{}       |
|   integrity hashes      |
+-------------------------+
| Payload (envelope ct)   |
|   wrapped_deks          |
|   ciphertexts           |
+-------------------------+
```

Cleartext header and manifest contain no PHI. The signature on the manifest is computed under a device-local key so that an import can detect tampering before attempting decryption.

The platform does not embed any recovery secret in the backup file itself. The user's KEK is required to decrypt.

### 4.1 Optional passphrase wrapper (extension)

Some users store backups in less-trusted locations (shared cloud drives, USB sticks). A future extension may add a passphrase-protected wrapper around the backup file (a key derived from a passphrase wraps the file's payload-key before it is written). This is an extension/plugin on top of the core export, not a core feature. ADR-306 O42 tracks it; low priority until a concrete user need surfaces.

---

## 5. Operational concerns

### 5.1 Audit

Every key operation and every recovery flow step emits an audit event (ADR-502 planned). Events:

- KEK unwrap requested, succeeded, failed.
- Envelope sync push, pull, conflict resolved.
- Recovery capability invoked, completed, aborted.
- Migration step boundaries.

Audit emission happens at the point closest to the operation, **before** any encryption, so that the audit ledger contains the meaningful context. The cloud never reads the audit content — only metadata it needs to act on (ADR-502 will define the split).

### 5.2 Crash dump scrubbing

PHI may sit in process memory at the moment of a crash. Crash reports must be scrubbed before they leave the device. Concrete measures (deferred to ADR-303 O28):

- Disable upstream crash reporting that includes memory dumps unless a scrubbing pipeline runs first.
- Mark all PHI buffers with a tag that the scrubber matches.
- Default policy: no automatic crash upload. Manual report with explicit user opt-in only.

### 5.3 Telemetry boundaries

Telemetry (usage analytics, performance metrics) goes only over the brokered cloud path and carries Operational data only (ADR-302). The class boundary is the wall; telemetry is not exempt.

---

## 6. Implementation notes

- **AES-256-GCM** for record-level encryption. Nonce per record. Authenticated tag verified on every decrypt.
- **KEK wrap algorithm**: KMS-provider-specific for Strategy A. AES-KW or AES-GCM-KW for Strategy B.
- **Recovery code**: 256-bit entropy, encoded as a 24-word BIP-39-style phrase or a 48-character base32 string. Choice driven by usability research; both pass the "fits on a sticky note" test.
- **Paired-session code**: short-lived (90 seconds), 6-8 digits, channel established via ECDH; the code is the channel-binding string, not the secret itself.

## Related

- ADR-301, ADR-302, ADR-303, ADR-304, ADR-306 — the architectural commitments this guide implements.
- ADR-305 — provider plugin pattern that KMS providers follow.
- ADR-502 (planned) — audit and consent ledger emissions.
- [PHI backup and encryption reasoning](../References/PHI_Backup_And_Encryption_Reasoning.md) — the analysis behind ADR-303.
- [Local-first pattern](../References/Local_First_Pattern.md) — the read/write topology this guide operates against.
