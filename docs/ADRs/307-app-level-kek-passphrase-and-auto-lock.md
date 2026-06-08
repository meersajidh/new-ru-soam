# App-level KEK passphrase + auto-lock + endpoint threat model

**ID:** ADR-307
**Status:** Accepted
**Date:** 2026-05-17
**Supersedes:** —
**Superseded by:** —
**Related:** ADR-301, ADR-302, ADR-303, ADR-304, ADR-306, ADR-403, ADR-412, ADR-502 _(planned)_

## Context

ADR-301 commits the structural-not-procedural rule for PHI: the wrong thing must be impossible, not merely discouraged. ADR-303 picks E2EE for cloud transport and names a Strategy B (recovery-code-managed) KEK. As originally written, Strategy B placed the KEK plaintext in the OS keychain (`kek-material`, ADR-304) and treated the OS user session as the runtime trust gate. That choice mirrors the standard transparent-data-encryption (TDE) pattern used by server databases: master key in a managed store, app boots and the data layer transparently decrypts.

The TDE pattern was developed for a different deployment context. In server context:

- The database sits behind locked-rack physical security.
- An app-tier credential gate (DB connection credentials) sits in front of the data layer.
- The network boundary is the outer perimeter.

Ru-soam is an **endpoint** product. The relevant deployment context is a mental-health practitioner's laptop, typically in:

- A shared clinic office where colleagues, support staff, cleaners, and patients are physically present.
- A private practice where brief unattended periods (bathroom, intake meet, returning a call from another room) are constant.
- Travel and home environments where the laptop changes location frequently.

In this context, the protections TDE assumes do not exist. The OS user session is both the physical perimeter *and* the credential gate. A walk-up attacker on an unlocked OS session — colleague, patient walking past, cleaning staff — can open the app and read every chart with no challenge. Relock-then-unlock is one button click because re-unlock = re-read keychain. No barrier.

This is the threat the original Strategy B did not name. The reasoning behind ADR-303 (see [PHI backup and encryption reasoning](../References/PHI_Backup_And_Encryption_Reasoning.md)) considered cloud breach, platform insider, KMS provider, and data-loss exposure for single-device users. It did not consider walk-up access on a logged-in clinical workstation. The omission produced a key-management story whose endpoint-side trust gate is "the OS screen-lock, eventually". For an endpoint clinical product, that gate is too weak.

HIPAA Technical Safeguards §164.312(a)(2)(iii) (Automatic Logoff) is addressable, not strictly required, but the prevailing pattern in clinical endpoint software (Epic, Cerner, sole-practitioner EHRs) is an app-level credential gate with inactivity auto-lock. Without it, the "lock workspace" command in the Implementation Plan is theater — a button that wipes a memory copy but cannot prevent re-acquisition.

This ADR fixes the gap by introducing an **app-level credential gate** (a passphrase) that wraps the KEK, and an **inactivity auto-lock** that gives the lock state operational meaning. The recovery code from ADR-303 stays; its role is rebalanced to fallback + new-device-bootstrap.

## Decision

### App-level passphrase wraps the KEK

The KEK is **never persisted plaintext on disk** — not in the keychain, not in workspace metadata, not anywhere. At setup, a random 256-bit KEK is generated; the user picks a passphrase; the passphrase is stretched through Argon2id; the resulting wrap-key wraps the KEK; the wrapped KEK is written to workspace metadata. Unlock is "user enters passphrase → Argon2id → unwrap → KEK in memory".

This replaces ADR-303's Strategy B runtime model (KEK plaintext in OS keychain, fetched on every boot) with a model that holds the KEK behind a user-supplied secret.

ADR-304's credential-store catalogue loses `kek-material`. `local-store-db-key` (SQLCipher whole-DB key) stays in the keychain as a defense-in-depth layer against disk-seizure on a powered-off device. The envelope layer continues to block PHI under walk-up because the KEK is memory-only and absent when locked.

### Recovery code as fallback, not primary

The recovery code from ADR-303 §"Strategy B" remains. Its role narrows:

- **Forgotten passphrase** — user enters recovery code → unwrap via HKDF-SHA256 → KEK in memory → app forces a passphrase reset before workspace becomes usable.
- **New device bootstrap** — same flow on the new device. Paired-session bootstrap (Guide §2.4) is preferred when an existing device is reachable; recovery-code entry is the always-available path.

