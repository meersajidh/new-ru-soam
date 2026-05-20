# PR-8 — Styling consolidation: CSS monolith decomposition

Decomposes `workbench.css` (909 LOC) and `setup.css` (1074 LOC) into
colocated component CSS files. After this PR, the only CSS in
`apps/desktop/src/styles/` is foundation files (tokens, themes,
font-sets, type recipes, `theme.css`, `index.css`) plus one thin
temporary shared file pending PR-9.

## Goal

Every selector lives next to the TSX component that owns its DOM.
`workbench.css` and `setup.css` are deleted. No new selectors are
introduced — pure relocation.

## Shared file: `styles/setup-shared.css`

Seven classes from `setup.css` are consumed by components outside the
setup route (`routes/workspaces/index.tsx`, `workbench/middle/PrefsDevPanel.tsx`).
These cannot be colocated with a single component. Group them in a thin
shared file that every consumer imports directly.

**Flagged for PR-9 elimination.** When component primitives (Card, Input,
Button) land, callers replace these classes with typed component props and
this file goes away.

Contents (move from `setup.css`):

| Section | Selectors |
|---|---|
| `/* ── Page shell ──*/` | `.setup-page`, `.setup-page::before` |
| topbar block | `.setup-topbar`, `.setup-help-btn`, `.setup-help-btn:hover` |
| `/* ── Wordmark ──*/` | `.setup-wordmark`, `.setup-wordmark .dash` |
| `/* ── Main column ──*/` | `.setup-main`, `.setup-container` |
| `/* ── Form elements ──*/` (partial) | `.setup-title`, `.setup-description`, `.setup-label`, `.setup-input`, `.setup-input::placeholder`, `.setup-input:hover`, `.setup-input:focus`, `.setup-error` |
| `/* ── Buttons ──*/` (partial) | `.setup-btn-ghost`, `.setup-btn-ghost:hover:not(:disabled)`, `.setup-btn-ghost:disabled` |
| `/* ── Responsive ──*/` | entire block (targets `.setup-container`, `.setup-topbar`) |

Header: `@reference "./theme.css";` (same directory as theme.css).

## Global resets → `index.css`

The first ~35 lines of `workbench.css` are global — not tied to any
component. Move them to `index.css` (which already has `@import "tailwindcss"`
so `@apply` works inline):

- `*, *::before, *::after { box-sizing: border-box; }`
- Webkit scrollbar theming (`::-webkit-scrollbar`, `track`, `thumb`, `thumb:hover`)
- Firefox scrollbar theming (`* { scrollbar-width: thin; ... }`)
- `html, body, #root { height: 100%; margin: 0; overflow: hidden; }`

Append these blocks after the existing `body { margin: 0; }` rule in
`index.css` (before or after the `h1–h6` reset from PR-7a — either order
is fine).

Also remove `@import "./styles/workbench.css";` from `index.css` (line 11).

## New CSS files — from `workbench.css`

Create 15 new CSS files. Each starts with `@reference "../../styles/theme.css";`
(adjust relative path for actual depth). Move the listed CSS blocks verbatim,
keeping `@apply` directives unchanged.

### `workbench/Workbench.css`
**`@reference "../styles/theme.css";`**
Contents: `.workbench { ... }` only (the single remaining block after
globals move to index.css).
Import: update `Workbench.tsx` line — change
`import '../styles/workbench.css'` → `import './Workbench.css'`.

### `workbench/middle/Middle.css`
Contents: `.part-middle`, `.middle-center`.
Import: add `import './Middle.css'` to `Middle.tsx`.

### `workbench/middle/ActivityBar.css`
Contents: `.part-activitybar`.
Import: add `import './ActivityBar.css'` to `ActivityBar.tsx`.

### `workbench/middle/PrimarySideBar.css`
Contents: `.part-sidebar`, `.part-sidebar-primary`, `.sidebar-empty-state`.
Import: add `import './PrimarySideBar.css'` to `PrimarySideBar.tsx`.

### `workbench/middle/AuxSideBar.css`
Contents: `.part-sidebar-aux`.
Import: add `import './AuxSideBar.css'` to `AuxSideBar.tsx`.

### `workbench/middle/EditorArea.css`
Contents: `.part-editor-area`, `.editor-split`, `.editor-split--horizontal`,
`.editor-split--vertical`, `.editor-split-child`, `.editor-split-divider`.
Import: add `import './EditorArea.css'` to `EditorArea.tsx`.

