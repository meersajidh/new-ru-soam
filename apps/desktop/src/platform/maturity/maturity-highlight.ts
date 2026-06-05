/**
 * Maturity-highlight toggle — localStorage-backed, mirrors ActivityBarDensityService pattern.
 *
 * Controls body.maturity-highlight on bundle view iframes via the theme/init
 * message channel (BundleViewIframe pushes maturityHighlight on init + on change).
 *
 * StatusBar entry: 'workbench.maturityHighlight' (registered in boot.ts).
 * Command:         'workbench.toggleMaturityHighlight' (registered in boot.ts).
 */

const STORAGE_KEY = 'soam.maturityHighlight';

export interface IMaturityHighlightService {
  isEnabled(): boolean;
  setEnabled(on: boolean): void;
  onDidChange(listener: (enabled: boolean) => void): () => void;
}

export class MaturityHighlightService implements IMaturityHighlightService {
  private _enabled: boolean;
  private readonly _listeners = new Set<(enabled: boolean) => void>();

  constructor(initial = false) {
    this._enabled = initial;
  }

  isEnabled(): boolean {
    return this._enabled;
  }

  setEnabled(on: boolean): void {
    if (this._enabled === on) return;
    this._enabled = on;
    try { localStorage.setItem(STORAGE_KEY, on ? '1' : '0'); } catch { /* storage unavailable */ }
    for (const l of this._listeners) l(on);
  }

  onDidChange(listener: (enabled: boolean) => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }
}

/** Read persisted highlight state from localStorage; returns false when absent/invalid. */
export function readPersistedMaturityHighlight(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}