Two wrapped copies of the KEK exist in workspace metadata: `wrapped_KEK_passphrase` (used in normal flow) and `wrapped_KEK_recovery` (used in fallback). The cloud-side wrapped copy from ADR-303 §"second-device bootstrap" remains identical to `wrapped_KEK_recovery`.

### Inactivity auto-lock is platform behaviour

Locking the workspace is a first-class lifecycle event, not a side-effect:

- **Idle timer** — fires after configurable inactivity; default 5 minutes. Tracked via Main-side `powerMonitor` plus renderer activity heartbeat (mouse / keyboard / focus events).
- **System suspend** — workspace locks on suspend; remains locked through resume.
- **OS screen-lock event** — workspace locks immediately.
- **Window blur (cmd-tab, focus to another app)** — does **not** lock. Too aggressive for the cmd-tab-between-apps workflow.
- **Manual relock command** — palette + StatusBar entry, always available.

The idle timeout is a workspace setting; per-workspace override over a user default. ADR-403 §workspace-settings carries the persistence shape; this ADR commits the *behaviour*.

### Algorithms (frozen)

| Purpose | Algorithm | Notes |
|---|---|---|
| Passphrase KDF | **Argon2id** | Params: `m=64 MiB, t=3, p=1`, tuned to ≈500 ms on target hardware. Lib: `@node-rs/argon2`. |
| Recovery-code KDF | **HKDF-SHA256** | Recovery code is 128-bit entropy; no memory-hard KDF required (entropy is already cryptographic-strength). HKDF expands to a full 256-bit AES wrap-key. Node `crypto.hkdfSync`. |
| KEK wrap (DEK↔KEK; wrap-key→KEK) | **AES-GCM-KW** | Same primitive as record encryption — one algorithm to audit. |
| Record AEAD | **AES-256-GCM** | Per-op random 96-bit nonce. Native Node `crypto`. |
| Recovery code format | **BIP-39, 12 words** | 128-bit entropy. Brute-force surface is infeasible (NIST general-use floor). Easier to transcribe / dictate than 24 words or base32. Lib: `@scure/bip39`. |
| Envelope shape | `{ v, alg, wrapped_dek?, nonce, ciphertext, tag, aad }` | Frozen here; Phase 10 and Phase 11 consume unchanged. All binary fields standard-base64. `wrapped_dek` omitted for single-key encrypts (verifier canary, raw KEK wraps). `tag` is the AES-GCM authentication tag as a separate field — matches Node `crypto.getAuthTag()` return shape; safer than concat-and-split on the wire. `aad` is base64 of the canonical-JSON AAD buffer. |

These were named in the Guide §6 as implementation notes; this ADR promotes them to architectural commitments because Phase 10 Local Store and Phase 11 Sync depend on the shape staying stable.

### Passphrase strength policy

Passphrase setup and change paths enforce:

- Minimum length: **12 characters**.
- zxcvbn score: **block at score < 3**. Score 3 (≈10^8 guesses) is the floor.
- Strength meter visible during entry; failure mode names the weakness without dictating phrasing.

The block is at the entry surface, not at the crypto layer. The crypto layer accepts any passphrase; the UI refuses to commit a weak one. This keeps the crypto primitive context-free and the policy revisable without a re-derivation event.

### Rate limiting on failed unlock

Exponential backoff schedule:

| Attempt | Delay before next attempt allowed |
|---|---|
| 1–5 | none (typo-tolerant) |
| 6 | 1 minute |
| 7 | 5 minutes |
| 8 | 15 minutes |
| 9+ | 15 minutes (cap) |

**No permanent lockout.** The recovery-code path is always reachable. Counter resets on a successful unlock; persists across app restart so brute force cannot circumvent by relaunching. The persistence file is plaintext and unauthenticated — its purpose is friction, not crypto.

### Lifecycle state machine

_Amended 2026-05-17:_ multi-workspace support adds a zero-workspaces / picker fork at the top of the lifecycle. The KEK-lock state machine per active workspace is unchanged.

