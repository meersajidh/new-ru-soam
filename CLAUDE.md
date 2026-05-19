# Project Intelligence

<!--
  USAGE NOTES FOR OPUS (lead agent)
  ──────────────────────────────────
  This file is your persistent memory and the primary cache asset for the
  project. Both you and every Sonnet subagent load it on every invocation —
  so anything stable and reusable belongs here.

  After significant design decisions, append a note to the Architecture Log
  section below. This converts ephemeral conversation context into free cached
  context for all future invocations.
-->

---

## Project Overview

**Name:** ru-soam

**Purpose:** Local-first Electron workbench for mental-health practitioners. PHI never reaches the cloud in plaintext (ADR-301). VSCode-style composition shell where most features ship as bundles (capabilities + contributions) rather than core code. MVP tenancy = Individual practitioner (ADR-501); Clinic proposed (ADR-503).

**Stack:**

- Electron 41 (main + preload + renderer + bundle-host = four processes / trust zones — ADR-101, ADR-410). Pinned at 41 in Phase 10a — `better-sqlite3-multiple-ciphers@12.9.0` does not compile against Electron 42's V8 14 API. Bump re-evaluated when SQLCipher lands in 10b.
- React 19 + React Compiler, TanStack Router (file-based, generated `routeTree.gen.ts`), TanStack Query
- Tailwind v4 (`@tailwindcss/vite`) with CSS class-based theming (palette × luminance × font-set axes — ADR-413)
- ProseMirror (in `@ru-soam/editor`, the RuEdit primitive)
- Vite for renderer, main, preload, and bundle-host bundles (four `vite.*.config.ts`)
- TypeScript ESNext, ESM-only, `strict`, `verbatimModuleSyntax`, `erasableSyntaxOnly`
- pnpm workspace; `just` for dev recipes; `electron-builder` for packaging

**Entry points:**

- Renderer: `apps/desktop/src/main.tsx` → `App.tsx` → `Workbench.tsx`
- Main: `apps/desktop/electron/main/index.ts`
- Preload: `apps/desktop/electron/preload/index.ts` (exposes `window.soam` — ADR-202)
- Bundle Host: `apps/desktop/electron/bundle-host/index.ts` (Node process spawned on demand — ADR-410)
- Dev: `just dev-desktop` or `pnpm --filter ru-soam-app dev`

---

## Repository Layout

```
/
├── apps/
│   ├── desktop/                   # Electron workbench (the product)
│   │   ├── electron/
│   │   │   ├── main/              # Main process: window, security, IPC, capability host
│   │   │   ├── preload/           # window.soam capability bridge (ADR-202)
│   │   │   ├── bundle-host/       # Bundle Host Node process (ADR-410)
│   │   │   └── shared/            # IPC + host protocol types (renderer↔main↔host)
│   │   ├── src/                   # Renderer (React composition shell — ADR-102)
│   │   │   ├── platform/          # services, command, context-key, keybinding,
│   │   │   │                      # theme, font, layout, statusbar, workspace, ru-edit
│   │   │   ├── workbench/         # Parts: TitleBar, Banner, Middle (5 slots), StatusBar
│   │   │   ├── routes/            # TanStack Router (file-based) + routeTree.gen.ts
│   │   │   └── styles/            # tokens.css, palette CSS, workbench.css
│   │   ├── bundles/               # First-party bundles (e.g. echo-test, echo-lazy)
│   │   └── vite.{main,preload,bundle-host,config}.ts
│   └── web/                       # Placeholder (not yet implemented)
├── packages/
│   └── editor/                    # @ru-soam/editor — ProseMirror-based RuEdit primitive
├── docs/                          # ADRs/, Proposals/, Guides/, References/, Implementation_Plan.md, Open_Items.md
├── server/                        # Placeholder
├── justfile                       # `just dev-desktop`
└── pnpm-workspace.yaml            # apps/* + packages/*
```

---

## Conventions

### Code style

