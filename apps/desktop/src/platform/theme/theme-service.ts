import { TOKEN_PREFIX, type ThemeContribution, type TokenMap } from './tokens';

export interface IThemeService {
  setTheme(id: string): void;
  getActive(): ThemeContribution;
  getTokenSnapshot(): TokenMap;
  onThemeChange(listener: (theme: ThemeContribution) => void): () => void;
}

export class ThemeService implements IThemeService {
  private _active: ThemeContribution;
  private readonly _root: HTMLElement;
  private readonly _registry = new Map<string, ThemeContribution>();
  private readonly _listeners = new Set<(theme: ThemeContribution) => void>();

  constructor(root: HTMLElement, themes: ThemeContribution[], initialThemeId: string) {
    this._root = root;
    for (const t of themes) this._registry.set(t.id, t);
    const initial = this._registry.get(initialThemeId);
    if (!initial) throw new Error(`Initial theme not found: ${initialThemeId}`);
    this._active = initial;
    // Tokens already on DOM from applyInitialTheme in main.tsx; no re-apply needed.
  }

  setTheme(id: string): void {
    const theme = this._registry.get(id);
    if (!theme) throw new Error(`Unknown theme: ${id}`);
    this._active = theme;
    this._applyTokens(theme.tokens);
    try { localStorage.setItem('soam.theme', id); } catch { /* storage unavailable */ }
    for (const l of this._listeners) l(theme);
  }

  getActive(): ThemeContribution {
    return this._active;
  }

  getTokenSnapshot(): TokenMap {
    return { ...this._active.tokens };
  }

  onThemeChange(listener: (theme: ThemeContribution) => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  private _applyTokens(tokens: TokenMap): void {
    for (const [name, value] of Object.entries(tokens)) {
      this._root.style.setProperty(`${TOKEN_PREFIX}${name.replace(/\./g, '-')}`, value);
    }
  }
}
