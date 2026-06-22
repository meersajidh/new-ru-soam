/**
 * FontScaleService — renderer source of truth for appearance.fontScale pref.
 *
 * Backed by prefs@1.0 key `appearance.fontScale`. Valid values: 1, 1.1, 1.2.
 * Default 1 (no scaling).
 *
 * Two distinct scale paths:
 *   Shell (React chrome): sets --root-font-size on document.documentElement
 *                         (tokens.css :root already inherits via var(--root-font-size,16px)).
 *   Bundle views:         getSnapshot() returns { '--ui-scale': String(scale) } which
 *                         rides the existing appearance bridge; view-bootstrap.ts applies
 *                         it as CSS zoom on the view's <html> element.
 *
 * No PHI. Only persisted value is a numeric scale factor.
 */

export type FontScale = 1 | 1.1 | 1.2;

const VALID_SCALES = new Set<number>([1, 1.1, 1.2]);
const PREF_KEY = 'appearance.fontScale';
const DEFAULT_SCALE: FontScale = 1;

function isValidScale(v: unknown): v is FontScale {
  return typeof v === 'number' && VALID_SCALES.has(v);
}

function parseScale(raw: string | null | undefined): FontScale {
  if (!raw) return DEFAULT_SCALE;
  const n = parseFloat(raw);
  if (isValidScale(n)) return n;
  return DEFAULT_SCALE;
}

export interface IFontScaleService {
  getScale(): FontScale;
  setScale(scale: FontScale): void;
  onDidChange(listener: (scale: FontScale) => void): () => void;
  /** CSS var snapshot for the bridge appearance payload: { '--ui-scale': String(scale) } */
  getSnapshot(): Record<string, string>;
}

export class FontScaleService implements IFontScaleService {
  private _scale: FontScale = DEFAULT_SCALE;
  private readonly _listeners = new Set<(scale: FontScale) => void>();
  private _proxy: {
    call: (method: string, ...args: ReadonlyArray<unknown>) => Promise<unknown>;
    dispose: () => void;
  } | null = null;
  private _workspaceUnsub: (() => void) | null = null;

  constructor() {
    // Apply default immediately so shell size is set before prefs load.
    this._applyShell();

    // Bind prefs capability — fire and forget; reload once bound.
    window.soam
      .bindCapability('prefs', '1.0')
      .then((proxy) => {
        this._proxy = proxy;
        void this._reload();
      })
      .catch((err: unknown) => {
        console.warn('[FontScaleService] could not bind prefs cap:', err);
      });

    // Reload on workspace change so scale reflects the new workspace's prefs.
    this._workspaceUnsub = window.soam.workspace.onChange(() => {
      void this._reload();
    });
  }

  getScale(): FontScale {
    return this._scale;
  }

  setScale(scale: FontScale): void {
    const validated = isValidScale(scale) ? scale : DEFAULT_SCALE;
    if (validated === this._scale) return;
    this._scale = validated;
    this._applyShell();
    this._emit();

    // Persist — fire and forget.
    if (this._proxy) {
      (this._proxy.call('set', PREF_KEY, String(validated)) as Promise<unknown>).catch(
        (err: unknown) => {
          console.warn('[FontScaleService] could not persist scale:', err);
        },
      );
    }
  }

  onDidChange(listener: (scale: FontScale) => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  getSnapshot(): Record<string, string> {
    return { '--ui-scale': String(this._scale) };
  }

  private _applyShell(): void {
    document.documentElement.style.setProperty('--root-font-size', 16 * this._scale + 'px');
  }

  private async _reload(): Promise<void> {
    if (!this._proxy) return;
    // Skip pref read if no workspace active — avoid [cap.not_found] noise at boot.
    const active = await window.soam.workspace.getActive();
    if (!active) return;
    try {
      const result = (await this._proxy.call('get', PREF_KEY)) as { value: string | null };
      const next = parseScale(result?.value);
      if (next !== this._scale) {
        this._scale = next;
        this._applyShell();
        this._emit();
      }
    } catch (err) {
      console.warn('[FontScaleService] could not read scale pref:', err);
    }
  }

  private _emit(): void {
    for (const l of this._listeners) l(this._scale);
  }

  dispose(): void {
    this._workspaceUnsub?.();
    this._workspaceUnsub = null;
    this._proxy?.dispose();
    this._proxy = null;
    this._listeners.clear();
  }
}
