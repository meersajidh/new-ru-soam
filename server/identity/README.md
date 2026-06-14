# identity service

Cloud Backend identity service for ru-soam (ADR-311, Phase 11a).

Thin Go/Gin server. No PHI, no KEK.

## What it does

- `GET /health` — overall health
- `GET /health/live` — liveness probe
- `GET /health/ready` — readiness probe (503 when DB unreachable)
- `POST /v1/session` — verify a Google ID token; auto-register account; return `{account_id, sub, email}` (11a.2 — 11a.3 replaces with `{access_token, refresh_token}`)

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

## curl — verify auto-register

```sh
# 1. Start local Postgres + apply migrations
just db-identity-up
just migrate-identity up

# 2. Start server (with .env containing DATABASE_URL + GOOGLE_CLIENT_ID)
just dev-identity

# 3. POST a real Google ID token (obtained from the Desktop app's PKCE flow)
curl -s -X POST http://localhost:8080/v1/session \
  -H 'Content-Type: application/json' \
  -d '{"id_token":"<YOUR_GOOGLE_ID_TOKEN>"}' | jq .

# Expected response:
# {
#   "account_id": "<uuid>",
#   "sub": "<google-sub>",
#   "email": "<email>"
# }

# 4. Check readiness
curl -s http://localhost:8080/health/ready | jq .
```

Second POST with same token → same `account_id`, updated `email` if changed (upsert).

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
internal/model/                     data types (Account)
internal/service/                   domain logic: Google ID-token JWKS verifier
internal/session/                   POST /v1/session handler (verify + auto-register)
internal/store/                     AccountStore interface + pgx/v5 implementation
internal/rest/                      gin router + middleware
specs/openapi.yaml                  API contract
```

Deployment/orchestration artifacts (local-dev Postgres compose, prod
manifests) live under `server/deploy/`, not in this module — see
`server/deploy/README.md`. Local Postgres: `just db-identity-up`.
