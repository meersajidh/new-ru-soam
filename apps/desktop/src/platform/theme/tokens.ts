export interface ThemeDescriptor {
  readonly id: string;
  readonly label: string;
  readonly source: 'built-in' | 'bundle';
}

// CSS custom property names for all theme tokens.
// Used by ThemeService.getTokenSnapshot() (Phase 7 iframe bridge).
export const TOKEN_NAMES = [
  '--color-surface-base',
  '--color-surface-panel',
  '--color-surface-elevated',
  '--color-surface-active',
  '--color-fg-primary',
  '--color-fg-secondary',
  '--color-fg-muted',
  '--color-border',
  '--color-border-focus',
  '--color-accent',
  '--color-accent-fg',
  '--color-accent-hover',
  '--color-accent-pressed',
  '--color-info',
  '--color-success',
  '--color-warning',
  '--color-error',
] as const;

export type TokenName = (typeof TOKEN_NAMES)[number];
