# Data recovery flows

**ID:** ADR-306
**Status:** Accepted
**Date:** 2026-05-13
**Supersedes:** —
**Superseded by:** —
**Related:** ADR-301, ADR-302, ADR-303, ADR-304, ADR-305

## Context

Several failure modes have surfaced as prior ADRs landed:

- DPAPI material rendered undecryptable after a Windows user password reset (ADR-304).
- Cloud ciphertext rendered undecryptable after a KMS account access loss (ADR-303 Strategy A).
- All devices lost together with the recovery code (ADR-303 Strategy B).
- Device theft or hardware failure (anywhere).
- Local Store corruption (ADR-302).
- Voluntary PHI export to a user-chosen destination, and the inverse import flow (ADR-302 O24).

Each is a different scenario with different preconditions and outcomes, but they share enough structure to deserve a single framework. Without one, recovery shows up as ad-hoc error handlers scattered across services, and users find out after the fact which scenarios were "supported".

This ADR commits to **a recovery framework** that names every scenario, what is recoverable, what is not, and through which path. Each recovery path is a first-class capability, not an error handler.

Operational detail — what each recovery flow looks like step by step, detection heuristics, edge cases — is captured in the companion [Data encryption, key management, and recovery guide](../Guides/data-encryption-and-recovery.md). This ADR commits the framework; the guide elaborates the procedures.

## Decision

### Framework

For every recovery scenario the platform names:

- the **trigger** that detects the scenario,
- the **preconditions** that determine which recovery path applies,
- the **path** the platform offers,
- the **outcome** — what is recovered, what is lost.

Scenarios with no path under their preconditions are labelled **unrecoverable**, surfaced in onboarding when the user makes choices that produce this risk, and named explicitly in the UI when they occur.

### Scenario catalogue

The platform commits to handling the following scenarios. Each is a first-class flow with its own UX, telemetry, and recovery capabilities.

| # | Scenario                                                | Recovery path (if any)                                                                                                | Loses                                                          |
|---|---------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------|
| 1 | Lost device; another device still online                | Add new device → paired-session bootstrap (ADR-303); sync converges via cloud or LAN.                                  | Nothing of substance.                                          |
| 2 | Lost device; no other device; cloud sync was enabled    | New device → authenticate → unlock KEK (KMS or recovery code) → restore from cloud ciphertext.                         | Anything not yet synced at moment of loss.                     |
| 3 | Lost device; no other device; local-only (no cloud)     | Restore from local backup file if the user took one (scenario 9 below).                                                | If no backup: everything. Named in onboarding.                 |
| 4 | Windows password reset; DPAPI keychain entries dead     | Detect at boot. If cloud sync was on: treat as scenario 2 on the same machine (reinit). If local-only: scenario 3.     | Locally-cached unsynced data if cloud-on; everything if local-only-no-backup. |
| 5 | KMS account access lost (Strategy A)                    | Cloud ciphertext becomes undecryptable. Still-online devices remain functional (DEKs cached in keychain).             | Cloud ciphertext for scenarios 2 and 4. Local data unaffected. |
| 6 | Recovery code lost + all devices lost (Strategy B)      | **Unrecoverable.** Named in onboarding.                                                                                | Everything.                                                    |
| 7 | Local Store corruption                                  | If cloud sync was on: reinit local store, restore from cloud. If local-only: restore from backup. Else reinit empty.   | Same as scenarios 2/3 depending on preconditions.              |
| 8 | Voluntary local backup export                           | User-initiated. Encrypted envelope (ADR-303 shape) written to user-chosen destination.                                 | (Not a loss scenario.)                                         |
| 9 | Local backup import                                     | User-initiated. Envelope decrypted with user's KEK; records merged into Local Store with conflict resolution per ADR-302/303. | (Not a loss scenario.)                                         |

### Capabilities, not error handlers

Each scenario above maps to a recovery capability with a typed entry point. Examples (illustrative):

- `recovery.pairedSessionBootstrap` — scenario 1.
- `recovery.restoreFromCloud` — scenarios 2, 4-when-cloud, 7-when-cloud.
- `recovery.restoreFromBackupFile` — scenarios 3, 4-local-only, 7-local-only, 9.
- `recovery.exportBackupFile` — scenario 8.
- `recovery.handleDpapiLoss` — scenario 4 detection and routing.
- `recovery.handleKmsAccessLoss` — scenario 5 routing.

These capabilities live in main, follow ADR-103's bind/scope rules, and surface to the renderer through a dedicated recovery surface (a recovery view in the workbench shell). Recovery is not buried in catch blocks; it is a named area of the product.