```
        ┌────────────────┐                          ┌─────────────────────────────┐
        │ fresh install  │ first run                │                             │
        └───────┬────────┘                          ▼                             │
                │  no workspaces ────────────▶ setup-pending (Phase 9b route)     │
                │                                   │                             │
                │  workspaces exist, no active  ──▶ picker (Phase 9c route)       │
                │                                   │                             │
                ▼                                   ▼                             │
        ┌─────────────────────────────────────────────────────┐                   │
        │             active workspace bound                  │                   │
        └───────────────────────┬─────────────────────────────┘                   │
                                │ setup ceremony commit                           │
                                ▼                                                 │
                          ┌──────────┐ unlock (passphrase OR recovery → reset)   │
                          │  locked  │─────────────────────────────┐              │
                          └──────────┘                             │              │
                                ▲                                  ▼              │
                                │                          ┌──────────┐          │
                                │ relock / idle /          │ unlocked │          │
                                │ suspend / lock-screen    └─────┬────┘          │
                                └──────────────────────────┐     │ sign-out      │
                                                            └─────┘     ▼         │
                                                                    (clear active │
                                                                     pointer)─────┘
```

The pre-workspace states (`zero-workspaces`, `picker`) and the workspace-bound states (`setup-pending`, `locked`, `unlocked`) are render-distinct surfaces. Routes and surfaces are owned by ADR-403; this ADR commits the *states* and *transitions*.

Sign-out is a first-class transition: relock the KEK + clear the `active-workspace.json` pointer. From the picker (or, in Phase 9b interim, the setup route if zero workspaces) the user can re-enter the unlock flow of a different workspace.

### Context keys

_Amended 2026-05-17:_ key renamed from `workspace.locked` → `workspace.kekLocked` to avoid collision with pre-existing `workspace.isLocked` (workspace open/closed state on `WorkspaceService`). Two additional keys added for multi-workspace surfacing.

| Key | Type | Source |
|---|---|---|
| `workspace.kekLocked` | `boolean` | `LockService`, published via IPC |
| `workspace.setupComplete` | `boolean` | `LockService`, published via IPC |
| `workspace.activeId` | `string \| ''` | `WorkspaceRegistry`, published via IPC. Empty string when no active workspace. |
| `workspace.nickname` | `string \| ''` | `WorkspaceRegistry`, published via IPC. Empty string when no active workspace. |

When-clauses on PHI-bearing UI gate on `!workspace.kekLocked && workspace.setupComplete`. ADR-407 reserves the `workspace.*` namespace; this ADR populates four entries.

### Threat model

| Threat | Defended by | Residual |
|---|---|---|
| Cloud breach | E2EE envelope (cloud holds no KEK) | None within model |
| Platform insider | Same | None within model |
| Disk seizure (powered-off device) | SQLCipher whole-DB encryption (key in OS keychain, unreachable when device off or different OS user) + envelope layer | None within model |
| Walk-up attacker on unlocked OS session | Passphrase gate + inactivity auto-lock + lock-on-suspend + lock-on-screen-lock | Window left in `unlocked` state during the configured idle window |
| Malware under same OS user | Partial: raw keychain entries (e.g. `local-store-db-key`) are readable, but that key now opens only the **`operational`** store (no PHI — O452). PHI lives in the `protected` store, whose key is KEK-wrapped and unwrappable only while unlocked; on a locked/cold workspace the PHI store is closed and undecryptable. KEK memory-only and absent when locked | If app is running and **unlocked**, PHI plaintext is reachable (the unlocked window). Out of scope for MVP |
| Walk-up attacker uses unlocked app to act through non-PHI keychain credentials (cloud session, KMS, third-party API key) | Per-cred-type policy: high-walk-up-impact credentials are **KEK-wrapped** in the keychain (see §Keychain credential walk-up policy below). Walk-up on a locked workspace = unusable cred | Walk-up during the unlocked window remains exposed (same as PHI) |
| Forgotten passphrase | Recovery-code unwrap → forced passphrase reset | None within model |
| Lost device, has recovery code | Recovery-code path on new device | None within model |
| Lost recovery code + all devices | Unrecoverable (named in onboarding per ADR-306 scenario 6) | Accepted by user at setup |

The OS-screen-lock interaction is the load-bearing one. If the OS does not lock and the user does not return within the idle-timeout window, the workspace is exposed. The platform mitigates by defaulting the idle timer aggressively (5 minutes) and locking proactively on every system signal it can observe.

### Keychain credential walk-up policy

ADR-304's CredentialStore holds more than the SQLCipher key. As features land, the catalogue grows to include the cloud session token (Phase 11), KMS credentials when Strategy A ships (O307a), and third-party API keys (post-Phase-13). A walk-up attacker who reads these raw would gain capabilities orthogonal to PHI: cloud-account exfiltration, KMS unwrap (which defeats this ADR entirely), API-credit theft. Asymmetric protection — PHI gated, cloud session not — is not acceptable.

