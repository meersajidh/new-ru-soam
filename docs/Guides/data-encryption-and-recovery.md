# Data encryption, key management, and recovery

Operational companion to ADR-302, ADR-303, ADR-304, ADR-306, and ADR-307. This guide tells a developer what each piece looks like step by step. It does not re-argue the decisions — for that, see the related ADRs and the [PHI backup and encryption reasoning](../References/PHI_Backup_And_Encryption_Reasoning.md) reference.

**Last revised 2026-05-17** for ADR-307 (app-level KEK passphrase + auto-lock). Sections 2.3, 2.4 (Strategy B path), and 6 reflect the passphrase-wrapped KEK model. Strategy A sections remain pending Phase 9.5 / pre-Phase-11.

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

_Rewritten 2026-05-17 per ADR-307._ The KEK is no longer cached in the OS keychain. It is wrapped by a user-supplied **passphrase** and held only in process memory between unlock and relock. The recovery code wraps a second copy used as a fallback (forgotten passphrase or new device).

#### Setup

1. User selects "Use a recovery code only" (or this is the default Phase 9 path while Strategy A is deferred).
2. User picks a passphrase. Strength meter live; UI refuses to commit a passphrase below the threshold (`zxcvbn` score `>= 3`, length `>= 12`).
3. Platform derives `wrap_key_p` via **Argon2id** (`m=64 MiB, t=3, p=1`, tuned to ≈500 ms) over the passphrase and a fresh per-workspace salt `salt_p`.
4. Platform generates a fresh **KEK** (random 256-bit).
5. Platform generates a fresh **recovery code** (128-bit, encoded as 12 BIP-39 words).
6. Platform derives `wrap_key_r` via **HKDF-SHA256** over the recovery code and a fresh salt `salt_r`. HKDF expands 128 bits to a full 256-bit AES wrap-key. (HKDF, not Argon2id, because the recovery code already has cryptographic-strength entropy; brute-force on a 128-bit space is infeasible.)
7. `wrap_key_p` wraps the KEK → `wrapped_KEK_passphrase`.
8. `wrap_key_r` wraps the KEK → `wrapped_KEK_recovery`.
9. The platform writes the workspace metadata file:

    ```
    {
      version: 1,
      kdf: { algo: "argon2id", m: 67108864, t: 3, p: 1 },
      salt_p: <16 bytes>,
      salt_r: <16 bytes>,
      wrapped_KEK_passphrase: <bytes>,
      wrapped_KEK_recovery:   <bytes>,
      verifier: <encrypted canary>
    }
    ```

10. `wrapped_KEK_recovery` is also uploaded to the Cloud Backend recovery store (when sync is consented; not until then).
11. The recovery code is displayed to the user once. They must check the acknowledge box ("I have recorded these words; I understand they are the only way to recover access if I forget my passphrase or lose this device") before the workspace transitions to `unlocked`.
12. Consent gate (ADR-303) is recorded — explicit acknowledgement that loss of code + all devices is unrecoverable.

The KEK plaintext is **never persisted** — not in the keychain, not in workspace metadata, not in process scratch. It exists only in process memory between unlock and relock.

#### Use at runtime

Normal unlock:

1. User enters the passphrase.
2. Platform derives `wrap_key_p` (Argon2id over passphrase + stored `salt_p`).
3. Platform unwraps `wrapped_KEK_passphrase` → KEK in memory.
4. Platform verifies the canary; if it decrypts cleanly, the unlock succeeds.
5. `workspace.locked` flips to `false`.

Auto-lock (per ADR-307):

- Idle timer fires after the configured inactivity (default 5 min).
- System suspend signal received from `powerMonitor`.
- OS screen-lock signal received from `powerMonitor`.
- Manual relock command invoked.

In every case, the KEK is zeroed from memory and `workspace.locked` flips to `true`. The workspace shell is replaced in place by the unlock gate; the workspace itself is not unloaded.

Window blur (cmd-tab) does **not** auto-lock.

Failed unlocks are rate-limited via exponential backoff (5 fast attempts, then 1 min, 5 min, 15 min, 15 min cap). The recovery-code path is always reachable.

#### Forgotten passphrase

1. User clicks "Use recovery code instead" on the unlock gate.
2. User enters the 12 BIP-39 words.
3. Platform derives `wrap_key_r` (HKDF over the code + stored `salt_r`).
4. Platform unwraps `wrapped_KEK_recovery` → KEK in memory.
5. Platform forces the user to set a new passphrase before the workspace becomes usable.
6. The new passphrase derives a fresh `salt_p` and `wrap_key_p`; the in-memory KEK is re-wrapped; `wrapped_KEK_passphrase` is replaced in the metadata file.
7. `workspace.locked` flips to `false`.

The recovery code itself is not changed by this flow. A user who wants a new recovery code uses the rotation procedure below.

#### Change passphrase (no recovery code involved)

