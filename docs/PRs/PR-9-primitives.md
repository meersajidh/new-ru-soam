# PR-9 — Component primitive layer

Introduces the first-party component primitive layer under `src/platform/ui/`.
Eliminates `styles/setup-shared.css` (a PR-8 temporary bridge) by replacing
every raw `setup-*` / `unlock-gate-*` class string with typed React
component calls. No external deps.

## Primitives to create

Five new files under `apps/desktop/src/platform/ui/`:

```
platform/ui/
  cn.ts
  Button.tsx
  Button.css
  TextInput.tsx
  TextInput.css
  FormField.tsx        ← no CSS file; utility-only
  Dialog.tsx
  Dialog.css
  PageShell.tsx
  PageShell.css
```

Each CSS file starts with `@reference "../../styles/theme.css";`.

---

### `cn.ts`

Tiny class-joining helper; no dependency:

```ts
export function cn(...args: (string | undefined | null | false)[]): string {
  return args.filter(Boolean).join(' ');
}
```

---

### `Button.tsx` + `Button.css`

**TypeScript interface**

```ts
type ButtonVariant = 'primary' | 'ghost';
type ButtonSize = 'md' | 'sm';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant; // default: 'ghost'
  size?: ButtonSize;       // default: 'md'
}
```

Export as a named function component:
```tsx
export function Button({ variant = 'ghost', size = 'md', className, ...rest }: ButtonProps) {
  return (
    <button
      className={cn('btn', `btn--${variant}`, size === 'sm' && 'btn--sm', className)}
      {...rest}
    />
  );
}
```

**`Button.css`** — move from `setup-btn-primary` / `setup-btn-ghost` CSS in
`setup.css` (currently in `keys.css` post-PR-8), rename selectors:

```
.setup-btn-primary    →  .btn--primary
.setup-btn-ghost      →  .btn--ghost
```

Add a `.btn` base selector:
```css
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  @apply gap-2;
  cursor: pointer;
  line-height: 1;
  transition:
    background 0.12s,
    box-shadow 0.15s,
    border-color 0.12s,
    color 0.12s,
    transform 0.08s;
}
```

For `.btn--primary`: copy all rules from `.setup-btn-primary`, replacing
`border-radius: var(--setup-pill-radius)` with `@apply rounded-full`.

For `.btn--ghost`: copy all rules from `.setup-btn-ghost`, replacing
`border-radius: var(--setup-pill-radius)` with `@apply rounded-full`.
(**Visual change note:** current CSS uses pill (9999px) for ghost too.
Keeping `rounded-full` for both preserves the visual. The user selected
`rounded-full` for primary + `rounded-md` for ghost — if the ghost button
should intentionally change to 8px radius, use `@apply rounded-md` instead.
Implementer: verify in dogfood and pick one — primary must stay `rounded-full`.)

Add a `.btn--sm` modifier for small size (reduce padding from the md defaults).
Derive small padding by subtracting ~4px from each axis of the `md` defaults.

**Removes `var(--setup-pill-radius)` from the codebase entirely.**

---

### `TextInput.tsx` + `TextInput.css`

**TypeScript interface**

```ts
interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  // Passes all standard <input> attrs through (value, onChange, id,
  // placeholder, autoFocus, autoComplete, disabled, type, etc.)
}
```

Export:
```tsx
export function TextInput({ className, ...rest }: TextInputProps) {
  return <input className={cn('text-input', className)} {...rest} />;
}
```

**`TextInput.css`** — move from `.setup-input` + `.setup-input::placeholder`
+ `.setup-input:hover` + `.setup-input:focus` in `setup.css`, renaming
selector to `.text-input`:

```css
.text-input  { /* from .setup-input — all 4 rule sets */ }
```

`border-radius: 10px` stays as-is (internal to component, no token needed).
Remove `box-sizing: border-box` (already set globally in `index.css` after PR-8).

