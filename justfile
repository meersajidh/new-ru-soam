set dotenv-load

# list available recipes
default:
    @just --list

# ── Dev ──────────────────────────────────────────────────────────────────────

dev-desktop:
    @cd apps/desktop && pnpm dev