- TypeScript ESNext, ESM only. `strict`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `noUnusedLocals/Parameters`, `noFallthroughCasesInSwitch`. No emit (Vite handles bundling).
- Prettier (root `.prettierrc`): 2-space indent, single quotes, semicolons, trailing comma `all`, print width `100`, `endOfLine: lf`, `bracketSpacing: true`, `arrowParens: always`. JSX uses double quotes.
- ESLint flat config (`apps/desktop/eslint.config.js`): `@eslint/js` recommended + `typescript-eslint` recommended + `eslint-plugin-react-hooks` + `eslint-plugin-react-refresh` (vite). `dist/` globally ignored.
- React 19 + React Compiler enabled via `babel-plugin-react-compiler`. Don't pre-memoize what the compiler will memoize; write idiomatic React.
- Tailwind v4 with `@theme {}` tokens in `apps/desktop/src/styles/tokens.css`. Use generated `bg-*` / `text-*` / `font-*` utilities, not inline `style={{...}}` for theme-able values.

### Naming

- File names: `kebab-case.ts` for modules, `PascalCase.tsx` for React components. Test files (when they exist): `*.test.ts`.
- Service identifiers: branded `ServiceId<T> = { readonly _t: T; readonly id: string }` (O96 resolved Phase 2). Suffix DI tokens with `ServiceId` (e.g. `ThemeServiceId`, `FontServiceId`).
- Command ids: `<bundleId>.<verb>[.<noun>]` (platform commands use the `workbench.*` namespace — ADR-406).
- Context keys: dotted, lowercase. Platform-reserved namespaces (`workbench.*`, `editor.*`, `patient.*`, `record.*`) — bundles may not write to them.
- ADR files: `ADRs/NNN-kebab-case-title.md`; ranges defined in `docs/README.md`.

### Error handling

- Renderer is a composition shell, not an authority owner (ADR-102). Errors from capabilities surface as typed rejections through `window.soam.*` — propagate to TanStack Query / the calling Part; do not swallow.
- Bundle Host crash must NOT take down the Renderer (ADR-410, Phase 1 exit). Treat host calls as remote: timeouts, typed errors, no shared memory assumptions.
- Disposable pattern (`docs/Guides/disposable-pattern.md`) is the cleanup convention across the platform — return `IDisposable` from anything that subscribes / registers / spawns.

### Imports / module boundaries

- **Renderer must never import `electron`** or any node built-in. Cross-zone access goes through `window.soam.*` capabilities only (ADR-202).
- **No `<webview>` and no direct `BrowserWindow`** outside `electron/main/window-factory.ts` (ADR-201). Bundle UIs render through the sandboxed iframe + `view://` bridge (ADR-411).
- **Brokered networking only** — no direct `fetch` from the Renderer to third-party origins; use the `app://` protocol or a capability that wraps it (ADR-203).
- Workspace package imports: use `@ru-soam/editor` (alias from `packages/editor` via pnpm workspace), not relative paths into `packages/*`.
- TanStack Router: file-based routes in `apps/desktop/src/routes/`. Regenerate with `pnpm --filter ru-soam-app route-gen` after adding/renaming routes. Don't hand-edit `routeTree.gen.ts`.
- Any architectural change (new trust-zone crossing, new contribution point, new protocol scheme, new persisted shape) requires an ADR or an Open Item entry — see `docs/README.md` and `docs/Open_Items.md`.

### Styling system

Tailwind v4 owns design tokens; CSS recipe files own component composites;
JSX owns structure and state via utilities. Pick the right layer for the
change.

**Layer choices, in order of preference:**

1. **Tailwind utilities in JSX** — structure, layout, spacing, one-off
   variants. Write `flex gap-2 items-center text-fg-muted`, not hand-rolled
   CSS classes.
2. **Semantic type recipes (`styles/type.css`)** — typography role. Apply
   `.t-body`, `.t-label`, etc., instead of re-declaring
   `font-family + font-size + color`.
3. **Component CSS recipes** — multi-property composites that recur (button
   variants, card surfaces, dialog overlays). Colocated next to the
   component as `Component.css`, imported by the component module.
