# Cloud Backend identity service: node-first auth, ID-token verification, session JWT, usage telemetry

**ID:** ADR-311
**Status:** Accepted (amended 2026-06-15 — see Amendment 1: sign-out is a local operation; login ≡ signup; revoke moves to delete-account)
**Date:** 2026-06-14
**Supersedes:** —
**Superseded by:** —
**Related:** ADR-101, ADR-103, ADR-106, ADR-202, ADR-203, ADR-301, ADR-302, ADR-303, ADR-304, ADR-305, ADR-307, ADR-309, ADR-310, ADR-312, ADR-501, ADR-502

## Status note

This ADR **takes up ADR-309 Part B** (Open Item **O309a**), which ADR-309 left as a Proposed direction to be committed in "its own ADR when taken up". It is the **first slice of Phase 11 (11a)**: stand up the Cloud Backend as the fourth trust zone (ADR-101) with an **identity service only**. Cloud **sync transport** and **conflict resolution** (O23) are Phase 11b and out of scope here; this ADR records the seams they will bind to (the session JWT, the account/tenant record) without building them.

ADR-309 Part A (client identity — real Google OAuth in Main, replacing the Phase-9 mock) is **already built**. This ADR is the server side that Part A was given "a contract to bind to".

## Context

The desktop app is a **node** in a network of installs, not a thin client of a hub. Three properties are load-bearing and shape every decision below:

1. **The node is self-sufficient.** It works **offline and standalone** (ADR-302: "offline support is the default, not a feature; the sync worker is what is optional"). Nothing the node does for its core function may block on the Cloud Backend.
2. **All third-party connectivity is node-direct.** Bundles that reach external providers — Schedule → Google Calendar (ADR-310), Sessions → Google Meet, AI/KMS providers — do so as **ADR-305 Flow-A provider plugins**: user-provided credentials in the OS keychain (ADR-304), outbound calls brokered through Main (ADR-203), **with zero dependency on our Cloud Backend**. New provider bundles can be contributed (ADR-104/105) without any server change.
3. **PHI never reaches the cloud in plaintext** (ADR-301). The identity service handles **no PHI at all**; the architecture keeps that true structurally, not by inspection.

What the Cloud Backend must therefore do is narrow: establish **who owns a workspace's Entity** (ADR-501), issue the **session token** that will later authenticate that Entity to cloud sync (ADR-303), and record **operational usage telemetry** so app usage can be ascertained. What it must **not** do is participate in any node↔provider connectivity, hold any PHI, or hold any KEK/escrow (ADR-303: KEK is user-managed only).

A prior draft of this design routed the OAuth **code exchange** through the server (would make us a confidential client and remove the bundled `client_secret`). That was **rejected**: it breaks node offline-self-sufficiency and conflates identity with provider connectivity, which ADR-310 explicitly separates. See Considered Options.

## Decision

### 1. Server scope (11a)

The Cloud Backend identity service does exactly four things and no more:

1. **Auto-register** — on first verified Google ID-token, create a minimal account keyed by the Google `sub` (progressive registration; profile is filled in later, not behind a signup wall).
2. **Verify** the Google **ID-token only** (signature via Google JWKS, `aud`/`iss`/`exp`/`nonce`). The server **never participates in the OAuth code exchange** (§3).
3. **Issue a session JWT** (RS256) plus a rotating **refresh token**. The same session JWT is the credential that will authorize cloud sync once 11b lands.
4. **Record session events** for usage analytics (§7).

### 2. Stack ("Solution A")

| Concern | Choice | Notes |
| --- | --- | --- |
| Compute | **Cloud Run (Go)** | Serverless containers, scale-to-zero, low-ops; aligns with the small-scale / solo-ops posture. |
| Token signing | **Cloud KMS** (asymmetric RS256) | Private key never leaves KMS; clean rotation. (MVP-acceptable fallback: signing key in Secret Manager.) |
| ID-token verify | Google **JWKS** | Standard Google OIDC verification. |
| Account / tenant store | **Cloud SQL for Postgres** (smallest tier) | Relational fit for account/entity/refresh-token/session-event tables; pairs with the later sync mirror. |
| Secrets | **Secret Manager** | Google `client_secret`, DB creds, etc. |
| Region | **`asia-south1` (Mumbai)** | India-first product (MHA-2017 / DPDP); data residency. |

