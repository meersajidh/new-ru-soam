# PR-5 — Styling consolidation: inline `style={{}}` triage

Migrates inline-style usage in JSX to Tailwind utilities or existing
recipe classes, per the "Styling system" rules in `CLAUDE.md`. Reserves
inline `style` for runtime values only.

## Goal

Of 21 inline `style={{}}` sites:
- 7 are dynamic / runtime values — **keep as-is**.
- 14 are layout primitives, spacing, alignment, or theme-able properties
  — **replace** with Tailwind utilities (and one fix for a broken token
  reference).

Out of scope (deferred):
- BEM-strict naming codemod — PR-6.
- Type recipe (`.t-*`) adoption — PR-7.
- CSS file relocation and recipe layer — PR-8+.

## Background

The "Styling system" rules in `CLAUDE.md` (under **Conventions**) state
inline `style={{}}` is reserved for runtime values the styling system
cannot know — computed flex ratios, dynamic avatar backgrounds, animation
progress. Everything else (gap, margin, display, opacity, theme-able
colors) must go through Tailwind utilities or recipe classes.

Tailwind v4 token-to-utility mapping in this project:
- `--space-1 (4px)` → `gap-1` / `mt-1` / etc.
- `--space-2 (8px)` → `gap-2` / `mt-2` / etc.
- `--space-3 (12px)` → `gap-3` / `mt-3` / etc.
- `--space-4 (16px)` → `gap-4` / `mt-4` / etc.
- `--radius-sm (4px)` → `rounded-sm`
- `--radius-md (8px)` → `rounded-md`
- `--font-mono` → `font-mono`
- `--color-surface-elevated` → `bg-surface-elevated`
- `--color-fg-muted` → `text-fg-muted`

(Tailwind v4 generates utilities directly from `@theme` tokens in
`tokens.css`. If a utility does not exist, the corresponding token does
not exist — do not invent values.)

## Scope

Files in scope:

- `apps/desktop/src/platform/auth/StrengthMeter.tsx` (no changes — already
  runtime-only; listed here so a future audit can see it was reviewed).
- `apps/desktop/src/routes/workspaces/index.tsx`
- `apps/desktop/src/routes/setup/keys.tsx`
- `apps/desktop/src/workbench/middle/PrefsDevPanel.tsx`
- `apps/desktop/src/workbench/middle/EditorArea.tsx` (no changes —
  runtime).
- `apps/desktop/src/workbench/middle/PreWorkspaceRoute.tsx`
- `apps/desktop/src/workbench/middle/UnlockGate.tsx`
- `apps/desktop/src/workbench/middle/WorkspaceTileGrid.tsx` (no changes —
  runtime).
- `apps/desktop/src/workbench/middle/ChangePassphraseDialog.tsx`

No CSS files in scope. No selector additions. No new tokens.

## Sites — keep as inline (runtime / dynamic values)

These 7 sites are **out of scope for editing**. They are documented here
so the success-criteria grep can be tightened later.

| File / line | Reason |
|---|---|
| `StrengthMeter.tsx:25` | Dynamic bar background based on `score`. |
| `StrengthMeter.tsx:33` | Dynamic label color based on `score`. |
| `EditorArea.tsx:18` | Computed `flex: node.ratio`. |
| `EditorArea.tsx:22` | Computed `flex: 1 - node.ratio`. |
| `WorkspaceTileGrid.tsx:70` | Dynamic per-workspace avatar background. |
| `ChangePassphraseDialog.tsx:155` | Dynamic strength bar background. |
| `ChangePassphraseDialog.tsx:161` | Dynamic strength label color. |

## Sites — replace (14)

Lines refer to the file state on `main` at the time of the audit. Verify
each match before editing — locate by literal expression if line drifted.

### Flex-fill divs

| File / line | Before | After |
|---|---|---|
| `workspaces/index.tsx:72` | `<div style={{ flex: '1 1 auto' }} />` | `<div className="flex-auto" />` |
| `PreWorkspaceRoute.tsx:42` | `<div style={{ flex: '1 1 auto' }} />` | `<div className="flex-auto" />` |

### Single-property spacing

