# PHI backup and encryption: reasoning behind ADR-303

Reference document capturing the analysis behind ADR-303's commitments. Read this when ADR-303 leaves you wondering "but why this, not something simpler".

## The tension

Two strong constraints pull in opposite directions:

1. **ADR-301: the cloud cannot read PHI.** Stated as architectural principle, enforced structurally.
2. **Single-device practitioners lose everything when a laptop dies.** This is the realistic baseline user — one device, no backup ritual, a stolen or failed laptop is the highest-probability disaster.

A strict reading of (1) means no cloud touchpoint at all for PHI. Combined with (2), this produces a platform that quietly accepts data-loss exposure for the majority of its users. That trade is not acceptable for a clinical tool.

The resolution turns on what (1) actually forbids. ADR-301's principle is **the cloud cannot read PHI plaintext**. It is not "no bytes related to PHI ever traverse the cloud's wires". End-to-end encryption preserves the principle without forfeiting cross-device sync or disaster recovery: the cloud sees ciphertext, holds no decryption capability, and is regulatorily not in possession of PHI from its own perspective in most frameworks.

## The three options

### Option A — LAN P2P only + local backup tooling

PHI moves only between devices on the same network, encrypted end-to-end. No cloud touchpoint. Backup is the user's responsibility, with platform-provided tooling (encrypted export to external drive, NAS, the user's own cloud storage folder).

**For:** strictest reading of ADR-301; no cloud trust required.

**Against:**

- Single-device practitioners are the majority. LAN P2P does nothing for them.
- Backup discipline is hard to enforce. "Last backup N days ago" warnings are easy to dismiss.
- Stolen laptop with last week's backup is acceptable; stolen laptop with no backup is catastrophic. The platform cannot prevent the second outcome.

### Option B — E2EE cloud backup and sync

Cloud Backend stores ciphertext only. User holds the key. Cloud handles transport and durability; cannot decrypt.

**For:**

- Solves both problems (cross-device sync and disaster recovery) with one machinery.
- Cloud sees ciphertext only — ADR-301's principle is preserved.
- One transport stack; uniform shape.

**Against:**

- Key management is real engineering. Recovery is the hard part — if all keys are lost, ciphertext is gone.
- Live cross-device latency goes through the WAN even when both devices are in the same room.

### Option C — Hybrid: E2EE cloud + LAN P2P

E2EE cloud sync as the always-on convergence path. LAN P2P as an opportunistic accelerator when peers are reachable on the same network.

**For:**

- LAN P2P delivers near-zero-latency live sync when devices are co-located, which is the common multi-device case (laptop + desktop at home).
- Cloud sync is always available, so single-device users get backup and cross-device users not on the same network still converge.
- Same encrypted envelopes carry over either transport — no separate crypto.

**Against:**

- Two transport stacks. Genuine cost; mitigated by treating them as plug-ins to a single sync worker.

## Why C was chosen

The single-device practitioner is the dominant user profile, and the cost of their data loss is severe. Option A accepts this loss; rejected.

Between B and C, the question is whether LAN-fast live sync is worth a second transport. The judgement was yes — multi-device practitioners using their tools simultaneously expect near-instant convergence, and forcing every keystroke through the WAN to converge locally is the wrong feel for a clinical tool. The cost of the second transport is bounded because it slots in behind the same sync worker, the same envelopes, the same conflict resolution.

A secondary structural decision: **LAN P2P is an extension, cloud is platform**. The reasoning:

- Cloud sync is the universal path. Every install needs it. It belongs in the core.
- LAN P2P is an enhancement that depends on network conditions, OS permissions (mDNS / Bonjour), and user environment. It is reasonable to ship without it on day one. Making it an extension prevents the core from carrying transport complexity that not every user will exercise.
- This sets up a useful precedent: **sync transports are a contribution point** (per ADR-104). LAN P2P is the first plug-in. Future ideas — mesh, USB-direct, alternate cloud transports — land behind the same contract.

## The envelope encryption pattern

PHI is encrypted before any transport touches it. The shape:

