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
 * classFilter: which classification ids are VISIBLE. A missing key means visible
 * (default all visible); explicit `false` means hidden. Keys are the 5 classification
 * ids: 'client_session', 'probable_client_session', 'not_client_session', 'personal',
 * 'unclassified'. schedule.html applies this as a client-side render filter — no
 * refetch. Default `{}` = all visible.
 */

const STORAGE_KEY = 'soam.scheduleViewState';

export type ScheduleView = 'agenda' | 'day' | 'week' | 'month';

export interface ScheduleViewState {
  view: ScheduleView;
  calRev: number;
  classFilter: Record<string, boolean>;
}

const VALID_VIEWS = new Set<string>(['agenda', 'day', 'week', 'month']);

const DEFAULT_STATE: ScheduleViewState = { view: 'week', calRev: 0, classFilter: {} };

function shallowEqualClassFilter(a: Record<string, boolean>, b: Record<string, boolean>): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

function deepEqual(a: ScheduleViewState, b: ScheduleViewState): boolean {
  return a.view === b.view && a.calRev === b.calRev && shallowEqualClassFilter(a.classFilter, b.classFilter);
}

export interface IScheduleViewStateService {
  getState(): ScheduleViewState;
  setState(s: ScheduleViewState): void;
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
    this._state = { view: s.view, calRev: s.calRev, classFilter: { ...s.classFilter } };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._state));
    } catch {
      /* storage unavailable */
    }
    for (const l of this._listeners) l(this._state);
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
        // Validate classFilter: must be an object of boolean values; default {} if absent/invalid.
        let classFilter: Record<string, boolean> = {};
        if (
          p.classFilter !== null &&
          p.classFilter !== undefined &&
          typeof p.classFilter === 'object' &&
          !Array.isArray(p.classFilter)
        ) {
          const cf = p.classFilter as Record<string, unknown>;
          const valid: Record<string, boolean> = {};
          let ok = true;
          for (const k of Object.keys(cf)) {
            if (typeof cf[k] !== 'boolean') { ok = false; break; }
            valid[k] = cf[k] as boolean;
          }
          if (ok) classFilter = valid;
        }
        return { view: p.view as ScheduleView, calRev, classFilter };
      }
    }
  } catch {
    /* storage unavailable or JSON invalid */
  }
  return { view: 'week', calRev: 0, classFilter: {} };
}
