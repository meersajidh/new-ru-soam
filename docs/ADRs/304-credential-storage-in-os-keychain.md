# Credential storage in OS keychain

**ID:** ADR-304
**Status:** Accepted
**Date:** 2026-05-13
**Supersedes:** —
**Superseded by:** —
**Related:** ADR-101, ADR-103, ADR-302, ADR-303, ADR-305 _(planned: third-party provider credentials)_, ADR-306 _(planned: data recovery)_

## Context

The platform needs a durable place to store secrets. The set includes:

- The session token for the user's Cloud Backend account.
- The Local Store database encryption key (per ADR-302).
- User-provided third-party API keys (per ADR-305, planned) — AI providers, KMS providers, etc.
- KEK or KEK-bootstrap material when the user picks Strategy B in ADR-303 (recovery-code-derived material the platform caches at runtime).

ADR-101 forbids any of these from living in the renderer. ADR-103 says all renderer access is through capabilities. This ADR commits to where on disk and through what OS facilities those secrets live.

A plain file in user-data is unacceptable — anyone with read access to the disk can extract it. An app-encrypted file with a bundled key is worse, because the key is in the binary. The OS already provides a managed credential store on every supported platform; the right answer is to use it.

## Decision

The platform stores credentials in the **operating system's keychain**, accessed through Electron's `safeStorage` API in the main process. No credentials are written elsewhere.

### Backend per platform

`safeStorage` resolves to the platform-native credential store:

- **macOS** — Keychain Services.
- **Windows** — DPAPI (Data Protection API), keyed to the user's Windows login.
- **Linux** — `libsecret` (GNOME Keyring / KWallet / etc.). Variant detection and fallback is an Open Item.

### Owner

A single **CredentialStore** service in the main process owns all keychain access. The service exposes a capability (ADR-103) with typed get/set/delete operations keyed by **credential type**.

```ts
interface CredentialStore {
  get<T extends CredentialType>(type: T, ref?: string): Promise<CredentialOf<T> | null>;
  set<T extends CredentialType>(type: T, value: CredentialOf<T>, ref?: string): Promise<void>;
  delete<T extends CredentialType>(type: T, ref?: string): Promise<void>;
}
```

Credential types are an enumerated set defined by the platform (illustrative):

- `cloud-session-token`
- `local-store-db-key`
- `third-party-api-key` (with `ref` = provider identifier; see ADR-305)
- `kms-credentials` (with `ref` = KMS provider identifier)
- `kek-material` (Strategy B from ADR-303)

The exact enumeration grows as features land; this ADR commits to the **typed enumeration** discipline, not to the catalogue.

### Renderer never sees credentials

Credentials never traverse the renderer/main boundary. A capability that *uses* a credential (e.g., `net.brokered.fetch` from ADR-203) consumes the credential inside main and returns only the result. The renderer asks for an operation, not for a credential. This holds even when the credential is logically associated with the user's input (e.g., the user pasting an API key into a form): the form's submit handler hands the value to a capability that writes it into the CredentialStore on the main side; the value does not round-trip back to the renderer afterwards.

### Permission scope

Each credential type carries a permission scope. Only main-side code with the matching scope may read it. The capability registry enforces the scope at bind time (per ADR-103). A bundle that needs `cloud-session-token` does not get to read `local-store-db-key`.

### Bootstrap

At Main startup:

1. The CredentialStore service initialises.
2. The Local Store layer requests `local-store-db-key`. If present, the Local Store opens. If absent, the platform is in fresh-install state and runs first-run setup (which generates the key and stores it).
3. Other subsystems (auth, sync worker, third-party providers) bind their credential needs as they activate.

Bootstrap failure (keychain unreachable, key corrupted, user password change rendering DPAPI material undecryptable) is a named recovery flow handled by ADR-306, not a silent crash.

### What does not live in the keychain

- **PHI.** PHI lives in the encrypted Local Store, not in keychain entries. Keychains are sized for secrets, not records.
- **User preferences and settings.** Operational data lives in the Local Store, not in keychain.
- **Bundled application secrets.** None exist — app-owned credentials live in the Cloud Backend (per ADR-101 and ADR-305 planned).

## Consequences

### Positive

- Secrets get the OS's encryption and access controls — Keychain ACLs on macOS, DPAPI on Windows, libsecret on Linux.
- No bundled secrets in the binary. The app holds no plaintext key material in source or build artefacts.
- One service, one access path, one audit target.
- Credential types are typed; misuse is a compile-time error.

### Negative

- Linux variability is real. `libsecret` is widespread but not universal; KWallet, no daemon, ssh-agent-only setups all exist. Fallback policy is an Open Item.
- Windows DPAPI is keyed to the user's Windows login; a Windows password reset (without the reset-disk recovery path) can render existing DPAPI-protected entries undecryptable. Recovery is handled in ADR-306.
- Keychain unavailability (locked, daemon dead, network home-dir issues) requires graceful degradation.

### Neutral

- The CredentialStore is a small, security-critical service. It receives outsized review attention; that is appropriate.

## Considered Options

- **Plain file under user-data** — _Rejected_: no OS protection. Disk read = secrets read.
- **App-encrypted file with a bundled key** — _Rejected_: the key sits in the binary. Equivalent to "secrets are public to anyone with the installer".
- **App-encrypted file with a key derived from user login** — _Rejected_: re-implements what OS keychains already do, worse.
- **Electron `safeStorage` over OS keychain, accessed via a typed main-owned service** _(chosen)_ — Uses platform-native protection. Typed, capability-scoped, single owner.

## Open Items

- **O30** — Linux backend variants and fallback policy. `libsecret`, KWallet, headless / no-daemon setups. Define behaviour when no backend is available (degraded mode? refuse to start? prompt for OS configuration?).
- **O31** — Hardware-bound storage (Secure Enclave on macOS, TPM-backed keys on Windows, hardware security modules on Linux). Preferred where available; pilot in a later phase. Defer specifics.
