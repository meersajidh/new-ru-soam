set dotenv-load

# list available recipes
default:
    @just --list

# ── Dev ──────────────────────────────────────────────────────────────────────

dev-desktop:
    @cd apps/desktop && npm run dev

# Build packaged release (.deb on Linux, .exe on Windows)
build-desktop:
    @cd apps/desktop && npm run dist

# Alias: same as build-desktop (mirrors `npm run dist -w ru-soam`)
dist:
    @cd apps/desktop && npm run dist

# Install .desktop + icons via xdg
install-desktop:
    @cd apps/desktop && npm run dist:install