Language is **Go** (per direction). A comparative review of the old `~/Repos/msh/ru-soam` Go `identityaccess` subsystem as a **design reference** (not a port) is deferred to implementation time; ADR-309 §salvage already fences what must **not** be ported (single-blob `safe-store`, raw IPC channels, combined calendar+identity scopes).

### 3. OAuth boundary — node does the exchange, server verifies the ID-token only

OAuth runs **in Main** (ADR-309 §A1): PKCE + ephemeral loopback (`127.0.0.1`), `state`-validated. Main exchanges the authorization code **directly with Google** and obtains an ID-token. Main sends **only the ID-token** to the server; the server verifies it and never sees the code or the exchange.

**`client_id` and `client_secret` stay baked into the build.** Google issues a `client_secret` for the **Desktop-app (installed) client type** and the loopback flow uses it, but Google's own guidance treats that secret as **non-confidential** ("the client secret is obviously not treated as a secret") because a native binary cannot keep one. **PKCE (RFC 7636 / RFC 8252) is the actual security control**, not the secret. Bundling `client_id` + non-confidential `client_secret` + PKCE is the correct and standard native pattern; the bundled secret is **not** a leak.

This **closes the O309a "client-secret removal" sub-item as N/A**: removal was conditional on moving the exchange to the backend (confidential web client), which this ADR rejects. Likewise the O309a "token-exchange home (Main vs backend)" question is **resolved: Main**.

### 4. Token model

- **Session JWT** — RS256, Cloud-KMS-signed, short-lived (~15 min). Claims: `sub`, `entity_id`, `exp`, and (later) a plan claim for licensing (O309b). This is the credential 11b sync will present.
- **Refresh token** — opaque random, stored **server-side hashed** (never the raw value), **rotated on every use** (one-time-use; detected reuse revokes the whole token family).
- **Client at rest** — the node stores **only our refresh token** (`cloud-session-token`), **KEK-wrapped** in the CredentialStore (ADR-304/307). The node holds **no Google tokens** at rest for identity (the ID-token is verified and discarded; no `offline` scope is requested, so Google issues no refresh token for the identity grant). This **shrinks O307f** to a single client credential type; the old `google-oauth-refresh` client credential **does not exist** in this design.
- **Refresh loop never touches Google.** Google is contacted exactly once, at sign-in; all subsequent session renewal is node↔our-server.

### 5. Identity vs provider connectivity — two independent concerns

| | **Identity** (this ADR) | **Provider connectivity** (ADR-305 / ADR-310) |
| --- | --- | --- |
| OAuth | Main, `openid email profile` only | per-plugin, provider-specific scopes |
| Where credentials live | our session token only (client); account record (server) | OS keychain, per-provider entry (ADR-304) |
| Our server involved? | yes (verify + issue + log) | **no — node-direct, server-independent** |
| Example | sign-in establishes the Entity | Calendar, Meet, AI keys, user's KMS |

The identity Google grant and any provider Google grant (Calendar, Meet) both hit `accounts.google.com` but are stored as **distinct CredentialStore entries** so the grants do not collide (ADR-310 §Negative). Identity scope stays minimal — `openid email profile`, no calendar/meet scope rides along.

### 6. base/domain split (ADR-106) and the account model

- **Base (`basebench`) owns identity**: Google `sub`, email, session/refresh tokens, Entity binding. Identity is a domain-agnostic platform mechanism and is product-wide (this client + this server).
- **Domain (`ru-soam`) owns the "user profile"**: practitioner name, picture, and any clinical-role detail. Re-homed to Local Store + (later) operational sync, not a server signup wall.
- The server inherits the same one-way dependency: base identity tables ⟂ domain profile tables.
- **Account key** = Google `sub` (email is unique too, but `sub` is the stable key). **Nickname** is **display-only**, captured per ADR-501; it carries **no uniqueness constraint** — Google identity is already the unique key. This **withdraws the O307h "nickname global-uniqueness" requirement**.

