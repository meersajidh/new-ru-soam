const VALID_THEMES = new Set(['bamboo', 'spectrum', 'primer', 'iris', 'stone']);
const VALID_FONT_SETS = new Set(['system-sans', 'ru-display', 'ru-editorial']);

function safeGetItem(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

// Called synchronously in main.tsx before createRoot.render to avoid FOUC.
// Applies three independent CSS classes to <html>: theme-<id>, dark, font-set-<id>.
export function applyInitialTheme(root: HTMLElement): void {
  const storedTheme = safeGetItem('soam.theme') ?? 'bamboo';
  const themeId = VALID_THEMES.has(storedTheme) ? storedTheme : 'bamboo';

  const storedDark = safeGetItem('soam.dark');
  const dark = storedDark !== null
    ? storedDark === 'true'
    : window.matchMedia('(prefers-color-scheme: dark)').matches;

  const storedFontSet = safeGetItem('soam.fontSet') ?? 'ru-display';
  const fontSetId = VALID_FONT_SETS.has(storedFontSet) ? storedFontSet : 'ru-display';

  root.classList.add(`theme-${themeId}`);
  if (dark) root.classList.add('dark');
  root.classList.add(`font-set-${fontSetId}`);
}
