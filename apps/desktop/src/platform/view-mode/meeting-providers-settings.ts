/**
 * MeetingProvidersSettingsService — renderer source of truth for the
 * `schedule.meetingProviders` pref (JSON [{ name, domain }]).
 *
 * This is the SOLE renderer writer of that pref. Mirrors the pattern of
 * ScheduleRefreshSettingsService / TelemetryModeService.
 *
 * Responsibilities:
 *   - On init: read pref. If empty → seed with DEFAULT_MEETING_PROVIDERS and
 *     persist. If non-empty → additive merge by domain (add any defaults whose
 *     domain is absent; never overwrite user-edited entries).
 *   - getProviders()   — returns current list (stable ref).
 *   - setProviders()   — replaces the list, persists, emits.
 *   - onDidChange()    — subscription.
 *
 * PHI note: provider domains are not PHI → operational store (prefs).
 */

export interface MeetingProvider {
  readonly name: string;
  readonly domain: string;
}

/** Built-in defaults — seeded into the pref only when it is unset/empty. */
export const DEFAULT_MEETING_PROVIDERS: ReadonlyArray<MeetingProvider> = [
  { name: 'Zoom',    domain: 'zoom.us' },
  { name: 'Teams',   domain: 'teams.microsoft.com' },
  { name: 'Whereby', domain: 'whereby.com' },
  { name: 'doxy.me', domain: 'doxy.me' },
];

const PREF_KEY = 'schedule.meetingProviders';

/**
 * Additive merge: returns `existing` with any default whose domain is not
 * already in the list appended. Never overwrites existing entries (user edits).
 */
function mergeWithDefaults(existing: MeetingProvider[]): MeetingProvider[] {
  if (existing.length === 0) return [...DEFAULT_MEETING_PROVIDERS];
  const existingDomains = new Set(existing.map((p) => p.domain.toLowerCase()));
  const toAdd = DEFAULT_MEETING_PROVIDERS.filter(
    (d) => !existingDomains.has(d.domain.toLowerCase()),
  );
  return toAdd.length > 0 ? [...existing, ...toAdd] : existing;
}

export interface IMeetingProvidersSettingsService {
  getProviders(): ReadonlyArray<MeetingProvider>;
  setProviders(list: ReadonlyArray<MeetingProvider>): void;
  onDidChange(listener: (list: ReadonlyArray<MeetingProvider>) => void): () => void;
  dispose(): void;
}

export class MeetingProvidersSettingsService implements IMeetingProvidersSettingsService {
  private _providers: ReadonlyArray<MeetingProvider> = DEFAULT_MEETING_PROVIDERS;
  private readonly _listeners = new Set<(list: ReadonlyArray<MeetingProvider>) => void>();
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
        console.warn('[MeetingProvidersSettingsService] could not bind prefs cap:', err);
      });

    // Reload on workspace change so settings reflect the new workspace's prefs.
    this._workspaceUnsub = window.soam.workspace.onChange(() => {
      void this._reload();
    });
  }

  getProviders(): ReadonlyArray<MeetingProvider> {
    return this._providers;
  }

  setProviders(list: ReadonlyArray<MeetingProvider>): void {
    const next = Array.from(list);
    if (JSON.stringify(next) === JSON.stringify(this._providers)) return;
    // Immutable replace — never mutate in place (React memoisation gotcha).
    this._providers = next;
    this._emit();

    // Persist — fire and forget.
    if (this._proxy) {
      (
        this._proxy.call('set', PREF_KEY, JSON.stringify(next)) as Promise<unknown>
      ).catch((err: unknown) => {
        console.warn('[MeetingProvidersSettingsService] could not persist providers:', err);
      });
    }
  }

  onDidChange(listener: (list: ReadonlyArray<MeetingProvider>) => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  private async _reload(): Promise<void> {
    if (!this._proxy) return;
    // Skip pref read if no workspace is active yet (same guard as ScheduleRefreshSettingsService).
    const active = await window.soam.workspace.getActive();
    if (!active) return;
    try {
      const result = (await this._proxy.call('get', PREF_KEY)) as { value: string | null };
      let parsed: MeetingProvider[] = [];
      if (result?.value) {
        try {
          const raw = JSON.parse(result.value);
          if (Array.isArray(raw)) parsed = raw as MeetingProvider[];
        } catch {
          // Ignore malformed pref; fall through to defaults.
        }
      }

      const merged = mergeWithDefaults(parsed);

      // Persist merged list if it grew (new defaults added / first-time seed).
      if (merged.length !== parsed.length) {
        (
          this._proxy.call('set', PREF_KEY, JSON.stringify(merged)) as Promise<unknown>
        ).catch((err: unknown) => {
          console.warn('[MeetingProvidersSettingsService] could not seed providers pref:', err);
        });
      }

      if (JSON.stringify(merged) !== JSON.stringify(this._providers)) {
        this._providers = merged;
        this._emit();
      }
    } catch (err) {
      console.warn('[MeetingProvidersSettingsService] could not read providers pref:', err);
    }
  }

  private _emit(): void {
    for (const l of this._listeners) l(this._providers);
  }

  dispose(): void {
    this._workspaceUnsub?.();
    this._workspaceUnsub = null;
    this._proxy?.dispose();
    this._proxy = null;
    this._listeners.clear();
  }
}
