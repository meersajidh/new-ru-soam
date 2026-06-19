/**
 * Schedule view-state channel — localStorage-backed, mirrors OverviewViewModeService pattern.
 *
 * Controls which calendar view (agenda/day/week/month) schedule.html renders,
 * and which calendars are hidden (by calendarId). BundleViewIframe pushes
 * scheduleViewState on init + on change; the iframe reads it from the init
 * payload and the dedicated 'scheduleViewState' message.
 *
 * calVisibility: keyed by calendarId; a MISSING key means visible —
 * only an explicit `false` hides a calendar.
 *
 * Note: a `filter` field (classification filter) is intentionally absent here;
 * deferred to O491.
 */

const STORAGE_KEY = 'soam.scheduleViewState';

export type ScheduleView = 'agenda' | 'day' | 'week' | 'month';

export interface ScheduleViewState {
  view: ScheduleView;
  calVisibility: Record<string, boolean>;
}

const VALID_VIEWS = new Set<string>(['agenda', 'day', 'week', 'month']);

const DEFAULT_STATE: ScheduleViewState = { view: 'week', calVisibility: {} };

function deepEqual(a: ScheduleViewState, b: ScheduleViewState): boolean {
  if (a.view !== b.view) return false;
  const aKeys = Object.keys(a.calVisibility);
  const bKeys = Object.keys(b.calVisibility);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (a.calVisibility[k] !== b.calVisibility[k]) return false;
  }
  return true;
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
    this._state = { view: s.view, calVisibility: { ...s.calVisibility } };
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
        VALID_VIEWS.has((parsed as { view: string }).view) &&
        'calVisibility' in parsed &&
        typeof (parsed as { calVisibility: unknown }).calVisibility === 'object' &&
        (parsed as { calVisibility: unknown }).calVisibility !== null
      ) {
        const p = parsed as { view: string; calVisibility: Record<string, unknown> };
        // Validate calVisibility entries are boolean
        const calVis: Record<string, boolean> = {};
        for (const [k, v] of Object.entries(p.calVisibility)) {
          if (typeof v === 'boolean') calVis[k] = v;
        }
        return { view: p.view as ScheduleView, calVisibility: calVis };
      }
    }
  } catch {
    /* storage unavailable or JSON invalid */
  }
  return { view: 'week', calVisibility: {} };
}
