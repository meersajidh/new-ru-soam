# Design-System Inventory (A1 — O516)

**Status:** Draft (A1 output — inventory only, no ADR, no extraction)
**Date:** 2026-07-06
**Feeds:** `docs/Design_System_And_Testing_Refactor.md` Lane A. A2 (extraction) is ADR-gated (range 400s, reconcile O194) — **nothing here is extracted until that ADR is written and accepted.**

---

## 1. The organizing fact: two render surfaces

The design system is split by render surface, and the split is architectural, not incidental (ADR-411/413/419):

| Surface | Where it runs | Origin / CSP | Icon impl | Theme delivery |
| ------- | ------------- | ------------ | --------- | -------------- |
| **Shell** | `apps/desktop/src` renderer | `app://` (trusted) | **font** codicon (`<Icon>` in `platform/icons`) | `tokens.css` + palette classes in-tree |
| **View** | bundle iframes | `view://<bundleId>` (sandboxed, strict CSP) | **inline-SVG** codicon (`<Icon>` in `@ru-soam/view-kit`) | per-bundle Tailwind build importing `@ru-soam/view-kit/theme.css` |

There are therefore **two `<Icon>` components by design** (ADR-413 Am1) — do not merge them. Every primitive below belongs to exactly one surface. Proposed homes reflect that:

- **`@ru-soam/view-kit`** — view-surface primitives. **Already a real package** (`ViewRoot`, `Icon`, hooks, `codicon-paths`, `theme.css`, `tokens.css`). A2 = *grow* it with the fragments bundles currently re-derive.
- **`basebench` base pkg** — shell-surface base primitives. **Not yet extracted** (O194). A2 for the shell kit reconciles with / partially subsumes O194.
- **`@ru-soam/editor`** — RuEdit primitive. **Already owned** — no move needed.
- **stays put** — app-specific one-offs (workspace switcher, avatar, splash, toasts…). Not design-system primitives.

---

## 2. Shell surface (`app://` renderer)

### 2a. Shell UI kit — SHARED, extract candidate → `basebench`

Generic, theme-only, multi-consumer. Already colocated under `platform/ui` + `platform/popover` + `platform/menu` as a de-facto kit; the boundary is just not owned/enforced.

| Primitive | Current location | Importers | Class | Proposed home |
| --------- | ---------------- | :-------: | ----- | ------------- |
| `Button` (+`.css`) | `platform/ui/Button.tsx` | 7 | shared | `basebench` |
| `FormField` | `platform/ui/FormField.tsx` | 7 | shared | `basebench` |
| `TextInput` (+`.css`) | `platform/ui/TextInput.tsx` | 6 | shared | `basebench` |
| `Dialog` (+`.css`) | `platform/ui/Dialog.tsx` | 4 | shared | `basebench` |
| `Popover` (+`.css`) | `platform/popover/Popover.tsx` | 3 | shared | `basebench` |
| `usePopover` | `platform/popover/use-popover.ts` | 6 | shared | `basebench` |
| `ContextMenu` (+`.css`) | `platform/menu/ContextMenu.tsx` | (menu svc) | shared | `basebench` |
| `Icon` (font) | `platform/icons/Icon.tsx` | many | shared | `basebench` (shell tier) |
| `ResizeHandle` | `workbench/middle/ResizeHandle.tsx` | 4 | shared | `basebench` |
| `cn()` | `platform/ui/cn.ts` | 4 | shared util | `basebench` |
| `useModalKeys` | `platform/hooks/useModalKeys.ts` | (dialogs) | shared hook | `basebench` |

### 2b. Shell UI kit — BORDERLINE (single consumer today, part of the kit)

Ship with the kit for coherence, or leave in place and revisit. Flag in the A2 ADR.

| Primitive | Current location | Importers | Class | Note |
| --------- | ---------------- | :-------: | ----- | ---- |
| `PageShell` (+`.css`) | `platform/ui/PageShell.tsx` | 1 | one-off-ish | kit member, low reuse |
| `Select` (+`.css`) | `platform/popover/Select.tsx` | 1 | one-off-ish | built on `Popover`; kit member |
| `Dialog`-family: `ChangePassphraseDialog`, `DeleteWorkspaceDialog` | `workbench/middle/*` | 1 each | one-off | consumers of `Dialog`, not primitives — stay |

### 2c. RuEdit — ALREADY OWNED → `@ru-soam/editor`

| Primitive | Current location | Class | Home |
| --------- | ---------------- | ----- | ---- |
| RuEdit core (`mountRuEdit`, schema, commands, snippets…) | `packages/editor/src` | owned pkg | `@ru-soam/editor` (no change) |
| `RuEditView` / `RuEditToolbar` (React wrappers) | `platform/ru-edit/*` | shell wrapper | stays in `platform/ru-edit` (thin adapter over owned pkg) |

### 2d. Shell one-offs — STAY (not design-system primitives)

App-specific composition, single-purpose, DI/registry-coupled. Not candidates.

