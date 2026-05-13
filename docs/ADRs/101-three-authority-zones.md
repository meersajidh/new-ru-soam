# Three authority zones: Renderer, Main, Cloud Backend

**ID:** ADR-101
**Status:** Final
**Date:** 2026-05-12
**Supersedes:** —
**Superseded by:** —
**Related:** ADR-301

## Context

The application runs in three distinct execution environments: the Electron renderer (UI), the Electron main process (local OS-privileged runtime), and the Cloud Backend (server-side services).

Without explicit trust layering, code accretes wherever it is easiest to write. In practice this means the renderer ends up holding credentials, performing privileged operations, and acting as the de facto authority — because that is where the developer is already typing. This is the default failure mode of Electron applications.

The platform handles PHI, user-provided third-party API keys, and clinical workflows. Drifting toward a renderer-centric trust model is not acceptable. A trust model must be declared up front so that all subsequent decisions (networking, secrets, IPC, sync, audit) can be evaluated against it.

## Decision

The platform adopts three named authority zones. Each zone has a fixed trust level and a fixed set of responsibilities. Cross-zone interaction occurs only through brokered contracts; the mechanisms are defined in dependent ADRs.

### Renderer — UI capability layer

- **Trust:** _untrusted boundary_. Treated as the most exposed process in the application; assume eventual compromise.
- **Owns:** React UI, view state, user interaction, presentation logic.
- **Does not own:** persisted credentials, privileged OS access, direct network calls to authenticated endpoints, PHI storage.

### Main process — local-privileged authority

- **Trust:** _local-privileged_. Acts as the local capability broker — the kernel of the desktop runtime, not a server. Privileged within the user's machine; not a globally trusted environment.
- **Owns:** OS integrations, IPC routing, protocol handlers, credential storage access, network mediation for authenticated requests, permission enforcement, and the Local Store that holds PHI (per ADR-301).
- **Does not own:** app-owned third-party provider secrets, billing and quota logic, multi-tenant business rules.

### Cloud Backend — cloud-trusted authority

_The Cloud Backend is stubbed in the current implementation. This ADR declares its role and trust level; concrete capabilities will be added in dependent ADRs as backend services are built._

- **Trust:** _cloud-trusted_. Server-side environment under organizational control.
- **Role:** account systems, billing, quotas, app-owned secrets, app-owned third-party provider orchestration, operational data sync.
- **Does not own:** PHI (see ADR-301), user-provided third-party keys.

## Consequences

### Positive

- Every subsequent ADR has a fixed vocabulary for trust placement.
- New code has an unambiguous home: the answer to "where does this run" is constrained by "what authority does it need".
- The PHI boundary in ADR-301 acquires concrete machinery — the Main process is the enforcer and the Local Store sits inside it.

### Negative

- More layers than a monolithic SPA. Small features pay a fixed cost in IPC plumbing.
- Forces architectural decisions earlier than a prototype-first approach would.
- Developers used to "renderer can do anything" must unlearn that habit.

## Considered Options

- **All-renderer (monolithic SPA in Electron shell)** — _Rejected_: no trust boundary between UI and credentials. Standard Electron security guidance and the PHI requirement (ADR-301) both forbid this.
- **Two zones (Renderer + Cloud Backend, treat Main as a thin shell)** — _Rejected_: ignores the Main process as a real authority. The Local Store, OS keychain access, and protocol handlers must live in Main; pretending Main is invisible leaks those concerns into the renderer.
- **Treat Main as a local server (cloud-trust semantics)** — _Rejected_: blurs the role. Main runs in the user's untrusted OS environment and has different threat assumptions than a server. Cloud-trust semantics must not be assumed for local code.
- **Three zones with explicit authority contracts** _(chosen)_ — Matches the actual process topology and the trust gradient. Mirrors the platform shape that VSCode arrived at through evolution.