| File / line | Before | After |
|---|---|---|
| `setup/keys.tsx:357` | `style={{ marginTop: 'var(--space-4)' }}` on existing element | Add `mt-4` to that element's existing `className`. Drop the `style` prop entirely. |
| `PrefsDevPanel.tsx:121` | `<div style={{ marginTop: 'var(--space-4)' }}>` | `<div className="mt-4">` |
| `PrefsDevPanel.tsx:122` | `<p className="setup-label" style={{ marginBottom: 'var(--space-2)' }}>` | `<p className="setup-label mb-2">` |
| `PrefsDevPanel.tsx:152` | `<span style={{ opacity: 0.5 }}>` | `<span className="opacity-50">` |
| `UnlockGate.tsx:276` | `<p className="setup-description" style={{ marginBottom: 'var(--space-2)' }}>` | `<p className="setup-description mb-2">` |
| `ChangePassphraseDialog.tsx:125` | `<label htmlFor="cp-new" className="setup-label" style={{ marginTop: 'var(--space-2)' }}>` | `<label htmlFor="cp-new" className="setup-label mt-2">` |

### Composite layout

| File / line | Before | After |
|---|---|---|
| `setup/keys.tsx:490` | `<div className="setup-actions" style={{ justifyContent: 'center' }}>` | `<div className="setup-actions justify-center">` (the existing `.setup-actions` already sets `display: flex`; the `justify-center` utility composes with it cleanly). |
| `PrefsDevPanel.tsx:59` | `<div className="unlock-gate-card" style={{ width: 520, maxWidth: 'calc(100vw - 32px)' }}>` | `<div className="unlock-gate-card w-[520px] max-w-[calc(100vw-32px)]">` |
| `PrefsDevPanel.tsx:60` | `<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>` | `<div className="flex justify-between items-baseline">` |
| `PrefsDevPanel.tsx:135` | `<ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>` | `<ul className="list-none p-0 m-0 flex flex-col gap-1">` |
| `ChangePassphraseDialog.tsx:98` | `<form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>` | `<form onSubmit={handleSubmit} className="flex flex-col gap-3">` |

### Multi-property grid item — `PrefsDevPanel.tsx:139–148`

This is the prefs-list row. Before:

```tsx
<li
  key={row.key}
  style={{
    display: 'grid',
    gridTemplateColumns: '1fr 1fr auto',
    gap: 'var(--space-2)',
    padding: 'var(--space-1) var(--space-2)',
    background: 'var(--color-surface-raised)',
    borderRadius: 4,
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
  }}
>
```

**Note — pre-existing bug.** `--color-surface-raised` is not a defined
token (`tokens.css` declares `base / panel / elevated / active`).
The element currently renders with no background. Fix to
`--color-surface-elevated` (the nearest semantic neighbour) as part of
this rewrite.

After:

```tsx
<li
  key={row.key}
  className="grid grid-cols-[1fr_1fr_auto] gap-2 py-1 px-2 bg-surface-elevated rounded-sm font-mono text-xs"
>
```

(`text-xs` = 12px in Tailwind v4 default scale; `rounded-sm` = 4px per
the project's `--radius-sm` token.)

## Constraints

- Do **not** modify the 7 runtime sites listed above.
- Do not change visual behaviour except for the documented
  `--color-surface-raised` → `--color-surface-elevated` fix (which
  restores a previously-broken background).
- Do not add new tokens or new CSS classes.
- Do not modify the existing class names being composed with (e.g.
  `.setup-label`, `.setup-actions`, `.unlock-gate-card`,
  `.setup-description`).
- If a utility you expect to use does not resolve (Tailwind warns or the
  class has no effect), stop and surface the finding — do not invent
  arbitrary values or write CSS to compensate.

## Success criteria

- `pnpm --filter ru-soam-app compile` clean.
- `pnpm --filter @ru-soam/editor compile` clean.
- `pnpm --filter ru-soam-app lint` clean.
- `grep -rn "style={{" apps/desktop/src --include="*.tsx" | wc -l` returns
  **7** (only the runtime sites remain).
- Visual dogfood (handled by Opus after the handoff): the prefs dev panel
  list rows now have a visible background; everything else looks
  unchanged.

## Reporting

When done, report:
1. The post-sweep `style={{` count (expect 7).
2. Compile + lint results.
3. Any line drift.
4. Whether the Tailwind utilities resolved (no warnings about missing
   classes or unrecognised arbitrary values).
5. Anything skipped and why.
