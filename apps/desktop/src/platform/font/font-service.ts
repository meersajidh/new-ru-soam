export interface FontSetDescriptor {
  readonly id: string;
  readonly label: string;
  readonly source: 'built-in' | 'bundle';
}

export interface IFontService {
  setFontSet(id: string): void;
  getActive(): FontSetDescriptor;
  onFontSetChange(listener: (fs: FontSetDescriptor) => void): () => void;
}

export class FontService implements IFontService {
  private _active: FontSetDescriptor;
  private readonly _root: HTMLElement;
  private readonly _registry = new Map<string, FontSetDescriptor>();
  private readonly _listeners = new Set<(fs: FontSetDescriptor) => void>();

  constructor(root: HTMLElement, fontSets: FontSetDescriptor[]) {
    this._root = root;
    for (const fs of fontSets) this._registry.set(fs.id, fs);

    const activeClass = Array.from(root.classList).find(c => c.startsWith('font-set-'));
    const activeId = activeClass ? activeClass.slice(9) : (fontSets[0]?.id ?? 'system-sans');
    this._active = this._registry.get(activeId) ?? fontSets[0];
  }

  setFontSet(id: string): void {
    const fs = this._registry.get(id);
    if (!fs) throw new Error(`Unknown font set: ${id}`);
    Array.from(this._root.classList)
      .filter(c => c.startsWith('font-set-'))
      .forEach(c => this._root.classList.remove(c));
    this._root.classList.add(`font-set-${id}`);
    this._active = fs;
    try { localStorage.setItem('soam.fontSet', id); } catch { /* storage unavailable */ }
    for (const l of this._listeners) l(fs);
  }

  getActive(): FontSetDescriptor {
    return this._active;
  }

  onFontSetChange(listener: (fs: FontSetDescriptor) => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }
}
