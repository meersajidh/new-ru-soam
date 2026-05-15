import { TOKEN_PREFIX } from '../tokens';
import { defaultDark } from './default-dark';
import { defaultLight } from './default-light';
import type { ThemeContribution, TokenMap } from '../tokens';

const THEMES: Record<string, ThemeContribution> = {
  [defaultDark.id]: defaultDark,
  [defaultLight.id]: defaultLight,
};

// Called synchronously in main.tsx before createRoot.render to avoid FOUC.
export function applyInitialTheme(root: HTMLElement): void {
  let stored: string | null = null;
  try { stored = localStorage.getItem('soam.theme'); } catch { /* ignore */ }
  const resolved: ThemeContribution | undefined = stored !== null ? THEMES[stored] : undefined;
  const theme =
    resolved ??
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? defaultDark : defaultLight);
  applyTokens(root, theme.tokens);
}

export function applyTokens(root: HTMLElement, tokens: TokenMap): void {
  for (const [name, value] of Object.entries(tokens)) {
    root.style.setProperty(`${TOKEN_PREFIX}${name.replace(/\./g, '-')}`, value);
  }
}
