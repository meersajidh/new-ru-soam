/**
 * shadcn/Base UI primitive barrel (ADR-421 F4). `add`ed source lives here
 * (own-the-source, D7). The kit's public root (../../index.ts) re-exports these
 * as each S1 primitive is re-based onto the standard; old hand-rolled primitives
 * are deleted on promotion (D10 delete-on-promote).
 */
export * from './button.js';
export * from './input.js';
export * from './label.js';
export * from './dialog.js';
export * from './popover.js';
export * from './select.js';
