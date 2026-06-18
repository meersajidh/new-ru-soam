/**
 * Google Calendar adapter — FP-Host-resident domain logic.
 *
 * Holds the Google descriptor as data and the listEvents response→CalendarEvent mapping.
 * All credential/egress operations are brokered through Main via:
 *   - credential.broker@1.0  (status, grant, revoke)
 *   - net.brokeredFetch@1.0  (authenticated outbound calls to GCAL_API_BASE)
 *
 * Moved verbatim from electron/main/calendar/google-adapter.ts (P0 deviation corrected
 * per ADR-507 §10 / ADR-506 Am1.1 — F1 provider-residency refactor).
 *
 * PHI note: event titles, organizer, attendees may carry PHI.
 * They ride the existing phi:true lock-gated cap path — no new trust crossing.
 */

// ── Google provider descriptor (data, not code) ──────────────────────────────

export const GOOGLE_DESCRIPTOR = {
  provider: 'google-calendar',
  authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  revokeUrl: 'https://oauth2.googleapis.com/revoke',
  scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
};

const GCAL_API_BASE = 'https://www.googleapis.com/calendar/v3';

// ── Adapter factory ───────────────────────────────────────────────────────────

/**
 * Create a Google Calendar adapter bound to the provided Main caps.
 *
 * @param {object} broker  - Bound credential.broker@1.0 capability handle
 * @param {object} netFetch - Bound net.brokeredFetch@1.0 capability handle
 */
export function createGoogleCalendarAdapter(broker, netFetch) {
  const { provider, authUrl, tokenUrl, scopes, revokeUrl } = GOOGLE_DESCRIPTOR;

  async function getStatus() {
    const result = await broker.call('status', [{ provider }]);
    return { connected: !!(result && result.connected), providerName: 'Google Calendar' };
  }

  async function connect() {
    return broker.call('grant', [{ provider, authUrl, tokenUrl, scopes, revokeUrl }]);
  }

  async function disconnect() {
    await broker.call('revoke', [{ provider, revokeUrl }]);
    return null;
  }

  async function listEvents(from, to) {
    if (typeof from !== 'string' || typeof to !== 'string') {
      throw Object.assign(
        new Error('schedule.calendar.listEvents: from and to must be ISO date strings'),
        { code: 'cap.handler_threw' },
      );
    }

    const params = new URLSearchParams({
      timeMin: new Date(from).toISOString(),
      timeMax: new Date(to).toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250',
    });

    const resp = await netFetch.call('fetch', [
      {
        provider,
        url: `${GCAL_API_BASE}/calendars/primary/events?${params}`,
        method: 'GET',
      },
    ]);

    if (!resp.ok) {
      throw new Error(`Google Calendar API error: ${resp.status}`);
    }

    const data = resp.body;
    const calendarName = (data && data.summary) ? data.summary : 'Calendar';

    return (data && data.items ? data.items : []).map((item) => {
      const startRaw = (item.start && (item.start.dateTime || item.start.date)) || '';
      const endRaw   = (item.end   && (item.end.dateTime   || item.end.date))   || '';
      const allDay   = !(item.start && item.start.dateTime);

      // Resolve meeting link: hangoutLink (simpler, legacy) preferred;
      // fall back to first 'video' conferenceData entry point.
      let meetingLink;
      if (item.hangoutLink) {
        meetingLink = item.hangoutLink;
      } else if (
        item.conferenceData &&
        item.conferenceData.entryPoints
      ) {
        const videoEntry = item.conferenceData.entryPoints.find(
          (ep) => ep.entryPointType === 'video',
        );
        if (videoEntry && videoEntry.uri) meetingLink = videoEntry.uri;
      }

      // Organizer — omit if both name and email absent.
      let organizer;
      if (item.organizer && (item.organizer.displayName || item.organizer.email)) {
        organizer = {};
        if (item.organizer.displayName !== undefined) organizer.name  = item.organizer.displayName;
        if (item.organizer.email       !== undefined) organizer.email = item.organizer.email;
      }

      // Attendees — omit empty arrays.
      let attendees;
      if (item.attendees && item.attendees.length > 0) {
        attendees = item.attendees.map((a) => {
          const att = {};
          if (a.displayName    !== undefined) att.name           = a.displayName;
          if (a.email          !== undefined) att.email          = a.email;
          if (a.responseStatus !== undefined) att.responseStatus = a.responseStatus;
          if (a.organizer      !== undefined) att.organizer      = a.organizer;
          if (a.self           !== undefined) att.self           = a.self;
          return att;
        });
      }

      const event = {
        id: item.id,
        title: item.summary || '(No title)',
        start: startRaw,
        end: endRaw,
        allDay,
        calendarId: 'primary',
        calendarName,
      };

      if (item.location) event.location  = item.location;
      if (meetingLink)   event.meetingLink = meetingLink;
      if (organizer)     event.organizer  = organizer;
      if (attendees)     event.attendees  = attendees;

      return event;
    });
  }

  return { getStatus, connect, disconnect, listEvents };
}
