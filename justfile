set dotenv-load

# list available recipes
default:
    @just --list

# ── Dev ──────────────────────────────────────────────────────────────────────

dev-desktop:
    @cd apps/desktop && pnpm run dev

# Run the Cloud Backend identity service with live reload (requires `air`)
dev-identity:
    @cd server/identity && air

# Run the Cloud Backend identity service (plain, no live reload)
run-identity:
    @cd server/identity && go run ./cmd

# Start local Postgres for identity service dev (docker compose)
db-identity-up:
    @cd server/deploy/dev && docker compose up -d

# Stop local Postgres for identity service dev (add `-v` manually to wipe data)
db-identity-down:
    @cd server/deploy/dev && docker compose down

# Run goose migrations — DATABASE_URL from server/identity/.env or env
# Example: just migrate-identity up
migrate-identity command="up":
    @cd server/identity && go run ./cmd/migrate {{command}}

# Generate an RS256 JWT signing keypair for the identity service (dev/interim-prod)
# Example: just gen-identity-keys          (keys/, 2048-bit)
#          just gen-identity-keys keys 4096
gen-identity-keys *args:
    @cd server/identity && ./scripts/gen-jwt-keys.sh {{args}}

# Inspect a workspace DB (dev only). Examples:
#   just dev-db --list
#   just dev-db meersh --info
#   just dev-db meersh --tables
#   just dev-db meersh --sql "SELECT * FROM prefs"
#   just dev-db meersh --protected --info
#   just dev-db meersh --protected --tables
#   RU_SOAM_DEV_PASSPHRASE=mypass just dev-db meersh --protected --tables
# NOTE: a quoted multi-word --sql "…" canNOT go through this recipe — just splits
# {{args}} on spaces and truncates the query. Use `dev-db-sql` / `dev-db-psql`.
dev-db *args:
    @cd apps/desktop && pnpm exec electron --no-sandbox scripts/dev-localstore.mjs {{args}}

# Run a read-only SQL query against a workspace OPERATIONAL DB (dev only). Quote the query:
#   just dev-db-sql meersh "SELECT * FROM prefs"
dev-db-sql name query:
    @cd apps/desktop && pnpm exec electron --no-sandbox scripts/dev-localstore.mjs {{name}} --sql "{{query}}"

# Run a read-only SQL query against a workspace PROTECTED (PHI) DB (dev only).
# Needs the passphrase — pass via env to avoid shell-history leak:
#   export RU_SOAM_DEV_PASSPHRASE='…' && just dev-db-psql meersh "SELECT id, given_name, status FROM patients"
dev-db-psql name query:
    @cd apps/desktop && pnpm exec electron --no-sandbox scripts/dev-localstore.mjs {{name}} --protected --sql "{{query}}"

# Run a WRITE statement against a workspace PROTECTED (PHI) DB (dev only). DESTRUCTIVE — opens
# the DB read-write and prints the changed row count. No audit, no cascade — raw sqlite. Use only
# for dev fixups (e.g. orphaned rows from cross-bundle erase gaps). Passphrase via env:
#   export RU_SOAM_DEV_PASSPHRASE='…' && just dev-db-pexec meersh "DELETE FROM client_meeting WHERE patient_id='…'"
dev-db-pexec name query:
    @cd apps/desktop && pnpm exec electron --no-sandbox scripts/dev-localstore.mjs {{name}} --protected --exec --sql "{{query}}"

# Build packaged release (.deb on Linux, .exe on Windows)
build-desktop:
    @cd apps/desktop && pnpm run dist

# Alias: same as build-desktop (mirrors `pnpm --filter ru-soam dist`)
dist:
    @cd apps/desktop && pnpm run dist

# Install .desktop + icons via xdg
install-desktop:
    @cd apps/desktop && pnpm run dist:install

# ── Release guards ────────────────────────────────────────────────────────────

# Validate package.json versions + CHANGELOG before tagging.
# Example: just release-check 0.1.6
release-check version:
    @node apps/desktop/scripts/check-release.mjs {{version}}

# Opt-in pre-push hook that runs release-check before any v* tag reaches CI.
# Run once per clone: just hooks-install
hooks-install:
    @git config core.hooksPath .githooks
