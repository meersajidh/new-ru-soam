/**
 * ScheduleDisplaySettingsService — renderer source of truth for calendar display prefs.
 *
 * Backed by prefs@1.0 key `schedule.chipLabelMode`.
 * The Settings menu (gear → Schedule) is the sole writer via setSettings().
 * schedule.html consumes updates via BundleViewIframe init/context/onDidChange push.
 *
 * No PHI. Settings carry only chipLabelMode ('title' | 'clientName').
 */

export type ChipLabelMode = 'title' | 'clientName';

export interface DisplaySettings {
  readonly chipLabelMode: ChipLabelMode;
}

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  chipLabelMode: 'title',
};

const PREF_CHIP_LABEL_KEY = 'schedule.chipLabelMode';

const VALID_MODES = new Set<string>(['title', 'clientName']);

function isValidMode(v: unknown): v is ChipLabelMode {
  return typeof v === 'string' && VALID_MODES.has(v);
}

export interface IScheduleDisplaySettingsService {
  getSettings(): DisplaySettings;
  setSettings(s: Partial<DisplaySettings>): void;
  onDidChange(listener: (s: DisplaySettings) => void): () => void;
}

export class ScheduleDisplaySettingsService implements IScheduleDisplaySettingsService {
  private _settings: DisplaySettings = { ...DEFAULT_DISPLAY_SETTINGS };
  private readonly _listeners = new Set<(s: DisplaySettings) => void>();
  private _proxy: {
    call: (method: string, ...args: ReadonlyArray<unknown>) => Promise<unknown>;
    dispose: () => void;
  } | null = null;
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
        console.warn('[ScheduleDisplaySettingsService] could not bind prefs cap:', err);
      });

    // Reload on workspace change so settings reflect the new workspace's prefs.
    this._workspaceUnsub = window.soam.workspace.onChange(() => {
      void this._reload();
    });
  }

  getSettings(): DisplaySettings {
    return this._settings;
  }

  setSettings(s: Partial<DisplaySettings>): void {
    const chipLabelMode =
      s.chipLabelMode !== undefined && isValidMode(s.chipLabelMode)
        ? s.chipLabelMode
        : this._settings.chipLabelMode;

    if (chipLabelMode === this._settings.chipLabelMode) return;

    // Immutable replace — never mutate in place (React memoisation gotcha).
    this._settings = { chipLabelMode };
    this._emit();

    // Persist — fire and forget.
    if (this._proxy) {
      (this._proxy.call('set', PREF_CHIP_LABEL_KEY, chipLabelMode) as Promise<unknown>).catch(
        (err: unknown) => {
          console.warn('[ScheduleDisplaySettingsService] could not persist chipLabelMode:', err);
        },
      );
    }
  }

  onDidChange(listener: (s: DisplaySettings) => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  private async _reload(): Promise<void> {
    if (!this._proxy) return;
    // Skip pref read if no workspace is active yet — avoids [cap.not_found] noise at boot.
    const active = await window.soam.workspace.getActive();
    if (!active) return;
    try {
      const modeResult = (await this._proxy.call('get', PREF_CHIP_LABEL_KEY)) as {
        value: string | null;
      };
      const chipLabelMode: ChipLabelMode = isValidMode(modeResult?.value)
        ? modeResult.value
        : 'title';

      if (chipLabelMode !== this._settings.chipLabelMode) {
        this._settings = { chipLabelMode };
        this._emit();
      }
    } catch (err) {
      console.warn('[ScheduleDisplaySettingsService] could not read display settings prefs:', err);
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
