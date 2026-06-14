# identity service

Cloud Backend identity service for ru-soam (ADR-311, Phase 11a).

Thin Go/Gin server. Phase 11a.0 = structure + health only. Auth logic (Google JWKS verify, JWT issue, refresh rotation) lands in 11a.1–11a.3. No PHI, no KEK.

## What it does (11a.0)

- `GET /health` — overall health
- `GET /health/live` — liveness probe
- `GET /health/ready` — readiness probe

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

## Docker

```sh
docker build -t identity .
docker run -p 8080:8080 identity
```

## Project layout

```
cmd/main.go                 entrypoint
internal/app/               app lifecycle (Run + Shutdown)
internal/config/            env-based config
internal/error/             typed AppError + gin responder
internal/health/            /health handlers
internal/rest/              gin router + middleware
specs/openapi.yaml          API contract
```
