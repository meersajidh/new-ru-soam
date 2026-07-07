import type { FontSetDescriptor } from '../font-service';

// ADR-421 F1: font-set axis folded into the single signature theme (base-luma
// uses one sans for body + display). The font picker keeps a single entry.
export const BUILT_IN_FONT_SETS: FontSetDescriptor[] = [
  { id: 'base-luma', label: 'Base Luma', source: 'built-in' },
];
