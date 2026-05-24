set dotenv-load

# list available recipes
default:
    @just --list

# ── Dev ──────────────────────────────────────────────────────────────────────

dev-desktop:
    @cd apps/desktop && pnpm dev

# Build packaged release (.deb on Linux, .exe on Windows)
build-desktop:
    @cd apps/desktop && pnpm dist

# Alias: same as build-desktop (mirrors `pnpm --filter ru-soam dist`)
dist:
    @cd apps/desktop && pnpm dist

# Install .desktop + icons via xdg
install-desktop:
    @cd apps/desktop && pnpm dist:install