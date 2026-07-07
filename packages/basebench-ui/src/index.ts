/**
 * @basebench/ui — the single base-layer UI kit (ADR-421 D3).
 *
 * ONE kit, BOTH render surfaces: the shell (app://) and every bundle view
 * (view:// build) import from here (domain→base, the allowed ADR-106 direction).
 * Build/source unification only — each surface still compiles into its own
 * origin/process (ADR-421 D6; trust/render surface untouched).
 *
 * Public surface:
 *   Button, TextInput, Dialog, FormField, PageShell — form/layout primitives
 *   Popover, usePopover, Select                     — positioning + listbox
 *   Icon, resolveIcon                               — one inline-SVG multi-source Icon (Phosphor primary — D5)
 *   ResizeHandle                                    — drag-resize strip
 *   cn, useModalKeys                                — utilities
 */

export { Button, buttonVariants } from './components/ui/button.js';
export { Input } from './components/ui/input.js';
export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from './components/ui/dialog.js';
export { FormField } from './FormField.js';
export { PageShell } from './PageShell.js';
export { cn } from './cn.js';

export { default as Popover } from './Popover.js';
export { usePopover } from './use-popover.js';
export type { PopoverAnchor, PopoverPosition, UsePopoverOptions, UsePopoverReturn } from './use-popover.js';
export { default as Select } from './Select.js';
export type { SelectItem, SelectProps } from './Select.js';

export { Icon } from './Icon.js';
export type { IconProps } from './Icon.js';
export { resolveIcon } from './icon-registry.js';
export type { SemanticIconId, IconEntry } from './icon-registry.js';

export { useModalKeys } from './useModalKeys.js';

// Base UI CSP integration (ADR-421 D4 / F4 gate finding). `disableStyleElements`
// stops Base UI injecting inline <style> (scroll-lock etc.) that STRICT_VIEW_CSP
// `style-src 'self'` would block; positioning stays CSSOM (ungoverned). ViewRoot
// wraps every view tree in this. Re-exported so consumers need only @basebench/ui.
export { CSPProvider } from '@base-ui/react/csp-provider';

export { ResizeHandle } from './ResizeHandle.js';
export type { ResizeHandleProps } from './ResizeHandle.js';
