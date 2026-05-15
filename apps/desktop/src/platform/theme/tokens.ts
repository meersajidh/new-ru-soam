export type TokenMap = Record<string, string>;

export interface ThemeContribution {
  readonly id: string;
  readonly label: string;
  readonly uiKind: 'dark' | 'light' | 'high-contrast';
  readonly tokens: TokenMap;
}

export const TOKEN_PREFIX = '--soam-';

export function tokenVar(name: string): string {
  return `var(${TOKEN_PREFIX}${name.replace(/\./g, '-')})`;
}

// V1 token catalogue — every theme must supply all of these.
export const TOKEN_CATALOGUE = [
  'color.background.workbench',
  'color.background.titlebar',
  'color.background.banner',
  'color.background.sidebar',
  'color.background.editor',
  'color.background.panel',
  'color.background.statusbar',
  'color.foreground.primary',
  'color.foreground.secondary',
  'color.foreground.muted',
  'color.border.default',
  'color.border.focus',
  'color.accent.default',
  'color.accent.hover',
  'color.accent.pressed',
  'color.semantic.info',
  'color.semantic.warning',
  'color.semantic.error',
  'color.semantic.success',
  'space.1',
  'space.2',
  'space.3',
  'space.4',
  'space.6',
  'space.8',
  'radius.sm',
  'radius.md',
  'font.sans',
  'font.mono',
] as const;

export type TokenName = (typeof TOKEN_CATALOGUE)[number];
