# PR-6 — Styling consolidation: BEM-strict naming codemod

Renames component-local state classes from the `.is-{state}` pattern to
the BEM-strict `.block--{modifier}` pattern, per the "Styling system"
rules in `CLAUDE.md`. Where the naive rename would drop the rule's
specificity below a competing `:hover` rule, uses a doubled-class form
(`.block.block--modifier`) to preserve specificity.

## Goal

Rename 14 `.is-{state}` selectors and update all 9 JS/TSX call-sites.
Result: zero `is-{state}` selectors in scope; all component-local state
uses `.block--{modifier}`. One dead selector (no JS counterpart) is
documented and skipped.

Out of scope (deferred):
- Type recipe (`.t-*`) adoption — PR-7.
- CSS file relocation and recipe layer — PR-8+.
- Decomposing `workbench.css` / `setup.css` — PR-8+.

## Scope

CSS files (2):
- `apps/desktop/src/styles/workbench.css`
- `apps/desktop/src/styles/setup.css`

JS/TSX files (6):
- `apps/desktop/src/workbench/parts/StatusBar.tsx`
- `apps/desktop/src/workbench/parts/TitleBar.tsx`
- `apps/desktop/src/platform/ru-edit/RuEditToolbar.tsx`
- `apps/desktop/src/routes/setup/-keys-components.tsx`
- `packages/editor/src/snippets/trigger-plugin.ts`
- `packages/editor/src/snippets/picklist-view.ts`

Out of scope:
- The two `.editor-*` `.is-*` patterns do not exist (already BEM-strict).
- `.ru-snippet-placeholder--picklist.is-open` (workbench.css:954) is dead
  CSS — no JS sets the `is-open` class. Skip and flag for PR-8 cleanup.
- No new tokens. No new selectors (only renames). No type/recipe changes.

## Rename strategy

Two flavours, picked per site by specificity context:

**Naive rename** — when no competing same-specificity `:hover` rule lives
in the same source block:
```
.block.is-X     →   .block--X
```

**Doubled-class rename** — when a `:hover` rule with the same
specificity as the original `.block.is-X` lives above it in the source.
Without the doubling, the modifier would drop from (0,2,0) to (0,1,0),
losing the cascade race against `:hover`:
```
.block.is-X     →   .block.block--X
```

The doubled form keeps specificity at (0,2,0), matching the original
behaviour exactly while still expressing the BEM modifier. Both class
names must always be applied together at the call-site (the existing
JS code already does this since the base class is always present).

## CSS rewrites — `workbench.css`

| Line | Before | After | Reason |
|---|---|---|---|
| 109 | `.tb-menu-item.is-open` (in selector list with `.tb-menu-item:hover`) | `.tb-menu-item--open` (kept in same list) | Naive — body identical to `:hover`, source order resolves. |
| 235 | `.tb-win-btn.is-close:hover` | `.tb-win-btn--close:hover` | Naive — line is 4 lines below the base `.tb-win-btn:hover`, so the `:hover` pseudo on the modifier still wins by source order at same (0,2,0) specificity. |
| 434 | `.statusbar-entry.is-ok` | `.statusbar-entry.statusbar-entry--ok` | **Doubled** — `.statusbar-entry:hover` at line 429 has (0,2,0); naive would lose. |
| 438 | `.statusbar-entry.is-warning` | `.statusbar-entry.statusbar-entry--warning` | **Doubled** — same reason. |
| 443 | `.statusbar-entry.is-error` | `.statusbar-entry.statusbar-entry--error` | **Doubled** — same reason. |
| 682 | `.ru-edit-toolbar-btn.is-active,` (in selector list with `.ru-edit-toolbar-btn[aria-pressed="true"]`) | `.ru-edit-toolbar-btn.ru-edit-toolbar-btn--active,` (keep the `[aria-pressed]` branch as-is) | **Doubled** — `.ru-edit-toolbar-btn:hover` at line 680 has (0,2,0); naive would lose. The `[aria-pressed]` branch is already (0,2,0) and stays. |
| 895 | `.ru-snippet-popup-item.is-selected` (in selector list with `.ru-snippet-popup-item:hover`) | `.ru-snippet-popup-item--selected` (kept in same list) | Naive — body identical to `:hover`, no separate cascade issue. |
| 954 | `.ru-snippet-placeholder--picklist.is-open` | **SKIP** | Dead CSS — no JS sets `is-open` on the placeholder. Flag for PR-8. |
| 980 | `.ru-snippet-picklist-item.is-selected` (in selector list with `.ru-snippet-picklist-item:hover`) | `.ru-snippet-picklist-item--selected` (kept in same list) | Naive — same as 895. |

## CSS rewrites — `setup.css`