4. **Design tokens (`styles/tokens.css`)** — never hardcode colors, shadows,
   spacing, or radii. If a value recurs, add a token first.

**Hard rules:**

- **No raw color literals.** No `rgba(0,0,0,*)`, no `#hex`, no `oklch(...)`
  outside `tokens.css` and the theme/font-set files. Brand-mandated colors
  (e.g. Google sign-in pill) live in a clearly-named isolated module.
- **No inline `style={{}}` for theme-able properties.** Use Tailwind
  utilities or recipe classes. Inline `style` is reserved for runtime values
  the styling system cannot know (computed flex ratios, dynamic avatar
  backgrounds, animation progress).
- **Semantic tints via tint tokens.** Use `--tint-{color}-{step}`
  (e.g. `var(--tint-accent-soft)`), not ad-hoc
  `color-mix(... N%, transparent)`. Add a token if a step is missing; do not
  introduce magic percentages. The 5-step scale
  (`subtle` → `soft` → `medium` → `strong` → `bold`) is **calibrated per
  color**, not pinned to a fixed percentage across colors — `accent-strong`
  is 55%, `info-strong` is 40%, `warning-strong` is 60%, etc. Steps express
  perceptual weight ("how loud is this tint"), so the % differs by hue.
  When introducing a new step, calibrate visually against the existing
  steps for that color, not against the same step in another color.
- **Shadows via shadow tokens.** Use
  `var(--shadow-rest|card|overlay|modal)`, never raw
  `box-shadow: ... rgba(0,0,0,*)`.
- **Naming.** BEM-strict for component CSS: `block`, `block__element`,
  `block--modifier`. State that does not belong to a single component
  (`is-open`, `is-active`) may use the `is-*` prefix without the block
  scope — but prefer modifiers when the state is component-local.
- **CSS file location.** Component CSS lives next to its component
  (`MyComponent.tsx` + `MyComponent.css`). The global `workbench.css` and
  `setup.css` are legacy and being decomposed; do not add new selectors to
  them.

**Anti-patterns to reject in review:**

- New entries in `workbench.css` or `setup.css`.
- `style={{ display: 'flex', gap: ... }}` — use utilities.
- `color-mix(... N%, transparent)` outside `tokens.css`.
- `font-family: var(--font-sans); font-size: 13px;` — use `.t-body`.
- New `*.css` file that is not colocated with a component.

Architectural changes to the styling system require an ADR.

---

## Test Command

No automated test suite yet. Verify changes with type-check + lint:

```bash
# Type-check the whole workspace (project references via tsc -b)
pnpm --filter ru-soam-app compile && pnpm --filter @ru-soam/editor compile

# Lint the desktop app
pnpm --filter ru-soam-app lint

# Smoke-run the app (dogfood verification — Implementation_Plan.md uses
# "you can open the app and see X work" as the exit criterion for each phase)
just dev-desktop
```

---

## Skills & search-tool selection

### Always-on skills (main thread)

- **caveman** — keep all output terse; drop articles, filler, pleasantries.
- **agent-browser** — reach for it whenever the task needs Electron/browser
  automation or dogfooding.

### On-demand skills

- **frontend-design** — invoke only when scope touches UI components, pages,
  or visual design.
- **ast-grep** — invoke per the search-tool decision rule below.

### Search tool selection — `grep` vs `ast-grep`

Choose by query shape, not habit:

- **Use `grep`** for literal-string matches: known identifiers, error
  messages, import paths, file names, URL fragments. Anything you'd paste
  between quotes.
- **Use `ast-grep`** the moment the query depends on code structure:
  - "all calls to X with N+ args" / "X called as second arg of Y"
  - "every `useState<T>(...)` where T is a non-primitive"
  - "all `ipcMain.handle` registrations" (handlers may be registered via
    helpers, dynamic strings, or chained calls that `grep` will miss)
  - "every `switch` statement missing a `default` case"
  - any rename or refactor where AST node type matters