**`PasswordInput.tsx` update** — PasswordInput currently renders
`<input className="setup-input" ...>` internally. Change that one line to
`<TextInput ...>`. Remove `import './PasswordInput.css'` for the input
styling part only (pw-wrap / pw-eye CSS stays in `PasswordInput.css` —
those selectors are unaffected). Since `TextInput` applies `.text-input`
via its own import, `PasswordInput.tsx` just needs to import TextInput.
The `PasswordInput.css` file shrinks to contain only `.pw-wrap` and `.pw-eye`.

---

### `FormField.tsx` (no CSS)

**TypeScript interface**

```ts
interface FormFieldProps {
  label: string;
  htmlFor: string;
  error?: string | null;
  children: React.ReactNode;
  className?: string;
}
```

Export:
```tsx
export function FormField({ label, htmlFor, error, children, className }: FormFieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label
        htmlFor={htmlFor}
        className="text-xs font-semibold text-fg-secondary block"
        style={{ letterSpacing: '0.02em' }}
      >
        {label}
      </label>
      {children}
      {error && (
        <p className="text-xs text-error m-0 flex items-center gap-1.5">
          {error}
        </p>
      )}
    </div>
  );
}
```

Note: `letter-spacing: 0.02em` is not a Tailwind token; use inline style
(runtime value for letter-spacing is acceptable per CLAUDE.md).

Replaces the pattern:
```tsx
<label htmlFor="x" className="setup-label">...</label>
<SomeInput id="x" className="setup-input" ... />
{err && <p className="setup-error">{err}</p>}
```

---

### `Dialog.tsx` + `Dialog.css`

Replaces the `setup-modal-overlay` + `setup-modal-card` and
`change-passphrase-overlay` + `change-passphrase-card` patterns.
Does **not** replace `unlock-gate-overlay` (different UX — no scrim,
fills flex area).

**TypeScript interface**

```ts
interface DialogProps {
  open: boolean;
  onClose?: () => void;
  width?: number;          // default: 400
  'aria-label'?: string;
  'aria-labelledby'?: string;
  children: React.ReactNode;
}
```

Export:
```tsx
export function Dialog({ open, onClose, width = 400, children, ...aria }: DialogProps) {
  if (!open) return null;

  function handleOverlayClick() {
    onClose?.();
  }

  return (
    <div className="dialog-overlay" onClick={handleOverlayClick}>
      <div
        className="dialog-card"
        style={{ width }}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        {...aria}
      >
        {children}
      </div>
    </div>
  );
}
```

**`Dialog.css`** — combine `setup-modal-overlay/card` + `change-passphrase-overlay/card`:

```css
.dialog-overlay {
  position: fixed;
  inset: 0;
  @apply bg-scrim-modal;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.dialog-card {
  background: var(--color-surface-elevated);
  border: 1px solid var(--color-border);
  @apply rounded-md shadow-modal p-8;
  max-width: calc(100vw - 2rem);
  display: flex;
  flex-direction: column;
  @apply gap-4;
}
```

(These are identical between the two source blocks in `setup.css`. The only
difference was card `width`, which Dialog now accepts as a prop.)

---

### `PageShell.tsx` + `PageShell.css`

Encapsulates the `setup-page` + `setup-topbar` pattern used by
`routes/setup/keys.tsx` and `routes/workspaces/index.tsx`.

**TypeScript interface**

```ts
interface PageShellProps {
  topbar?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}
```

Export:
```tsx
export function PageShell({ topbar, children, className }: PageShellProps) {
  return (
    <div className={cn('page-shell', className)}>
      {topbar !== undefined && (
        <div className="page-shell-topbar">{topbar}</div>
      )}
      {children}
    </div>
  );
}
```

**`PageShell.css`** — move from `.setup-page`, `.setup-page::before`,
`.setup-topbar` sections of `setup.css`, renaming:

```
.setup-page          →  .page-shell
.setup-page::before  →  .page-shell::before
.setup-topbar        →  .page-shell-topbar
```

