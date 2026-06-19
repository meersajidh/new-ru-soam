/**
 * ScheduleCounts — non-persisted relay for per-classification event counts.
 *
 * schedule.html publishes a count per classification id after every classify
 * pass. The renderer forwards it via BundleViewIframe (request.setScheduleCounts
 * → ScheduleCountsService.setCounts). nav.html (Phase A2) consumes getCounts()
 * via the init/context payloads and the dedicated 'scheduleCounts' push.
 *
 * Counts cover ALL loaded events regardless of classFilter — the filter only
 * hides events in the calendar grid; counts always reflect the full window.
 *
 * Keys are the 5 classification ids:
 *   'client_session' | 'probable_client_session' | 'not_client_session' |
 *   'personal' | 'unclassified'
 */

export type ScheduleCounts = Record<string, number>;

export interface IScheduleCountsService {
  getCounts(): ScheduleCounts;
  setCounts(c: ScheduleCounts): void;
  onDidChange(listener: (c: ScheduleCounts) => void): () => void;
}

function shallowEqualCounts(a: ScheduleCounts, b: ScheduleCounts): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

export class ScheduleCountsService implements IScheduleCountsService {
  private _counts: ScheduleCounts = {};
  private readonly _listeners = new Set<(c: ScheduleCounts) => void>();

  getCounts(): ScheduleCounts {
    return this._counts;
  }

  setCounts(c: ScheduleCounts): void {
    if (shallowEqualCounts(this._counts, c)) return;
    this._counts = { ...c };
    for (const l of this._listeners) l(this._counts);
  }

  onDidChange(listener: (c: ScheduleCounts) => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }
}
