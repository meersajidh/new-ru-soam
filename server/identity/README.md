# identity service

Cloud Backend identity service for ru-soam (ADR-311, Phase 11a).

Thin Go/Gin server. No PHI, no KEK.

## What it does

- `GET /health` — overall health
- `GET /health/live` — liveness probe
- `GET /health/ready` — readiness probe
- `POST /v1/session` — verify a Google ID token; return `{sub, email}` (11a.1 provisional — 11a.3 replaces with `{access_token, refresh_token}`)

## Run

**Requirements:** Go 1.26, `air` (`go install github.com/air-verse/air@latest`) for live reload.

```sh
# Live reload (preferred)
just dev-identity

# Plain run (no live reload)
just run-identity

# Tests
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
| `GOOGLE_CLIENT_ID` | _(required for 11a.1)_ | Desktop-app OAuth2 client ID. Used as audience when verifying Google ID tokens. Obtain from Google Cloud Console → APIs & Services → Credentials. If unset, the service logs a WARN at startup and rejects all real ID tokens. |

## Docker

```sh
docker build -t identity .
docker run -p 8080:8080 identity
```

## Project layout

```
cmd/main.go                 entrypoint
internal/app/               app lifecycle (composition root, Run + Shutdown)
internal/config/            env-based config (Server, Logging, Google)
internal/error/             typed AppError + gin responder
internal/health/            GET /health handlers
internal/service/           domain logic: Google ID-token JWKS verifier
internal/session/           POST /v1/session handler
internal/rest/              gin router + middleware
specs/openapi.yaml          API contract
```
