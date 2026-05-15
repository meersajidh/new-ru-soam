import { TOKEN_NAMES, type ThemeDescriptor } from './tokens';

export interface IThemeService {
  setTheme(id: string): void;
  setDarkMode(enabled: boolean): void;
  isDark(): boolean;
  getActive(): ThemeDescriptor;
  getTokenSnapshot(): Record<string, string>;
  onThemeChange(listener: (theme: ThemeDescriptor) => void): () => void;
  onDarkModeChange(listener: (dark: boolean) => void): () => void;
}

export class ThemeService implements IThemeService {
  private _active: ThemeDescriptor;
  private _dark: boolean;
  private readonly _root: HTMLElement;
  private readonly _registry = new Map<string, ThemeDescriptor>();
  private readonly _themeListeners = new Set<(theme: ThemeDescriptor) => void>();
  private readonly _darkListeners = new Set<(dark: boolean) => void>();

  constructor(root: HTMLElement, themes: ThemeDescriptor[]) {
    this._root = root;
    for (const t of themes) this._registry.set(t.id, t);

    // Pick up whatever applyInitialTheme() already applied to the DOM.
    const activeClass = Array.from(root.classList).find(c => c.startsWith('theme-'));
    const activeId = activeClass ? activeClass.slice(6) : (themes[0]?.id ?? 'bamboo');
    this._active = this._registry.get(activeId) ?? themes[0];
    this._dark = root.classList.contains('dark');
  }

  setTheme(id: string): void {
    const theme = this._registry.get(id);
    if (!theme) throw new Error(`Unknown theme: ${id}`);
    Array.from(this._root.classList)
      .filter(c => c.startsWith('theme-'))
      .forEach(c => this._root.classList.remove(c));
    this._root.classList.add(`theme-${id}`);
    this._active = theme;
    try { localStorage.setItem('soam.theme', id); } catch { /* storage unavailable */ }
    for (const l of this._themeListeners) l(theme);
  }

  setDarkMode(enabled: boolean): void {
    this._root.classList.toggle('dark', enabled);
    this._dark = enabled;
    try { localStorage.setItem('soam.dark', String(enabled)); } catch { /* storage unavailable */ }
    for (const l of this._darkListeners) l(enabled);
  }

  isDark(): boolean {
    return this._dark;
  }

  getActive(): ThemeDescriptor {
    return this._active;
  }

  getTokenSnapshot(): Record<string, string> {
    const computed = getComputedStyle(this._root);
    const snap: Record<string, string> = {};
    for (const name of TOKEN_NAMES) {
      snap[name] = computed.getPropertyValue(name).trim();
    }
    return snap;
  }

  onThemeChange(listener: (theme: ThemeDescriptor) => void): () => void {
    this._themeListeners.add(listener);
    return () => this._themeListeners.delete(listener);
  }

  onDarkModeChange(listener: (dark: boolean) => void): () => void {
    this._darkListeners.add(listener);
    return () => this._darkListeners.delete(listener);
  }
}
