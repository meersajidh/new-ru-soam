/**
 * Overview view-mode toggle — localStorage-backed, mirrors MaturityHighlightService pattern.
 *
 * Controls which density layout (dense/focused/timeline) the overview.html renders.
 * BundleViewIframe pushes overviewViewMode on init + on change; the iframe
 * reads it from the init payload and the dedicated 'overviewViewMode' message.
 */

const STORAGE_KEY = 'soam.overviewViewMode';

export type OverviewViewMode = 'dense' | 'focused' | 'timeline';

const VALID_MODES = new Set<string>(['dense', 'focused', 'timeline']);

export interface IOverviewViewModeService {
  getMode(): OverviewViewMode;
  setMode(m: OverviewViewMode): void;
  onDidChange(listener: (m: OverviewViewMode) => void): () => void;
}

export class OverviewViewModeService implements IOverviewViewModeService {
  private _mode: OverviewViewMode;
  private readonly _listeners = new Set<(m: OverviewViewMode) => void>();

  constructor(initial: OverviewViewMode = 'dense') {
    this._mode = initial;
  }

  getMode(): OverviewViewMode {
    return this._mode;
  }

  setMode(m: OverviewViewMode): void {
    if (this._mode === m) return;
    this._mode = m;
    try { localStorage.setItem(STORAGE_KEY, m); } catch { /* storage unavailable */ }
    for (const l of this._listeners) l(m);
  }

  onDidChange(listener: (m: OverviewViewMode) => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }
}

/** Read persisted view mode from localStorage; returns 'dense' when absent/invalid. */
export function readPersistedOverviewViewMode(): OverviewViewMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null && VALID_MODES.has(stored)) return stored as OverviewViewMode;
  } catch { /* storage unavailable */ }
  return 'dense';
}