### `workbench/middle/EditorGroup.css`
Contents: `.editor-group`, `.editor-group--focused::after`,
`.editor-group:not(.editor-group--focused) ...`,
`.editor-group--focused .editor-tab...`,
`.editor-tabstrip`, `.editor-tabstrip::-webkit-scrollbar`,
`.editor-tab` and all sub-rules, `.editor-tab-close` and all sub-rules,
`.editor-content`, `.bundle-view-iframe`.
Import: add `import './EditorGroup.css'` to `EditorGroup.tsx`.

### `workbench/middle/EmptyEditorPart.css`
Contents: `.part-empty-editor`, `.editor-group-empty`,
`.editor-empty`, `.editor-empty-mark`, `.editor-empty-title`,
`.editor-empty-line`, `.editor-empty-key`.
Import: add `import './EmptyEditorPart.css'` to `EmptyEditorPart.tsx`.

### `workbench/middle/PlaceholderEditor.css`
Contents: `.editor-placeholder`, `.editor-placeholder-label`.
Import: add `import './PlaceholderEditor.css'` to `PlaceholderEditor.tsx`.

### `workbench/middle/Panel.css`
Contents: `.part-panel`, `.panel-empty-state`.
Import: add `import './Panel.css'` to `Panel.tsx`.

### `workbench/middle/ScratchRuEdit.css`
Contents:
- `.ru-edit-scratch`, `.ru-edit-scratch-toolbar`, `.ru-edit-toolbar`,
  `.ru-edit-toolbar-group`, `.ru-edit-toolbar-btn` (all variants),
  `.ru-edit-scratch-resource`, `.ru-edit-host`, `.ru-edit-host .ProseMirror`
  (and all sub-rules), `.editor-unknown`
- **Snippet engine** (lines 804-909 in workbench.css): `.ru-snippet-trigger`,
  `.ru-snippet-popup` (and sub-rules), `.ru-snippet-placeholder` (and
  sub-rules), `.ru-snippet-picklist-dropdown`, `.ru-snippet-picklist-item`
  (and sub-rules).
  — Note: snippet DOM is owned by `packages/editor/src/snippets/`; CSS
  stays here until the editor package has its own CSS build pipeline.
Import: add `import './ScratchRuEdit.css'` to `ScratchRuEdit.tsx`.

### `workbench/parts/TitleBar.css`
Contents: `.part-titlebar`, `.titlebar-drag-region`, `.tb-flex`, `.tb-app`,
`.tb-menu`, `.tb-menu-item` (and hover/--open), `.tb-nav`, `.tb-icon-btn`
(and hover/disabled), `.quick-open` (and sub-rules), `.tb-right`,
`.tb-divider`, `.tb-win`, `.tb-win-btn` (and variants), `.avatar-btn`.
Import: add `import './TitleBar.css'` to `TitleBar.tsx`.

### `workbench/parts/StatusBar.css`
Contents: `.part-statusbar`, `.statusbar-region` (and variants),
`.statusbar-entry` (and hover/modifier variants), `.sb-divider`, `.sb-badge`.
Import: add `import './StatusBar.css'` to `StatusBar.tsx`.

### `workbench/parts/Banner.css`
Contents: `.part-banner`.
Import: add `import './Banner.css'` to `Banner.tsx`.

### `workbench/command-palette/CommandPalette.css`
Contents: `.cmd-palette-overlay`, `.cmd-palette`, `.cmd-palette-input`
(and placeholder), `.cmd-palette-list`, `.cmd-palette-empty`,
`.cmd-palette-item` (and --selected/hover), `.cmd-palette-category`,
`.cmd-palette-title`.
Import: add `import './CommandPalette.css'` to `CommandPalette.tsx`.

## New CSS files — from `setup.css`

### `platform/auth/StrengthMeter.css`
Contents: `/* ── Strength meter ──*/` section
(`.strength-meter`, `.strength-bars`, `.strength-bar`, `.strength-bar.on`,
`.strength-bar.on-weak`, `.strength-bar.on-mid`, `.strength-label`).
Import: add `import './StrengthMeter.css'` to `StrengthMeter.tsx`.
Also remove the comment in `StrengthMeter.tsx` that says "classes are defined
in styles/setup.css".

### `platform/auth/PasswordInput.css`
Contents: `/* ── Password wrap + eye toggle ──*/` section
(`.pw-wrap`, `.pw-wrap .setup-input`, `.pw-eye` and variants).
Import: add `import './PasswordInput.css'` to `PasswordInput.tsx`.

### `routes/setup/-keys-components.css`
Contents: `/* ── Progress section ──*/` section (lines 123–283)
— all `.setup-progress`, `.progress-eyebrow`, `.progress-counter`,
`.progress-counter .now/.sep/.total`, `.progress-rail` (and ::before/::after),
`.setup-seg`, `.setup-seg--done`, `.setup-seg--active`,
`.setup-steps`, `.step`, `.step-node`, `.step-label`,
`.step--done *`, `.step--active *`.
Import: add `import './-keys-components.css'` to `-keys-components.tsx`.

