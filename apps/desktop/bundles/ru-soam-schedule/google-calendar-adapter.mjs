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
 *
 * Slice 2 (O494): account-aware port methods added (authenticate, getAccountStatus,
 * disconnectAccount, listCalendars, listEventsForCalendars). Legacy methods unchanged.
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

// ── Shared event mapper (extract for reuse between listEvents and listEventsForCalendars) ──

/**
 * Returns true if the organizer email is a Google Calendar resource address
 * (secondary/shared/holiday calendars) rather than a real person's email.
 * Resource emails: <hash>@group.calendar.google.com or contain '#' (e.g. holiday feeds).
 */
function isResourceOrganizer(email) {
  return typeof email === 'string' && (
    /@group(\.v)?\.calendar\.google\.com$/i.test(email) ||
    email.indexOf('#') !== -1
  );
}

/**
 * Map a single Google Calendar API event item to a CalendarEvent shape.
 *
 * @param {object} item               - Raw Google API event item
 * @param {string} calendarId         - Provider-level calendar id (passed through; remapped to
 *                                      local handle by the caller for account-aware fetches)
 * @param {string} calendarName       - Display name of the calendar (for old compat field)
 */
function mapEvent(item, calendarId, calendarName) {
  const startRaw = (item.start && (item.start.dateTime || item.start.date)) || '';
  const endRaw   = (item.end   && (item.end.dateTime   || item.end.date))   || '';
  const allDay   = !(item.start && item.start.dateTime);

  // Resolve meeting link: hangoutLink preferred; fall back to first 'video' conferenceData entry.
  let meetingLink;
  if (item.hangoutLink) {
    meetingLink = item.hangoutLink;
  } else if (item.conferenceData && item.conferenceData.entryPoints) {
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
    if (item.organizer.self        !== undefined) organizer.self  = item.organizer.self;
    // Resource organizer fix: secondary/holiday calendars use a resource email
    // (e.g. <hash>@group.calendar.google.com, en.indian#holiday@group.v.calendar.google.com).
    // Replace with the calendar's human name; drop the resource email so UI never shows a hash.
    if (organizer.email && isResourceOrganizer(organizer.email)) {
      organizer.name = calendarName;
      delete organizer.email;
    }
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
    calendarId,
    calendarName,
  };

  if (item.location) event.location   = item.location;
  if (meetingLink)   event.meetingLink = meetingLink;
  if (organizer)     event.organizer   = organizer;
  if (attendees)     event.attendees   = attendees;

  return event;
}

// ── Adapter factory ───────────────────────────────────────────────────────────

/**
 * Create a Google Calendar adapter bound to the provided Main caps.
 *
 * @param {object} broker   - Bound credential.broker@1.0 capability handle
 * @param {object} netFetch - Bound net.brokeredFetch@1.0 capability handle
 */