1. Workspace is unlocked. User enters current passphrase + new passphrase.
2. Platform re-derives `wrap_key_p` from the current passphrase + stored `salt_p`; verifies by unwrap of `wrapped_KEK_passphrase`.
3. Platform generates fresh `salt_p'`; derives `wrap_key_p'` from new passphrase + `salt_p'`.
4. Platform re-wraps the in-memory KEK; replaces `wrapped_KEK_passphrase` and `salt_p` in the metadata file.
5. The recovery code wrap (`wrapped_KEK_recovery`) is unchanged.

#### Rotation

Harder than KMS. To rotate the KEK:

1. Generate a new KEK.
2. Re-wrap every existing DEK with the new KEK across all online devices and the cloud.
3. Generate a new recovery code; wrap the new KEK with it (HKDF + fresh `salt_r`).
4. Derive a fresh `wrap_key_p` over the current passphrase + fresh `salt_p`; wrap the new KEK.
5. Display the new recovery code; user records.
6. Invalidate the old recovery code + wrapped-KEK copies in the metadata file and the cloud recovery store.

Rotation is a deliberate user action, not background work. Phase 9 ships the change-passphrase command only; the full KEK-rotation surface lands with Phase 12 recovery UX (Open Item **O26**).

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
5. New device prompts the user to set a passphrase. Derives `wrap_key_p` (Argon2id over passphrase + fresh `salt_p`). Wraps the received KEK; writes the new device's workspace metadata file. The recovery code is fetched from the cloud recovery store and re-wrapped under the same KEK on the new device (`wrapped_KEK_recovery` for the new device's `salt_r`).
6. Channel closes. The received KEK plaintext is zeroed from memory after wrapping.

**Recovery code entry (fallback)**:

1. New device prompts for the recovery code.
2. New device fetches the cloud-stored `wrapped_KEK_recovery`.
3. Recovery code unwraps it locally → KEK in memory.
4. New device prompts the user to set a passphrase. Wraps the KEK under the new passphrase; writes the new device's workspace metadata file with both wrapped copies.

If the user has only the recovery code and no existing device, the fallback path is the only option. The platform surfaces this clearly.

_Amended 2026-05-17 per ADR-307._ In both paths the new device asks the user to choose its own passphrase — passphrases are per device, the KEK is shared.

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

_Pinned 2026-05-17 by ADR-307 §Algorithms. Phase 10 (Local Store) and Phase 11 (Sync) consume these unchanged._

- **Record AEAD**: **AES-256-GCM**. Per-op random 96-bit nonce. Authenticated tag verified on every decrypt. Native Node `crypto`.
- **KEK wrap algorithm**: **AES-GCM-KW** for Strategy B (used for `wrap_key_p → KEK`, `wrap_key_r → KEK`, and `DEK → KEK`). KMS-provider-specific for Strategy A (when implemented).
- **Passphrase KDF**: **Argon2id** with `m=64 MiB, t=3, p=1`. Tune to ≈500 ms on target hardware. Library: `@node-rs/argon2`.
- **Recovery-code KDF**: **HKDF-SHA256** (Node `crypto.hkdfSync`). The recovery code is 128-bit entropy (cryptographic-strength); a memory-hard KDF is not required. HKDF expands to a full 256-bit AES wrap-key.
- **Recovery code**: 128-bit entropy, encoded as a **12-word BIP-39** phrase. Library: `@scure/bip39`. Easier to transcribe and dictate than 24 words or base32.
- **Envelope shape**: `{ v, alg, wrapped_dek?, nonce, ciphertext, tag, aad }`. Frozen by ADR-307; consumed unchanged by Phase 10 + Phase 11. All binary fields standard-base64. `wrapped_dek` omitted for single-key encrypts (verifier canary, raw KEK wraps). `tag` = AES-GCM auth tag as a separate field (matches Node `crypto.getAuthTag()`). `aad` = base64 of the canonical-JSON AAD buffer.
- **Paired-session code**: short-lived (90 seconds), 6-8 digits, channel established via ECDH; the code is the channel-binding string, not the secret itself.
- **Passphrase strength**: minimum length 12 characters; **block setup / change** at `zxcvbn` score `< 3`. Library: `zxcvbn-ts/core`.
- **Failed-unlock rate limit**: 5 fast attempts; then 1 min, 5 min, 15 min, 15 min cap. No permanent lockout — the recovery-code path stays open. Counter persists across restart in a plain unauthenticated file (purpose is friction, not crypto).

## Related

- ADR-301, ADR-302, ADR-303, ADR-304, ADR-306, ADR-307 — the architectural commitments this guide implements.
- ADR-305 — provider plugin pattern that KMS providers follow.
- ADR-502 (planned) — audit and consent ledger emissions.
- [PHI backup and encryption reasoning](../References/PHI_Backup_And_Encryption_Reasoning.md) — the analysis behind ADR-303.
- [Local-first pattern](../References/Local_First_Pattern.md) — the read/write topology this guide operates against.
