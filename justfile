set dotenv-load

# list available recipes
default:
    @just --list

# ── Dev ──────────────────────────────────────────────────────────────────────

dev-desktop:
    @cd apps/desktop && pnpm run dev

# Inspect a workspace local-store DB (dev only). Examples:
#   just dev-db --list
#   just dev-db meersh --info
#   just dev-db meersh --tables
dev-db *args:
    @cd apps/desktop && pnpm exec electron --no-sandbox scripts/dev-localstore.mjs {{args}}

# Run a read-only SQL query against a workspace DB (dev only). Quote the query:
#   just dev-db-sql meersh "SELECT * FROM prefs"
dev-db-sql name query:
    @cd apps/desktop && pnpm exec electron --no-sandbox scripts/dev-localstore.mjs {{name}} --sql "{{query}}"

# Build packaged release (.deb on Linux, .exe on Windows)
build-desktop:
    @cd apps/desktop && pnpm run dist

# Alias: same as build-desktop (mirrors `pnpm --filter ru-soam dist`)
dist:
    @cd apps/desktop && pnpm run dist

# Install .desktop + icons via xdg
install-desktop:
    @cd apps/desktop && pnpm run dist:install
