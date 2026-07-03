/* eslint-disable react-refresh/only-export-components */
import './schedule.css';
import { useEffect, useRef, useState, useMemo, useLayoutEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { useQueryClient } from '@tanstack/react-query';
import {
  ViewRoot,
  useSoamView,
  useCapQuery,
  useViewChannel,
  Icon,
} from '@ru-soam/view-kit';
import type { BoundProxy } from '@ru-soam/view-kit';
import {
  type CalendarEvent,
  type ChipLabelMode,
  type EventMatch,
  addDays,
  isToday,
  fmtTime,
  fmtTimeRange,
  fmtTimeShort,
  fmtDuration,
  eventDisplayTitle,
  isEventDeclined,
  responseIcon,
  modalitySubline,
  participantClassHint,
  classClass,
  classLabel,
  fetchWindow,
  rangeForView,
  getEventsForDay,
  getEventParticipantLabel,
  minOfDay,
  packLanes,
  startOfMonth,
  startOfWeek,
  endOfMonth,
  DAY_NAMES_SHORT,
  DAY_NAMES_FULL,
  MONTH_NAMES_SHORT,
  MONTH_NAMES,
  type RangeForViewResult,
} from './schedule-lib';

// ── Classification (SD-11 / ADR-313 Am2) ────────────────────────────────────
// ev.classification is a DERIVED PROJECTION — never stored, never sent to provider.

interface ClassEntry {
  classification: string;
  _match: EventMatch | null;
  _clientLabel?: string;
}

const PREC: Record<string, number> = {
  client_session: 2,
  not_client_session: 1,
  unclassified: 0,
};

interface LinkedRow {
  provider_event_id: string;
  patient_id?: string | null;
}

interface ResolveResult {
  outcome?: string;
  clientId?: string;
  candidates?: unknown[];
}

interface ClientRecord {
  givenName?: string;
  familyName?: string;
}

function formatClientName(rec: ClientRecord | null): string {
  const given = rec && rec.givenName ? String(rec.givenName).trim() : '';
  const family = rec && rec.familyName ? String(rec.familyName).trim() : '';
  if (family && given) return `${family}, ${given.charAt(0)}.`;
  if (family) return family;
  return given || '(Unknown)';
}

/**
 * Async classify pass. Returns a map eventId → ClassEntry. Pure: never mutates
 * the input events (caller merges the map into fresh event copies). Mirrors the
 * vanilla runClassifyPass — linked-instant + sequential resolveParticipant with
 * PREC precedence (ADR-313 Am2: only ever SET _bestMatch on a real match, never
 * null-clobber captured candidates) + per-pass cached name resolution.
 */
async function runClassifyPass(
  evs: CalendarEvent[],
  win: { from: Date; to: Date },
  sessionsQuery: BoundProxy,
  recordQuery: BoundProxy,
): Promise<Record<string, ClassEntry>> {
  const fromMs = win.from.getTime();
  const toMs = win.to.getTime();

  let rows: LinkedRow[];
  try {
    rows =
      ((await sessionsQuery.call('listLinkedProvider', {
        providerId: 'google-calendar',
        from: fromMs,
        to: toMs,
      })) as LinkedRow[]) || [];
  } catch {
    rows = [];
  }

  const linkedSet: Record<string, boolean> = {};
  const linkedRowMap: Record<string, LinkedRow> = {};
  rows.forEach((r) => {
    linkedSet[r.provider_event_id] = true;
    linkedRowMap[r.provider_event_id] = r;
  });

  interface PerEvent {
    id: string;
    entry: ClassEntry;
    matchedClientIds: string[];
  }

  const perEvent: PerEvent[] = await Promise.all(
    evs.map(async (ev): Promise<PerEvent> => {
      // Already linked → instant client_session, enriched with linked clientId.
      if (linkedSet[ev.id]) {
        const lr = linkedRowMap[ev.id];
        return {
          id: ev.id,
          entry: {
            classification: 'client_session',
            _match:
              lr && lr.patient_id
                ? { matchClientId: lr.patient_id, source: 'linked' }
                : { source: 'linked' },
          },
          matchedClientIds: [],
        };
      }

      // Gather participants: non-self attendees + external organizer.
      const participants: { email: string | null; name: string | null }[] = [];
      if (ev.attendees) {
        ev.attendees.forEach((a) => {
          if (!a.self && (a.email || a.name)) {
            participants.push({ email: a.email || null, name: a.name || null });
          }
        });
      }
      if (ev.organizer && ev.organizer.email && !ev.organizer.self) {
        const orgEmail = ev.organizer.email.toLowerCase();
        const alreadySelf =
          ev.attendees &&
          ev.attendees.some((a) => a.self && (a.email || '').toLowerCase() === orgEmail);
        if (!alreadySelf) {
          const alreadyAdded = participants.some(
            (p) => p.email && p.email.toLowerCase() === orgEmail,
          );
          if (!alreadyAdded) {
            participants.push({
              email: ev.organizer.email,
              name: ev.organizer.displayName || null,
            });
          }
        }
      }

      if (participants.length === 0) {
        return {
          id: ev.id,
          entry: { classification: 'personal', _match: null },
          matchedClientIds: [],
        };
      }

      // Resolve participants sequentially — collect ALL matched clientIds.
      let best = 'unclassified';
      let bestMatch: EventMatch | null = null;
      const matchedClientIds: string[] = [];

      for (const p of participants) {
        const query: { email?: string; name?: string } = {};
        if (p.email) query.email = p.email;
        if (p.name) query.name = p.name;
        let result: ResolveResult;
        try {
          result = (await recordQuery.call('resolveParticipant', query)) as ResolveResult;
        } catch {
          continue; // resolver error → treat as unclassified for this participant
        }
        const outcome = (result && result.outcome) || 'none';
        let cls: string;
        if (outcome === 'match') cls = 'client_session';
        else if (outcome === 'suppressed') cls = 'not_client_session';
        else cls = 'unclassified'; // candidates + none → unclassified grid class

        if (outcome === 'match' && result?.clientId) {
          if (matchedClientIds.indexOf(result.clientId) === -1) {
            matchedClientIds.push(result.clientId);
          }
        }
        // ADR-313 Am2: only ever SET _bestMatch on a real match (never null-clobber).
        if (PREC[cls] > PREC[best] && outcome === 'match' && result?.clientId) {
          bestMatch = { matchClientId: result.clientId, source: 'resolver' };
        }
        // Candidates: capture for aux disambiguation, but only when no better match found.
        if (
          outcome === 'candidates' &&
          result?.candidates &&
          best !== 'client_session' &&
          (!bestMatch || !bestMatch.matchClientId)
        ) {
          bestMatch = { candidates: result.candidates, source: 'resolver' };
        }
        if (PREC[cls] > PREC[best]) best = cls;
      }

      return {
        id: ev.id,
        entry: { classification: best, _match: bestMatch },
        matchedClientIds,
      };
    }),
  );

  // Name-resolution pass — per-pass cache so a client on many events is fetched once.
  const nameCache: Record<string, Promise<string | null>> = {};
  const fetchClientName = (clientId: string): Promise<string | null> => {
    if (!nameCache[clientId]) {
      nameCache[clientId] = recordQuery
        .call('get', clientId)
        .then((rec) => formatClientName(rec as ClientRecord))
        .catch(() => null);
    }
    return nameCache[clientId];
  };

  await Promise.all(
    perEvent.map(async (pe) => {
      if (pe.entry.classification !== 'client_session') return;
      const ids: string[] = [];
      if (pe.entry._match && pe.entry._match.matchClientId) {
        ids.push(pe.entry._match.matchClientId);
      }
      pe.matchedClientIds.forEach((id) => {
        if (ids.indexOf(id) === -1) ids.push(id);
      });
      if (ids.length === 0) return;

      const entries = await Promise.all(
        ids.map(async (id) => ({ id, name: await fetchClientName(id) })),
      );
      const valid = entries.filter((e) => e.name) as { id: string; name: string }[];
      valid.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
      if (valid.length > 0) {
        pe.entry._clientLabel = valid[0].name;
        pe.entry._match = pe.entry._match || {};
        pe.entry._match.matchClientId = valid[0].id;
        pe.entry._match.matchClientIds = valid.map((e) => e.id);
      }
    }),
  );

  const map: Record<string, ClassEntry> = {};
  perEvent.forEach((pe) => {
    map[pe.id] = pe.entry;
  });
  return map;
}

// ── Types ───────────────────────────────────────────────────────────────────

interface Calendar {
  id: string;
  accountId: string;
  displayName: string;
  color?: string;
  selected: boolean;
}

interface ScheduleViewStatePayload {
  view?: string;
  calRev?: number;
  classFilter?: string | null;
}

// ── EventCard Component (Agenda View) ────────────────────────────────────────

interface EventCardProps {
  ev: CalendarEvent;
  selected: boolean;
  chipLabelMode: ChipLabelMode;
  onClick: (e: React.MouseEvent) => void;
}

function EventCard({ ev, selected, chipLabelMode, onClick }: EventCardProps) {
  const isAllDay = ev.allDay || !ev.start || ev.start.length <= 10;
  const style: React.CSSProperties = {};
  if (ev.calendarColor) {
    style.backgroundColor = `color-mix(in srgb, ${ev.calendarColor} 14%, transparent)`;
  }

  const subline = modalitySubline(ev);

  return (
    <div
      className={`event-card${selected ? ' is-selected' : ''}`}
      style={style}
      onClick={onClick}
    >
      <div className={`event-time-col${isAllDay ? ' allday-label' : ''}`}>
        {fmtTimeShort(ev)}
      </div>
      <div className="event-body">
        <div className={`event-title${isEventDeclined(ev) ? ' is-declined' : ''}`}>
          {eventDisplayTitle(ev, chipLabelMode)}
        </div>
        {subline && <div className="event-modality">{subline}</div>}
      </div>
      <div className={`event-kind-badge ${classClass(ev)}`}>
        {classLabel(ev)}
      </div>
    </div>
  );
}

// ── TimeGrid Component (Week & Day Views) ───────────────────────────────────

interface TimeGridProps {
  dayDates: Date[];
  isDayView: boolean;
  events: CalendarEvent[];
  calVisibility: Record<string, boolean>;
  classFilter: string | null;
  chipLabelMode: ChipLabelMode;
  selectedId: string | null;
  onEventClick: (ev: CalendarEvent, e: React.MouseEvent) => void;
}

const HOUR_H = 56;
const MIN_BLOCK_H = 22;
const SCROLL_TO_HOUR = 7;

function TimeGrid({
  dayDates,
  isDayView,
  events,
  calVisibility,
  classFilter,
  chipLabelMode,
  selectedId,
  onEventClick,
}: TimeGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll to 7 AM on mount (once per layout change, ignore selectedId changes)
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = SCROLL_TO_HOUR * HOUR_H - 24;
    }
  }, [dayDates.length, isDayView]);

  // Compute now-line positions
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const nowTop = (nowMin / 60) * HOUR_H;

  const todayIndex = dayDates.findIndex((d) => isToday(d));

  return (
    <div className={`tg-root${isDayView ? ' day-view' : ''}`}>
      {/* Column Headers */}
      <div className="tg-col-headers">
        <div className="tg-col-header-gutter" />
        {isDayView ? (
          (() => {
            const d0 = dayDates[0];
            return (
              <div className={`tg-col-header day-solo${isToday(d0) ? ' is-today' : ''}`}>
                <div className={`tg-col-header-date${isToday(d0) ? ' is-today' : ''}`}>
                  {d0.getDate()}
                </div>
                <div className="tg-col-header-wd">
                  {`${DAY_NAMES_FULL[d0.getDay()]}, ${d0.getDate()} ${MONTH_NAMES[d0.getMonth()]}`}
                </div>
              </div>
            );
          })()
        ) : (
          dayDates.map((d) => (
            <div
              key={d.toISOString()}
              className={`tg-col-header${isToday(d) ? ' is-today' : ''}`}
            >
              <div className="tg-col-header-wd">{DAY_NAMES_SHORT[d.getDay()]}</div>
              <div className={`tg-col-header-date${isToday(d) ? ' is-today' : ''}`}>
                {d.getDate()}
              </div>
            </div>
          ))
        )}
      </div>

      {/* All-Day Strip */}
      <div className="tg-allday-row">
        <div className="tg-allday-gutter">all‑day</div>
        <div className="tg-allday-cols">
          {dayDates.map((d) => {
            const dayEvs = getEventsForDay(d, events, calVisibility, classFilter);
            const allDayEvs = dayEvs.filter(
              (ev) => ev.allDay || (ev.start && ev.start.length <= 10)
            );

            return (
              <div key={`ad-${d.toISOString()}`} className="tg-allday-col">
                {allDayEvs.map((ev) => {
                  const style: React.CSSProperties = {};
                  if (ev.calendarColor) {
                    (style as Record<string, string>)['--ev-border-color'] = ev.calendarColor;
                    style.backgroundColor = `color-mix(in srgb, ${ev.calendarColor} 14%, transparent)`;
                  }

                  return (
                    <div
                      key={ev.id}
                      className={`tg-allday-pill ${classClass(ev)}${
                        ev.id === selectedId ? ' is-selected' : ''
                      }${isEventDeclined(ev) ? ' is-declined' : ''}`}
                      style={style}
                      onClick={(e) => onEventClick(ev, e)}
                    >
                      {eventDisplayTitle(ev, chipLabelMode)}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Scrollable Grid Body */}
      <div className="tg-scroll" ref={scrollRef}>
        <div className="tg-grid">
          {/* Hour Labels Gutter */}
          <div className="tg-gutter">
            {Array.from({ length: 23 }, (_, i) => {
              const h = i + 1;
              const labelText =
                h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;
              return (
                <div
                  key={`hl-${h}`}
                  className="tg-hour-label"
                  style={{ top: `${h * HOUR_H}px` }}
                >
                  {labelText}
                </div>
              );
            })}
            {todayIndex !== -1 && (
              <div
                className="tg-now-gutter-line"
                style={{ top: `${nowTop}px` }}
              />
            )}
          </div>

          {/* Day Columns */}
          <div className="tg-cols">
            {dayDates.map((d) => {
              const dayEvs = getEventsForDay(d, events, calVisibility, classFilter);
              const timedEvs = dayEvs.filter(
                (ev) => !ev.allDay && ev.start && ev.start.length > 10
              );

              const packed = packLanes(timedEvs);

              return (
                <div
                  key={`col-${d.toISOString()}`}
                  className={`tg-day-col${isToday(d) ? ' is-today' : ''}`}
                >
                  {packed.map((item) => {
                    const ev = item.ev;
                    const startMin = minOfDay(ev.start);
                    let endMin = ev.end ? minOfDay(ev.end) : startMin + 60;
                    if (endMin <= startMin) endMin = startMin + 30;
                    const durationMin = endMin - startMin;

                    const topPx = (startMin / 60) * HOUR_H;
                    const hPx = Math.max(MIN_BLOCK_H, (durationMin / 60) * HOUR_H);

                    const laneW = 100 / item.totalLanes;
                    const leftPct = item.lane * laneW;
                    const rightPct = 100 - (item.lane + 1) * laneW;

                    const isTiny = hPx < 30;

                    const style: React.CSSProperties = {
                      top: `${topPx}px`,
                      height: `${hPx}px`,
                    };

                    if (ev.calendarColor) {
                      (style as Record<string, string>)['--ev-border-color'] = ev.calendarColor;
                      style.backgroundColor = `color-mix(in srgb, ${ev.calendarColor} 14%, transparent)`;
                    }

                    if (item.totalLanes > 1) {
                      style.left = `calc(${leftPct}% + 3px)`;
                      style.right = `calc(${rightPct}% + 3px)`;
                    }

                    const displayTitle = eventDisplayTitle(ev, chipLabelMode);
                    const participantLabel = getEventParticipantLabel(ev);
                    const declined = isEventDeclined(ev);

                    return (
                      <button
                        key={ev.id}
                        type="button"
                        className={`tg-event ${classClass(ev)}${
                          ev.id === selectedId ? ' is-selected' : ''
                        }${isTiny ? ' tiny' : ''}`}
                        style={style}
                        onClick={(e) => onEventClick(ev, e)}
                      >
                        <div className="tg-event-time">{fmtTime(ev.start)}</div>
                        <div className="tg-event-title">
                          <span className={declined ? 'is-declined' : undefined}>
                            {displayTitle}
                          </span>
                          {!isTiny && (ev.meetingLink || ev.location) && (
                            <span
                              style={{
                                verticalAlign: 'middle',
                                marginLeft: '4px',
                                opacity: 0.65,
                                display: 'inline-flex',
                                alignItems: 'center',
                              }}
                            >
                              <Icon
                                name={ev.meetingLink ? 'globe' : 'location'}
                                size={11}
                              />
                            </span>
                          )}
                        </div>
                        <div className={`tg-event-cls-badge ${classClass(ev)}`}>
                          {classLabel(ev)}
                        </div>
                        {!isTiny &&
                          ev.classification !== 'client_session' &&
                          participantLabel && (
                            <div className="tg-event-participant">
                              {participantLabel}
                            </div>
                          )}
                      </button>
                    );
                  })}

                  {isToday(d) && (
                    <div
                      className="tg-now-line"
                      style={{ top: `${nowTop}px` }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── View components ──────────────────────────────────────────────────────────

interface ViewProps {
  range: RangeForViewResult;
  events: CalendarEvent[];
  calVisibility: Record<string, boolean>;
  classFilter: string | null;
  chipLabelMode: ChipLabelMode;
  selectedId: string | null;
  onEventClick: (ev: CalendarEvent, e: React.MouseEvent) => void;
}

function AgendaView({
  range,
  events,
  calVisibility,
  classFilter,
  chipLabelMode,
  selectedId,
  onEventClick,
}: ViewProps) {
  const days: Date[] = [];
  let cur = new Date(range.from);
  while (cur < range.to) {
    days.push(new Date(cur));
    cur = addDays(cur, 1);
  }

  let hasAny = false;
  const renderedDays = days.map((d) => {
    const dayEvs = getEventsForDay(d, events, calVisibility, classFilter);
    if (dayEvs.length > 0) hasAny = true;

    return (
      <div key={d.toISOString()} className="day-group">
        <div className="day-header">
          <span className={`day-num${isToday(d) ? ' is-today' : ''}`}>
            {d.getDate()}
          </span>
          <span className="day-weekday">{DAY_NAMES_SHORT[d.getDay()]}</span>
          <span className="day-month">{MONTH_NAMES_SHORT[d.getMonth()]}</span>
        </div>
        <div className="day-events">
          {dayEvs.length === 0 ? (
            <div className="day-empty">No events</div>
          ) : (
            dayEvs.map((ev) => (
              <EventCard
                key={ev.id}
                ev={ev}
                selected={ev.id === selectedId}
                chipLabelMode={chipLabelMode}
                onClick={(e) => onEventClick(ev, e)}
              />
            ))
          )}
        </div>
      </div>
    );
  });

  return (
    <div className="agenda-card-shell">
      <div className="agenda-scroll">
        {renderedDays}
        {!hasAny && <div className="no-events">No events in this period.</div>}
      </div>
    </div>
  );
}

function DayView(props: ViewProps) {
  return (
    <div className="day-card-shell">
      <TimeGrid {...props} dayDates={[props.range.from]} isDayView={true} />
    </div>
  );
}

function WeekView(props: ViewProps) {
  const days: Date[] = [];
  let cur = new Date(props.range.from);
  while (cur < props.range.to) {
    days.push(new Date(cur));
    cur = addDays(cur, 1);
  }
  return <TimeGrid {...props} dayDates={days} isDayView={false} />;
}

function MonthView({
  range,
  events,
  calVisibility,
  classFilter,
  chipLabelMode,
  selectedId,
  onEventClick,
}: ViewProps) {
  const monthStart = startOfMonth(range.from);
  const gridStart = startOfWeek(monthStart);
  const monthEnd = endOfMonth(range.from);
  const gridEnd = addDays(startOfWeek(monthEnd), 6);

  const cells: React.JSX.Element[] = [];
  let cur = new Date(gridStart);

  while (cur <= gridEnd) {
    const d = new Date(cur);
    const outside = d.getMonth() !== monthStart.getMonth();
    const dayEvs = getEventsForDay(d, events, calVisibility, classFilter);
    const maxPills = 5;

    cells.push(
      <div
        key={d.toISOString()}
        className={`month-cell${outside ? ' is-outside' : ''}`}
      >
        <div className={`month-cell-date${isToday(d) ? ' is-today' : ''}`}>
          {d.getDate()}
        </div>
        {dayEvs.slice(0, maxPills).map((ev) => {
          const style: React.CSSProperties = {};
          if (ev.calendarColor) {
            (style as Record<string, string>)['--cal-color'] = ev.calendarColor;
            style.backgroundColor = `color-mix(in srgb, ${ev.calendarColor} 14%, transparent)`;
          }

          return (
            <div
              key={ev.id}
              className={`month-event-pill ${classClass(ev)}${
                ev.id === selectedId ? ' is-selected' : ''
              }${isEventDeclined(ev) ? ' is-declined' : ''}`}
              style={style}
              onClick={(e) => onEventClick(ev, e)}
            >
              {eventDisplayTitle(ev, chipLabelMode)}
            </div>
          );
        })}
        {dayEvs.length > maxPills && (
          <div className="month-overflow">
            {`+${dayEvs.length - maxPills} more`}
          </div>
        )}
      </div>
    );

    cur = addDays(cur, 1);
  }

  return (
    <div className="month-view-wrap">
      <div className="month-weekday-row">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((wd) => (
          <div key={wd} className="month-weekday-label">
            {wd}
          </div>
        ))}
      </div>
      <div className="month-grid">{cells}</div>
    </div>
  );
}

// ── Event detail popover ─────────────────────────────────────────────────────

function fallbackCopy(text: string, onSuccess: () => void) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    if (ok) onSuccess();
  } catch {
    /* silently ignore */
  }
}

interface PopoverProps {
  ev: CalendarEvent;
  anchorRect: DOMRect;
  onClose: () => void;
  onOpenSidePanel: (ev: CalendarEvent) => void;
}

function EventPopover({ ev, anchorRect, onClose, onOpenSidePanel }: PopoverProps) {
  const soamView = useSoamView();
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [copied, setCopied] = useState(false);

  // Position near anchor, clamped within iframe viewport (measure after mount).
  useLayoutEffect(() => {
    const pop = popRef.current;
    if (!pop) return;
    // The view <html> carries a CSS `zoom` (--ui-scale, appearance text-size).
    // getBoundingClientRect() returns zoom-scaled (visual) coords, but a
    // position:fixed child of the zoomed root is re-scaled by the same factor,
    // so all placement math must run in the view's LOCAL (unzoomed) px space:
    // divide the anchor rect + viewport by the zoom. Z=1 → unchanged.
    const z = parseFloat(document.documentElement.style.zoom) || 1;
    const popW = pop.offsetWidth || 380;
    const popH = pop.offsetHeight || 320;
    const vw = window.innerWidth / z;
    const vh = window.innerHeight / z;
    const aLeft = anchorRect.left / z;
    const aRight = anchorRect.right / z;
    const aTop = anchorRect.top / z;
    const aBottom = anchorRect.bottom / z;
    const margin = 8;
    let left = aRight + margin;
    if (left + popW > vw - margin) left = aLeft - popW - margin;
    left = Math.max(margin, Math.min(left, vw - popW - margin));
    let top = aTop;
    if (top + popH > vh - margin) top = aBottom - popH;
    top = Math.max(margin, Math.min(top, vh - popH - margin));
    setPos({ top, left });
    pop.focus({ preventScroll: true });
  }, [anchorRect]);

  // Dismiss on Escape (popover) + window blur (sandboxed-iframe outside-click).
  useEffect(() => {
    const onBlur = () => onClose();
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, [onClose]);

  const durMin =
    !ev.allDay && ev.start && ev.end && ev.start.length > 10 && ev.end.length > 10
      ? Math.round((new Date(ev.end).getTime() - new Date(ev.start).getTime()) / 60000)
      : 0;

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!ev.meetingLink) return;
    const url = ev.meetingLink;
    const showCopied = () => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(showCopied).catch(() => fallbackCopy(url, showCopied));
    } else {
      fallbackCopy(url, showCopied);
    }
  };

  const hasAttendees = !!(ev.attendees && ev.attendees.length > 0);
  const hasOrganizerOnly =
    !hasAttendees && !!ev.organizer && !!(ev.organizer.email || ev.organizer.displayName);
  const orgEmail = ev.organizer && ev.organizer.email ? ev.organizer.email.toLowerCase() : null;
  const isOrganiser = (a: { organizer?: boolean; email?: string }) =>
    a.organizer === true || (!!orgEmail && (a.email || '').toLowerCase() === orgEmail);
  const initialsOf = (s: string) =>
    s
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w.charAt(0))
      .join('') || '?';
  const maxShown = 8;
  const popPcHint = participantClassHint(ev);

  return (
    <>
      <div id="popover-backdrop" onClick={onClose} />
      <div
        ref={popRef}
        id="detail-popover"
        tabIndex={-1}
        style={{
          top: pos ? `${pos.top}px` : undefined,
          left: pos ? `${pos.left}px` : undefined,
          visibility: pos ? 'visible' : 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
      >
        <div className="popover-header">
          <div className={`popover-kind-strip ${classClass(ev)}`} />
          <div className="popover-title">{ev.title || '(No title)'}</div>
          <div className={`event-kind-badge ${classClass(ev)}`}>{classLabel(ev)}</div>
          <button className="popover-close" type="button" onClick={onClose} aria-label="Close">
            <Icon name="x" size={14} />
          </button>
        </div>
        <div className="popover-body">
          {/* Time row */}
          <div className="popover-row">
            <span className="popover-row-icon">
              <Icon name="clock" size={13} />
            </span>
            <span className="popover-row-text">
              {ev.allDay ? (
                'All day'
              ) : (
                <>
                  <strong>{fmtTimeRange(ev)}</strong>
                  {durMin > 0 && (
                    <span className="popover-duration-badge">{fmtDuration(durMin)}</span>
                  )}
                </>
              )}
            </span>
          </div>

          {/* Calendar row */}
          {ev.calendarName && (
            <div className="popover-row">
              <span className="popover-row-icon">
                <Icon name="layers" size={13} />
              </span>
              <div className="popover-row-text">
                <span className="popover-cal-badge">{ev.calendarName}</span>
              </div>
            </div>
          )}

          {/* Location row */}
          {ev.location && (
            <div className="popover-row">
              <span className="popover-row-icon">
                <Icon name="location" size={13} />
              </span>
              <span className="popover-row-text">{ev.location}</span>
            </div>
          )}

          {/* Meeting link row */}
          {ev.meetingLink && (
            <div className="popover-row">
              <span className="popover-row-icon">
                <Icon name="globe" size={13} />
              </span>
              <div className="popover-row-text">
                <div className="popover-join-label">Meeting link</div>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}
                >
                  <span className="popover-join-url">{ev.meetingLink}</span>
                  <div
                    className="popover-link-btn"
                    title="Join link"
                    onClick={(e) => {
                      e.stopPropagation();
                      soamView.openExternal(ev.meetingLink as string);
                    }}
                  >
                    <Icon name="globe" size={14} />
                  </div>
                  <div className="popover-link-btn" title="Copy link" onClick={handleCopy}>
                    <Icon name={copied ? 'check-all' : 'copy'} size={14} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Participants */}
          {(hasAttendees || hasOrganizerOnly) && (
            <>
              <div className="popover-divider" />
              <div className="popover-section-label">
                <Icon name="person" size={11} /> Participants
                {popPcHint && <span className="popover-participant-class">{popPcHint}</span>}
              </div>
              <div className="popover-participants">
                {hasAttendees ? (
                  <>
                    {ev.attendees!.slice(0, maxShown).map((a, i) => {
                      const nameStr = a.name || a.email || '?';
                      const resp = responseIcon(a.responseStatus);
                      return (
                        <div className="popover-participant" key={`${a.email || a.name || i}`}>
                          <div className="popover-avatar-wrap">
                            <div className="popover-avatar">{initialsOf(nameStr)}</div>
                            {resp && (
                              <span
                                className={`popover-resp-badge ${resp.cls}`}
                                title={resp.title}
                              >
                                <Icon name={resp.icon} size={8} />
                              </span>
                            )}
                          </div>
                          <div className="popover-participant-name">
                            {a.name || a.email || 'Unknown'}
                          </div>
                          {a.self && <span className="popover-participant-role">you</span>}
                          {isOrganiser(a) && (
                            <span className="popover-participant-role">organiser</span>
                          )}
                        </div>
                      );
                    })}
                    {ev.attendees!.length > maxShown && (
                      <div
                        className="popover-row-text"
                        style={{
                          fontSize: '11px',
                          paddingLeft: '30px',
                          color: 'var(--color-fg-muted)',
                        }}
                      >
                        +{ev.attendees!.length - maxShown} more
                      </div>
                    )}
                  </>
                ) : (
                  <div className="popover-participant">
                    <div className="popover-avatar">
                      {initialsOf(ev.organizer!.displayName || ev.organizer!.email || '?')}
                    </div>
                    <div className="popover-participant-name">
                      {ev.organizer!.displayName || ev.organizer!.email || '?'}
                    </div>
                    <span className="popover-participant-role">organiser</span>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Footer — escape to aux event-detail */}
          <div className="popover-footer">
            <button
              className="popover-side-btn"
              type="button"
              onClick={() => onOpenSidePanel(ev)}
            >
              <Icon name="open-in-window" size={12} />
              Open in side panel
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Main Schedule Component ──────────────────────────────────────────────────

function Schedule() {
  const soamView = useSoamView();
  const qc = useQueryClient();

  // ── calRev dedup refs ──────────────────────────────────────────
  const currentRevRef = useRef(0);
  const lastSeenRevRef = useRef(-1);

  // ── Channel values ─────────────────────────────────────────────
  const scheduleViewState = useViewChannel<ScheduleViewStatePayload>('scheduleViewState');
  const view = scheduleViewState?.view || 'week';
  const calRev = scheduleViewState?.calRev || 0;
  const classFilter = scheduleViewState?.classFilter || null;
  const displaySettings = useViewChannel<{ chipLabelMode?: ChipLabelMode }>(
    'scheduleDisplaySettings',
  );
  const chipLabelMode: ChipLabelMode =
    displaySettings?.chipLabelMode === 'clientName' ? 'clientName' : 'title';
  const auxVisible = useViewChannel<boolean>('auxVisible') ?? false;
  const refreshSettings = useViewChannel<{ mode?: string; intervalMin?: number }>(
    'scheduleRefreshSettings',
  );

  // ── State ──────────────────────────────────────────────────────
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [popover, setPopover] = useState<{ ev: CalendarEvent; rect: DOMRect } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [viewActive, setViewActive] = useState(false);

  // ── Classification state (SD-11) ───────────────────────────────
  const [classMap, setClassMap] = useState<Record<string, ClassEntry>>({});
  const classSeqRef = useRef(0);
  const capsRef = useRef<{
    sessions?: Promise<BoundProxy | null>;
    record?: Promise<BoundProxy | null>;
    cmd?: Promise<BoundProxy>;
  }>({});

  // Refs to track previous calendar visibilities for diffing
  const lastAddedCalIdsRef = useRef<string | undefined>(undefined);
  const lastCalVisibilityRef = useRef<Record<string, boolean> | undefined>(undefined);

  // Track view changes to reset offset/selection
  const lastViewRef = useRef(view);
  useEffect(() => {
    if (lastViewRef.current !== view) {
      lastViewRef.current = view;
      setOffset(0);
      setSelectedId(null);
    }
  }, [view]);

  // ── Apply inbound scheduleViewState (calRev dedup) ─────────────
  useEffect(() => {
    if (calRev === undefined) return;

    if (lastSeenRevRef.current >= 0 && calRev > currentRevRef.current) {
      // External bump
      currentRevRef.current = calRev;
      lastSeenRevRef.current = calRev;
      void qc.invalidateQueries({ queryKey: ['schedule.calendar.query', 'listAddedCalendars'] });
    } else {
      // Own echo or first seed
      currentRevRef.current = calRev;
      if (lastSeenRevRef.current < 0) {
        lastSeenRevRef.current = calRev;
      }
    }
  }, [calRev, qc]);

  // ── Queries ────────────────────────────────────────────────────
  const calsQuery = useCapQuery('schedule.calendar.query', '1.0', 'listAddedCalendars', [], {
    staleTime: 30_000,
  });

  // Cold-load refresh settings (canonical first value; channel pushes live updates).
  const refreshQuery = useCapQuery('schedule.calendar.query', '1.0', 'getRefreshSettings', [], {
    staleTime: 60_000,
  });
  const coldRefresh = refreshQuery.data as { mode?: string; intervalMin?: number } | undefined;
  const refreshMode =
    (refreshSettings?.mode ?? coldRefresh?.mode) === 'auto' ? 'auto' : 'manual';
  const refreshIntervalMin = (() => {
    const v = refreshSettings?.intervalMin ?? coldRefresh?.intervalMin;
    return typeof v === 'number' && v >= 1 ? Math.floor(v) : 15;
  })();

  const cals = useMemo(() => (calsQuery.data as Calendar[]) || [], [calsQuery.data]);
  const addedCalIds = useMemo(() => cals.map((c) => c.id).sort().join(','), [cals]);
  const connected = addedCalIds.length > 0;

  const calVisibility = useMemo(() => {
    const map: Record<string, boolean> = {};
    cals.forEach((c) => {
      map[c.id] = !!c.selected;
    });
    return map;
  }, [cals]);

  // ── Background sync (slice 6) ──────────────────────────────────
  // Fire syncEvents non-blocking; on real changes invalidate the window cache so
  // the view refetches from the updated DB. Auth-failure disconnects bump nav.
  const triggerBackgroundSync = useCallback(async () => {
    if (!capsRef.current.cmd) {
      capsRef.current.cmd = soamView.bindCommand('schedule.calendar', '1.0');
    }
    let cmd: BoundProxy;
    try {
      cmd = await capsRef.current.cmd;
    } catch {
      return;
    }
    try {
      const result = (await cmd.call('syncEvents')) as
        | { upserts?: number; deletions?: number; disconnectedAccounts?: unknown[] }
        | undefined;
      if (!result) return;
      const changed = (result.upserts || 0) > 0 || (result.deletions || 0) > 0;
      if (changed) {
        void qc.invalidateQueries({
          queryKey: ['schedule.calendar.query', 'listWindowEvents'],
        });
      }
      if (result.disconnectedAccounts && result.disconnectedAccounts.length > 0) {
        if (soamView.bumpScheduleData) soamView.bumpScheduleData();
      }
    } catch {
      /* sync failure is non-fatal — cached events remain visible */
    }
  }, [soamView, qc]);

  // ── Diff calendar list updates on calRev change ─────────────────
  useEffect(() => {
    if (!calsQuery.data) return;

    const newIds = addedCalIds;
    const newVisibility = calVisibility;

    const prevIds = lastAddedCalIdsRef.current;
    const prevVisibility = lastCalVisibilityRef.current;

    // Save current values for next diff
    lastAddedCalIdsRef.current = newIds;
    lastCalVisibilityRef.current = newVisibility;

    if (prevIds === undefined) {
      return;
    }

    const addedSetChanged = newIds !== prevIds;
    let visibilityChanged = addedSetChanged;
    if (!visibilityChanged && prevVisibility) {
      const oldKeys = Object.keys(prevVisibility).sort();
      const newKeys = Object.keys(newVisibility).sort();
      if (oldKeys.length !== newKeys.length) {
        visibilityChanged = true;
      } else {
        for (let i = 0; i < oldKeys.length; i++) {
          if (prevVisibility[oldKeys[i]] !== newVisibility[oldKeys[i]]) {
            visibilityChanged = true;
            break;
          }
        }
      }
    }

    if (addedSetChanged) {
      // Added/removed a calendar — window cache no longer covers the new set.
      // Invalidate to refetch, and sync so the new calendar's events populate.
      void qc.invalidateQueries({ queryKey: ['schedule.calendar.query', 'listWindowEvents'] });
      void triggerBackgroundSync();
    } else if (visibilityChanged) {
      // Visibility only: client-side re-render (events recompute via calVisibility).
    } else {
      // Metadata change (calendar color/name baked onto cached events) → refetch.
      void qc.invalidateQueries({ queryKey: ['schedule.calendar.query', 'listWindowEvents'] });
    }
  }, [calsQuery.data, addedCalIds, calVisibility, qc, triggerBackgroundSync]);

  // ── Compute 6-week month-grid window ───────────────────────────
  const win = useMemo(() => fetchWindow(view, offset), [view, offset]);

  // ── Events query ───────────────────────────────────────────────
  const eventsQuery = useCapQuery(
    'schedule.calendar.query',
    '1.0',
    'listWindowEvents',
    [win.fromISO, win.toISO],
    {
      staleTime: 5 * 60 * 1000,
      enabled: connected,
    }
  );

  const rawEvents = useMemo(() => (eventsQuery.data as CalendarEvent[]) || [], [eventsQuery.data]);

  // Merge the async classification map into fresh event copies (never mutate cache).
  const events = useMemo(() => {
    return rawEvents.map((ev) => {
      const c = classMap[ev.id];
      return {
        ...ev,
        classification: c?.classification ?? 'unclassified',
        _match: c?._match ?? null,
        _clientLabel: c?._clientLabel,
      };
    });
  }, [rawEvents, classMap]);

  // ── Classification pass (cross-bundle, async, stale-guarded) ────
  // Re-runs when the window events change (new fetch) or an external calRev bump
  // signals a roster/triage change. Caps are bound lazily and may be absent —
  // events then stay unclassified (fails-closed). Mirrors vanilla runClassifyPass.
  useEffect(() => {
    // No events → nothing to classify; stale classMap is harmless (events=[] anyway).
    if (!connected || rawEvents.length === 0) return;
    const seq = ++classSeqRef.current;
    let cancelled = false;
    void (async () => {
      if (!capsRef.current.sessions) {
        capsRef.current.sessions = soamView
          .bindQuery('sessions.meeting.query', '1.0')
          .catch(() => null);
      }
      if (!capsRef.current.record) {
        capsRef.current.record = soamView
          .bindQuery('record.patient.query', '1.0')
          .catch(() => null);
      }
      const [sessionsQuery, recordQuery] = await Promise.all([
        capsRef.current.sessions,
        capsRef.current.record,
      ]);
      if (cancelled || seq !== classSeqRef.current) return;
      if (!sessionsQuery || !recordQuery) return; // classify caps unavailable — stay unclassified
      const result = await runClassifyPass(rawEvents, win, sessionsQuery, recordQuery);
      if (cancelled || seq !== classSeqRef.current) return;
      setClassMap(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [rawEvents, calRev, connected, soamView, win]);

  // ── Set tab description ────────────────────────────────────────
  const range = useMemo(() => rangeForView(view, offset), [view, offset]);
  useEffect(() => {
    if (!soamView || !soamView.setTabDescription) return;
    const tabDesc =
      view === 'agenda'
        ? (offset === 0
          ? 'Next 7 days'
          : `${range.from.getDate()} ${MONTH_NAMES_SHORT[range.from.getMonth()]}`)
        : view === 'week'
        ? `Wk of ${MONTH_NAMES_SHORT[range.from.getMonth()]} ${range.from.getDate()}`
        : view === 'day'
        ? `${range.from.getDate()} ${MONTH_NAMES_SHORT[range.from.getMonth()]}`
        : `${MONTH_NAMES_SHORT[range.from.getMonth()]} ${range.from.getFullYear()}`;
    soamView.setTabDescription(tabDesc);
  }, [view, offset, range.from, soamView]);

  // ── Publish counts ─────────────────────────────────────────────
  useEffect(() => {
    if (!soamView || !soamView.setScheduleCounts) return;
    const counts: Record<string, number> = {
      client_session: 0,
      not_client_session: 0,
      personal: 0,
      unclassified: 0,
    };
    const fromMs = range.from.getTime();
    const toMs = range.to.getTime();

    events.forEach((ev) => {
      if (calVisibility[ev.calendarId] === false) return;
      if (!ev.start) return;
      const evMs = new Date(ev.start).getTime();
      if (evMs < fromMs || evMs >= toMs) return;

      const c = ev.classification || 'unclassified';
      if (counts[c] !== undefined) {
        counts[c]++;
      } else {
        counts['unclassified']++;
      }
    });
    soamView.setScheduleCounts(counts);
  }, [events, range.from, range.to, calVisibility, soamView]);

  // ── Event-click hybrid (aux-open → side panel; aux-closed → popover) ──
  const handleEventClick = useCallback(
    (ev: CalendarEvent, e: React.MouseEvent) => {
      e.stopPropagation();
      setSelectedId(ev.id);
      if (auxVisible) {
        soamView.setActiveEvent(ev);
      } else {
        setPopover({ ev, rect: e.currentTarget.getBoundingClientRect() });
      }
    },
    [auxVisible, soamView],
  );

  const closePopover = useCallback(() => {
    setPopover(null);
    setSelectedId(null);
  }, []);

  // When the aux sidebar is open it owns the detail role — hide the popover
  // (derived during render; no effect/setState needed).
  const showPopover = popover !== null && !auxVisible;

  // ── Handlers ───────────────────────────────────────────────────
  function handlePrev() {
    setOffset((prev) => prev - 1);
  }

  // Auto-connect and load data on activation + background sync; track view-active
  // state so the auto-poller only runs while the tab is foregrounded.
  useEffect(() => {
    if (!soamView) return;
    const a = soamView.events.onActivate(() => {
      setViewActive(true);
      void qc.invalidateQueries({ queryKey: ['schedule.calendar.query'] });
      void triggerBackgroundSync();
    });
    const d = soamView.events.onDeactivate(() => {
      setViewActive(false);
    });
    return () => {
      a.dispose();
      d.dispose();
    };
  }, [soamView, qc, triggerBackgroundSync]);

  // Auto-refresh poller — only while view active and mode is 'auto'.
  useEffect(() => {
    if (!viewActive || refreshMode !== 'auto') return;
    const id = window.setInterval(() => {
      void triggerBackgroundSync();
    }, refreshIntervalMin * 60000);
    return () => window.clearInterval(id);
  }, [viewActive, refreshMode, refreshIntervalMin, triggerBackgroundSync]);

  function handleNext() {
    setOffset((prev) => prev + 1);
  }

  function handleToday() {
    setOffset(0);
  }

  // Manual refresh — spin while a sync is in flight (min one rotation, no flicker).
  const handleManualRefresh = useCallback(() => {
    if (refreshing) return;
    setRefreshing(true);
    const started = Date.now();
    void Promise.resolve(triggerBackgroundSync()).then(() => {
      const elapsed = Date.now() - started;
      window.setTimeout(() => setRefreshing(false), Math.max(0, 700 - elapsed));
    });
  }, [refreshing, triggerBackgroundSync]);

  function handleViewChange(newView: string) {
    if (newView === view) return;
    soamView.setScheduleViewState({
      view: newView,
      calRev: currentRevRef.current,
      classFilter: classFilter,
    });
  }

  function handleConnect() {
    soamView.openInEditor('calendar-setup', {
      query: 'mode=add',
      title: 'Add calendar',
      entityId: 'calendar-setup',
    });
  }

  // Retrying the queries on failure
  function handleRetry() {
    void qc.invalidateQueries({ queryKey: ['schedule.calendar.query'] });
  }

  // ── Render Area ────────────────────────────────────────────────
  const loadError =
    (calsQuery.error ? (calsQuery.error.message || String(calsQuery.error)) : null) ||
    (eventsQuery.error ? (eventsQuery.error.message || String(eventsQuery.error)) : null);

  const renderContent = () => {
    if (!calsQuery.isLoading && !connected) {
      return (
        <div className="state-panel">
          <div className="state-icon">
            <Icon name="calendar" size={20} />
          </div>
          <div className="state-title">Connect your calendar</div>
          <div className="state-desc">
            Link Google Calendar to see your schedule. Your credential never leaves this device.
          </div>
          <button className="btn btn-accent" type="button" onClick={handleConnect}>
            Connect Google Calendar
          </button>
        </div>
      );
    }

    if (loadError) {
      return (
        <div className="state-panel">
          <div className="state-icon">
            <Icon name="warning" size={20} />
          </div>
          <div className="state-title">Failed to load events</div>
          <div className="state-error-msg">{loadError}</div>
          <button className="btn btn-ghost" type="button" onClick={handleRetry}>
            Retry
          </button>
        </div>
      );
    }

    if (calsQuery.isLoading || (eventsQuery.isLoading && connected)) {
      return (
        <div className="loading-row">
          <span className="spinner"></span> Loading events…
        </div>
      );
    }

    switch (view) {
      case 'agenda':
        return (
          <AgendaView
            range={range}
            events={events}
            calVisibility={calVisibility}
            classFilter={classFilter}
            chipLabelMode={chipLabelMode}
            selectedId={selectedId}
            onEventClick={handleEventClick}
          />
        );
      case 'day':
        return (
          <DayView
            range={range}
            events={events}
            calVisibility={calVisibility}
            classFilter={classFilter}
            chipLabelMode={chipLabelMode}
            selectedId={selectedId}
            onEventClick={handleEventClick}
          />
        );
      case 'week':
        return (
          <WeekView
            range={range}
            events={events}
            calVisibility={calVisibility}
            classFilter={classFilter}
            chipLabelMode={chipLabelMode}
            selectedId={selectedId}
            onEventClick={handleEventClick}
          />
        );
      case 'month':
        return (
          <MonthView
            range={range}
            events={events}
            calVisibility={calVisibility}
            classFilter={classFilter}
            chipLabelMode={chipLabelMode}
            selectedId={selectedId}
            onEventClick={handleEventClick}
          />
        );
      default:
        return null;
    }
  };

  return (
    <>
      {/* Work header */}
      <div className="work-header">
        <div className="date-nav">
          <button
            className="nav-btn"
            title="Previous"
            type="button"
            onClick={handlePrev}
          >
            ‹
          </button>
          <button
            className="btn-today"
            type="button"
            onClick={handleToday}
          >
            Today
          </button>
          <button
            className="nav-btn"
            title="Next"
            type="button"
            onClick={handleNext}
          >
            ›
          </button>
        </div>
        <span className="range-label">{range.label}</span>
        <div className="phi-chip" title="PHI Safety Score — high (read-only provider, no cloud sync)">
          <span className="phi-chip-dot"></span>High PHI safety
        </div>
        <span className="header-divider" aria-hidden="true"></span>
        <div className="view-switcher">
          {(['agenda', 'day', 'week', 'month'] as const).map((v) => (
            <button
              key={v}
              className={`view-tab${view === v ? ' is-active' : ''}`}
              type="button"
              onClick={() => handleViewChange(v)}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
        <span className="header-divider" aria-hidden="true"></span>
        <button
          className={`btn-refresh${refreshing ? ' spinning' : ''}`}
          type="button"
          title="Refresh calendar"
          aria-label="Refresh calendar"
          onClick={handleManualRefresh}
        >
          <Icon name="refresh" size={15} />
        </button>
        <span className="header-divider" aria-hidden="true"></span>
      </div>

      {/* Dynamic calendar area */}
      <div id="cal-area">{renderContent()}</div>

      {/* Event detail popover (aux-closed path) */}
      {showPopover && popover && (
        <EventPopover
          ev={popover.ev}
          anchorRect={popover.rect}
          onClose={closePopover}
          onOpenSidePanel={(ev) => {
            soamView.setActiveEvent(ev);
            closePopover();
          }}
        />
      )}
    </>
  );
}

// ── Entry ─────────────────────────────────────────────────────────────────────

const rootEl = document.getElementById('root');
if (rootEl == null) throw new Error('[schedule] missing #root element');

createRoot(rootEl).render(
  <ViewRoot>
    <Schedule />
  </ViewRoot>,
);