**`setup-wordmark`, `setup-help-btn`**: these are specific to the setup/picker
page topbar content. Leave `.setup-wordmark` + `.setup-help-btn` CSS in
`keys.css` (setup route) and `setup-shared.css` (if still needed for workspace
picker). Since `Wordmark` and the help button are only in setup/picker context,
these classes need not become primitives in PR-9. The topbar content (Wordmark,
help button, avatar) is passed to `<PageShell topbar={...}>` as children.

---

## `styles/setup-shared.css` — content after consumer sweep

After the sweep, `setup-shared.css` contains only:
- `.setup-wordmark`, `.setup-wordmark .dash`
- `.setup-help-btn`, `.setup-help-btn:hover`
- `.setup-main`, `.setup-container`
- Responsive section (targets `.setup-container`, `.setup-topbar`)

The topbar help button and wordmark are setup/picker-specific and used
by at most 2 routes. These can stay in `setup-shared.css` until PR-10
(or delete by inlining to Tailwind utilities in the two call sites).

Whether to delete `setup-shared.css` entirely in PR-9 is the implementer's
call: if all remaining classes have only 1-2 call sites and are short enough
to convert to utilities, delete the file. If not, leave it thin and note
it for PR-10. Do not leave any `setup-btn-*`, `setup-input`, `setup-label`,
`setup-error`, `setup-title`, `setup-description` in it.

---

## Consumer sweep — file by file

### `routes/setup/keys.tsx`

- `<h1 className="setup-title">` → `<h1 className="t-h2 font-display">`
  (6 sites; `t-h2` = `text-xl font-semibold text-fg-primary`, then add `font-display`)
- `<p className="setup-description">` → `<p className="t-description max-w-[48ch]">`
- All `<label htmlFor="..." className="setup-label"> ... </label>` +
  adjacent `<input className="setup-input">` + adjacent `{err && <p className="setup-error">}` →
  wrap with `<FormField label="..." htmlFor="..." error={err ?? undefined}>`
  and replace `<input className="setup-input" ...>` with `<TextInput ...>`
- `<button className="setup-btn-primary" ...>` → `<Button variant="primary" ...>`
- `<button className="setup-btn-ghost" ...>` → `<Button variant="ghost" ...>`
- `<button className="btn-google setup-btn-google" ...>` → **keep as-is** (deferred)
- `import '../../styles/setup-shared.css'` → keep (still needed for wordmark/topbar)
  OR → `import '../../platform/ui/PageShell.css'` if setup-shared is deleted
- `import '../../styles/workbench.css'` → already removed in PR-8
- Wrap outer shell: `<div className="setup-page"><div className="setup-topbar">` →
  `<PageShell topbar={<><Wordmark /><button className="setup-help-btn">...</button></>}>`

### `routes/setup/-keys-components.tsx`

- `<label className="setup-label">` + `<input className="setup-input">` + error →
  `<FormField>` + `<TextInput>`
- `<button className="setup-btn-primary">` → `<Button variant="primary">`
- `<button className="setup-btn-ghost">` → `<Button variant="ghost">`
- `className="setup-modal-overlay"` + `className="setup-modal-card"` wrapping
  MockOAuthModal → `<Dialog open={showOAuth} onClose={...} width={360}>`
  with `import { Dialog } from '../../platform/ui/Dialog'`

### `routes/workspaces/index.tsx`

- `<div className="setup-page ..."><div className="setup-topbar">` →
  `<PageShell topbar={<Wordmark />} className="justify-start overflow-auto">`
- `<h1 className="setup-title">` → `<h1 className="t-h2 font-display">`
- `<p className="setup-description">` → `<p className="t-description max-w-[48ch]">`
- `{error && <p className="setup-error">}` → `{error && <p className="text-xs text-error flex items-center gap-1.5">}`
  (or pass `error` prop to a FormField wrapping the WorkspaceTileGrid — simpler to just inline)
- `import '../../styles/setup.css'` → already removed in PR-8
  OR `import '../../styles/setup-shared.css'` (PR-8 plan) → can be removed if setup-shared is deleted

### `workbench/middle/UnlockGate.tsx`

- `<label className="setup-label">` + `<input ...>` + error →
  `<FormField>` + `<TextInput>` (or `<PasswordInput>` where type=password)