### `routes/setup/keys.css`
Contents: everything from `setup.css` **not** in `setup-shared.css`,
`-keys-components.css`, `StrengthMeter.css`, `PasswordInput.css`,
`UnlockGate.css`, `ChangePassphraseDialog.css`, or `UserAvatar.css`:
- `/* ── Content card ──*/` (`.setup-content`, `.setup-step`)
- `/* ── Step layout ──*/` (`.setup-title` remaining rules, `.setup-description`
  etc. NOT in setup-shared — but see note below)
- `/* ── Form elements ──*/` (partial): `.setup-actions`, `.setup-actions > button`
- `/* ── Buttons ──*/` (partial): `.setup-btn-primary` and variants
- `/* ── Google sign-in pill ──*/`: `.btn-google`, `.setup-btn-google` and variants
- `/* ── Recovery surface ──*/`: `.recovery` and all sub-rules
- `/* ── Acknowledge checkbox ──*/`: `.setup-checkbox-label` and sub-rules
- `/* ── Trust strip ──*/`: `.setup-trust`, `.setup-trust-badge` and sub-rules
- `/* ── Finish screen ──*/`: `.setup-finish-mark`, `.setup-finish-title`,
  `.setup-finish-desc`, `.setup-foot` and sub-rules
- `/* ── Footnote ──*/`: `.setup-foot strong` and remaining
- `/* ── Modal overlay ──*/`: `.setup-modal-overlay`, `.setup-modal-card`,
  `.setup-modal-header`, `.setup-modal-title`, `.setup-modal-subtitle`,
  `.setup-modal-form`, `.setup-modal-actions`

Import: update `keys.tsx` — replace both
`import '../../styles/workbench.css'` and `import '../../styles/setup.css'`
with:
```ts
import '../../styles/setup-shared.css';
import './keys.css';
```

### `workbench/middle/UnlockGate.css`
Contents: `/* ── Unlock gate ──*/` section
(`.unlock-gate-overlay`, `.unlock-gate-card`, `.unlock-gate-title`,
`.unlock-gate-nickname`, `.unlock-gate-form`, `.unlock-gate-error`,
`.unlock-recovery-toggle` and hover, `.recovery-entry-area` and :focus).
Import: update `UnlockGate.tsx` — replace
`import '../../styles/setup.css'` → `import './UnlockGate.css'`.

### `workbench/middle/ChangePassphraseDialog.css`
Contents: `/* ── Change passphrase dialog ──*/` section
(`.change-passphrase-overlay`, `.change-passphrase-card`,
`.change-passphrase-title`).
Import: update `ChangePassphraseDialog.tsx` — replace
`import '../../styles/setup.css'` → `import './ChangePassphraseDialog.css'`.

### `workbench/middle/UserAvatar.css`
Contents: `/* ── User avatar ──*/` section
(`.user-avatar-container`, `.user-avatar-btn` and :hover,
`.user-avatar-menu` and sub-rules).
Import: update `UserAvatar.tsx` — replace
`import '../../styles/setup.css'` → `import './UserAvatar.css'`.

## TSX files to update (import only — no JSX changes)

| File | Remove | Add |
|---|---|---|
| `workbench/Workbench.tsx` | `import '../styles/workbench.css'` | `import './Workbench.css'` |
| `workbench/middle/Middle.tsx` | — | `import './Middle.css'` |
| `workbench/middle/ActivityBar.tsx` | — | `import './ActivityBar.css'` |
| `workbench/middle/PrimarySideBar.tsx` | — | `import './PrimarySideBar.css'` |
| `workbench/middle/AuxSideBar.tsx` | — | `import './AuxSideBar.css'` |
| `workbench/middle/EditorArea.tsx` | — | `import './EditorArea.css'` |
| `workbench/middle/EditorGroup.tsx` | — | `import './EditorGroup.css'` |
| `workbench/middle/EmptyEditorPart.tsx` | — | `import './EmptyEditorPart.css'` |
| `workbench/middle/PlaceholderEditor.tsx` | — | `import './PlaceholderEditor.css'` |
| `workbench/middle/Panel.tsx` | — | `import './Panel.css'` |
| `workbench/middle/ScratchRuEdit.tsx` | — | `import './ScratchRuEdit.css'` |
| `workbench/middle/UnlockGate.tsx` | `import '../../styles/setup.css'` | `import './UnlockGate.css'` |
| `workbench/middle/ChangePassphraseDialog.tsx` | `import '../../styles/setup.css'` | `import './ChangePassphraseDialog.css'` |
| `workbench/middle/UserAvatar.tsx` | `import '../../styles/setup.css'` | `import './UserAvatar.css'` |
| `workbench/middle/PrefsDevPanel.tsx` | `import '../../styles/setup.css'` | `import '../../styles/setup-shared.css'` + `import './UnlockGate.css'` |
| `workbench/parts/TitleBar.tsx` | — | `import './TitleBar.css'` |
| `workbench/parts/StatusBar.tsx` | — | `import './StatusBar.css'` |
| `workbench/parts/Banner.tsx` | — | `import './Banner.css'` |
| `workbench/command-palette/CommandPalette.tsx` | — | `import './CommandPalette.css'` |
| `platform/auth/StrengthMeter.tsx` | — | `import './StrengthMeter.css'` |
| `platform/auth/PasswordInput.tsx` | — | `import './PasswordInput.css'` |
| `routes/setup/-keys-components.tsx` | — | `import './-keys-components.css'` |
| `routes/setup/keys.tsx` | both monolith imports | `import '../../styles/setup-shared.css'` + `import './keys.css'` |
| `routes/workspaces/index.tsx` | both monolith imports | `import '../../styles/setup-shared.css'` |

