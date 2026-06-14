# identity service

Cloud Backend identity service for ru-soam (ADR-311, Phase 11a).

Thin Go/Gin server. No PHI, no KEK.

## What it does

- `GET /health` — overall health
- `GET /health/live` — liveness probe
- `GET /health/ready` — readiness probe (503 when DB unreachable)
- `POST /v1/session` — verify Google ID token; auto-register account; issue `{access_token, refresh_token, expires_in, token_type}` (RS256 JWT, 15min + opaque rotating refresh, 30d)
- `POST /v1/refresh` — rotate refresh token (one-time-use); reuse → revoke entire family + 401
- `POST /v1/revoke` — sign out; revoke token family (idempotent)

## Run

**Requirements:** Go 1.26, `air` (`go install github.com/air-verse/air@latest`), Docker (for local Postgres).

```sh
# Start local Postgres
just db-identity-up

# Apply migrations
just migrate-identity up

# Live reload (preferred)
just dev-identity

# Plain run (no live reload)
just run-identity

# Tests (store integration test auto-skips without DATABASE_URL)
cd server/identity && go test ./...
```

## Environment variables

Copy `.env.example` to `.env` and edit as needed.

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8080` | TCP port. Cloud Run injects this automatically. |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:3000\|http://localhost:5173` | Pipe-separated allowed origins. |
| `LOG_LEVEL` | `INFO` | `DEBUG` / `INFO` / `WARN` / `ERROR` |
| `LOG_FORMAT` | `json` | `json` or `text` |
| `GOOGLE_CLIENT_ID` | _(required for 11a.1+)_ | Desktop-app OAuth2 client ID. Used as audience when verifying Google ID tokens. If unset, service logs WARN and rejects all real tokens. |
| `DATABASE_URL` | _(required for 11a.2+)_ | pgx-compatible Postgres connstring. Example: `postgres://identity:identity@localhost:5432/identity?sslmode=disable`. If unset, readiness → 503 and session → 500. |
| `JWT_DEV_EPHEMERAL` | `false` | Set `true` for local dev — generates an in-memory RS256 keypair (WARN logged; tokens invalid across restarts). **Never in production.** |
| `JWT_SIGNING_KEY_PEM` | — | Inline PEM-encoded RSA private key (PKCS#1 or PKCS#8). Takes precedence over `JWT_SIGNING_KEY_PATH`. |
| `JWT_SIGNING_KEY_PATH` | — | Path to a PEM file containing the RSA private key. |
| `JWT_ISSUER` | `ru-soam-identity` | JWT `iss` claim. |
| `JWT_ACCESS_TTL` | `15m` | Access JWT lifetime (`time.ParseDuration` format). |
| `JWT_REFRESH_TTL` | `720h` | Refresh token lifetime (default 30 days). |

## Migrations

Migrations live in `internal/migrations/sql/` (embedded via `embed.FS`). Run via the `cmd/migrate` binary:

```sh
# Apply all pending migrations
DATABASE_URL=postgres://identity:identity@localhost:5432/identity?sslmode=disable \
  go run ./cmd/migrate up

# Roll back one migration
DATABASE_URL=... go run ./cmd/migrate down

# Check migration status
DATABASE_URL=... go run ./cmd/migrate status

# Or use the justfile recipe (reads DATABASE_URL from .env)
just migrate-identity up
```

## Local Postgres (dev)

```sh
# Start
just db-identity-up

# Stop
just db-identity-down
```

Credentials (dev only): user=`identity`, password=`identity`, db=`identity`, port=`5432`.

## curl — token lifecycle (11a.3)

Requires a real Google ID token from the Desktop PKCE flow (see ADR-311 §3).
The full automated flow (Desktop → server → refresh → revoke) is 11a.5.

```sh
# 1. Start local Postgres + apply both migrations
just db-identity-up
just migrate-identity up

# 2. Start server with JWT_DEV_EPHEMERAL=true (add to .env)
just dev-identity

# 3. Login — POST /v1/session with a real Google ID token
TOKEN_RESP=$(curl -s -X POST http://localhost:8080/v1/session \
  -H 'Content-Type: application/json' \
  -d '{"id_token":"<YOUR_GOOGLE_ID_TOKEN>"}')
echo "$TOKEN_RESP" | jq .
# { "access_token":"eyJ...", "refresh_token":"...", "expires_in":900, "token_type":"Bearer" }

ACCESS=$(echo "$TOKEN_RESP" | jq -r .access_token)
REFRESH=$(echo "$TOKEN_RESP" | jq -r .refresh_token)

# 4. Rotate — POST /v1/refresh (issues new pair, marks old consumed)
REFRESH_RESP=$(curl -s -X POST http://localhost:8080/v1/refresh \
  -H 'Content-Type: application/json' \
  -d "{\"refresh_token\":\"$REFRESH\"}")
echo "$REFRESH_RESP" | jq .
NEW_REFRESH=$(echo "$REFRESH_RESP" | jq -r .refresh_token)

# 5. Replay old refresh → 401 (reuse detected; family revoked)
curl -s -X POST http://localhost:8080/v1/refresh \
  -H 'Content-Type: application/json' \
  -d "{\"refresh_token\":\"$REFRESH\"}" | jq .
# { "error": { "code": "UNAUTHORIZED", "message": "invalid_grant" } }

# 6. Revoke — POST /v1/revoke (sign out)
curl -s -X POST http://localhost:8080/v1/revoke \
  -H 'Content-Type: application/json' \
  -d "{\"refresh_token\":\"$NEW_REFRESH\"}"
# 200 (idempotent; unknown tokens also 200)

# 7. Check readiness
curl -s http://localhost:8080/health/ready | jq .
```

### Generate a signing keypair (dev / interim prod)

```sh
just gen-identity-keys          # keys/{private,public}.pem, 2048-bit (keys/ gitignored)
# or: cd server/identity && ./scripts/gen-jwt-keys.sh [output_dir] [bits]
```

The script prints the `JWT_SIGNING_KEY_PATH` to set. For prod (pre-KMS), load
the private PEM into Secret Manager and inject it as `JWT_SIGNING_KEY_PEM` at
deploy — never commit a private key. Migrate to Cloud KMS at 11a.6.

### Hard-fail without signing key

Starting the server without a signing key and `JWT_DEV_EPHEMERAL` unset:

```sh
# Confirm hard-fail at boot:
go run ./cmd  # exits with: "build: init JWT signer: signer: no signing key configured..."
```

## Docker

```sh
docker build -t identity .
docker run -p 8080:8080 identity
```

## Project layout

```
cmd/main.go                         entrypoint
cmd/migrate/main.go                 goose migration runner
internal/app/                       app lifecycle (composition root, Run + Shutdown)
internal/config/                    env-based config (Server, Logging, Google, DB)
internal/error/                     typed AppError + gin responder
internal/health/                    GET /health handlers (readiness pings DB)
internal/migrations/sql/            embedded goose SQL migration files
internal/model/                     data types (Account, Claims, RefreshToken)
internal/service/                   Google ID-token JWKS verifier; PEMSigner; TokenService
internal/session/                   /v1/session, /v1/refresh, /v1/revoke handlers
internal/store/                     AccountStore + RefreshTokenStore interfaces + pgx impls
internal/util/                      CryptoRandomToken, S256Hash
internal/rest/                      gin router + middleware
specs/openapi.yaml                  API contract
```

Deployment/orchestration artifacts (local-dev Postgres compose, prod
manifests) live under `server/deploy/`, not in this module — see
`server/deploy/README.md`. Local Postgres: `just db-identity-up`.
