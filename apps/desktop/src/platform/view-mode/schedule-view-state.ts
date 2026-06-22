/**
 * Schedule view-state channel — localStorage-backed, mirrors OverviewViewModeService pattern.
 *
 * Controls which calendar view (agenda/day/week/month) schedule.html renders,
 * and signals cross-iframe data refresh via a monotonic `calRev` counter.
 * BundleViewIframe pushes scheduleViewState on init + on change; the iframe reads it
 * from the init payload and the dedicated 'scheduleViewState' message.
 *
 * calRev: opaque monotonic integer. nav.html bumps it on any account/calendar mutation
 * (connect, disconnect, calendar selected-toggle). schedule.html refetches
 * listAggregatedEvents whenever calRev changes. schedule.html never resets calRev —
 * it preserves the last-seen value when writing back its own view change.
 *
 * Calendar selection (which calendars are shown) is now persisted in the `calendar`
 * table (slice 2, ADR-507 Am1) and enforced server-side by listAggregatedEvents —
 * the old client-side calVisibility filter is gone.
 *
 * classFilter: single-focus classification filter. null = all visible (default);
 * a string = only events with that classification id are shown. The 4 ids:
 * 'client_session', 'not_client_session', 'personal', 'unclassified'.
 * schedule.html applies this as a client-side render filter — no refetch.
 *
 * Back-compat: consumers that received the old Record<string,boolean> shape from
 * localStorage will fall through validation and default to null (all visible).
 */

const STORAGE_KEY = 'soam.scheduleViewState';

export type ScheduleView = 'agenda' | 'day' | 'week' | 'month';

export interface ScheduleViewState {
  view: ScheduleView;
  calRev: number;
  /** null = all visible; string = focus on that classification id only. */
  classFilter: string | null;
}

const VALID_VIEWS = new Set<string>(['agenda', 'day', 'week', 'month']);

const DEFAULT_STATE: ScheduleViewState = { view: 'week', calRev: 0, classFilter: null };

function deepEqual(a: ScheduleViewState, b: ScheduleViewState): boolean {
  return a.view === b.view && a.calRev === b.calRev && a.classFilter === b.classFilter;
}

export interface IScheduleViewStateService {
  getState(): ScheduleViewState;
  setState(s: ScheduleViewState): void;
  /**
   * Increment `calRev` (view+classFilter unchanged), broadcasting to all schedule
   * iframes so they re-classify / refresh. The single sanctioned cross-module
   * refresh trigger — call this from any renderer consumer that mutates a
   * classification input (PHI-read toggle, roster erase, calendar edit, triage).
   * Encapsulated on the service (a true registry singleton) so it never depends
   * on a module-level singleton, which HMR does not swap (boot-singleton gotcha).
   */
  bumpCalRev(): void;
  onDidChange(listener: (s: ScheduleViewState) => void): () => void;
}

export class ScheduleViewStateService implements IScheduleViewStateService {
  private _state: ScheduleViewState;
  private readonly _listeners = new Set<(s: ScheduleViewState) => void>();

  constructor(initial: ScheduleViewState = DEFAULT_STATE) {
    this._state = initial;
  }

  getState(): ScheduleViewState {
    return this._state;
  }

  setState(s: ScheduleViewState): void {
    if (deepEqual(this._state, s)) return;
    this._state = { view: s.view, calRev: s.calRev, classFilter: s.classFilter ?? null };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._state));
    } catch {
      /* storage unavailable */
    }
    for (const l of this._listeners) l(this._state);
  }

  bumpCalRev(): void {
    const s = this._state;
    this.setState({ view: s.view, calRev: s.calRev + 1, classFilter: s.classFilter });
  }

  onDidChange(listener: (s: ScheduleViewState) => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }
}

/** Read persisted schedule view state from localStorage; returns default when absent/invalid. */
export function readPersistedScheduleViewState(): ScheduleViewState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) {
      const parsed = JSON.parse(stored) as unknown;
      if (
        parsed !== null &&
        typeof parsed === 'object' &&
        'view' in parsed &&
        typeof (parsed as { view: unknown }).view === 'string' &&
        VALID_VIEWS.has((parsed as { view: string }).view)
      ) {
        const p = parsed as { view: string; calRev?: unknown; classFilter?: unknown };
        const calRev = typeof p.calRev === 'number' ? p.calRev : 0;
        // Validate classFilter: must be a string (focused class id) or null.
        // Old Record<string,boolean> shape → falls through to null (all visible).
        let classFilter: string | null = null;
        if (typeof p.classFilter === 'string' && p.classFilter.length > 0) {
          classFilter = p.classFilter;
        }
        return { view: p.view as ScheduleView, calRev, classFilter };
      }
    }
  } catch {
    /* storage unavailable or JSON invalid */
  }
  return { view: 'week', calRev: 0, classFilter: null };
}
