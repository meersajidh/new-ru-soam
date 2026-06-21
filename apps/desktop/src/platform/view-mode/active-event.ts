/**
 * ActiveEvent — non-persisted relay for the currently-selected calendar event.
 *
 * schedule.html publishes the selected event object when the user clicks an
 * event in the calendar grid. BundleViewIframe forwards it via
 * request.setActiveEvent → ActiveEventService.setActiveEvent(ev|null).
 * event-detail.html (aux slot) receives the current event via the init/context
 * payloads and the dedicated 'activeEvent' push.
 *
 * Payload is opaque (Record<string,unknown>|null) — relayed verbatim
 * iframe→renderer→iframe. No PHI interpretation in the renderer.
 */

export type ActiveEvent = Record<string, unknown> | null;

export interface IActiveEventService {
  getActiveEvent(): ActiveEvent;
  setActiveEvent(ev: ActiveEvent): void;
  onDidChange(listener: (ev: ActiveEvent) => void): () => void;
}

export class ActiveEventService implements IActiveEventService {
  private _event: ActiveEvent = null;
  private readonly _listeners = new Set<(ev: ActiveEvent) => void>();

  getActiveEvent(): ActiveEvent {
    return this._event;
  }

  setActiveEvent(ev: ActiveEvent): void {
    // Identity replace — never mutate in place (React memoisation gotcha).
    const next: ActiveEvent = ev === null ? null : { ...ev };
    this._event = next;
    for (const l of this._listeners) l(this._event);
  }

  onDidChange(listener: (ev: ActiveEvent) => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }
}
