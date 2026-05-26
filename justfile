set dotenv-load

# list available recipes
default:
    @just --list

# ── Dev ──────────────────────────────────────────────────────────────────────

dev-desktop:
    @cd apps/desktop && pnpm run dev

# Build packaged release (.deb on Linux, .exe on Windows)
build-desktop:
    @cd apps/desktop && pnpm run dist

# Alias: same as build-desktop (mirrors `pnpm --filter ru-soam dist`)
dist:
    @cd apps/desktop && pnpm run dist

# Install .desktop + icons via xdg
install-desktop:
    @cd apps/desktop && pnpm run dist:install
