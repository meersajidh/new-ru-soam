# A2 Extraction Brief (ADR-420 → implementer handoff)

**Status:** Ready to execute. ADR-420 Accepted 2026-07-06. Not started.
**Authority:** `docs/ADRs/420-design-system-component-boundary.md` (the decisions), `docs/Guides/design-system.md` (the discipline), `docs/Design_System_Inventory.md` (the file-level map — §2a/§2b/§3b).
**Note for next session:** this is a multi-step, cross-cutting move with a mass import rewrite + a new workspace package + native/vite/tsconfig wiring — do NOT one-shot it. Land it in the 4 slices below, each independently green (`pnpm --filter ru-soam compile && lint`), each its own commit. Slice 1 (shell pkg) and Slice 4 (view backfill) are independent — either can go first.

**Division of labor (delegation rule — see `[[feedback_implementer_no_run_no_git]]`):** a delegated implementer does **static gates only** (compile + lint), leaves the tree **uncommitted**, and does **NOT run the app / CDP / dogfood** and **NOT git**. The "dogfood live" success bars in each slice below are the *slice's* exit criteria — but the **main thread** runs that live/CDP verification after the implementer returns green static gates, and the **user** owns git. Don't brief an implementer to run `just dev-desktop` or commit.

---

## Slice 1 — Create `@basebench/ui` + move the 13 clean primitives

> **AMENDED 2026-07-06 (S1 execution).** The original 15-item scope included two
> primitives that back-depend on app DI — `ResizeHandle` (LayoutService + prefs
> cap) and `ContextMenu` (menu-service contract types). Moving either as-is =
> a package→app back-edge = the exact one-way-dep violation this slice proves
> clean. **Carved out:** `ResizeHandle` → new **S1b** (split, not move);
> `ContextMenu` → deferred + reclassified as menu-service-internal (see ADR-420
> D3 Amendment). S1 = the **13 clean primitives** below.

**Goal:** stand up `packages/basebench-ui`, move the 13 clean shell primitives, rewrite importers. Keep S1 a pure behavior-preserving move — no refactors.

**Scope (move, behavior-preserving — keep public APIs + class names + `.css` identical):**
- From `apps/desktop/src/platform/ui/`: `Button`, `TextInput`, `Dialog`, `FormField`, `PageShell`, `cn` (all + their `.css`).
- From `apps/desktop/src/platform/popover/`: `Popover`, `use-popover`, `Select` (+ `.css`).
- From `apps/desktop/src/platform/icons/`: the **font** `Icon` (`Icon.tsx`) + `icon-registry.ts` (glyph/name data — confirmed clean, moves with `Icon`).
- From `apps/desktop/src/platform/hooks/`: `useModalKeys`.
- **NOT in S1:** `ResizeHandle` (→ S1b), `ContextMenu` (→ deferred, stays with `menu-service`).