### 7. Usage telemetry

> **Policy consolidated in [ADR-312](312-usage-telemetry-base-and-domain-tiers.md) (Accepted).** This section describes the **base mechanism** as built in 11a; the canonical telemetry decisions — base/domain two-tier model, 3-mode consent gate, PHI-free classification (incl. the stricter domain inferential-leakage rule), and 90-day retention — live in ADR-312. Keep policy edits there, not here.

The server records a **session-event** at each token **issue** (login), **refresh**, and **sign-out**, into a server-side **usage store** distinct from the ADR-502 clinical audit ledger (that ledger is PHI-domain, Main-origin, client-side; this is operational, account-level, server-side).

Each session-event row:

```
{ sub, device_id, event_type: 'login' | 'refresh' | 'signout', ts, app_version }
```

- **No IP address, no location.** Minimal personal-data surface for an analytics purpose.
- **`device_id`** = a **generated UUID** minted once per install and stored locally (operational), sent with each event. It is **not** a hardware fingerprint: it is user-resettable, not cross-app trackable, and DPDP-clean. Hardware fingerprinting is rejected for an analytics purpose (tracking-grade, fragile); it is only reconsidered if **licensing/anti-abuse device-binding** needs it → **O309b**.
- **Zero PHI by construction** — login/refresh/sign-out events carry no clinical content; the ADR-301 invariant is preserved structurally.
- This is the **first telemetry surface**, the trigger O28 (crash-dump PHI scrubbing) was deferred to. Usage-login telemetry needs no scrubbing (no PHI); crash-dump scrubbing remains separately deferred.

### 8. Offline-first and contact timing

- **Server contact is best-effort / online-only.** Sign-in **must not block** on the server. Offline, the node signs in against its **last-known local identity**, **queues** the usage event, and **flushes** on reconnect. The session JWT is online-acquired; the node's core function does not depend on holding a fresh one.
- **Contact timing = every online sign-in, regardless of sync state.** An account exists from first run (ADR-501: no anonymous workspaces), and usage telemetry is intended to measure **general** app usage, not sync-users only. Sync is a *later, additional* consumer of the same session JWT.

### 9. PHI and key invariants (restated, structural)

- The server stores **account records + usage events only**. No PHI. No PHI plaintext, no PHI ciphertext, in 11a.
- The server holds **no KEK, no escrow, no recovery copy** (ADR-303 §KEK ownership: user-managed only). The user's KMS (Strategy A) is the **user's own** account and is unrelated to our Cloud KMS, which signs JWTs only.
- When 11b adds sync, the server becomes a carrier of **`{ wrapped_dek, ciphertext, metadata }`** envelopes (ADR-303) — still no key, still unable to read PHI.

### 10. Salvage & build basis

Three prior Go auth codebases were reviewed (2026-06-14) as design inputs, not port targets:

| Source | What it is | Take | Leave |
| --- | --- | --- | --- |
| **Old monolith** `~/Repos/msh/ru-soam/.../identityaccess/auth` | Verify Google **ID-token** → auto-register practitioner → RS256 JWT + refresh (+license) | **The Google-flow** — `google.go` JWKS-cache verifier (TTL + double-check lock, issuer/aud/sub/email checks) is clean and exactly node-first / ID-token-only; **typed JWT claims struct** (`appClaims`) | Raw refresh-token storage (defect); local-RSA signing; license JWT (→ O309b); monolith embedding |
| **Pilot control-plane** `~/Repos/msh/pilot/control-plane/services/auth` | Full SaaS IdP (server-side OAuth code-exchange, password+argon2, auth-codes, SSO, PKCE, multi-tenant memberships, system-principals, gRPC) | **The craftsmanship + skeleton** — layered `cmd → internal/{app,config,error,model,service,store,rest,util}`, typed `apperrors.*`, slog, recovery/access-log/CORS, OpenAPI, Dockerfile; **refresh-token hygiene** (`generateRefreshToken` → token + SHA-256 **hash**, lookup by hash) | Server-side OAuth exchange (we keep exchange in Main); password/argon2 (Google-only); auth-code server / SSO; cells/memberships/system-principals (Individual MVP); `MapClaims` + `getStringClaim` manual extraction (use typed struct instead) |
| **Pilot app-plane** `~/Repos/msh/pilot/application-plane/services/auth` | Resource/verify service (JWT verify, tenant-scoped, gateway-aware) | **pgx/v5** driver; verifier + tenant-context middleware pattern → relevant to **11b** sync-endpoint auth | n/a for 11a issuance |

