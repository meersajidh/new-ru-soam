// ADR-421 F1: single signature theme (base-luma). Palette + font-set axes are
// collapsed — only the `.dark` luminance class is meaningful now. Stale
// localStorage theme/font ids from the old 3-axis model sanitize to base-luma.
const VALID_THEMES = new Set(['base-luma']);
const VALID_FONT_SETS = new Set(['base-luma']);

function safeGetItem(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

// Called synchronously in main.tsx before createRoot.render to avoid FOUC.
// Applies theme-base-luma + (optional) dark + font-set-base-luma to <html>.
// base-luma itself lives on :root/.dark in tokens.css; the theme-* class is a
// stable hook for future named themes (F2), harmless with one theme today.
export function applyInitialTheme(root: HTMLElement): void {
  const storedTheme = safeGetItem('soam.theme') ?? 'base-luma';
  const themeId = VALID_THEMES.has(storedTheme) ? storedTheme : 'base-luma';

  const storedDark = safeGetItem('soam.dark');
  const dark = storedDark !== null
    ? storedDark === 'true'
    : window.matchMedia('(prefers-color-scheme: dark)').matches;

  const storedFontSet = safeGetItem('soam.fontSet') ?? 'base-luma';
  const fontSetId = VALID_FONT_SETS.has(storedFontSet) ? storedFontSet : 'base-luma';

  root.classList.add(`theme-${themeId}`);
  if (dark) root.classList.add('dark');
  root.classList.add(`font-set-${fontSetId}`);
}