export function createGoogleCalendarAdapter(broker, netFetch) {
  const { provider, authUrl, tokenUrl, scopes, revokeUrl } = GOOGLE_DESCRIPTOR;

  // ── P0 legacy methods (unchanged; kept for backward compat) ─────────────────

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

  /**
   * P0 primary-calendar list (unchanged signature/behavior).
   * Refactored internally to use shared mapEvent helper.
   */
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

    return (data && data.items ? data.items : []).map((item) =>
      mapEvent(item, 'primary', calendarName),
    );
  }

  // ── Slice 2: account-aware port methods ─────────────────────────────────────

  /**
   * Initiate OAuth flow for a new or returning account.
   * Returns broker result verbatim: { ok, account?, error? }
   * account = { externalId, email, displayName } — NO tokens.
   */
  async function authenticate() {
    return broker.call('grant', [{ provider, authUrl, tokenUrl, scopes, revokeUrl }]);
  }

  /**
   * Check connection state for a specific external account id.
   * Returns { connected: boolean }.
   */
  async function getAccountStatus(externalAccountId) {
    return broker.call('status', [{ provider, accountId: externalAccountId }]);
  }

  /**
   * Revoke the OAuth grant for a specific external account id.
   */
  async function disconnectAccount(externalAccountId) {
    return broker.call('revoke', [{ provider, accountId: externalAccountId, revokeUrl }]);
  }

  /**
   * Fetch all calendars for an account from the Google calendarList endpoint.
   * Returns array of { providerCalendarId, name, isPrimary, readOnly }.
   */
  async function listCalendars(externalAccountId) {
    const resp = await netFetch.call('fetch', [
      {
        provider,
        accountId: externalAccountId,
        url: `${GCAL_API_BASE}/users/me/calendarList`,
        method: 'GET',
      },
    ]);

    if (!resp.ok) {
      throw new Error(`Google Calendar API error (calendarList): ${resp.status}`);
    }

    const data = resp.body;
    return (data && data.items ? data.items : []).map((item) => ({
      providerCalendarId: item.id,
      name:       item.summary,
      isPrimary:  !!item.primary,
      readOnly:   item.accessRole === 'reader' || item.accessRole === 'freeBusyReader',
    }));
  }

  /**
   * Fetch events across multiple provider calendars for an account.
   * Returns one flat array. A single calendar failing is tolerated (skipped).
   * Each event's calendarId is set to the provider-level id; callers remap to
   * local cal_<uuid> handle and attach color.
   *
   * @param {string}   externalAccountId   - Google account id (broker key)
   * @param {string[]} providerCalendarIds - Array of provider calendar ids to fetch
   * @param {string}   from                - ISO date string
   * @param {string}   to                  - ISO date string
   */
  async function listEventsForCalendars(externalAccountId, providerCalendarIds, from, to) {
    if (typeof from !== 'string' || typeof to !== 'string') {
      throw Object.assign(
        new Error('listEventsForCalendars: from and to must be ISO date strings'),
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

    const results = [];

    for (const providerCalendarId of providerCalendarIds) {
      try {
        const url =
          `${GCAL_API_BASE}/calendars/${encodeURIComponent(providerCalendarId)}/events?${params}`;

        const resp = await netFetch.call('fetch', [
          {
            provider,
            accountId: externalAccountId,
            url,
            method: 'GET',
          },
        ]);

        if (!resp.ok) {
          // Single calendar failed — skip, continue.
          continue;
        }

        const data = resp.body;
        const calendarName = (data && data.summary) ? data.summary : providerCalendarId;

        const items = data && data.items ? data.items : [];
        for (const item of items) {
          // calendarId = provider-level id; caller remaps to local handle + attaches color.
          results.push(mapEvent(item, providerCalendarId, calendarName));
        }
      } catch (_err) {
        // Tolerate single calendar failure.
        continue;
      }
    }

    return results;
  }

  // ── Slice 6: syncEvents (ADR-507 Am2, O495) ─────────────────────────────────

  /**
   * Sync events for a single provider calendar.
   *
   * Full sync (no syncToken): fetches all events with start >= timeMin, pages
   * through all pages, returns { upserts[], deletions[], nextSyncToken }.
   *
   * Incremental sync (syncToken provided): fetches only changed/cancelled events.
   * Cancelled events (status:'cancelled') land in deletions[].
   *
   * 410 Gone: token expired — callers must wipe the token and run a full resync.
   * Throws an error with code 'sync.token_expired' to signal this.
   *
   * @param {string} externalAccountId       - Google account id (broker key)
   * @param {string} providerCalendarId      - Provider-level calendar id to sync
   * @param {{ syncToken?: string, timeMin?: string }} opts
   * @returns {{ upserts: object[], deletions: string[], nextSyncToken: string }}
   */
  async function syncEvents(externalAccountId, providerCalendarId, opts) {
    opts = opts || {};
    const syncToken = opts.syncToken || null;
    const timeMin   = opts.timeMin   || null;

    const upserts   = [];
    const deletions = [];
    let   nextSyncToken = null;
    let   pageToken = null;

    // Build initial params.
    const baseParams = {
      singleEvents: 'true',
      maxResults:   '250',
    };
    if (syncToken) {
      // Incremental sync — syncToken replaces timeMin/timeMax (Google API requirement).
      baseParams.syncToken = syncToken;
    } else {
      // Full sync — bound by timeMin (default: now − 3mo).
      // NOTE: do NOT set `orderBy` here — Google suppresses `nextSyncToken` on any
      // list request that uses `orderBy`, which would break incremental sync
      // (every sync would re-pull the full window). Events are sorted client-side.
      const tMin = timeMin || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      baseParams.timeMin   = tMin;
    }

    const calUrl = `${GCAL_API_BASE}/calendars/${encodeURIComponent(providerCalendarId)}/events`;
    let calendarName = providerCalendarId; // Will be replaced on first page response.

    do {
      const params = new URLSearchParams(baseParams);
      if (pageToken) params.set('pageToken', pageToken);

      let resp;
      try {
        resp = await netFetch.call('fetch', [
          {
            provider,
            accountId: externalAccountId,
            url:       `${calUrl}?${params}`,
            method:    'GET',
          },
        ]);
      } catch (err) {
        throw Object.assign(
          new Error(`syncEvents: network error for ${providerCalendarId}: ${err && err.message}`),
          { code: 'sync.network_error' },
        );
      }

      if (!resp.ok) {
        if (resp.status === 410) {
          // Gone — sync token expired; signal caller to wipe + full-resync.
          throw Object.assign(
            new Error(`syncEvents: sync token expired for ${providerCalendarId} (410 Gone)`),
            { code: 'sync.token_expired' },
          );
        }
        throw Object.assign(
          new Error(`syncEvents: Google Calendar API error ${resp.status} for ${providerCalendarId}`),
          { code: 'sync.api_error' },
        );
      }

      const data = resp.body;
      if (data && data.summary) calendarName = data.summary;

      const items = (data && data.items) ? data.items : [];
      for (const item of items) {
        if (item.status === 'cancelled') {
          // Deleted / cancelled event — record provider_event_id for deletion.
          if (item.id) deletions.push(item.id);
        } else {
          // Active event — map and collect.
          upserts.push(mapEvent(item, providerCalendarId, calendarName));
        }
      }

      // nextPageToken = more pages; nextSyncToken = only on LAST page.
      pageToken     = (data && data.nextPageToken) || null;
      nextSyncToken = (data && data.nextSyncToken) || nextSyncToken;

    } while (pageToken);

    return { upserts, deletions, nextSyncToken: nextSyncToken || '' };
  }

  return {
    providerType: 'google',
    // P0 legacy
    getStatus,
    connect,
    disconnect,
    listEvents,
    // Slice 2: account-aware port
    authenticate,
    getAccountStatus,
    disconnectAccount,
    listCalendars,
    listEventsForCalendars,
    // Slice 6: event cache sync
    syncEvents,
  };
}