The default policy for any new keychain credential type is:

- **High walk-up impact** (cloud account access, KMS access, billable third-party access): keychain stores `KEK-wrapped(credential)`. The credential is unwrapped on demand inside Main using the in-memory KEK and used in place. Walk-up on a **locked** workspace = unwrap impossible = credential unusable. The capability that consumes the credential refuses with `LockedError` when `workspace.locked` (same decorator pattern as PHI-flagged capabilities).
- **Low walk-up impact** (defense-in-depth disk-seizure protection only, no operational power on a logged-in OS session beyond what the app already exposes): keychain stores the raw credential. `local-store-db-key` is the canonical example — it has to be raw because it is fetched at Main startup before the workspace metadata can be opened. A walk-up attacker who reads it can decrypt the SQLite file directly, but the envelope layer still blocks PHI plaintext and no external account is reachable.

Each new credential type added to ADR-304's catalogue declares its policy (`raw` or `kek-wrapped`) at the point it is added. Wrap policy decisions are recorded against Open Item **O307f**.

When the KEK rotates (Phase 12, Open Item O26), every `kek-wrapped` keychain credential is re-wrapped as part of the rotation procedure.

This policy makes the lock state the single dominant gate for everything dangerous on the endpoint: unlock the workspace, every credential becomes usable; lock it, every high-impact credential is inert. There is no asymmetric path where one cred type protects PHI while another exfiltrates operational data.

### Setup ceremony

_Amended 2026-05-17:_ the ceremony expanded to capture cloud-account identity (email via Google OAuth, mocked in Phase 9) and workspace nickname before the passphrase + recovery-code steps. Identity (email) persists in a KEK-encrypted `identity.envelope` file, separate from `lock.json`.

First-run flow lives at the `/setup/keys` route (full-screen, replaces empty-workspace render). Steps:

1. **Sign in with Google** — opens an OAuth dialog (mocked in Phase 9 returning `{ email, googleId: "mock-<uuid>" }`; real OAuth flow lands per **O307g** alongside cloud sync in Phase 11/12). Email is the identity binding for the workspace.
2. **Choose nickname** — 4-64 char text input. Length-only validation at this phase; global-uniqueness check is server-side (per **O307h**, Phase 11+).
3. Explain the passphrase's role in one screen: "This passphrase unlocks your workspace. We never see it. If you forget it, you'll need your recovery code."
4. Prompt passphrase + confirm. Strength meter live. Refuses commit below threshold.
5. Generate KEK + recovery code. Display the 12 words once. Force checkbox: "I have recorded these words. I understand they are the only way to recover access if I forget my passphrase or lose this device."
6. Commit. `WorkspaceRegistry.create({ nickname, email })` runs first (generates UUID, mkdir, writes `meta.json`); then `setup.acknowledge({ identity: { email } })` writes `lock.json` + `identity.envelope`. Workspace transitions to `unlocked`.

The setup cannot be skipped, postponed, or replaced with a "no-key" mode. ADR-303's "default local-only no-cloud" applies to *sync consent*, not to encryption-at-rest — the local workspace is always KEK-gated.

### Storage layout (multi-workspace)

_Added 2026-05-17:_ multi-workspace support requires per-workspace dirs and an active-workspace pointer. The KEK-encryption layer is unchanged; only the dir-and-namespacing layout changes.

```
$userData/
├── active-workspace.json             { "workspaceId": "<uuid>" | null }
├── workspaces/
│   └── <uuid>/
│       ├── lock.json                 frozen ADR-307 shape (per workspace)
│       ├── lock-attempts.json        rate-limit state (per workspace)
│       ├── meta.json                 { nickname, createdAt, lastSignedIn }
│       └── identity.envelope         KEK-encrypted single envelope over { email, ...future cloud-acct fields }
└── credentials/
    └── store.json                    keys: "ru-soam.<workspaceId>.<credentialType>[.<ref>]"
```

- `meta.json` is pre-unlock readable (non-PHI; populates the picker UI in Phase 9c).
- `identity.envelope` is post-unlock only; the email is operational data per ADR-501 but accumulated emails on a shared device = informational disclosure → keep behind the KEK.
- Credential store keys are now workspaceId-namespaced. Each workspace has its own `local-store-db-key`, ensuring per-workspace SQLCipher isolation in Phase 10.