If the answer to "would `grep` match the wrong things or miss syntactic
variants" is yes, `ast-grep` is the correct tool. Default to `grep` for
speed; reach for `ast-grep` deliberately when the query crosses the
structural-vs-textual line above.

### Subagent dispatch

Use `subagent_type: implementer` (defined at `~/.claude/agents/implementer.md`)
for all implementation delegation. The agent's system prompt bakes in the
skill-activation rules above, so briefs do not need to repeat them — pass
only the task-specific Goal / Scope / Constraints / Success criteria.

## Architecture Log

<!--
  Opus appends here after every significant design decision.
  Format each entry as shown. This is what prevents Opus from having to
  re-derive decisions from conversation history — it's all in the cache.
-->

### 17 May 2026 — Initial setup

- Multi-agent orchestration: Opus plans and reviews; Sonnet 4.6 implements.
- Handoffs are thin briefs (intent + scope + success criteria). Sonnet reads
  its own execution context from the codebase.
- All stable decisions live in this file to maximise cache reuse.

### 17 May 2026 — Review comments and fixes

- Bundle Host = fourth trust zone now canonical in ADR-101/103/104/105

### 18 May 2026 — Design-system bundle landed (Ru-Soam DS v1)

- Source: handoff bundle from Claude Design (claude.ai/design). Implemented in 4 sequential implementer passes (Foundations / Chrome / Setup+Gate+Picker / Editor).
- **Typography**: three runtime font sets — `system-sans` (fallback), `ru-display` (default), `ru-editorial`. Webfonts via `styles/fonts/google-fonts.css` (`@import` CDN; Source Serif 4 / Inter Tight / IBM Plex Mono, SIL OFL). New `--font-display` token + `--font-display-weight` / `--font-display-letter-spacing`. Default cold-start font-set flipped `system-sans → ru-display` (`initial-theme.ts` VALID_FONT_SETS + fallback). Production migration TODO: bundle `.woff2` to drop CDN dep (no CSP audit done).
- **Tokens**: shadow scale added to `@theme` — `--shadow-rest|card|overlay|modal`. Every literal `rgba(0,0,0,*)` shadow in `workbench.css`/`setup.css` swapped to vars. Semantic type recipes in `styles/type.css` (`.t-display`, `.t-title`, `.t-body`, etc.).
- **Icons**: `lucide-react@^1.16.0` is now a dep. All bracketed glyphs (`[L]`/`[U]`), unicode window controls, "G" letter mark replaced with Lucide / SVG components. Bridge mark (`workbench/parts/BridgeMark.tsx`) = the cane-suspension-bridge app icon, sits in the accent-filled 36×36 `tb-app` slot.
- **Chrome (TitleBar)**: rewritten — 32→36px, adds menu strip (File · Edit · View · Patient · Snippets · Window · Help), back/forward, quick-open pill (opens `commandPalette.open`), panel toggles (dispatch `workbench.togglePrimarySideBar` / `togglePanel` / `toggleAuxSideBar`), divider, avatar slot, window controls. `window.soam.bindCapability('platform.window','1.0')` wiring preserved.
- **StatusBar service contract**: `StatusBarEntry` (and `EntryPatch`) gain `icon?: string`, `severity?: 'ok'|'warning'|'error'`, `badge?: number`. New `StatusBar.tsx` renders icon via Lucide map, severity class, badge pill. Divider auto-inserted between priority buckets (heuristic: ≥700 left / ≥800 right). `anchored-ids.ts` reordered — Alerts on right corner (priority 1000), dev-mode below it (warning-tinted), then sync, then bundle activity. Left: lock (icon flips lock/unlock via boot.ts), nickname, entity, dirty. Legacy `workbench.kek.lock` deleted.
- **Setup ceremony**: dot-row replaced with progress-rail (eyebrow counter + headline + 5-node rail with linear fill `--pct`, check icon on done, pulse halo on active). Recovery code rendered as a sensitive surface — warning border + 4px halo, severity banner (`ShieldAlert`), zero-padded indices, footer with Copy + Download .txt actions. Modernised Google sign-in pill (`btn-google`, white pill / hairline / `Roboto, Inter Tight` font, dark-mode variant) + reusable `GoogleMark` 4-color SVG. Shared `platform/auth/PasswordInput.tsx` (eye-toggle inside input) replaces the show/hide ghost-button pattern across setup wizard + UnlockGate.
- **UnlockGate**: title gets `<Lock />` (or `<KeyRound />` in `forceResetMode`); passphrase + reset-passphrase fields use `PasswordInput`.
- **Editor surfaces**: snippet chips re-themed — hardcoded `rgb(122,139,222)` / `rgb(90,180,140)` → `color-mix(in oklch, var(--color-info|--color-success) N%, transparent)` so they retheme across Bamboo/Stone/Geist. Halo states `ProseMirror-selectednode.ru-snippet-placeholder--text` and `.ru-snippet-placeholder--picklist.is-open` get 2px outer ring. ProseMirror H1 + H2 adopt display family + tighter tracking. `.ru-edit-host` constrained to `max-width:760px; margin:0 auto; padding:28px 40px 80px`. Empty-editor surfaces (`EmptyEditorPart`, `editor-group-empty`) replaced with the weave-motif card (96×96 panel + double repeating-linear-gradient in accent) + display-family title + kbd hint.
- **Caveats**:
  - `React.FormEvent` deprecation warnings (TS 6385) in `UnlockGate.tsx` + `-keys-components.tsx` — pre-existing, surfaced because files were touched. Not a regression.
  - Webfonts require network in renderer (Google Fonts CDN). No CSP audit. To package, port `.woff2` locally per `styles/fonts/README.md`.
  - StatusBar divider insertion is heuristic — may need explicit grouping if more anchored entries are added.