**Build basis:** old monolith is the right *shape*, the pilot is the right *craftsmanship*. Build 11a as a **pilot-quality service skeleton** (CP layering, pgx/v5, typed errors, slog, OpenAPI, Dockerfile-for-Cloud-Run) **wrapping the old monolith's Google ID-token verifier**, with **hashed refresh tokens + reuse-detection** and **Cloud-KMS JWT signing** (the one net-new piece none of the three have; PEM-in-Secret-Manager is the acceptable MVP fallback). The pilot's two-plane/cell architecture is an AWS-SaaS multi-tenant pattern — overkill for Individual MVP, loosely maps to future Clinic tenancy (ADR-503), not built now.

## Consequences

### Positive

- The node is **self-sufficient for all Google connectivity** (identity + every provider plugin). The Cloud Backend is a thin identity verifier + (later) sync backbone, touched only when online — and for sync, only when consented.
- Provider bundles (Calendar, Meet, AI) compose with **zero server work** (ADR-305 Flow A), satisfying the contribution model (ADR-104/105).
- `client_secret` posture is correct and standard for native apps; no false sense that the bundled secret is a vulnerability, and no server-exchange complexity introduced to "fix" a non-problem.
- Minimal, PHI-free, location-free telemetry gives real usage signal at low privacy cost; `device_id`-as-UUID stays DPDP-clean.
- Forward-compatible: the session JWT and account/Entity record are the exact seams 11b sync, ADR-503 Clinic tenancy, and O309b licensing bind to, with no reshaping.

### Negative

- Standing up a Cloud Run service + Cloud SQL + Cloud KMS + Secret Manager is real new infrastructure and ops surface (deploy, secrets, region, backups), even at the smallest tier.
- Refresh-token rotation with reuse-detection and an offline event queue is non-trivial correctness work (replay, clock skew, family revocation).
- Usage telemetry introduces a **new operational personal-data category** that needs a DPDP notice at onboarding (O468) before it can ship.

### Neutral

- Cloud SQL is not scale-to-zero (a small always-on cost). Firestore would be cheaper at idle but is a poor fit for the relational account/refresh-token model; revisit only if idle cost dominates.
- The old Go `identityaccess` subsystem informs the rebuild as a reference; the comparative A/B review against this design is deferred to implementation.

## Considered Options

- **Exchange the OAuth code on the server (confidential client; remove bundled secret)** — *Rejected.* Breaks node offline-self-sufficiency (sign-in would depend on the server) and conflates identity with provider connectivity, which ADR-310 explicitly separates. The "secret removal" it buys is unnecessary because the native client secret is non-confidential by Google's own model.
- **Self-issued RS256 JWT after ID-token verification** *(chosen)* — full control of `entity_id`/plan/license claims; matches ADR-309 Part B; signing key isolated in Cloud KMS.
- **GCP Identity Platform / Firebase Auth** — *Rejected.* Owns the token model and expects its own client SDK flow, fighting the already-built Main-owns-OAuth design; awkward custom Entity/license claims; vendor lock.
- **Cloud SQL Postgres vs Firestore for the account store** — *Cloud SQL chosen.* Relational fit, strong consistency, pairs with the later sync mirror. Firestore kept as a fallback only if idle cost becomes the dominant concern.
- **Hardware fingerprint as device identifier** — *Rejected* for an analytics purpose (tracking-grade, DPDP-sensitive, fragile). Generated UUID `device_id` chosen; fingerprint reconsidered only for licensing/anti-abuse (O309b).
- **GKE / App Engine / Cloud Functions for compute** — *Rejected* in favor of Cloud Run (ops overhead / legacy / event-shape mismatch respectively).