## Files to delete

- `apps/desktop/src/styles/workbench.css`
- `apps/desktop/src/styles/setup.css`

## `theme.css` — update comment

`theme.css` has a comment listing `workbench.css, setup.css, type.css,
WorkspaceTileGrid.css` as reference consumers. Update the comment to
reflect the new colocated file structure (list the new files or describe
the pattern generically).

## Constraints

- **No new selectors.** Relocation only. Do not add, remove, or rename any
  CSS selector or property.
- **No JSX changes.** Only add/update CSS `import` statements in TSX files.
  Do not touch JSX return values, className strings, or logic.
- **`@reference` path must be correct** for each file's depth:
  - `workbench/` (1 level deep from src): `@reference "../styles/theme.css"`
  - `workbench/middle/` or `workbench/parts/` or `workbench/command-palette/`
    (2 levels deep): `@reference "../../styles/theme.css"`
  - `platform/auth/` (2 levels deep): `@reference "../../styles/theme.css"`
  - `routes/setup/` (2 levels deep): `@reference "../../styles/theme.css"`
  - `styles/` (1 level deep, same dir as theme.css): `@reference "./theme.css"`
- **Keep section comments** (the `/* ── X ──*/` banners) in the destination
  files — they're useful documentation.
- **Verify partition is complete.** Every line from `workbench.css` and
  `setup.css` must land somewhere (a destination file, `index.css`, or the
  `@reference` header which is replaced). The two monoliths are fully deleted.

## Watch out for

- `PrefsDevPanel.tsx` uses `unlock-gate-overlay`, `unlock-gate-card`,
  `unlock-gate-title`, `unlock-gate-form` (from UnlockGate.css) AND
  `setup-description`, `setup-label`, `setup-input`, `setup-btn-ghost`
  (from setup-shared.css). It must import both files.
- `routes/workspaces/index.tsx` uses `setup-page`, `setup-topbar`,
  `setup-title`, `setup-description`, `setup-error` — all in
  `setup-shared.css`. No other CSS needed after globals move to index.css.
- The `Workbench.tsx` import currently goes to `workbench.css` which
  loaded 900+ LOC. After PR-8, Workbench.css is ~10 LOC. The rest enters
  the bundle via each component's own import — this is correct; Vite
  deduplicates.
- `StrengthMeter.tsx` has a code comment saying its CSS is in setup.css.
  Remove that comment.
- `theme.css` currently lists the two monolith files in its leading comment.
  Update that comment.
- Some tiny CSS files will be created (ActivityBar.css ≈ 5 LOC,
  AuxSideBar.css ≈ 5 LOC, Banner.css ≈ 8 LOC). This is correct per the
  colocate rule.

## Success criteria

- `pnpm --filter ru-soam-app compile` clean.
- `pnpm --filter @ru-soam/editor compile` clean.
- `pnpm --filter ru-soam-app lint` clean.
- `ls apps/desktop/src/styles/` shows NO `workbench.css` or `setup.css`.
- `grep -rn "styles/workbench.css\|styles/setup.css" apps/desktop/src`
  returns zero matches.
- App boots; workspace picker and setup wizard render without HMR overlay
  errors. Verify via `just dev-desktop` (already running — do NOT restart).

## Reporting

When done, report:
1. Compile + lint.
2. Two success-criteria grep counts (both expected zero).
3. List of new CSS files created (count).
4. Any selector that was ambiguous to place — note the destination chosen.
5. Any TSX file that needed a JSX inspection to determine which CSS classes
   it actually used (for import scoping decisions).