`WorkspaceSwitcher`, `UserAvatar`, `LoadingSplash`, `BridgeMark`, `Wordmark`, `ActivityBar`, `CommandPalette`, `ToastStack` / `NotificationItem` / `NotificationPanel`, `WhatsNewModal`, `KeyboardShortcuts`, `SettingsMenu`, `PrefsDevPanel`, `AccountSelect`, `UnlockGate`, `BundleViewIframe`, the workbench Parts (`TitleBar`, `Banner`, `StatusBar`, `Middle`, side bars, `Panel`, `EditorArea`/`EditorGroup`).

---

## 3. View surface (`view://` iframes)

### 3a. view-kit — ALREADY EXTRACTED (the boundary exists)

| Primitive | Location | Status |
| --------- | -------- | ------ |
| `ViewRoot`, `useSoamView`, `useViewContext`, `useViewQuery`, `useCapQuery`, `useCapMutation`, `useViewChannel` | `packages/view-kit/src` | shipped |
| `Icon` (inline-SVG), `CODICON_PATHS` | `packages/view-kit/src` | shipped |
| `theme.css`, `tokens.css` | `packages/view-kit/src` | shipped |

14 view-src files already import `@ru-soam/view-kit`. This boundary is real — A2's view-side job is **backfilling fragments into it**, not creating it.

### 3b. Bundle-re-derived fragments — SHARED-BY-DUPLICATION, extract candidate → `@ru-soam/view-kit`

Same shapes hand-rolled across bundle `view-src` (measured by class/function occurrence). These are the highest-value view-side extractions.

| Fragment | Evidence | Class | Proposed home |
| -------- | -------- | ----- | ------------- |
| Empty-state / placeholder panel | `empty` class in **11** view-src files; `NotFoundPanel`, `LockedPanel` variants | shared-by-dup | `@ru-soam/view-kit` |
| Card / surface container | `card` class ×25 occurrences; `NextSessionCard`, `LastNoteCard`, `KvRow` | shared-by-dup | `@ru-soam/view-kit` |
| Badge / chip / pill | `badge` ×14, `chip` ×5, `pill` occurrences | shared-by-dup | `@ru-soam/view-kit` |
| Key-value row | `KvRow` (+ `kv-row` class ×7) | shared-by-dup | `@ru-soam/view-kit` |
| `Section` header block | `function Section` ×2 + many one-file variants | shared-by-dup | `@ru-soam/view-kit` |
| **Inline hand-drawn SVG icons** | `PlusIcon`, `PersonArrowIcon`, `MIcon`, `LockIcon` in `overview.tsx`, `calendar-setup.tsx` | **bug/dup** — should be `<Icon>` from view-kit | migrate to view-kit `Icon` (add missing codicon paths) |

> The inline-SVG icon components are not a new primitive — they're bundles bypassing the existing view-kit `<Icon>` because a needed codicon path was missing. A2 fix = add the paths to `CODICON_PATHS`, delete the hand-drawn ones.

### 3c. View one-offs — STAY

Per-view composition (`Roster`, `Schedule`, `Overview`, `MeetingRecord`, `SafetyPlanForm`, `MigrationView`, `Timeline`, `TimeGrid`, `WeekView`, `MonthView`, etc.) — application screens, not primitives.

---

## 4. Summary — what A2 actually extracts

1. **Shell kit → `basebench`** (§2a, ~11 primitives + `cn`/`useModalKeys`). Reconcile with O194; this may *be* a large slice of O194's base-pkg extraction. Borderline §2b members: decide per-item in the ADR.
2. **View fragments → `@ru-soam/view-kit`** (§3b): EmptyState, Card, Badge/Chip, KvRow, Section — plus killing the hand-drawn SVG icons by extending `CODICON_PATHS`. Package already exists; this is additive, no new boundary.
3. **No move:** `@ru-soam/editor` (RuEdit), all one-offs (§2d, §3c).

Two boundaries touched, only one *new* (the shell `basebench` kit — the ADR-gated part). view-kit growth is additive within an existing accepted boundary (ADR-419), so the ADR's genuinely novel decision is the **shell base-pkg kit** and its reconciliation with O194/O195/O196.

---

## 5. Open questions for the A2 ADR

- **Shell kit ⇄ O194.** Is the shell UI kit a *slice of* the `basebench` base-pkg extraction, or a sibling `@basebench/ui` sub-entry? Decides whether A2 unblocks O194 or waits behind it.
- **Borderline §2b.** Ship `PageShell`/`Select` with the kit (coherence) or leave (YAGNI)? Single-consumer today.
- **Two-Icon contract.** ADR should restate that shell-`Icon` (font) and view-kit-`Icon` (SVG) are permanently separate, so a future reader doesn't "unify" them.
- **Fragment API shape.** view-kit fragments (Card/EmptyState/Badge) — prop-driven components vs. `@apply`-class recipes? Must honor `docs/Guides/styling-system.md` (no `@apply` outside allowed layers).