```
plaintext  ──(DEK)──>  ciphertext
DEK       ──(KEK)──>  wrapped DEK

envelope = { wrapped_dek, ciphertext, metadata }
```

- **DEK** (Data Encryption Key): per-object, random, never reused.
- **KEK** (Key Encryption Key): wraps the DEK. User-managed. The KEK is what the user actually owns.

The wrapped DEK travels alongside the ciphertext. The cloud holds `{ wrapped_dek, ciphertext }` and cannot do anything with either without the KEK.

This pattern is standard in cloud cryptography for a reason: it cleanly separates the data-encryption story from the key-management story, supports rotation (re-wrap DEKs with a new KEK; the ciphertext doesn't have to be re-encrypted), and supports multi-recipient access (wrap the same DEK with multiple KEKs — relevant for clinic-shared content, ADR-501).

## Why KEK ownership is user-managed only

If the platform held any form of the KEK — even an escrowed copy, even split-secret-style — ADR-301's principle would be weaker. A platform breach would imply a PHI breach. An insider with KEK access would imply insider-readable PHI. The whole point of E2EE is that the platform cannot read the data; that holds only if the platform cannot get to the KEK by any path.

Two user-managed strategies are supported:

- **User-owned KMS** (Strategy A): the user provides a KMS account they control (Google Cloud KMS, AWS KMS, Azure Key Vault, etc.). The platform's role is to ask the user's KMS to wrap/unwrap on the user's authority. The user owns the account, can audit access, can revoke.
- **Recovery-code based** (Strategy B): the platform generates a KEK locally, and the user receives a one-time recovery code that can reconstruct or unlock the KEK. The user stores the code somewhere the platform cannot reach.

Strategy A is the cleaner story for users comfortable with cloud KMS. Strategy B is for users who want full off-platform key custody. Both are accepted; both have explicit risk acknowledgement during onboarding.

## Why KMS plugins follow ADR-305

KMS providers (Google, AWS, Azure, etc.) are third-party services the platform integrates with on the user's behalf, using the user's credentials. This is the same pattern as user-provided third-party API keys (AI providers, etc.) covered by ADR-305 (planned). The pattern fits cleanly: store KMS credentials in OS keychain (ADR-304), broker requests through main (ADR-203), never expose to renderer.

Making KMS providers plugins keeps the platform itself provider-agnostic. The user picks their KMS; the platform ships an integration plugin for that provider.

## Consent and onboarding

A platform that handles PHI cannot drift into a sync configuration silently. Consent is required, explicit, and per-strategy. Onboarding forces a choice before PHI is created. A user may always pick "local-only with data-loss risk" and operate the platform indefinitely in that state.

The upgrade path — enabling cloud sync on a previously local-only install — is a fresh consent moment. There is no silent migration; the user re-experiences the strategy choice and the associated risks.

## Trade-offs accepted

- **Recovery-code-only users have a real loss exposure.** Lost code + lost devices = lost data. Named in onboarding.
- **KMS-account loss is a real loss exposure.** Lost KMS account = lost ciphertext on cloud. Named in onboarding.
- **Key management UX is non-trivial.** Designing the KMS picker, the recovery-code ceremony, the paired-session flow for second-device bootstrap — each is real product work.
- **Two transport stacks.** Cloud and LAN. Mitigated by the contribution-point model; each transport is one plug-in implementation against one sync worker.

These are accepted because the alternative — accepting data loss for single-device users to preserve a strict but ineffective version of ADR-301 — is worse for the platform's actual users.

## Related

- ADR-301 — the original PHI boundary principle, which E2EE preserves rather than violates.
- ADR-302 — local-first data model that this encryption strategy slots into.
- ADR-303 — the architectural decision documenting the outcome of this reasoning.
- ADR-304 (planned) — credential storage in OS keychain (where KMS credentials, recovery-code-derived material, and DEK cache live at rest).
- ADR-305 (planned) — user-owned third-party credential pattern (KMS providers are an instance).
- ADR-501 (planned) — tenancy and clinic-shared key model.
- ADR-502 (planned) — audit and consent ledger (sync events emit audit entries before encryption).
