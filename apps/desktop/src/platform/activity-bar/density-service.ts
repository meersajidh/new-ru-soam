export type Density = 'compact' | 'default' | 'large';

const CLASS_PREFIX = 'actbar-density-';
const STORAGE_KEY = 'soam.activityBarDensity';
const DENSITIES: readonly Density[] = ['compact', 'default', 'large'];

export interface IActivityBarDensityService {
  getDensity(): Density;
  setDensity(id: Density): void;
  onDidChangeDensity(listener: (density: Density) => void): () => void;
}

export class ActivityBarDensityService implements IActivityBarDensityService {
  private _density: Density;
  private readonly _root: HTMLElement;
  private readonly _listeners = new Set<(density: Density) => void>();

  constructor(root: HTMLElement, initial: Density = 'default') {
    this._root = root;
    // Apply initial class immediately — no flash.
    this._density = initial;
    this._applyClass(initial);
  }

  getDensity(): Density {
    return this._density;
  }

  setDensity(id: Density): void {
    if (!DENSITIES.includes(id)) throw new Error(`Unknown activity bar density: ${id}`);
    this._density = id;
    this._applyClass(id);
    try { localStorage.setItem(STORAGE_KEY, id); } catch { /* storage unavailable */ }
    for (const l of this._listeners) l(id);
  }

  onDidChangeDensity(listener: (density: Density) => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  private _applyClass(id: Density): void {
    Array.from(this._root.classList)
      .filter((c) => c.startsWith(CLASS_PREFIX))
      .forEach((c) => this._root.classList.remove(c));
    this._root.classList.add(`${CLASS_PREFIX}${id}`);
  }
}

/** Read persisted density from localStorage; returns null when absent/invalid. */
export function readPersistedDensity(): Density | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'compact' || v === 'default' || v === 'large') return v;
  } catch { /* storage unavailable */ }
  return null;
}