### 18 May 2026 — Phase 10a delivered + Electron pin

- Phase 10 split into 10a (data pipeline, delivered) + 10b (encryption-at-rest + audit ledger, queued). Rationale: SQLCipher native-binding work + audit redaction discipline each carry their own risk; landing them together with the new pattern compounds debug surface.
- Local Store wrapper choice resolved (O22): `better-sqlite3-multiple-ciphers@^12.9.0`, aliased as `better-sqlite3`. SQLCipher-aware fork — plaintext in 10a (no `PRAGMA key`), keyed in 10b. Public API identical to `better-sqlite3`.
- Electron pinned to `^41.2.2` (was `^42.0.1`). better-sqlite3-multiple-ciphers does not yet compile against Electron 42's V8 14 API. Bump revisited when SQLCipher lands.
- New trust-zone surface: `store.changed` PlatformEvent over the existing `SOAM_EVENT_CHANNEL`. No new IPC channel. Renderer bridge → `queryClient.invalidateQueries({ queryKey: [table] })` (prefix-match) is the standard TanStack invalidation path for capability writes (ADR-412 §"Pattern 2").
- Capability surface stays callable when locked iff `phi: false`. `prefs@1.0` ships Operational (ADR-302 §"Class 2"); LocalStore stays open across lock. PHI tables (Phase 13+) will be PHI-flagged and lock-gated by the existing registry decorator.
- Native-module install lesson: `electron-builder install-app-deps` writes a `.forge-meta` marker; if the `.node` is deleted without removing the marker, the next install short-circuits. Force-rebuild = delete both.

### 18 May 2026 — Phase 10b delivered (SQLCipher + audit ledger)

