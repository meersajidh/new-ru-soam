/**
 * CalendarProvider port — ADR-507 §2.
 *
 * Provider-agnostic interface. Google is the first adapter; future adapters
 * (Microsoft, Apple, CalDAV) conform to this port without changing consumers.
 * The port lives with Schedule until a 2nd adapter exists ("until module #2"
 * discipline — ADR-507 §2 + O194).
 *
 * All operations are brokered through Main (ADR-203). Adapters hold the
 * credential themselves and inject it into outbound calls — it never surfaces
 * to the renderer or the FP-Host bundle.
 */

/** A single calendar event returned by the provider. PHI-free in P0 (no resolution). */
export interface CalendarEvent {
  /** Provider-assigned event id. Opaque string — do not parse. */
  readonly id: string;
  /** Display title from the provider. May contain PHI after PHI-read opt-in (future). */
  readonly title: string;
  /** ISO-8601 datetime string (UTC). For all-day events, date-only (YYYY-MM-DD). */
  readonly start: string;
  /** ISO-8601 datetime string (UTC). For all-day events, date-only (YYYY-MM-DD). */
  readonly end: string;
  readonly allDay: boolean;
  /** Provider calendar id (e.g. "primary"). */
  readonly calendarId: string;
  /** Display name of the calendar (e.g. "My Calendar"). */
  readonly calendarName: string;
}

/** Range for event queries — ISO-8601 date or datetime strings. */
export interface EventRange {
  readonly from: string;
  readonly to: string;
}

/** Connection status returned by getStatus(). */
export interface ProviderStatus {
  /** Whether a credential is stored and appears valid. */
  readonly connected: boolean;
  /** Human-readable provider display name, e.g. "Google Calendar". */
  readonly providerName: string;
}

/**
 * CalendarProvider port. Adapters implement this interface.
 * Method semantics:
 *   getStatus()          → connection state; never throws.
 *   connect()            → run OAuth grant; stores credential; returns ok+error.
 *   disconnect()         → clear credential; idempotent.
 *   listEvents(range)    → fetch events brokered through Main for the range.
 *                          Throws if not connected or network error.
 */
export interface CalendarProvider {
  getStatus(): Promise<ProviderStatus>;
  connect(): Promise<{ ok: boolean; error?: string }>;
  disconnect(): Promise<void>;
  listEvents(range: EventRange): Promise<ReadonlyArray<CalendarEvent>>;
}