- `<button className="setup-btn-primary">` → `<Button variant="primary">`
- `<button className="setup-btn-ghost">` → `<Button variant="ghost">`
- `<p className="setup-description ...">` → `<p className="t-description max-w-[48ch] ...">`
- Outer structure: `<div className="unlock-gate-overlay">` + `<div className="unlock-gate-card">` —
  **leave as-is.** This is not a Dialog (no scrim, fills flex space). `UnlockGate.css`
  stays unchanged for these selectors.

### `workbench/middle/ChangePassphraseDialog.tsx`

- `className="change-passphrase-overlay"` + `className="change-passphrase-card"` →
  `<Dialog open={isOpen} onClose={onClose} width={400}>`
- All `setup-label`, `setup-input`, `setup-error` → `<FormField>` + `<TextInput>`
- `setup-btn-primary`, `setup-btn-ghost` → `<Button>`
- `change-passphrase-title` → `<h2 className="t-base font-semibold text-fg-primary m-0">`
  (was `@apply text-base font-semibold text-fg-primary; margin: 0`)
- `import './ChangePassphraseDialog.css'` → `ChangePassphraseDialog.css` is now
  almost empty (overlay+card gone via Dialog, title gone via type recipe). Delete
  `ChangePassphraseDialog.css` if nothing remains; remove the import.

### `workbench/middle/PrefsDevPanel.tsx`

- `className="unlock-gate-overlay"` + `className="unlock-gate-card"` → stays
  (imports `UnlockGate.css` per PR-8)
- `className="setup-btn-primary"` → `<Button variant="primary">`
- `className="setup-btn-ghost"` → `<Button variant="ghost">`
- `className="setup-label"` + `className="setup-input"` → `<FormField>` + `<TextInput>`
- `className="setup-description"` → `className="t-description"`
- `import '../../styles/setup-shared.css'` → remove (no more setup-shared classes used)

### `platform/auth/PasswordInput.tsx`

- `<input className="setup-input" ...>` → `<TextInput ...>`
  (the only change — one line)
- Add `import '../ui/TextInput'` (or the correct relative path)
- Remove the comment "classes are defined in styles/setup.css"

---

## CSS dead-code removal

After the consumer sweep, the following CSS selectors are unreferenced.
Delete them from their files:

**From `routes/setup/keys.css`** (created in PR-8):
- `.setup-title`, `.setup-description`
- `.setup-label`, `.setup-input*`, `.setup-error`
- `.setup-actions`, `.setup-actions > button`
- `.setup-btn-primary` and all variants
- `.setup-btn-ghost` and all variants
- `.setup-content`, `.setup-step` — verify these aren't used as className in JSX
  before deleting; they're layout wrappers that may or may not be swept
- `.setup-modal-overlay`, `.setup-modal-card` and sub-rules
  (replaced by Dialog in MockOAuthModal)

**From `styles/setup-shared.css`** (created in PR-8):
- `.setup-btn-ghost*` — replaced by Button
- `.setup-label`, `.setup-input*`, `.setup-error`, `.setup-description`, `.setup-title` —
  replaced by FormField, TextInput, type recipes
- If nothing remains beyond wordmark/help-btn/responsive → **delete the file**

**From `workbench/middle/ChangePassphraseDialog.css`** (created in PR-8):
- `.change-passphrase-overlay`, `.change-passphrase-card` — replaced by Dialog
- `.change-passphrase-title` — replaced by type recipe in JSX
- If nothing remains → **delete the file** and remove the import

**From `platform/auth/PasswordInput.css`** (created in PR-8):
- `.pw-wrap .setup-input` rule → delete (TextInput handles input styling)
  Keep: `.pw-wrap` container rules, `.pw-eye` rules

---

## Import additions to component files

