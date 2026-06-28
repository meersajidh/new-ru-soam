/**
 * IdleLockSettingsService — renderer source of truth for idle auto-lock pref (O502).
 *
 * Backed by prefs@1.0 key `security.idleLockMin`.
 * Pref encoding: "0" = disabled; "N" = N minutes (N ≥ 1). Default = 5 (enabled, 5 min).
 *
 * The Settings menu (gear → Security) is the sole writer via setSettings().
 * On change it persists the pref AND calls window.soam.lock.setIdleTimeout()
 * so Main applies the new timeout live without restart.
 *
 * No PHI. Settings carry only numeric interval + enabled flag.
 */

export interface IdleLockSettings {
  readonly enabled: boolean;
  /** Minutes; only meaningful when enabled. Min 1. */
  readonly intervalMin: number;
}

export const DEFAULT_IDLE_LOCK_SETTINGS: IdleLockSettings = {
  enabled: true,
  intervalMin: 5,
};

const PREF_KEY = 'security.idleLockMin';

export interface IIdleLockSettingsService {
  getSettings(): IdleLockSettings;
  setSettings(s: Partial<IdleLockSettings>): void;
  onDidChange(listener: (s: IdleLockSettings) => void): () => void;
  dispose(): void;
}

export class IdleLockSettingsService implements IIdleLockSettingsService {
  private _settings: IdleLockSettings = { ...DEFAULT_IDLE_LOCK_SETTINGS };
  private readonly _listeners = new Set<(s: IdleLockSettings) => void>();
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
        console.warn('[IdleLockSettingsService] could not bind prefs cap:', err);
      });

    // Reload on workspace change so settings reflect the new workspace's prefs.
    this._workspaceUnsub = window.soam.workspace.onChange(() => {
      void this._reload();
    });
  }

  getSettings(): IdleLockSettings {
    return this._settings;
  }

  setSettings(s: Partial<IdleLockSettings>): void {
    const enabled = s.enabled !== undefined ? Boolean(s.enabled) : this._settings.enabled;
    const intervalMin =
      s.intervalMin !== undefined
        ? Math.max(1, Math.floor(Number(s.intervalMin) || 5))
        : this._settings.intervalMin;

    if (enabled === this._settings.enabled && intervalMin === this._settings.intervalMin) return;

    // Immutable replace — never mutate in place (React memoisation gotcha).
    this._settings = { enabled, intervalMin };
    this._emit();

    const prefValue = enabled ? String(intervalMin) : '0';

    // Persist — fire and forget.
    if (this._proxy) {
      (this._proxy.call('set', PREF_KEY, prefValue) as Promise<unknown>).catch(
        (err: unknown) => {
          console.warn('[IdleLockSettingsService] could not persist pref:', err);
        },
      );
    }

    // Notify Main so the live interval updates without restart.
    const ms: number | null = enabled ? intervalMin * 60_000 : null;
    window.soam.lock.setIdleTimeout(ms).catch((err: unknown) => {
      console.warn('[IdleLockSettingsService] could not update Main idle timeout:', err);
    });
  }

  onDidChange(listener: (s: IdleLockSettings) => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  private async _reload(): Promise<void> {
    if (!this._proxy) return;
    // Skip pref read if no workspace is active yet — avoids [cap.not_found] noise at boot.
    // workspace.onChange re-triggers _reload() once a workspace becomes active.
    const active = await window.soam.workspace.getActive();
    if (!active) return;
    try {
      const result = (await this._proxy.call('get', PREF_KEY)) as { value: string | null };
      const raw = result?.value;

      let next: IdleLockSettings;
      if (raw === null || raw === undefined || raw === '') {
        next = { ...DEFAULT_IDLE_LOCK_SETTINGS };
      } else {
        const n = parseInt(raw, 10);
        if (!Number.isFinite(n) || n < 0) {
          next = { ...DEFAULT_IDLE_LOCK_SETTINGS };
        } else if (n === 0) {
          next = { enabled: false, intervalMin: this._settings.intervalMin };
        } else {
          next = { enabled: true, intervalMin: n };
        }
      }

      if (next.enabled !== this._settings.enabled || next.intervalMin !== this._settings.intervalMin) {
        this._settings = next;
        this._emit();
      }
    } catch (err) {
      console.warn('[IdleLockSettingsService] could not read idle lock pref:', err);
    }
  }

  private _emit(): void {
    for (const l of this._listeners) l(this._settings);
  }

  dispose(): void {
    this._workspaceUnsub?.();
    this._workspaceUnsub = null;
    this._proxy?.dispose();
    this._proxy = null;
    this._listeners.clear();
  }
}
