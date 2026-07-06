/**
 * @basebench/ui — shell (app://) UI primitive kit (ADR-420).
 *
 * The trusted-renderer counterpart to @ru-soam/view-kit (which serves the
 * sandboxed view:// surface). The two are permanently separate — see
 * ADR-420 D4 (two-Icon contract) and ADR-413 Am1. Do not attempt to share
 * a component across that boundary.
 *
 * Public surface:
 *   Button, TextInput, Dialog, FormField, PageShell — form/layout primitives
 *   Popover, usePopover, Select                     — positioning + listbox
 *   Icon, resolveIconGlyph                          — font codicon + glyph data
 *   ResizeHandle                                    — drag-resize strip
 *   cn, useModalKeys                                — utilities
 */

export { Button } from './Button.js';
export { TextInput } from './TextInput.js';
export { Dialog } from './Dialog.js';
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
export { resolveIconGlyph } from './icon-registry.js';
export type { SemanticIconId } from './icon-registry.js';

export { useModalKeys } from './useModalKeys.js';

export { ResizeHandle } from './ResizeHandle.js';
export type { ResizeHandleProps } from './ResizeHandle.js';
