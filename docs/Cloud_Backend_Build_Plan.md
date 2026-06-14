# Cloud Backend Build Plan — Phase 11a (Identity service)

**Status:** Draft
**Date:** 2026-06-14
**Owner:** Architecture
**Decided by:** [ADR-311](ADRs/311-cloud-backend-identity-service.md) (design) · Open Items O309a / O468
**Scope:** Phase **11a** only — stand up the Cloud Backend (4th trust zone, ADR-101) as an **identity service**. Sync transport + conflict (O23) are 11b, out of scope.

---

## Context

The desktop app is a self-sufficient **node** (works offline/standalone; does all Google connectivity itself — identity in Main, providers as ADR-305 node-direct plugins). ADR-311 commits a thin server that does exactly four things: **verify Google ID-token → auto-register account → issue session JWT (+ rotating refresh) → record usage telemetry**. It holds **no PHI, no KEK** (ADR-301/303). This plan builds that server from scratch and wires the existing Main-side OAuth (ADR-309 Part A, already built) to it.

Build basis (ADR-311 §10, from the 2026-06-14 A/B/C review of three Go auth codebases): **pilot-quality service skeleton** (pilot control-plane layering) **wrapping the old monolith's Google ID-token JWKS verifier**, with **hashed refresh + reuse-detection** and a pluggable **Signer** (PEM-in-Secret-Manager first, Cloud KMS later).

---

## Placement & stack (locked)

- **`server/identity/`** in this monorepo (the `server/` placeholder), its **own Go module** (`go 1.26`, toolchain separate from the pnpm workspace; add a `just` recipe `dev-identity`).
- **Stack:** Gin · golang-jwt/v5 · **pgx/v5** (Postgres) · golang.org/x/crypto. **No `golang.org/x/oauth2`** — the server never does the OAuth code exchange (that stays in Main).
- **Infra:** Cloud Run (Dockerfile) · Cloud SQL Postgres · Cloud KMS (signing, from 11a.6) · Secret Manager · region **`asia-south1`** (India/DPDP).
- **Migrations:** `goose` (SQL-file based). **Signing:** `Signer` interface — `PEMSigner` (key in Secret Manager) first; `KMSSigner` swapped in at 11a.6, one impl change.

---

## File tree (pilot skeleton, trimmed to Individual MVP)

```
server/identity/
├── go.mod  Dockerfile  justfile  .air.toml
├── cmd/main.go
├── specs/openapi.yaml
├── migrations/                       # goose: accounts, refresh_tokens, session_events
└── internal/
    ├── app/        app.go build.go          # dependency wiring
    ├── config/     config.go server.go db.go oauth.go signer.go
    ├── error/      apperrors.go              # typed errors (pilot apperrors.* pattern)
    ├── model/      account.go claims.go refresh.go session_event.go
    ├── service/    verify.go    # ← port old monolith google.go (JWKS verifier)
    │               issue.go refresh.go session.go signer.go (PEM|KMS)
    ├── store/      store.go (iface) postgres.go (pgx/v5)
    ├── rest/       router.go routes.go middlewares.go handler_auth.go handler_health.go
    └── util/       crypto.go (random + SHA-256 hash) ctx.go
```

---

## Build sequence (vertical slices; each milestone verifiable)

| # | Slice | Deliverable | Milestone |
|---|---|---|---|
| **11a.0** | Skeleton + CI | Go module, layout, config (env), slog, recovery/access-log/CORS middleware, `/health{,/live,/ready}`, Dockerfile, `.air`, OpenAPI stub; compile + `go test` green | `just dev-identity` runs; `/health` → 200 |
| **11a.1** | Google verify | Port old `google.go` JWKS verifier (typed `googleClaims`, TTL+double-check-lock cache, iss/aud/sub/email checks) into `service/verify.go`; `POST /v1/session {id_token}` → verify; httptest-JWKS tests (from old `google_test.go`) | test ID-token verifies; bad iss/aud/missing-sub rejected |
| **11a.2** | Account + auto-register | `accounts` migration (`id`, `google_sub UNIQUE`, `email`, `entity_id NULL`, `created_at`), pgx store, auto-register on first verified token | verify → row created, second verify → looked-up |
| **11a.3** | JWT + refresh rotation | typed `appClaims` (`sub`, `entity_id?`, `exp`, issuer); RS256 sign via `Signer` (PEM); refresh = 64B random + **SHA-256 hash**, stored **by hash**, **rotation + reuse-detection (reuse → revoke family)**; `POST /v1/refresh`, `POST /v1/revoke` | login→JWT→refresh→rotate→revoke cycle; **replayed refresh rejected + family revoked** |
| **11a.4** | Usage telemetry | `session_events` migration (`sub`, `device_id`, `event_type`, `ts`, `app_version`); record on issue/refresh/signout | events written; **schema assertion: no PHI columns** |
| **11a.5** | Client (Main) integration | see §Client integration below | real sign-in hits server; airplane-mode sign-in works + flushes on reconnect |
| **11a.6** | GCP infra + deploy | Cloud Run (`asia-south1`), Cloud SQL instance, **`KMSSigner`** swap, Secret Manager (Google `client_secret`, DB creds), Cloud Build deploy | node talks to prod URL; KMS-signed JWT verifies |

