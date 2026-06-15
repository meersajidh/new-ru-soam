/**
 * TelemetryModeService — renderer source of truth for cloud.telemetryMode pref.
 *
 * Backed by the `prefs` capability key `cloud.telemetryMode` so Main's telemetry
 * emitter reads the same source. Default 'off' when unset.
 *
 * Reloads on workspace change (`window.soam.workspace.onChange`) so the in-memory
 * mode stays coherent when the user switches accounts.
 *
 * Consumers: SettingsMenu (Usage analytics selector) + boot.ts (StatusBar indicator).
 */

export type TelemetryMode = 'off' | 'online-only' | 'on';

export interface ITelemetryModeService {
  getMode(): TelemetryMode;
  setMode(m: TelemetryMode): void;
  onChange(listener: (m: TelemetryMode) => void): () => void;
}

const PREF_KEY = 'cloud.telemetryMode';
const VALID = new Set<string>(['off', 'online-only', 'on']);

function isValid(v: unknown): v is TelemetryMode {
  return typeof v === 'string' && VALID.has(v);
}

export class TelemetryModeService implements ITelemetryModeService {
  private _mode: TelemetryMode = 'off';
  private readonly _listeners = new Set<(m: TelemetryMode) => void>();
  private _proxy: { call: (method: string, ...args: ReadonlyArray<unknown>) => Promise<unknown>; dispose: () => void } | null = null;
  private _workspaceUnsub: (() => void) | null = null;

  constructor() {
    // Bind prefs capability — fire and forget; reload once bound.
    window.soam
      .bindCapability('prefs', '1.0')
      .then((proxy) => {
        this._proxy = proxy;
        void this._reload();
      })
      .catch((err: unknown) => {
        console.warn('[TelemetryModeService] could not bind prefs cap:', err);
      });

    // Reload on workspace change so mode reflects the new workspace's pref.
    this._workspaceUnsub = window.soam.workspace.onChange(() => {
      void this._reload();
    });
  }

  getMode(): TelemetryMode {
    return this._mode;
  }

  setMode(m: TelemetryMode): void {
    if (this._mode === m) return;
    this._mode = m;
    this._emit();
    if (this._proxy) {
      (this._proxy.call('set', PREF_KEY, m) as Promise<unknown>).catch((err: unknown) => {
        console.warn('[TelemetryModeService] could not persist mode:', err);
      });
    }
  }

  onChange(listener: (m: TelemetryMode) => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  private async _reload(): Promise<void> {
    if (!this._proxy) return;
    try {
      const result = (await this._proxy.call('get', PREF_KEY)) as { value: string | null };
      const v = result?.value;
      const next: TelemetryMode = isValid(v) ? v : 'off';
      if (next !== this._mode) {
        this._mode = next;
        this._emit();
      }
    } catch (err) {
      console.warn('[TelemetryModeService] could not read telemetry mode pref:', err);
    }
  }

  private _emit(): void {
    for (const l of this._listeners) l(this._mode);
  }

  dispose(): void {
    this._workspaceUnsub?.();
    this._workspaceUnsub = null;
    this._proxy?.dispose();
    this._proxy = null;
    this._listeners.clear();
  }
}