- SQLCipher at-rest encryption: `LocalStore.open(workspaceId, key: Buffer)` applies `PRAGMA key = "x'<64hex>'"` (hex form for raw 32-byte key) before any other pragma or migration. `integrity_check` immediately afterwards detects plaintext leftovers from 10a — on failure the DB file is unlinked + recreated encrypted with a single `console.warn`. DB key sourced from `ensureLocalStoreDbKey(workspaceId)` (OS-keychain-backed per ADR-304). Key is provisioned unconditionally at `set-active` and at boot — the `metadataExists` guard was removed because the store must be openable for setup-pending workspaces too (prefs are Operational class).
- Audit ledger (ADR-502 Tier 1, device-local): `audit_log` table (migration 2) with per-entry SHA-256 hash chain. Genesis `prev_hash = '0'.repeat(64)`. Hash input is an explicit-key-order JSON literal (`seq, ts, event, principal, entityId, recordId, recordType, detail, prevHash`) — not generic `JSON.stringify` key sort, so the canonical form is reproducible outside the DB. `detail` field is double-encoded in the hash input (`JSON.stringify(detailJson)` where `detailJson` is already the stringified detail) — documented in `LocalStore.appendAuditEntry`. Entire append (read-max-seq → compute-hash → insert) runs in one `db.transaction(...)`.
- `AuditService` is a thin facade — store getter injected at boot via `auditService.setStoreGetter(() => localStoreManager.current())`. Silent no-op when store closed; DB errors propagate. Main-process only; renderer access via `audit@1.0` capability (`list({ limit, offset })`). Not PHI-flagged — audit metadata is Operational per ADR-502.
- Audit emit points wired: `workspace.unlock`, `workspace.relock`, `workspace.recovery.used`, `workspace.passphrase.changed`, `workspace.setup.complete` (all in `lock-channel.ts`), `prefs.set` (in `capability/prefs.ts`, with `detail: { key }`). Closes O307e for Phase 10.
- `AuditEntry` redaction-by-construction: `event` is a closed `AuditEventKind` string union (source-code-change required to add a new kind); `detail` is `Record<string, string | number | boolean>` with an explicit "MUST NOT contain PHI content" JSDoc. No free-text fields in the type.
- Workspace settings stub (migration 3): `workspace_settings` table + `LocalStore.getSetting/setSetting` — no capability surface yet (Phase 12 wires the UI cascade). Provides the foundation for audit retention reads (O49) without blocking the ledger.
- Developer command: `developer.audit.dump` calls `audit@1.0`.list via `bindCapability` and dumps via `console.table`.
- Electron 41 pin holds (O157 stays open). BSMC@12.9.0 + SQLCipher works fine on V8 from Electron 41. Bump deferred until upstream ships V8-14 support.

### 19 May 2026 — PR-5 delivered (inline `style={{}}` triage)

- Replaced 14 of 21 inline `style={{}}` sites with Tailwind v4 utilities; 7 remaining sites are all runtime/dynamic values (StrengthMeter score-driven bg/color, EditorArea computed `flex: node.ratio`, WorkspaceTileGrid dynamic avatar bg, ChangePassphraseDialog strength meter) and intentionally kept.
- One pre-existing bug fixed in passing: `PrefsDevPanel.tsx:<li>` referenced undefined token `--color-surface-raised`; mapped to `--color-surface-elevated` (the prefs-list row now has a visible background). Verified token name against `tokens.css` — the four defined surface tokens are `base / panel / elevated / active`.
- Tailwind v4 token-to-utility mapping confirmed working: `--space-N` ↔ `mt-N` / `gap-N` etc., `--radius-sm` ↔ `rounded-sm`, `--font-mono` ↔ `font-mono`, `--color-surface-elevated` ↔ `bg-surface-elevated`, `--color-fg-muted` ↔ `text-fg-muted`. Arbitrary values supported via `[brackets]` (e.g. `max-w-[calc(100vw-32px)]`).
- Files touched (6): `routes/workspaces/index.tsx`, `routes/setup/keys.tsx`, `workbench/middle/PrefsDevPanel.tsx`, `workbench/middle/PreWorkspaceRoute.tsx`, `workbench/middle/UnlockGate.tsx`, `workbench/middle/ChangePassphraseDialog.tsx`. No CSS files, no new tokens, no new classes.
- Defer to PR-6: BEM-strict naming codemod (rename `is-*` state classes to `--mod` modifiers where state is component-local).
- Defer to PR-7+: type recipe (`.t-*`) adoption, CSS file relocation, recipe layer for repeated composites.

### 19 May 2026 — PR-4 delivered (surface-over-surface mixes)