### Detection

Each scenario has a detection trigger:

- DPAPI loss: keychain read of a known entry returns "cannot decrypt" at boot. Platform routes to scenario 4 flow.
- KMS access loss: KMS unwrap returns an authorization error during sync worker activity. Platform routes to scenario 5 flow.
- Local Store corruption: SQLite integrity check fails or open fails. Platform routes to scenario 7 flow.
- Cloud-side ciphertext-undecryptable scenarios are recognised when KEK unwrap fails, regardless of which scenario produced them.

Detection failures (the platform cannot tell the user is in scenario X) become silent data loss, which is the worst outcome. Detection coverage is reviewed when any recovery path lands.

### Local backup file format

A local backup file is an encrypted envelope (ADR-303 shape) plus a manifest:

- header: format version, envelope schema version, manifest signature.
- manifest: list of included record types, record counts, source-device identifier, export timestamp.
- payload: envelope ciphertext containing the records and their wrapped DEKs.

The user's KEK is required to decrypt on import. The platform does not embed any recovery secret in the backup file itself.

This format absorbs ADR-302 Open Item O24.

### Unrecoverable scenarios are named, not hidden

Scenario 6 is the canonical case. Onboarding for Strategy B (ADR-303) explicitly states that loss of the recovery code plus all devices is unrecoverable. The platform does not soften this. A user who later finds themselves in that scenario sees a clear "no recovery path; the platform cannot help here" message rather than a hopeful-sounding error.

### Cloud-side ciphertext deletion

Several scenarios result in cloud ciphertext that is no longer useful (KMS access lost, KEK strategy migration, user opt-out). The Cloud Backend exposes a deletion API; the platform offers the user a deliberate path to invoke it. Deletion is not passive — the platform does not garbage-collect undecryptable ciphertext silently, because the user may yet recover KMS access.

### Migration between KEK strategies

A user may move from Strategy B (recovery-code) to Strategy A (KMS), or vice versa. The migration:

1. Generates a new KEK under the new strategy.
2. Re-wraps existing DEKs with the new KEK on each online device.
3. Pushes re-wrapped envelopes to the cloud.
4. After all devices confirm, deletes the old-KEK-wrapped envelopes from the cloud.

Migration is a multi-step capability; the user sees progress and can pause. Mid-migration state is recoverable. Step-by-step detail lives in the companion guide.

## Consequences

### Positive

- Every loss-bearing scenario the platform recognises has a named flow, not an ad-hoc catch block.
- Users see honest outcomes — what is recoverable, what is not, before they make the choice that exposes them.
- Recovery code paths are testable as first-class capabilities, not as side effects of error states.
- The framework absorbs future scenarios cleanly: a new failure mode adds a row to the catalogue and a capability for its flow.

### Negative

- Significant surface area. Each scenario is real product work — UX, copy, telemetry, edge cases.
- Detection coverage is the silent failure point. Missed scenarios mean silent data loss.
- "Unrecoverable" outcomes will not be popular even when named honestly. The alternative — implicit platform escrow — is worse for the trust model.

### Neutral

- The framework will grow. New scenarios (e.g., synced clinic-level corruption, ADR-501) plug into the same shape.

## Considered Options

- **No recovery framework; ad-hoc handling per service** — _Rejected_: produces silent or inconsistent behaviour across scenarios. Users learn the platform's actual coverage by accident.
- **Cloud-managed recovery (platform escrows KEK or a derivative)** — _Rejected_: violates ADR-303's user-managed-key commitment. Re-introduces insider risk.
- **Single uniform "restore" flow that tries every path in sequence** — _Rejected_: hides which path actually ran; obscures preconditions; surfaces confusing errors when nothing applies.
- **Named scenarios, typed recovery capabilities, honest unrecoverable outcomes** _(chosen)_ — Matches the rest of the platform's named-and-typed discipline.

## Open Items

- **O38** — Local backup file format details (envelope schema version, manifest signing). Lock when first export ships.
- **O39** — DPAPI loss detection heuristic. False positives are bad (forces unneeded reinit); false negatives are worse (silent failures).
- **O40** — KMS access loss UX. Specifically the case where the user expects KMS to come back and does not want to delete cloud ciphertext.
- **O41** — Cloud-side ciphertext deletion API contract. Single-call delete? Tombstone with grace period? Determines how scenarios 5 and migration recover.
- **O42** — Optional **passphrase-wrapped backup** as a low-priority extension/plugin on top of the core export flow, for users who store backups in less-trusted locations (shared cloud drive, etc.). Not in core; lands as a bundle if/when demand exists.