---

## Client integration (11a.5) — wires existing Main surface

Existing (ADR-309 Part A, built):
- `apps/desktop/electron/main/auth/{oauth,loopback,pkce}.ts` — PKCE + loopback; `signInWithGoogle()` returns `{ email, googleId }`.
- `apps/desktop/electron/main/capability/platform-auth.ts` — capability `signInWithGoogle` → `{ ok, email, googleId }` (currently **no server round-trip**).
- `apps/desktop/electron/main/credentials/index.ts` — `CredentialStore` + `credentialStore` singleton; `CredentialType = 'local-store-db-key'`; `storageKey(workspaceId, type, ref)`.
- `apps/desktop/electron/main/lock/service.ts` — `LockService`; KEK held in memory unlock→relock; `lock.json` wrapped-KEK envelopes.

Changes:
1. **Surface the `id_token`** from `oauth.ts` (PKCE exchange already obtains it in Main) so Main can post it.
2. **Server call** — after OAuth, `POST <identity>/v1/session { id_token, device_id, app_version }` → `{ access_token, refresh_token }`. Best-effort (see offline below).
3. **Store refresh** — add `CredentialType 'cloud-session-token'`, stored **KEK-wrapped** (O307f) via `CredentialStore` + the `lock` KEK (only available while unlocked — fine; cloud contact only while unlocked).
4. **device_id** — generate UUID once per install, persist (operational, e.g. alongside workspace meta), send with each event.
5. **Offline-first** — sign-in **must not block** on the server: on network failure, complete local sign-in, **queue** the session event, **flush** on reconnect. Session JWT is online-acquired; absence does not gate core function.
6. **Capability** — extend `platform-auth` (ADR-202): renderer asks for sign-in / "am I signed in", never sees tokens.

---

## Gating & cross-cutting

- **O468 (DPDP consent/notice + retention)** — the server build proceeds, but **enabling telemetry in a release is gated** on the onboarding notice text + retention policy landing.
- **PHI invariant** — structural: identity DB has zero PHI columns (test-asserted; ADR-301).
- **Forward-compat** — `entity_id` claim/column kept **optional** (ADR-501 Individual MVP; ADR-503 Clinic later). No multi-tenant memberships/cells now.
- **Drop from salvage** — pilot control-plane's server-side OAuth exchange, password/argon2, auth-codes/SSO, cells/system-principals; old monolith's raw-refresh storage + license JWT (→ O309b).

---

## Salvage map (ADR-311 §10)

| Take | From |
|---|---|
| Google ID-token JWKS verifier + tests (near-verbatim) | old monolith `google.go`, `google_test.go`, `keys_test.go` |
| Typed JWT claims struct (`appClaims`) | old monolith `jwt.go` |
| Refresh hashing (`token + SHA-256`, lookup by hash) | pilot control-plane `service/jwt.go` `generateRefreshToken` |
| Service layering, typed `apperrors`, slog, middleware, OpenAPI, Dockerfile | pilot control-plane / app-plane skeleton |
| pgx/v5 store pattern | pilot app-plane |

---

## Verification (end-to-end)

- **Unit:** `go test ./...` — JWKS verify (httptest), JWT sign/verify round-trip, refresh rotation + reuse-rejection, store CRUD.
- **Local integration (11a.5):** run `server/identity` locally + `just dev-desktop`; real Google sign-in → server verifies + registers + returns JWT; toggle airplane mode → sign-in still completes, event flushes on reconnect.
- **PHI assertion:** schema test confirms identity DB has no PHI columns.
- **Prod (11a.6):** node points at Cloud Run URL; KMS-signed JWT verifies; session event lands in Cloud SQL; region = `asia-south1`.
- **Exit (per Implementation_Plan Phase 11a):** online sign-in verifies + auto-registers + issues JWT; session events recorded; offline sign-in works on local identity and flushes; server holds zero PHI.

---

## Deferred (not 11a)

- **11b** — sync queue + cloud mirror (`{wrapped_dek, ciphertext, metadata}` envelopes) + **O23** conflict (working assumption: per-record LWW + version counter).
- **O309b** — subscription/licensing (plan-as-claim, offline license JWT).
- **Cloud KMS** is in 11a.6; PEM-in-Secret-Manager covers 11a.0–11a.5.
- Multi-tenant / Clinic (ADR-503).