## Open Items

- **O468** *(partly resolved 2026-06-15)* — Usage-analytics consent/notice text + retention policy. Mechanism (the session-event store + the gated `/v1/events` channel) is committed in 11a.5b. **Notice DONE:** the opt-in 3-mode "Usage analytics" Settings control carries the consent notice (collected fields, explicit "no PHI", default-off). **Retention DECIDED: 90 days rolling** — raw `session_events` rows older than 90d are deleted; the **purge mechanism** (Cloud Scheduler + scheduled `DELETE`, or partition TTL) is implemented in **11a.6** and is the remaining gate before telemetry is *enabled* in a shipped release.
- **O309a** — *Resolved by this ADR* for the 11a identity slice (verification, JWT, refresh rotation, token-exchange home = Main). The "client-secret removal" sub-item closes as **N/A** (§3).
- **O307f** — *Shrunk*: the only client credential at rest is `cloud-session-token`, **KEK-wrapped**. The `google-oauth-refresh` client type does not exist in this design.
- **O307h** — *Withdrawn*: nickname is display-only; no global-uniqueness constraint (Google identity is the unique key).
- **O309b** — Subscription & licensing (plan-as-claim in the session JWT, offline license JWT, grace period). Own ADR; gated on this service existing. Also the home for any device-binding/fingerprint need.
- **O23** — Operational/PHI sync conflict resolution. Phase **11b**, not here. (Working assumption for the data shape at hand: per-record last-write-wins + version counter, since concurrent collaborative edit is deferred — O121.)
- **O28** — Crash-dump PHI scrubbing. This is the first telemetry surface (the named trigger); usage-login telemetry needs no scrubbing, crash-dump scrubbing stays deferred.

## Amendment 1 (2026-06-15) — sign-out is a local operation; login ≡ signup; revoke moves to delete-account

**Trigger.** The 11a.6 prod verification surfaced two "telemetry-flow" open items — **O472** (the `login` event is structurally near-uncapturable) and **O473** (sign-out orphans the cloud session with no way back). Working through them exposed that both are **category errors** introduced at *build* time (the 11a.5b / O471-phase-α client work), not gaps in this ADR's token model. §4–§5 already state the correct invariant — *Google is contacted exactly once, at sign-in; all subsequent session renewal is node↔our-server; identity ⟂ provider connectivity*. The build, however, wired **routine sign-out to revoke the server session** (`revokeOnSignOut` → delete the KEK-wrapped `cloud-session-token` + POST `/v1/revoke`), which is what manufactured the O473 orphan, and it treated `login` as if it were a recurring event, which is what made O472 look unsolvable. This amendment corrects the **session lifecycle semantics** to match the token model the ADR already chose. No change to the token model itself (§4), the OAuth boundary (§3), or the identity/provider split (§5).

### A1.1 The two session events the user experiences (and what each does)

Each **workspace is an account** (ADR-501; the account key is Google `sub`, §6). After the **one-time signup** (the only Google sign-in), there are exactly two recurring "session" events, and **neither involves Google or the server session**:

| User action | What it is | Effect on the local KEK | Effect on the cloud session (our refresh token at rest) |
| --- | --- | --- | --- |
| **Lock / auto-lock** (2a) | Workstation-style lock | KEK evaporates; in-memory state cleared | **Kept.** Rotated via `/v1/refresh` at the next unlock. |
| **Sign out** (2b) | Logoff → return to the account picker | KEK evaporates; in-memory state cleared | **Kept.** The picker loads *another* account; returning to this one and unlocking rotates *its* credential. |

