# Changelog

All notable changes to Ru-Soam are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] - 2026-05-24

### Changed

- Release artefacts and the auto-update feed moved to Cloudflare R2 (`dl.ru-soam.com`); `electron-updater` now uses the `generic` provider (ADR-204 Amendment 1).

### Added

- Public download website (`apps/web`) with per-platform installers (Windows `.exe`, Linux `.deb`), SHA-512 checksums, and a changelog page — built at release time from the update manifests and deployed to Cloudflare Pages.

### Fixed

- Auto-update now reaches its feed. The 0.1.0 updater pointed at a private GitHub Releases endpoint that returned 404 to clients; the R2 generic feed is publicly reachable.

## [0.1.0] - 2026-05-24

### Added

- Electron workbench shell with four-process trust-zone architecture (Main, Preload, Renderer, Bundle Host).
- React 19 + TanStack Router composition shell with file-based routing.
- Tailwind v4 CSS theming system with palette × luminance × font-set axes.
- SQLCipher-backed local store (better-sqlite3-multiple-ciphers) with WAL mode and audit ledger.
- Workspace lock/unlock lifecycle with Argon2id KDF and BIP-39 recovery codes.
- Window controls, shell-open, prefs, audit, and platform-dev capabilities over the `window.soam` bridge.
- First-party bundle system with sandboxed iframe views (`view://` protocol).
- App icon set (BridgeMark) wired to BrowserWindow and electron-builder targets.
- Loading splash with continuous progress sweep.
- StatusBar with workspace nickname, avatar, and activity slot.
- Linux `.desktop` integration via xdg post-install scripts.
- NSIS installer for Windows; `.deb` package for Linux (ADR-204).
- GitHub Releases publish pipeline with `electron-updater` manifests.
- Changelog parser (`scripts/build-changelog.mjs`) producing `changelog.json` and per-version release notes.

### Changed

- Linux target changed from AppImage to `.deb` only (ADR-204 §1).
- Default colour theme renamed `iris`; cold-start inherits OS dark/light preference.

### Fixed

- electron-builder config unified so packaged assets resolve correctly from a single `dist/` tree.
- Ru-Soam identity class and `.desktop` name now match across all Linux surfaces.
- Preload capability doctrine clarified — all non-bedrock capabilities go through `bindCapability`.

[Unreleased]: https://github.com/meersajidh/new-ru-soam/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/meersajidh/new-ru-soam/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/meersajidh/new-ru-soam/releases/tag/v0.1.0
