export interface ThemeDescriptor {
  readonly id: string;
  readonly label: string;
  readonly source: 'built-in' | 'bundle';
}

// Base-luma CONTRACT LEAF token names snapshotted for the iframe bridge (ADR-421
// F5 — retargeted off the retired `--color-*` alias shim). Used by
// ThemeService.getTokenSnapshot(): getComputedStyle reads these mode-resolved
// values (they are real `:root`/`.dark` props, so — unlike `@theme` vars — they
// read back non-empty), and the view sets them inline on its iframe root. That
// drives every `@theme inline` color utility (`bg-card` → `var(--color-card)` →
// `var(--card)`), raw `var(--primary)`/… in view CSS, AND the derived extension
// tokens (`--color-accent-hover` = color-mix(var(--primary)…), `--color-info` =
// var(--info)) which recompute from the pushed leaves.
export const TOKEN_NAMES = [
  '--background',
  '--foreground',
  '--card',
  '--card-foreground',
  '--popover',
  '--popover-foreground',
  '--primary',
  '--primary-foreground',
  '--secondary',
  '--secondary-foreground',
  '--muted',
  '--muted-foreground',
  '--accent',
  '--accent-foreground',
  '--destructive',
  '--border',
  '--input',
  '--ring',
  '--info',
  '--success',
  '--warning',
] as const;

export type TokenName = (typeof TOKEN_NAMES)[number];
