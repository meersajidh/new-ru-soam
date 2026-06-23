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
  scopes: [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/contacts.readonly',
    'https://www.googleapis.com/auth/contacts.other.readonly',
  ],
};

const GCAL_API_BASE   = 'https://www.googleapis.com/calendar/v3';
const PEOPLE_API_BASE = 'https://people.googleapis.com/v1';

// ── Shared event mapper (extract for reuse between listEvents and listEventsForCalendars) ──

/**
 * Fetch a map of { lowercasedEmail → displayName } from the People API for a single account.
 *
 * Queries two endpoints (both paginated):
 *   - /people/me/connections   (your contacts)
 *   - /otherContacts           (people you've corresponded with)
 *
 * Best-effort: any non-2xx response or thrown error is swallowed and logged once.
 * Connections win over otherContacts on email collision.
 * Returns {} if both endpoints fail.
 *
 * @param {object} netFetch          - Bound net.brokeredFetch@1.0 capability handle
 * @param {string} provider          - Provider string for the broker ('google-calendar')
 * @param {string} externalAccountId - Google account id (broker key)
 * @returns {Promise<Record<string, string>>}
 */
async function fetchContactNameMap(netFetch, provider, externalAccountId) {
  const nameMap = {};

  /**
   * Fetch all pages of a People API endpoint, merge results into nameMap.
   * @param {string} endpoint      - Full URL base (without pageToken)
   * @param {string} fieldParam    - 'personFields' or 'readMask' query param name
   * @param {string} fieldValue    - Value for that param ('names,emailAddresses')
   * @param {boolean} winOnConflict - If true, this source overwrites existing map entries
   */
  async function fetchPeopleEndpoint(endpoint, fieldParam, fieldValue, winOnConflict) {
    let pageToken = null;
    do {
      const params = new URLSearchParams({ [fieldParam]: fieldValue, pageSize: '1000' });
      if (pageToken) params.set('pageToken', pageToken);

      let resp;
      try {
        resp = await netFetch.call('fetch', [
          {
            provider,
            accountId: externalAccountId,
            url: `${endpoint}?${params}`,
            method: 'GET',
          },
        ]);
      } catch (err) {
        console.warn('[schedule] People API fetch error:', endpoint, err && err.message);
        return; // best-effort: abort this endpoint, keep whatever map we have
      }

      if (!resp.ok) {
        // 403 = new scope not yet granted (account predates new scopes); tolerate silently.
        console.warn('[schedule] People API non-2xx:', endpoint, resp.status);
        return;
      }

      const data = resp.body;
      const connections = (data && data.connections) || (data && data.otherContacts) || [];
      for (const person of connections) {
        const names  = person.names;
        const emails = person.emailAddresses;
        if (!names || names.length === 0 || !emails || emails.length === 0) continue;
        const displayName = names[0].displayName;
        if (!displayName) continue;
        for (const emailEntry of emails) {
          if (!emailEntry.value) continue;
          const key = emailEntry.value.toLowerCase();
          if (winOnConflict || !(key in nameMap)) {
            nameMap[key] = displayName;
          }
        }
      }

      pageToken = (data && data.nextPageToken) || null;
    } while (pageToken);
  }

  // otherContacts first (lower priority), then connections (win on conflict).
  try {
    await fetchPeopleEndpoint(
      `${PEOPLE_API_BASE}/otherContacts`,
      'readMask',
      'names,emailAddresses',
      false,
    );
    await fetchPeopleEndpoint(
      `${PEOPLE_API_BASE}/people/me/connections`,
      'personFields',
      'names,emailAddresses',
      true,
    );
  } catch (_err) {
    // Outer safety net — People API must never break calendar sync.
    console.warn('[schedule] fetchContactNameMap unexpected error:', _err && _err.message);
  }

  return nameMap;
}

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
 * @param {Record<string, string>} [nameMap] - Optional email→displayName map from People API.
 *                                      Used to fill missing displayName fields. Never overrides
 *                                      a real displayName returned by the Calendar API.
 */
function mapEvent(item, calendarId, calendarName, nameMap) {
  const _nameMap = nameMap || {};
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
    // Resource fix takes priority over People API name lookup.
    if (organizer.email && isResourceOrganizer(organizer.email)) {
      organizer.name = calendarName;
      delete organizer.email;
    } else if (organizer.email && !organizer.name) {
      // No displayName from Calendar API — try People API map.
      const mapped = _nameMap[organizer.email.toLowerCase()];
      if (mapped) organizer.name = mapped;
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
      // People API enrichment: fill name if Calendar API gave no displayName.
      if (!att.name && att.email) {
        const mapped = _nameMap[att.email.toLowerCase()];
        if (mapped) att.name = mapped;
      }
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

    // Fetch contact name map once for this call; best-effort (never throws).
    const nameMap = await fetchContactNameMap(netFetch, provider, externalAccountId);

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
          results.push(mapEvent(item, providerCalendarId, calendarName, nameMap));
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
   * @returns {Promise<{ upserts: object[], deletions: string[], nextSyncToken: string }>}
   *   Full sync: `timeMax` is auto-set to now+365d; incremental unchanged.
   */
  /**
   * Fetch the People API contact name map for an account.
   * Exposed so callers iterating multiple calendars for the same account can
   * pre-fetch once and pass it into each syncEvents call via opts.nameMap.
   * Best-effort — never throws.
   */
  async function getContactNameMap(externalAccountId) {
    return fetchContactNameMap(netFetch, provider, externalAccountId);
  }

  async function syncEvents(externalAccountId, providerCalendarId, opts) {
    opts = opts || {};
    const syncToken = opts.syncToken || null;
    const timeMin   = opts.timeMin   || null;

    // Use caller-supplied nameMap if provided (callers iterating multiple calendars
    // for the same account should pre-fetch once via getContactNameMap and pass it in).
    // Fallback: fetch here (single-calendar usage or when nameMap not supplied).
    const nameMap = opts.nameMap || await fetchContactNameMap(netFetch, provider, externalAccountId);

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
      // Full sync — bound by timeMin (default: now − 3mo) AND timeMax (now + 365d).
      // NOTE: do NOT set `orderBy` here — Google suppresses `nextSyncToken` on any
      // list request that uses `orderBy`, which would break incremental sync
      // (every sync would re-pull the full window). Events are sorted client-side.
      // NOTE: `timeMin`/`timeMax` ARE compatible with obtaining a `nextSyncToken`
      // (unlike `orderBy`). The returned token stays anchored to this first-sync window,
      // so events beyond +12 mo need a future re-anchor (full resync) — acceptable v1.
      const tMin = timeMin || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      baseParams.timeMin   = tMin;
      baseParams.timeMax   = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
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
        if (resp.status === 401 || resp.status === 403) {
          // Auth failure — token revoked or access denied; signal caller to disconnect account.
          throw Object.assign(
            new Error(`syncEvents: auth failed (${resp.status}) for ${providerCalendarId}`),
            { code: 'auth.invalid' },
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
          upserts.push(mapEvent(item, providerCalendarId, calendarName, nameMap));
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
    // Slice 2: account-aware port
    authenticate,
    getAccountStatus,
    disconnectAccount,
    listCalendars,
    listEventsForCalendars,
    // Slice 6: event cache sync
    syncEvents,
    // People API name enrichment
    getContactNameMap,
  };
}
