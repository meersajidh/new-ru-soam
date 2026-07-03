export interface AttendeeEntry {
  email?: string;
  name?: string;
  self?: boolean;
  organizer?: boolean;
  responseStatus?: string;
}

export interface EventMatch {
  matchClientId?: string | null;
  matchClientIds?: string[];
  candidates?: unknown[];
  linkedMeetingId?: string | null;
  source?: string;
}

export interface CalendarEvent {
  id: string;
  providerEventId?: string;
  externalAccountId?: string;
  providerCalendarId?: string;
  calendarId: string;
  title?: string;
  start?: string;
  end?: string;
  allDay?: boolean;
  location?: string;
  meetingLink?: string;
  meetingProvider?: string;
  attendees?: AttendeeEntry[];
  organizer?: { email?: string; displayName?: string; self?: boolean };
  calendarName?: string;
  calendarColor?: string;
  classification?: string;
  _match?: EventMatch | null;
  _clientLabel?: string;
}

export const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAY_NAMES_FULL = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
export const MONTH_NAMES_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(d.getDate() + n);
  return r;
}

export function startOfWeek(d: Date): Date {
  // Monday-anchored
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setDate(d.getDate() + diff);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

export function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

export function isToday(d: Date): boolean {
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function fmtTime(isoStr?: string): string {
  if (!isoStr || isoStr.length <= 10) return 'All day';
  try {
    return new Date(isoStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return isoStr;
  }
}

export function fmtTimeRange(ev: CalendarEvent): string {
  if (ev.allDay) return 'All day';
  return fmtTime(ev.start) + ' – ' + fmtTime(ev.end);
}

export function evDate(isoStr?: string, allDay?: boolean): Date {
  if (!isoStr) return new Date(NaN);
  if (allDay) return new Date(isoStr + 'T00:00:00');
  return new Date(isoStr);
}

export function minOfDay(isoStr?: string): number {
  if (!isoStr) return 0;
  const d = new Date(isoStr);
  return d.getHours() * 60 + d.getMinutes();
}

export function fmtDuration(minutes: number): string {
  if (minutes <= 0) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h} hr ${m} min`;
  if (h > 0) return h === 1 ? '1 hr' : `${h} hr`;
  return `${m} min`;
}

export const CLS_CLASS: Record<string, string> = {
  client_session: 'cls-client',
  not_client_session: 'cls-not',
  personal: 'cls-personal',
  unclassified: 'cls-unclassified',
};

export function classClass(ev?: CalendarEvent): string {
  const c = (ev && ev.classification) || 'unclassified';
  return CLS_CLASS[c] || 'cls-unclassified';
}

export const CLS_LABEL: Record<string, string> = {
  client_session: 'CLIENT',
  not_client_session: 'EXCLUDED',
  personal: 'PERSONAL',
  unclassified: 'UNCLASSIFIED',
};

export function classLabel(ev?: CalendarEvent): string {
  const c = (ev && ev.classification) || 'unclassified';
  return CLS_LABEL[c] || 'UNCLASSIFIED';
}

/** Chip label preference: raw event title (default) vs resolved client name. */
export type ChipLabelMode = 'title' | 'clientName';

/** Map an attendee responseStatus to an icon badge (name + color class + tooltip). */
export function responseIcon(
  status: string | undefined,
): { icon: string; cls: string; title: string } | null {
  switch (status) {
    case 'accepted':
      return { icon: 'thumbsup', cls: 'resp-yes', title: 'Accepted' };
    case 'declined':
      return { icon: 'thumbsdown', cls: 'resp-no', title: 'Declined' };
    case 'tentative':
      return { icon: 'question', cls: 'resp-maybe', title: 'Tentative' };
    case 'needsAction':
      return { icon: 'question', cls: 'resp-none', title: 'No response' };
    default:
      return null;
  }
}

export function eventDisplayTitle(ev: CalendarEvent, mode: ChipLabelMode = 'title'): string {
  if (mode === 'clientName' && ev.classification === 'client_session' && ev._clientLabel) {
    return ev._clientLabel;
  }
  return ev.title || '(No title)';
}

/**
 * True when the event should render struck-through: the organizer has declined,
 * or every attendee has declined. Requires attendee response data.
 */
export function isEventDeclined(ev: CalendarEvent): boolean {
  const atts = ev.attendees;
  if (!atts || atts.length === 0) return false;
  const organiserEmail = ev.organizer?.email?.toLowerCase() || null;
  const organiserAtt = atts.find(
    (a) => a.organizer === true || (organiserEmail && (a.email || '').toLowerCase() === organiserEmail),
  );
  if (organiserAtt && organiserAtt.responseStatus === 'declined') return true;
  return atts.every((a) => a.responseStatus === 'declined');
}

export function modalitySubline(ev: CalendarEvent): string {
  let modality = '';
  if (ev.meetingLink) {
    const provName = ev.meetingProvider || '';
    modality = provName ? `Online · ${provName}` : 'Online · Video call';
  } else if (ev.location) {
    modality = `In person · ${ev.location}`;
  }
  const hint = participantClassHint(ev);
  if (!modality && !hint) return '';
  if (!hint) return modality;
  if (!modality) return hint;
  return `${modality} · ${hint}`;
}

export function participantClassHint(ev: CalendarEvent): string {
  if (!ev.attendees || ev.attendees.length === 0) return '';
  const active = ev.attendees.filter((a) => a.responseStatus !== 'declined');
  const others = active.filter((a) => !a.self);
  const otherCount = others.length;
  if (otherCount === 0) return '';
  const hasSelf = active.some((a) => a.self);
  const total = otherCount + (hasSelf ? 1 : 0);
  const noun = total === 1 ? 'participant' : 'participants';
  if (otherCount === 1) return `${total} ${noun}`;
  return `Group · ${total} ${noun}`;
}

export function fmtTimeShort(ev: CalendarEvent): string {
  if (ev.allDay || !ev.start || ev.start.length <= 10) return 'All day';
  function fmt(iso: string) {
    const d = new Date(iso);
    const h = d.getHours();
    const m = d.getMinutes();
    return h + (m ? `:${m < 10 ? '0' + m : m}` : '');
  }
  const s = fmt(ev.start);
  const e = ev.end ? fmt(ev.end) : '';
  return e ? `${s}–${e}` : s;
}

export function getEventParticipantLabel(ev: CalendarEvent): string | null {
  if (!ev.attendees || ev.attendees.length === 0) return null;
  const nonSelf = ev.attendees.filter((a) => !a.self);
  if (nonSelf.length === 0) return null;

  const organiserEmail = ev.organizer?.email?.toLowerCase() || null;
  const organiserAttendee = nonSelf.find((a) => {
    return (
      a.organizer === true ||
      (organiserEmail && (a.email || '').toLowerCase() === organiserEmail)
    );
  });
  const primary = organiserAttendee || nonSelf[0];
  const nameStr = primary.name || primary.email || '';
  if (!nameStr) return null;

  const extra = nonSelf.length - 1;
  let chipLabel = extra > 0 ? `${nameStr} +${extra}` : nameStr;
  const pcHint = participantClassHint(ev);
  if (pcHint) {
    chipLabel = `${chipLabel} · ${pcHint}`;
  }
  return chipLabel;
}

export interface FetchWindowResult {
  from: Date;
  to: Date;
  fromISO: string;
  toISO: string;
  key: string;
}

export function fetchWindow(view: string, offset: number): FetchWindowResult {
  const base = new Date();
  let anchor: Date;
  if (view === 'month') {
    anchor = new Date(base);
    anchor.setMonth(anchor.getMonth() + offset);
  } else if (view === 'day') {
    anchor = new Date(base);
    anchor.setDate(anchor.getDate() + offset);
  } else {
    // week / agenda
    anchor = new Date(base);
    anchor.setDate(anchor.getDate() + offset * 7);
  }

  const winFrom = startOfWeek(startOfMonth(anchor));
  const winTo = addDays(startOfWeek(endOfMonth(anchor)), 7);
  const fromISO = winFrom.toISOString();
  const toISO = winTo.toISOString();
  return {
    from: winFrom,
    to: winTo,
    fromISO,
    toISO,
    key: `${fromISO}|${toISO}`,
  };
}

export interface RangeForViewResult {
  from: Date;
  to: Date;
  label: string;
}

export function rangeForView(view: string, offset: number): RangeForViewResult {
  const base = new Date();
  let from: Date;
  let to: Date;
  let label: string;

  if (view === 'agenda') {
    from = startOfDay(new Date());
    from = addDays(from, offset * 7);
    to = addDays(from, 7);
    const toInc = addDays(to, -1);
    if (offset === 0) {
      label = 'Next 7 days';
    } else if (
      from.getMonth() === toInc.getMonth() &&
      from.getFullYear() === toInc.getFullYear()
    ) {
      label = `${from.getDate()} – ${toInc.getDate()} ${MONTH_NAMES[from.getMonth()]} ${from.getFullYear()}`;
    } else if (from.getFullYear() === toInc.getFullYear()) {
      label = `${from.getDate()} ${MONTH_NAMES_SHORT[from.getMonth()]} – ${toInc.getDate()} ${MONTH_NAMES_SHORT[toInc.getMonth()]} ${from.getFullYear()}`;
    } else {
      label = `${from.getDate()} ${MONTH_NAMES_SHORT[from.getMonth()]} ${from.getFullYear()} – ${toInc.getDate()} ${MONTH_NAMES_SHORT[toInc.getMonth()]} ${toInc.getFullYear()}`;
    }
  } else if (view === 'week') {
    base.setDate(base.getDate() + offset * 7);
    from = startOfWeek(base);
    to = addDays(from, 7);
    const toInc = addDays(to, -1);
    if (
      from.getMonth() === toInc.getMonth() &&
      from.getFullYear() === toInc.getFullYear()
    ) {
      label = `${from.getDate()} – ${toInc.getDate()} ${MONTH_NAMES[from.getMonth()]} ${from.getFullYear()}`;
    } else if (from.getFullYear() === toInc.getFullYear()) {
      label = `${from.getDate()} ${MONTH_NAMES_SHORT[from.getMonth()]} – ${toInc.getDate()} ${MONTH_NAMES_SHORT[toInc.getMonth()]} ${from.getFullYear()}`;
    } else {
      label = `${from.getDate()} ${MONTH_NAMES_SHORT[from.getMonth()]} ${from.getFullYear()} – ${toInc.getDate()} ${MONTH_NAMES_SHORT[toInc.getMonth()]} ${toInc.getFullYear()}`;
    }
  } else if (view === 'day') {
    base.setDate(base.getDate() + offset);
    from = startOfDay(base);
    to = addDays(from, 1);
    label = `${DAY_NAMES_FULL[from.getDay()]}, ${from.getDate()} ${MONTH_NAMES[from.getMonth()]}`;
  } else {
    // month
    base.setMonth(base.getMonth() + offset);
    from = startOfMonth(base);
    to = new Date(endOfMonth(base).getTime() + 1);
    label = `${MONTH_NAMES[from.getMonth()]} ${from.getFullYear()}`;
  }

  return { from, to, label };
}

export function getEventsForDay(
  d: Date,
  events: CalendarEvent[],
  calVisibility: Record<string, boolean>,
  classFilter: string | null
): CalendarEvent[] {
  return events
    .filter((ev) => {
      const evD = evDate(ev.start, ev.allDay);
      const isCalVisible = calVisibility[ev.calendarId] !== false;
      const isClassVisible = !classFilter || (ev.classification || 'unclassified') === classFilter;
      return sameDay(evD, d) && isCalVisible && isClassVisible;
    })
    .sort((a, b) => {
      if (a.allDay && !b.allDay) return -1;
      if (!a.allDay && b.allDay) return 1;
      return new Date(a.start || 0).getTime() - new Date(b.start || 0).getTime();
    });
}

export interface PackedLaneEvent {
  ev: CalendarEvent;
  lane: number;
  totalLanes: number;
}

export function packLanes(timedEvs: CalendarEvent[]): PackedLaneEvent[] {
  // Sort by start time.
  const sorted = timedEvs.slice().sort((a, b) => {
    return new Date(a.start || 0).getTime() - new Date(b.start || 0).getTime();
  });
  
  // Each group = set of mutually-overlapping events.
  const result: { ev: CalendarEvent; groupIdx: number; lane: number; endMin: number }[] = [];
  interface Group {
    maxEnd: number;
    lanes: { endMin: number }[];
  }
  const groups: Group[] = []; // [{maxEnd, lanes: [{endMin}]}]

  sorted.forEach((ev) => {
    const startMin = minOfDay(ev.start);
    let endMin = ev.end ? minOfDay(ev.end) : startMin + 60;
    if (endMin <= startMin) endMin = startMin + 30;

    // Find a group where this event overlaps with at least one existing event.
    let placed = false;
    for (let gi = 0; gi < groups.length; gi++) {
      const grp = groups[gi];
      // Overlaps group if startMin < group's latest end.
      if (startMin < grp.maxEnd) {
        // Find a free lane within this group.
        let laneIdx = -1;
        for (let li = 0; li < grp.lanes.length; li++) {
          if (grp.lanes[li].endMin <= startMin) {
            laneIdx = li;
            break;
          }
        }
        if (laneIdx === -1) {
          laneIdx = grp.lanes.length;
          grp.lanes.push({ endMin });
        } else {
          grp.lanes[laneIdx].endMin = endMin;
        }
        grp.maxEnd = Math.max(grp.maxEnd, endMin);
        result.push({ ev, groupIdx: gi, lane: laneIdx, endMin });
        placed = true;
        break;
      }
    }
    if (!placed) {
      groups.push({ maxEnd: endMin, lanes: [{ endMin }] });
      result.push({ ev, groupIdx: groups.length - 1, lane: 0, endMin });
    }
  });

  // Second pass: annotate totalLanes per group.
  return result.map((item) => {
    return {
      ev: item.ev,
      lane: item.lane,
      totalLanes: groups[item.groupIdx].lanes.length,
    };
  });
}

