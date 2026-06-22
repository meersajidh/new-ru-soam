/**
 * ScheduleRefreshSettingsService — renderer source of truth for calendar auto-refresh prefs.
 *
 * Backed by prefs@1.0 keys `schedule.refreshMode` and `schedule.refreshIntervalMin`.
 * The Settings menu (gear → Schedule) is the sole writer via setSettings().
 * schedule.html consumes updates via BundleViewIframe init/context/onDidChange push.
 *
 * No PHI. Settings carry only mode/intervalMin.
 */

export interface RefreshSettings {
  readonly mode: 'auto' | 'manual';
  readonly intervalMin: number;
}

export const DEFAULT_REFRESH_SETTINGS: RefreshSettings = {
  mode: 'manual',
  intervalMin: 15,
};

const PREF_MODE_KEY = 'schedule.refreshMode';
const PREF_INTERVAL_KEY = 'schedule.refreshIntervalMin';

const VALID_MODES = new Set<string>(['auto', 'manual']);

function isValidMode(v: unknown): v is 'auto' | 'manual' {
  return typeof v === 'string' && VALID_MODES.has(v);
}

export interface IScheduleRefreshSettingsService {
  getSettings(): RefreshSettings;
  setSettings(s: Partial<RefreshSettings>): void;
  onDidChange(listener: (s: RefreshSettings) => void): () => void;
}

export class ScheduleRefreshSettingsService implements IScheduleRefreshSettingsService {
  private _settings: RefreshSettings = { ...DEFAULT_REFRESH_SETTINGS };
  private readonly _listeners = new Set<(s: RefreshSettings) => void>();
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
        console.warn('[ScheduleRefreshSettingsService] could not bind prefs cap:', err);
      });

    // Reload on workspace change so settings reflect the new workspace's prefs.
    this._workspaceUnsub = window.soam.workspace.onChange(() => {
      void this._reload();
    });
  }

  getSettings(): RefreshSettings {
    return this._settings;
  }

  setSettings(s: Partial<RefreshSettings>): void {
    const mode = s.mode !== undefined && isValidMode(s.mode) ? s.mode : this._settings.mode;
    const intervalMin =
      s.intervalMin !== undefined
        ? Math.max(1, Math.floor(Number(s.intervalMin) || 15))
        : this._settings.intervalMin;

    if (mode === this._settings.mode && intervalMin === this._settings.intervalMin) return;

    // Immutable replace — never mutate in place (React memoisation gotcha).
    this._settings = { mode, intervalMin };
    this._emit();

    // Persist — fire and forget.
    if (this._proxy) {
      (this._proxy.call('set', PREF_MODE_KEY, mode) as Promise<unknown>).catch((err: unknown) => {
        console.warn('[ScheduleRefreshSettingsService] could not persist mode:', err);
      });
      (
        this._proxy.call('set', PREF_INTERVAL_KEY, String(intervalMin)) as Promise<unknown>
      ).catch((err: unknown) => {
        console.warn('[ScheduleRefreshSettingsService] could not persist intervalMin:', err);
      });
    }
  }

  onDidChange(listener: (s: RefreshSettings) => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  private async _reload(): Promise<void> {
    if (!this._proxy) return;
    // O474: skip pref read if no workspace is active yet — avoids the
    // [cap.not_found] "no active workspace" noise logged at boot before unlock.
    // workspace.onChange already re-triggers _reload() once a workspace becomes active.
    const active = await window.soam.workspace.getActive();
    if (!active) return;
    try {
      const modeResult = (await this._proxy.call('get', PREF_MODE_KEY)) as {
        value: string | null;
      };
      const intervalResult = (await this._proxy.call('get', PREF_INTERVAL_KEY)) as {
        value: string | null;
      };

      const mode: 'auto' | 'manual' = isValidMode(modeResult?.value)
        ? modeResult.value
        : 'manual';
      const parsed = parseInt(intervalResult?.value ?? '', 10);
      const intervalMin = Number.isFinite(parsed) && parsed >= 1 ? parsed : 15;

      const next: RefreshSettings = { mode, intervalMin };
      if (next.mode !== this._settings.mode || next.intervalMin !== this._settings.intervalMin) {
        this._settings = next;
        this._emit();
      }
    } catch (err) {
      console.warn('[ScheduleRefreshSettingsService] could not read refresh settings prefs:', err);
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