#### Protected-store key in the hierarchy (Amended 2026-06-05, O452)

_Amended 2026-06-05 (O452):_ ADR-302 splits the Local Store into an `operational` database (key `local-store-db-key`, `raw` — see §"Keychain credential walk-up policy") and a **`protected` database** that holds Clinical PHI and is opened only while the workspace is unlocked. The `protected` store's key joins the KEK hierarchy:

- **Material:** a random 256-bit key, generated once per workspace, used as the whole-DB cipher key for `protected-store.db`.
- **At rest:** **KEK-wrapped** with the frozen envelope shape (AES-GCM-KW, §"Algorithms"), AAD bound to `{ purpose: 'protected-store-key', workspaceId }`. The wrapped key is written to a per-workspace file `protected-store.key.json`. It is **never** stored in the keychain (raw or otherwise) and never written plaintext.
- **Why a dedicated file, not `lock.json`:** `lock.json` is owned by the lock/KEK subsystem (this ADR). The protected store is a separate base subsystem (ADR-302) that merely *consumes* the in-memory KEK to wrap/unwrap its own key. Keeping the wrapped key in its own artifact preserves that subsystem boundary and lets the protected store be provisioned lazily (the file exists only for workspaces whose active bundles declare `protected`-residency tables).
- **Lifecycle:**
  - *Setup* (`setupAcknowledge`, KEK first created): if a `protected`-residency table is registered, generate the protected-store key, wrap under KEK, write `protected-store.key.json`.
  - *Unlock / recovery-unlock* (KEK in memory): unwrap → open `protected-store.db` (running its migrations on first open) → key buffer zeroed after the cipher pragma is applied.
  - *Relock / auto-lock / sign-out / set-active* (KEK zeroed): close `protected-store.db` and drop its handle.
  - *Boot:* the active workspace is locked, so `protected-store.db` is **not** opened until first unlock.
- **Passphrase change does NOT re-wrap the protected-store key.** The KEK is stable across passphrase change (the passphrase wraps the KEK, not the data), so `changePassphrase` and recovery-unlock both yield the same KEK and unwrap the same protected-store key. Only **KEK rotation (O26)** re-wraps it — added to the rotation procedure's set of `kek-wrapped` artifacts.

Storage layout gains one per-workspace file:

```
$userData/workspaces/<uuid>/
├── lock.json
├── lock-attempts.json
├── meta.json
├── identity.envelope
├── protected-store.key.json     KEK-wrapped 256-bit cipher key for protected-store.db (O452; present only when a protected-residency table is declared)
├── protected-blobs.key.json     KEK-wrapped 256-bit cipher key for protected-blobs/ (O454; present only when a blob-residency need is declared)
├── local-store.db               operational store (prefs, settings, audit_log) — raw-keyed, open while locked
├── protected-store.db           protected store (Clinical PHI rows) — KEK-wrapped key, closed on lock
└── protected-blobs/             protected blob store (Clinical PHI files) — KEK-wrapped key, evaporates on lock
```

#### Sibling protected-blobs key (Amended 2026-06-08, O454)

_Amended 2026-06-08 (O454):_ binary/file PHI (document attachments) is stored as encrypted files under `protected-blobs/`, not in the protected DB (ADR-302 §"Protected blob store"). Its cipher key joins the hierarchy **identically** to the protected-store key above — random 256-bit, KEK-wrapped in `protected-blobs.key.json` (AAD bound to `{ purpose: 'protected-blobs-key', workspaceId }`), never in the keychain, never plaintext; provisioned lazily (file exists only for workspaces whose active bundles declare a blob-residency need); unwrapped on unlock and **evaporated on relock** via the same lock open/close seam (`ipc/lock-channel.ts`). Passphrase change does not re-wrap it; only **KEK rotation (O26)** does — it joins the protected-store key in the rotation procedure's `kek-wrapped` set. The **lean** posture (one key, single-shot AES-GCM over file bytes) is deliberate; the per-object-DEK envelope (ADR-303 sync unit) and framed streaming AEAD are deferred (O461, ADR-302).

### Dev-workspace auto-provision

_Added 2026-05-17:_ developer-experience optimisation. When `import.meta.env.DEV && !app.isPackaged && WorkspaceRegistry.list().length === 0`, Main auto-provisions a fixed workspace and auto-unlocks it so developers can skip the setup ceremony during iteration.