```ts
// All files that use Button:
import { Button } from '../../platform/ui/Button';  // adjust path

// All files that use TextInput:
import { TextInput } from '../../platform/ui/TextInput';

// All files that use FormField:
import { FormField } from '../../platform/ui/FormField';

// -keys-components.tsx, ChangePassphraseDialog.tsx:
import { Dialog } from '../../platform/ui/Dialog';

// keys.tsx, workspaces/index.tsx:
import { PageShell } from '../../platform/ui/PageShell';
```

---

## Constraints

- **No new selectors on existing files.** All new CSS lives in the new `platform/ui/`
  CSS files.
- **No JSX logic changes.** Only className → component replacement and controlled-prop
  wiring. State, event handlers, form logic are untouched.
- **`FormField`** groups label + input + error only when the actual usage follows
  that pattern. If a label stands alone or an error has no matching input, do
  not force-wrap; use `className="text-xs font-semibold text-fg-secondary ..."` inline.
- **Preserve `setup-input-row`** in `ChangePassphraseDialog.tsx` if it exists —
  check whether `.setup-input-row` has any CSS definition; if not (dead class),
  remove it from JSX as part of the cleanup.
- **`setup-btn-google` deferred.** Do not rename or wrap the Google sign-in button.
- **Do not touch `UnlockGate.css`** beyond removing rules that become dead.
  `unlock-gate-overlay` / `unlock-gate-card` stay.
- **Ghost button radius change** — current CSS uses pill (9999px) for ghost buttons
  too. The spec changes ghost to `rounded-full` (keeps pill). If implementer verifies
  dogfood and ghost buttons look better with `rounded-md` (8px) — change it and
  note in the report. Either form is acceptable; just be consistent.

## Watch out for

- `setup-btn-primary` and `setup-btn-ghost` sit in TWO places post-PR-8:
  both in `keys.css` (step-specific content) AND in `setup-shared.css` (ghost only).
  After the Button primitive lands, dead-code removal must hit both files.
- `ChangePassphraseDialog.tsx` uses `.setup-input-row` (a wrapper div around
  the raw input + show-toggle). After TextInput replaces the input, check if
  `setup-input-row` still serves a layout purpose or can be removed.
- `setup-content` / `setup-step` are layout wrappers in `keys.css`. They are
  NOT form-element classes — don't sweep them with FormField. Verify they stay
  in `keys.css` unless confirmed unused in JSX.
- The `Dialog` component renders `null` when `open=false`. The existing
  MockOAuthModal passes a boolean `show` prop — align the open/close wiring
  in the consumer call.
- `PageShell` renders `setup-page`/`setup-topbar` → renamed to `page-shell` /
  `page-shell-topbar`. No JSX uses the old names after the sweep. The
  `justify-start overflow-auto` on `workspaces/index.tsx`'s `setup-page` div
  is passed via `<PageShell className="justify-start overflow-auto">`.

## Success criteria

- `pnpm --filter ru-soam-app compile` clean.
- `pnpm --filter @ru-soam/editor compile` clean.
- `pnpm --filter ru-soam-app lint` clean.
- `grep -rn "className.*setup-btn\|className.*setup-input\|className.*setup-label\|className.*setup-error" apps/desktop/src --include="*.tsx"`
  returns zero matches (except `setup-btn-google` / `btn-google` — those are deferred).
- `grep -rn "className.*setup-page\|className.*setup-topbar" apps/desktop/src --include="*.tsx"`
  returns zero matches.
- `styles/setup-shared.css` either deleted or reduced to wordmark/help-btn/responsive
  rules only (< 80 LOC).
- App boots; setup wizard, workspace picker, unlock gate, change-passphrase dialog,
  prefs dev panel all render correctly. Verify via `just dev-desktop` (already running
  — do NOT restart).

## Reporting

When done, report:
1. Compile + lint.
2. Three success-criteria grep counts.
3. Whether `setup-shared.css` was deleted or reduced (include remaining LOC).
4. Whether `ChangePassphraseDialog.css` was deleted.
5. Ghost button radius decision (kept `rounded-full` or changed to `rounded-md`),
   and whether dogfood looks correct.
6. Any FormField call site that was ambiguous (e.g., label without matching input
   in the same component tree).
