import type { ThemeDescriptor } from '../tokens';

// ADR-421 F1: 3-axis palette model collapsed to one signature theme (base-luma).
// Additional named themes return in F2+ (they add a `.theme-<id>` block that
// overrides the base-luma contract vars). Until then this is the sole theme.
export const BUILT_IN_THEMES: ThemeDescriptor[] = [
  { id: 'base-luma', label: 'Base Luma', source: 'built-in' },
];
