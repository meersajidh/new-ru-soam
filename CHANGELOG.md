# Changelog

All notable changes to Ru-Soam are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.10] - 2026-07-03

### Added

- Choose what calendar event chips show: the event title (default) or the matched client's name — Settings → Schedule → Event labels.
- Event details now show each participant's response — accepted, declined, or no reply — as a badge on their avatar, in both the event popover and the side panel.
- Declined events (where the organiser or everyone declined) now appear struck-through on the calendar.
- Event details "Refresh" now re-fetches the whole event (title, time, participants), not just the meeting link.

### Changed

- Calendar chips show the event title by default again; switch to client names in Settings → Schedule.
- Event details: participant emails moved to the Source section, and the participants list is more compact.
- App text size now applies inside the calendar and record views too.

### Removed

- Removed the raw-title row and advisory note from the event-details Source section.

## [0.1.9] - 2026-06-24

### Added

- Migrate existing clients from a calendar: when you add a calendar — or later via the calendar's "Re-run migration" right-click — review everyone on it and add them as clients in bulk, with multi-select and the option to link someone to a client you already have.
- Calendar appointments now show the client's name on the event chip (across Day, Week, Month, and Agenda) instead of the raw calendar title.
- Attendee and organiser names now resolve from your Google contacts, so events show real names instead of email addresses. (Reconnect a calendar account once to grant the new contacts permission.)

### Changed

- Schedule event details: a participant you previously marked "not a client" can now be added as a client directly (which also un-excludes them).

### Removed

- Removed the "Needs Linking" panel — its triage now lives in the event details panel and the new migration flow.

## [0.1.8] - 2026-06-23

### Fixed

- Schedule now works from a fresh start: the empty state guides you to connect a calendar, and the grid appears as soon as you add one (previously it could stay blank after signing in).
- Schedule event details: a client linked from the calendar who isn't in your roster yet now displays correctly, with clearer client-link actions.

## [0.1.7] - 2026-06-22

### Added

- Adjustable app text size — Settings → Appearance → Text size (Default, Large, X-Large).

### Changed

- Schedule: redesigned the event details panel with a clearer sectioned layout (Time, Participants, Client link, Source) that's easier to read.
- Schedule: calendar events link to your clients automatically and update live as you add or edit people in your roster.
- Side panel and bottom panel now have a close button in their header.
- Unified the header height across the side bars and editor area.

### Removed

- Removed the experimental PHI-read toggle and safety-score indicator from the schedule.

## [0.1.6] - 2026-06-05

### Added

- Practice (early preview): a client roster and per-client record overview. Marked as work-in-progress; data is local-only.

### Changed

- Internal: records now persist through an ownership-scoped local store with PHI held in a separate encrypted database.

## [0.1.5] - 2026-05-26

### Added

- Delete a workspace you own — from the account menu. Deletion is permanent (all records, notes, and session data in that workspace are destroyed and the recovery code stops working), so it asks you to type the workspace name to confirm.

### Changed

- Sign-in now uses your real Google account. The development placeholder sign-in has been removed; a correctly configured build is required to sign in.

## [0.1.4] - 2026-05-25

### Added

- App version is now shown in the status bar; click it (or run "What's New" from the command palette) to see the changelog.
- Notification centre: toast pop-ups, a notifications panel opened from the status-bar bell, an unread badge, and mark-as-read / dismiss controls.
- Update alerts: when an update is available, downloading, or ready to install, the app surfaces an in-app notification and a status-bar indicator with one-click Download / Restart actions (guided install on Linux).
- "What's new" dialog that shows the changelog automatically the first time you run a new version.

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

[Unreleased]: https://github.com/meersajidh/new-ru-soam/compare/v0.1.4...HEAD
[0.1.4]: https://github.com/meersajidh/new-ru-soam/compare/v0.1.1...v0.1.4
[0.1.1]: https://github.com/meersajidh/new-ru-soam/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/meersajidh/new-ru-soam/releases/tag/v0.1.0