- `workspaceId = "00000000-0000-4dev-8000-000000000000"` (deliberately non-conformant UUID v4 — never collides with real ones).
- `nickname = "Dev Workspace"`.
- `email = "dev@ru-soam.local"`.
- Passphrase: hardcoded constant in a module imported only from the dev-provision branch.
- Recovery code: deterministically derived from the dev passphrase via HKDF; developers can re-derive without recording.
- Hard gate: `import.meta.env.DEV && !app.isPackaged`. A production binary has `app.isPackaged === true` and cannot enter the branch.
- Triggers only when `WorkspaceRegistry.list().length === 0`, so a developer who has manually created a real workspace in dev mode does not get the dev-workspace overlaid.
- A `DEV MODE — mock user` warning surfaces in the StatusBar (renderer-side; lands with Phase 9b's StatusBar entries).

This is not a threat-model relaxation — it is a developer-iteration affordance that production binaries structurally cannot reach.

### What this ADR does not commit

- The exact UI surface of setup, unlock, change-passphrase, recovery-code entry. Owned by the renderer.
- Recovery flow beyond "unlock with recovery code → force passphrase reset". Full recovery framework lives in ADR-306; recovery surfaces ship Phase 12.
- KEK rotation procedure (ADR-303 Open Item O26). Lives with recovery surface in Phase 12.
- Strategy A (user-owned KMS) implementation. Deferred per ADR-303 amendment; new Open Item O307a tracks.
- Audit emission for lock / unlock / setup events. ADR-502 owns the ledger; emit-points named here, wiring lands when the ledger does (Phase 10).

## Consequences

### Positive

- Walk-up attack on unlocked OS session is structurally blocked, matching ADR-301's "structurally impossible" principle on the local surface.
- Lock and auto-lock have operational meaning — relock is a real barrier, not a memory wipe with a one-click bypass.
- HIPAA Automatic Logoff posture is satisfied without a separate compliance feature.
- KEK is never plaintext on disk anywhere. Disk seizure of an unlocked-OS device still requires breaking the passphrase wrap.
- Recovery code stays the universal fallback — its role is clearer (recovery and bootstrap), not "fallback to a runtime key already on disk".
- Algorithm choices are pinned in an ADR rather than floating in a Guide, so Phase 10 and Phase 11 cannot drift.

### Negative

- Friction on every cold start and after every auto-lock. Practitioners type a passphrase often; this is a workflow tax.
- Forgotten-passphrase recovery is a real support category. Users who never recorded the recovery code and forget the passphrase enter the unrecoverable state earlier than they would have under the keychain-only model.
- Argon2id native dependency (`@node-rs/argon2`) adds a small build-complexity surface.
- Setup is heavier: passphrase ceremony + recovery-code ceremony in the same flow. More to teach, more to absorb.
- The idle-timeout default is a UX compromise — 5 minutes is aggressive enough to matter, short enough to annoy. Configurable per workspace.

### Neutral

- The architecture diverges from the original ADR-303 §Strategy B runtime model. ADR-303 is amended to absorb the change; the wrap-and-unwrap shapes for cloud transport are unaffected (the cloud still sees only `wrapped_KEK_recovery` and envelope ciphertext).
- The OS keychain still holds `local-store-db-key`, so ADR-304's CredentialStore stays in the architecture — its catalogue is just smaller.

## Considered Options

- **Keep ADR-303 Strategy B unchanged: random KEK in OS keychain, OS session as runtime gate** — _Rejected_: see Context. The walk-up threat in shared clinical workspaces was not named in the original reasoning; under it, the lock command has no teeth and the auto-logoff posture is absent.
- **Hybrid: passphrase-wrapped KEK + duplicate plaintext copy in keychain for "convenience mode"** — _Rejected_: worst of both, doubles the crypto surface, asks the user to pick between security and convenience (they will pick wrong), audit story is ambiguous.
- **Passphrase derives the KEK directly (no wrap, no random KEK)** — _Rejected_: passphrase change requires re-encrypting every envelope (the KEK is the passphrase). Wrapping a random KEK preserves the rotation-by-rewrap property already used for DEKs.
- **Passphrase + biometric (TouchID / Hello / fingerprint) shortcut** — _Deferred_: orthogonal optimisation. Biometric unwrap of a stored key copy would re-introduce the walk-up exposure unless gated carefully. Tracked as O307d alongside hardware-bound storage.
- **App-level passphrase wraps the KEK; recovery code wraps a second copy; inactivity auto-lock with system-event integration** _(chosen)_ — Matches endpoint clinical-software convention, satisfies ADR-301 on the local surface, leaves ADR-303's cloud-side story unchanged, preserves the KEK rotation property.

## Open Items

- **O307a** — Strategy A (user-owned KMS) implementation. Deferred from ADR-303 by this amendment; lands in a follow-up phase (Phase 9.5 or pre-Phase-11). **Precondition:** the `kms-credentials` keychain entry must be `kek-wrapped` per the policy in §"Keychain credential walk-up policy" (raw `kms-credentials` would let a walk-up attacker invoke KMS unwrap and defeat this ADR entirely). The capability that uses KMS refuses with `LockedError` when `workspace.locked`.
- **O307b** — Idle-timeout configurability range and default. 5 minutes is the baseline default. Confirm range (1–60 min?), per-workspace vs per-user override semantics when the settings cascade ships (Phase 10 / 12).
- **O307c** — Passphrase strength policy hardening. zxcvbn `score < 3` block ships in Phase 9. Revisit after first clinical user feedback — may tighten to `< 4`, may add length-vs-score blended scoring, may add common-clinical-password blacklist.
- **O307d** — Hardware-bound passphrase derivation (Secure Enclave on macOS, TPM-assisted Argon2id on Windows, hardware-keyed unlock on Linux where available). Optional later hardening. Cross-references ADR-304 O31. Biometric-shortcut UX (TouchID / Hello) lives here too.
- **O307e** — Audit-event catalogue for lock / unlock / setup / passphrase-change / recovery-code-use. Emit-points named in this ADR; ledger wiring lives with ADR-502 in Phase 10.
- **O307f** — Per-keychain-credential walk-up policy (`raw` vs `kek-wrapped`). Default for any new high-walk-up-impact credential is `kek-wrapped` per §"Keychain credential walk-up policy". Per-cred decisions recorded as the credential types land: `cloud-session-token` (Phase 11), `kms-credentials` (Phase 9.5+ per O307a), `third-party-api-key` (post-Phase-13). `local-store-db-key` is `raw` and stays raw (bootstrap chicken-and-egg) — but as of O452 it keys **only the `operational` store** (prefs/settings/audit, no PHI); a walk-up reader of it can no longer reach PHI. The PHI `protected` store's cipher key is **KEK-wrapped** in `protected-store.key.json` (not the keychain — see §"Protected-store key in the hierarchy"); the protected **blob** store's cipher key is likewise KEK-wrapped in `protected-blobs.key.json` (O454, §"Sibling protected-blobs key"). KEK rotation procedure (O26) re-wraps every `kek-wrapped` entry **and** both the protected-store and protected-blobs keys.
- **O452** — PHI-at-rest split: `protected` store + KEK-wrapped per-workspace cipher key, opened on unlock and closed on relock. Key hierarchy + storage layout amended above (§"Protected-store key in the hierarchy"); data-class mapping and the base/domain residency boundary live in ADR-302 (this ADR owns the key, ADR-302 owns the store). Slice O452-A = core mechanism; deferred: O452-B dev-tooling inspection of the protected store (needs passphrase→KEK→unwrap), O26 rotation re-wrap, prod PHI migration out of the operational DB.
- **O454** — Protected blob store sibling key: `protected-blobs.key.json`, same KEK-wrapped lifecycle and lock seam as the protected-store key (§"Sibling protected-blobs key"). Lean posture; per-object-DEK envelope + framed streaming deferred to O461. Store layout + base/domain boundary live in ADR-302.
- **O307g** — Real Google OAuth integration. Phase 9 ships a mocked dialog returning `{ email, googleId: "mock-<uuid>" }`. Real OAuth flow (PKCE, refresh tokens, session-token storage per `cloud-session-token` credential type) lands alongside cloud sync transport in Phase 11/12.
- **O307h** — Nickname global-uniqueness check. Cloud-side; Phase 9 ships length-only validation (4-64 chars). Server-side check lands when the cloud account record is real (Phase 11+). Migration plan for pre-existing duplicate nicknames captured at landing: server rejects on first sync attempt → user prompted to rename.
