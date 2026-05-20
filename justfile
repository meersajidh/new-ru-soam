set dotenv-load

# list available recipes
default:
    @just --list

# ── Dev ──────────────────────────────────────────────────────────────────────

dev-desktop:
    @cd apps/desktop && pnpm dev

# Build packaged AppImage
build-desktop:
    @cd apps/desktop && pnpm dist

# Install .desktop + icons via xdg
install-desktop:
    @cd apps/desktop && pnpm dist:install