Sign-out (2b) differs from lock (2a) only in that it returns to the **account picker** (to switch accounts) instead of the unlock prompt for the same account. Both are **purely local**: the per-workspace `cloud-session-token` stays KEK-wrapped at rest, and the next unlock of that account rotates it. Because the refresh token is a **30-day sliding window** (rotated on every use), an account re-entered within 30 days **never re-contacts Google**.

### A1.2 Revoke is an explicit account-end action, not routine logoff

Tearing down the **server session** (POST `/v1/revoke` + delete the credential) is a deliberate, rare act — it belongs to **delete-account** (`soam:workspace:delete`, the Danger-Zone action that destroys the whole workspace), **not** to routine sign-out. There is no separate "disconnect cloud but keep the workspace" surface: telemetry already has its own three-mode off switch (it does not need session revocation to stop), and sync (11b) is future and separately consented. So:

- **Routine sign-out / lock** → drop in-memory session state only; **keep** the stored credential; emit **no** `signout` telemetry (the cloud session is still alive server-side — emitting `signout` would be a lie).
- **Delete-account** → while still unlocked, revoke the server session (best-effort `/v1/revoke`), emit the **one** honest `signout` telemetry event, then delete the credential and the workspace.

### A1.3 `login` ≡ signup — there is no recurring login

The §7 `login` session-event fires **only at signup** (the first and only Google sign-in, when the pending refresh token is first committed). Workspace **re-entry is not a login** — it is a `refresh`. Therefore:

- **O472 dissolves.** Stop trying to make `login` capturable as a recurring event. Accept it as the **one-time signup marker** (best-effort; it may fire before the user can opt into telemetry, since the per-account mode defaults off — that is acceptable for a once-per-account event). The **recurring activity heartbeat is `refresh`** (emitted on every unlock), which *is* captured.
- The closed event enum `{ login, refresh, signout }` is **unchanged**; only its semantics are clarified: `login` = signup (once), `refresh` = unlock/heartbeat (recurring), `signout` = explicit account-end (rare).

### A1.4 The one path Google legitimately reappears for identity

If an account is **idle past the 30-day refresh window**, the stored refresh token lapses; the next unlock's `/v1/refresh` returns `CloudAuthError`, the dead credential is cleared, and the account's cloud session is genuinely gone. Restoring it then requires a **fresh Google ID-token = a re-sign-in** (this is a *sign-in*, **not** a signup — the account already exists, keyed by `sub`). This is the **only** identity path where Google reappears after signup, and it is rare. A **"Reconnect to sync"** recovery entry point (re-run the Main OAuth → fresh `/v1/session` → commit while unlocked) is the recovery UX. It is **deferred** (telemetry is the only System-A consumer today, and it is opt-in/best-effort) → **O475**.

### A1.5 Provider connectivity (System B) consent/scope strategy — deferred

The Google grants for **provider APIs** (Calendar, Meet — §5, ADR-305 Flow-A, **domain**-owned, OS-keychain, server-independent) are a separate, unbuilt concern. Their open design question is **consent/scope strategy**: request provider scopes **incrementally per plugin** (cleaner credential isolation per ADR-310, but risks repeated auth prompts as Activities are added) vs **bundled** at a single consent moment (fewer prompts, weaker isolation). This is **not** part of identity and is deferred to the provider-connectivity ADR when Calendar/Meet build → **O476**.

### A1.6 Status changes

- **O472** — *Resolved by this amendment* (A1.3): `login` ≡ signup, one-time; recurring heartbeat is `refresh`.
- **O473** — *Resolved by this amendment* (A1.1/A1.2): routine sign-out is local and keeps the credential; revoke moves to delete-account. The orphan cannot occur.
- **O475** *(new)* — "Reconnect to sync" recovery UX for the 30-day-idle dead-refresh case (A1.4). Deferred.
- **O476** *(new)* — Provider-grant consent/scope-prompt strategy (incremental vs bundled), System B / domain (A1.5). Deferred to the provider-connectivity ADR.