- 5 new tokens in `tokens.css`: `--surface-input` (panel 80% × base), `--surface-input-focus` (panel 70% × base), `--surface-sunken-soft` (panel 50% × transparent), `--surface-sunken-medium` (panel 60% × transparent), `--surface-recessed` (base 60% × transparent).
- 6 sweep sites in `setup.css` (lines 350, 379, 668, 678, 755, 785). All exact-% match; zero visual delta. Closes out the surface-blend shape entirely.
- All `color-mix(in oklch, var(--color-surface-*) ...)` literals in `setup.css` / `workbench.css` now live in `tokens.css` or inside `calc(... * var(--glow-mul))` animated glow expressions (out of every styling PR's scope).
- Defer to PR-5: inline `style={{}}` triage (21 sites), BEM-strict naming codemod.
- Defer to PR-6+: type recipe adoption, CSS file relocation, recipe layer.

### 19 May 2026 — PR-3 delivered (tinted-border tokens + accent surface-blend cleanup)

- 4 new tokens in `tokens.css`: `--border-hover` (fg-muted 50% × border), `--border-warning-soft` (warning 40% × border), `--border-warning-strong` (warning 60% × border), `--border-subtle` (border 60% × transparent).
- 7 sweep sites in `setup.css`: 5 tinted borders (lines 370, 623, 638, 680, 760), 2 accent-over-surface (lines 77, 269). Tinted borders are zero-delta; accent-over-surface sites shifted from opaque `8%, surface-X` to translucent `var(--tint-accent-subtle)` (10% over transparent compositing on host bg) — small +2pp delta, within tolerance. Dogfood across bamboo / stone / geist dark mode: active progress-step node and help-button hover look correct.
- `setup.css:760` verified as `.setup-checkbox-label:hover` (true hover, not focus) — token name `--border-hover` is accurate.
- Implementer surfaced one additional surface-blend site missed in audit: `setup.css:785` (`color-mix(... surface-panel 60%, transparent)`). Added to PR-4 scope.
- Defer to PR-4: surface-over-surface mixes (6 sites total: 350, 379, 668, 678, 755, 785). These are subtle luminance adjustments where the right consolidation is unclear — token-vs-direct-surface-color call needed.
- Defer to PR-5: inline `style={{}}` triage (21 sites), BEM-strict naming codemod.
- Defer to PR-6+: type recipe adoption, CSS file relocation, recipe layer.

### 19 May 2026 — PR-2 delivered (scrim + edge-highlight + neutral tints)

- 7 new tokens in `tokens.css`: `--scrim-overlay` (rgba 0.45) and `--scrim-modal` (rgba 0.55); `--highlight-edge` (white 30%) and `--highlight-edge-hover` (white 35%); `--tint-neutral-{subtle|soft|medium}` (fg-primary at 4/10/12%).
- 10 sweep sites — all **exact %** match to originals, zero perceptual delta: 1 scrim in `workbench.css:782` (`.cmd-palette-overlay`); 2 modal scrims in `setup.css:887,1037` (`.setup-modal-overlay`, `.change-passphrase-overlay` — verified distinct selectors); 3 edge-highlights in `setup.css:468,477,551` (`.setup-btn-primary` rest+hover gloss, `.btn-google` outline); 4 neutral tints in `setup.css:187,513,591,732`.
- Scope intentionally trimmed: **surface-blend** mixes (8 sites: `color-mix(... N%, var(--color-surface-*))` and `... var(--color-border))`) and **white highlights with offsets** are deferred to PR-3 — they need fresh token design for tinted-surface / tinted-border patterns. Inline `style={{}}` triage (21 sites) and BEM naming codemod also deferred to PR-3 (different review surface).
- Dogfood note: `.unlock-gate-overlay` (workspace unlock view) uses `var(--color-surface-base)` and is **not** a scrim/modal — it's a full-viewport surface replacement (workspace is locked → entire workbench area is unavailable → centered unlock card on top of the host surface). Intentional, no scrim needed. Initial PR-2 observation that it should adopt `--scrim-modal` was a misread.

### 19 May 2026 — Styling system audit + consolidation plan

- Audit of design-code sprawl on top of the DS v1 handoff. Findings: Tailwind v4 is wired up for `@theme` tokens but the utility-class workflow was never adopted — 277 `className=` sites use ~13 utility tokens; the rest point at 176 unique hand-rolled selectors across `workbench.css` (982 LOC / 149 selectors) and `setup.css` (1,285 LOC / 142 selectors). Recipe layer thin (`type.css` underused, `@apply` count = 0). 62 ad-hoc `color-mix(... N%, transparent)` literals with magic percentages; 6 raw `rgba(0,0,0,*)` shadows bypass `--shadow-*` tokens; hex literals leaked into `setup.css` for the Google pill. Naming inconsistent (BEM-strict mixed with `is-*` state).
- "Styling system" section added to **Conventions** in this file — layer order (utilities → type recipes → component CSS → tokens), hard rules (no raw color literals, no inline `style` for theme-able props, semantic tints via `--tint-*` tokens, shadows via `--shadow-*`, BEM-strict naming, CSS files colocated with components), and review anti-patterns.
- Consolidation phased across four PRs to bound visual regression surface:
  - **PR-1** — semantic tint tokens + shadow sweep (`docs/PRs/PR-styling-1-tokens.md`); pure mechanical, deferred surface-blend / white-highlight / scrim / fg-primary tints to PR-2.
  - **PR-2** — scrim token, surface-blend / white-highlight / neutral tint normalisation, inline `style` triage, naming convention codemod.
  - **PR-3** — type recipe adoption (`.t-*`) across duplicated font/size/color sites.
  - **PR-4** — CSS file relocation (colocate next to components) + recipe layer for reusable composites; decompose `workbench.css` / `setup.css`.
- Going-forward policy (encoded in the "Styling system" section): new code uses utilities for structure, tokens for theme, type recipes for typography, recipe classes for composites. No new selectors in `workbench.css` / `setup.css`.

---

## Orchestration Protocol (Opus must follow this)

### My role

I am the lead agent. I think, plan, delegate, and verify. I do not implement.

### Workflow per task

**1. Plan**
Reason through the full requirement. Identify:

- What needs to change and why
- Which modules / files are in scope (names only, do not read contents)
- Edge cases and constraints
- Success criteria (how will I know it's correct?)

**2. Delegate**
Spawn the implementer agent via `Agent` with `subagent_type: implementer`
(defined at `~/.claude/agents/implementer.md`). Brief contains:

- **Goal** — one sentence
- **Scope** — list of file paths or directories in scope
- **Key constraints** — conventions, must-not-break interfaces, etc.
- **Success criteria** — what passing tests / behaviour looks like
- **Priority flags** — anything tricky to watch out for

Do NOT include file contents in the handoff. Do NOT include the full design
rationale. Do NOT repeat skill-activation rules — the agent file owns those.
Keep the brief to what the implementer needs to act on — it reads the rest
from CLAUDE.md and the codebase.

**3. Review**
After receiving the handoff summary:

- Read the changed files (I read them now, not before)
- Verify logic against the plan and conventions
- Check the test results reported
- If something is wrong, produce a correction brief and re-delegate
- When satisfied, summarise the outcome for the user and append any
  architectural decisions to the Architecture Log above

### What makes a good brief (template)

```
Goal: <one sentence>

Scope:
- src/module/foo.ts  (add X)
- src/module/bar.ts  (update Y to support X)
- tests/module/foo.test.ts  (add tests for X)

Constraints:
- Must not change the public API of Bar
- Follow the error-handling pattern in src/utils/errors.ts
- All new functions need JSDoc

Success criteria:
- `npm test` passes with no new failures
- X is callable from Bar with the signature: foo(a: string): Result<T>

Watch out for:
- Bar has a caching layer — make sure X invalidates it correctly
```

### Context hygiene

- After each task cycle, consider whether any decision warrants an entry in
  the Architecture Log. If yes, write it before moving on.
- Keep my conversational context lean. Stable knowledge belongs in this file,
  not in the chat.