| Line | Before | After | Reason |
|---|---|---|---|
| 193 | `.setup-seg.is-done` | `.setup-seg--done` | Naive — no `:hover` on `.setup-seg`. |
| 197 | `.setup-seg.is-active` | `.setup-seg--active` | Naive — same. |
| 256 | `.step.is-done .step-node` | `.step--done .step-node` | Naive — no competing `.step-node:hover` rule. |
| 262 | `.step.is-done .step-label` | `.step--done .step-label` | Naive — same. |
| 266 | `.step.is-active .step-node` | `.step--active .step-node` | Naive — same. |
| 277 | `.step.is-active .step-label` | `.step--active .step-label` | Naive — same. |

## JS/TSX rewrites

In every case, the existing JS already concatenates the modifier onto the
block class with a leading space. Update the string literal to use the
new modifier name. For doubled-class sites, the modifier string must
also include the block (so the doubled selector matches).

### `apps/desktop/src/workbench/parts/StatusBar.tsx` — lines 51–53

```diff
- if (severity === 'ok') return ' is-ok';
- if (severity === 'warning') return ' is-warning';
- if (severity === 'error') return ' is-error';
+ if (severity === 'ok') return ' statusbar-entry--ok';
+ if (severity === 'warning') return ' statusbar-entry--warning';
+ if (severity === 'error') return ' statusbar-entry--error';
```

(The base `statusbar-entry` class is already on the element; the doubled
selector requires both class names to be present, which they will be.)

### `apps/desktop/src/workbench/parts/TitleBar.tsx`

- Line 69:
  ```diff
  - className={`tb-menu-item${openMenu === m ? ' is-open' : ''}`}
  + className={`tb-menu-item${openMenu === m ? ' tb-menu-item--open' : ''}`}
  ```

- Line 164:
  ```diff
  - className="tb-win-btn is-close"
  + className="tb-win-btn tb-win-btn--close"
  ```

### `apps/desktop/src/platform/ru-edit/RuEditToolbar.tsx` — line 66

```diff
- const cls = `ru-edit-toolbar-btn${isActive ? ' is-active' : ''}`;
+ const cls = `ru-edit-toolbar-btn${isActive ? ' ru-edit-toolbar-btn--active' : ''}`;
```

(Doubled — base class always present.)

### `apps/desktop/src/routes/setup/-keys-components.tsx`

- Line 32 (inside the `.setup-seg` map):
  ```diff
  - const cls = n < step ? 'is-done' : n === step ? 'is-active' : '';
  + const cls = n < step ? 'setup-seg--done' : n === step ? 'setup-seg--active' : '';
  ```

- Line 39 (inside the `.step` map):
  ```diff
  - const cls = n < step ? 'is-done' : n === step ? 'is-active' : '';
  + const cls = n < step ? 'step--done' : n === step ? 'step--active' : '';
  ```

(Verify by reading the surrounding 5 lines that line 32 maps to
`setup-seg` and line 39 maps to `step` — the brief was authored against
file state on `main` but the two are visually similar and easy to
swap.)

### `packages/editor/src/snippets/trigger-plugin.ts` — line 217

```diff
- item.className = 'ru-snippet-popup-item' + (i === selectedIdx ? ' is-selected' : '');
+ item.className = 'ru-snippet-popup-item' + (i === selectedIdx ? ' ru-snippet-popup-item--selected' : '');
```

### `packages/editor/src/snippets/picklist-view.ts` — line 131

```diff
- item.classList.toggle('is-selected', selected);
+ item.classList.toggle('ru-snippet-picklist-item--selected', selected);
```

## Constraints

- Do not modify or remove the dead selector at `workbench.css:954`.
  Flag it in your report; PR-8 cleanup will handle it.
- Do not change any non-state class names (block names, element names,
  existing modifier names).
- Do not change any CSS properties or values. Pure selector rename.
- Do not introduce new selectors, files, or tokens.

## Success criteria

- `pnpm --filter ru-soam-app compile` clean.
- `pnpm --filter @ru-soam/editor compile` clean.
- `pnpm --filter ru-soam-app lint` clean.
- `grep -rEn "\.is-[a-z-]+" apps/desktop/src/styles workbench.css setup.css`
  inside scope CSS files returns only the one dead-selector match
  (`.ru-snippet-placeholder--picklist.is-open`).
- `grep -rEn "(^|[^a-zA-Z-])is-(open|close|active|selected|done|ok|warning|error)([^a-zA-Z-]|$)" apps/desktop/src packages/editor/src --include="*.ts" --include="*.tsx"`
  returns zero matches in scope JS/TSX.

## Watch out for

- The two `-keys-components.tsx` sites both use the literal class strings
  `'is-done'` / `'is-active'` — make sure each block-prefix rename
  (`setup-seg--*` vs `step--*`) maps to the correct site. The wrong
  swap will silently break visual state without a runtime error.
- The doubled-class rewrites must NOT shorten to single class form. The
  CSS selector `.statusbar-entry.statusbar-entry--ok` requires both
  class names on the element. The JS already adds both, but verify
  before saving.

## Reporting

When done, report:
1. The two success-criteria grep counts.
2. Compile + lint results.
3. Any line drift.
4. Confirmation that the dead selector at `workbench.css:954` is
   untouched.