**Package setup (this is the O194-mechanics-proving part — do it carefully, it's the template for the eventual mass move):**
- `packages/basebench-ui/package.json` — name `@basebench/ui`, `"type":"module"`, `exports` map, `workspace:*` deps as needed (React peer).
- `tsconfig` with a project ref added to `apps/desktop/tsconfig.json` solution (mirror how `@ru-soam/editor` / `@ru-soam/view-kit` are referenced — the `tsc -b` solution must build it).
- Vite alias `@basebench/ui` (mirror the `@ru-soam/editor` alias in `vite.config.ts`).
- pnpm-workspace already globs `packages/*` — confirm, no edit likely needed.
- Tailwind: the moved `.css` must still resolve `@theme`/palette tokens — verify the package's CSS is reachable by the renderer's Tailwind build (these are shell/`app://` styles, NOT the per-bundle view Tailwind). Watch the `@theme`-tree-shake gotcha (CLAUDE.md): use palette-file tokens, not raw `var(--x)` on `@theme` vars.

**Rewrite:** every importer of the moved files → `@basebench/ui`. Inventory §2a lists importer counts (Button 7, FormField 7, TextInput 6, Dialog 4, Popover 3, usePopover 6, cn 4, ResizeHandle 4). Use grep/ast-grep to find all; don't hand-count.

**Success:** `compile` + `lint` green; `just dev-desktop` boots; a shell surface that uses these (e.g. a dialog, the roster resize handles, a Select) renders + behaves identically. Dogfood at least one Dialog + ResizeHandle live.

**Watch out:**
- `Select` is built on `Popover` — both move together, no cycle.
- `RuEditToolbar` uses some of these — keep it working (it stays in `platform/ru-edit`, just re-imports).
- Don't move `menu-service`/`MenuHost`/`statusbar-service` etc. — those are DI/registry services, not primitives.
- Full `just dev-desktop` restart to verify (HMR won't swap boot singletons / new package resolution).

---

## Slice 1b — ResizeHandle split (pure primitive + app wrapper)

**Goal:** move the generic drag primitive into `@basebench/ui` while leaving the `LayoutService`/prefs binding in app. A refactor, not a straight move — hence its own slice + dogfood gate.

**Scope:**
- New pure `<ResizeHandle>` in `@basebench/ui`: props-only (`onResize`, `min`, `max`, orientation, etc.). No `useService`, no `window.soam`, no `LayoutService` import. Owns the pointer handling + the drag-shield (full-viewport transparent overlay on mousedown — the documented gotcha) + clamp math.
- App-side wrapper `LayoutResizeHandle` (stays in `apps/desktop/src`, near `layout`/the Parts): binds `LayoutService` + the `prefs` capability, translates to the pure primitive's `onResize`/`min`/`max`.
- Rewrite the 3 Part consumers (AuxSideBar, PrimarySideBar, Panel per A1) → the app wrapper.

**Success:** `compile` + `lint` green; **dogfood live** — resize each of the 3 Parts, confirm clamp behavior, drag-over-iframe still works (drag-shield), and sizes **persist across restart** (prefs round-trip). Behavior identical to pre-split.

**Watch out:** the drag-shield + prefs persistence are exactly what compile won't catch — this slice is not done until dogfooded. Full `just dev-desktop` restart (HMR won't swap the LayoutService singleton).

---

## Slice 2 — Boundary-import lint rule (D5.1)

**Goal:** enforce that shell primitives import only from `@basebench/ui`; no reaching into package internals; no cross-bundle `view-src` imports; no `app://`↔view-kit crossing.

**Scope:** extend the existing ADR-106 one-way-dependency import-lint (`apps/desktop/eslint.config.js` — find the rule that enforces base/domain today). Add: forbid deep imports past `@basebench/ui` / `@ru-soam/view-kit` public entry; forbid relative-path imports to the **moved** primitives (their canonical home is now the package). Do NOT forbid `platform/menu/ContextMenu` — it stays in app (S1 carve-out); `MenuHost` importing it relatively is correct.

**Success:** lint fails on a deliberately-wrong import (test it), passes clean on the rewritten tree.

---

## Slice 3 — No-raw-fragment lint (D5.2, incremental)

**Goal:** flag hand-written inline `<svg>` in bundle `view-src` (icons must be `<Icon>`).

**Scope:** an ast-grep or eslint rule over `bundles/*/view-src/**`. Start narrow (inline `<svg>` literal) — grow the covered-primitive allowlist later as Slice 4 lands fragments.

**Success:** flags the current offenders (`overview.tsx`, `calendar-setup.tsx` per A1 §3b) before they're fixed in Slice 4; green after.

---

## Slice 4 — Backfill `@ru-soam/view-kit` fragments + kill hand-drawn icons

**Goal:** add the proven-shared view fragments to `@ru-soam/view-kit`; delete per-bundle copies; replace hand-drawn SVG icons with `<Icon>`.

**Scope (per A1 §3b — all past rule-of-three, prop-driven, token-only, honor `styling-system.md`):**
- Add to view-kit: `EmptyState` (11 files use an `empty` pattern), `Card` (25×), `Badge`/`Chip` (14×/5×), `KvRow` (7×), `Section` header block.
- Replace hand-drawn `PlusIcon`/`PersonArrowIcon`/`MIcon`/`LockIcon` (in `ru-soam-practice/view-src/overview.tsx`, `ru-soam-schedule/view-src/calendar-setup.tsx`) with view-kit `<Icon>` — **add the missing glyph paths to `CODICON_PATHS`**, then delete the hand-drawn components.
- Rewrite each bundle copy → view-kit import; **delete all copies** (mandatory per rule-of-three).

**Success:** all 14 view-src consumers use the shared fragments; zero hand-drawn `<svg>`; each affected view dogfood-verified in its real `view://` iframe (CDP) — no blank views, icons render. `build:views` + `compile` + `lint` green. (Recall: `build:views` is NOT a type-check — always `compile`.)

**Watch out:**
- view-kit fragments are additive/un-gated (ADR-419 boundary already accepted) — Slice 4 can land independent of Slices 1–3.
- Per-bundle Tailwind: fragments ship as prop-driven components resolving to tokens via `@ru-soam/view-kit/theme.css` — don't hard-code colors.
- Dogfood the restart gotcha (memory): `pkill -f "new-ru-soam/node_modules/electron"`, confirm `lsof -i :9333` clear, relaunch single — else CDP hits stale code.

---

## Deferred to after extraction (separate, un-gated)

- **A3 gallery route** — `/dev/design-system` dev-only TanStack route; shell primitives direct, view primitives inside a real `view://` iframe frame; live axis toggles (palette × luminance × font-set). Its own brief later.

## Sequencing / commits

Independent: Slice 1 (shell pkg) ⟂ Slice 4 (view backfill). Slice 2/3 lint follow their respective extractions (2 after 1, 3 alongside/after 4). Each slice = own commit, own green gate. Do NOT bundle into one mega-commit.
