/**
 * Sessions provider-sync — pure decision core (ADR-508 P1 slice 2).
 *
 * Extracted from index.mjs (O517 B1) so the field-partitioned / no-LWW merge
 * policy, participant collection, and orphan gating can be unit-tested in
 * isolation. Pure: no `ctx`, no host caps, no module state, no I/O — every
 * function is a total map from its arguments to a plain value.
 *
 * The fp-host loads bundle code as raw ESM (`import(index.mjs)`), so this is a
 * plain `.mjs` sibling with no build step — keep it dependency-free.
 *
 * @typedef {Object} ProviderEvent
 * @property {string=}  id
 * @property {string=}  providerEventId
 * @property {string=}  externalAccountId
 * @property {string=}  providerCalendarId
 * @property {string=}  start                ISO datetime.
 * @property {string=}  end                  ISO datetime.
 * @property {string=}  meetingLink          Presence ⇒ modality 'online'.
 * @property {Array<{email?:string,name?:string,self?:boolean}>=} attendees
 * @property {{email?:string,name?:string}=} organizer
 *
 * @typedef {Object} DerivedMeetingFields
 * @property {string}       eventId
 * @property {string|null}  externalAccountId
 * @property {string|null}  providerCalendarId
 * @property {number|null}  startsAt
 * @property {number|null}  endsAt
 * @property {'online'|'in_person'} modality
 */

/** ISO datetime → epoch ms, or null for empty/invalid input. */
export function isoToMs(iso) {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Derive the provider-keyed + time/modality fields from a raw provider event.
 * eventId falls back to `providerEventId`; qualifier ids default to null (app-
 * origin rows); modality is 'online' iff the event carries a meeting link.
 *
 * @param {ProviderEvent} event
 * @returns {DerivedMeetingFields}
 */
export function deriveMeetingFields(event) {
  const eventId = event.id ?? event.providerEventId;
  const externalAccountId = event.externalAccountId ?? null;
  const providerCalendarId = event.providerCalendarId ?? null;
  const startsAt = isoToMs(event.start);
  const endsAt = isoToMs(event.end);
  const modality = event.meetingLink ? 'online' : 'in_person';
  return { eventId, externalAccountId, providerCalendarId, startsAt, endsAt, modality };
}

/**
 * Collect the human participants of an event: attendees (excluding self) plus
 * the organizer (unless the organizer *is* self), deduped by email→name key,
 * dropping entries with neither email nor name.
 *
 * @param {ProviderEvent} event
 * @returns {Array<{email?:string, name?:string}>}
 */
export function collectParticipants(event) {
  const participantMap = new Map();

  if (Array.isArray(event.attendees)) {
    for (const a of event.attendees) {
      if (a.self) continue;
      const key = a.email || a.name || '';
      if (key && !participantMap.has(key)) {
        participantMap.set(key, { email: a.email, name: a.name });
      }
    }
  }

  if (event.organizer) {
    // Include organizer unless their email matches an attendee marked self.
    const selfEmail = Array.isArray(event.attendees)
      ? (event.attendees.find((a) => a.self)?.email ?? null)
      : null;
    const orgEmail = event.organizer.email;
    if (!orgEmail || orgEmail !== selfEmail) {
      const key = orgEmail || event.organizer.name || '';
      if (key && !participantMap.has(key)) {
        participantMap.set(key, { email: orgEmail, name: event.organizer.name });
      }
    }
  }

  return Array.from(participantMap.values()).filter((p) => p.email || p.name);
}

/**
 * Stable pull/orphan key: "<externalAccountId>|<providerCalendarId>|<eventId>".
 * Null qualifiers collapse to empty string so app-origin and provider rows
 * compare consistently.
 */
export function compositeKey(extAcct, provCal, evId) {
  return `${extAcct ?? ''}|${provCal ?? ''}|${evId}`;
}

/**
 * Decide whether a linked provider row is orphaned by the latest pull.
 *
 * Absence ≠ orphaned in two cases:
 *   1. The row's (account, calendar) pair was not in the pull at all (calendar
 *      de-selected or removed) — skip.
 *   2. Otherwise, orphaned iff the row's composite key is not among the pulled
 *      event ids.
 *
 * @param {{external_account_id:?string, provider_calendar_id:?string, provider_event_id:string}} row
 * @param {Set<string>} pulledIds          composite keys of events pulled this sync.
 * @param {Set<string>} pulledCalendars    "<acct>|<cal>" pairs actually pulled.
 * @returns {boolean}
 */
export function isOrphaned(row, pulledIds, pulledCalendars) {
  const rowCalKey = `${row.external_account_id ?? ''}|${row.provider_calendar_id ?? ''}`;
  // If this row's calendar wasn't in the aggregate pull, skip — not orphaned.
  if (!pulledCalendars.has(rowCalKey)) return false;
  const rowComposite = compositeKey(
    row.external_account_id,
    row.provider_calendar_id,
    row.provider_event_id,
  );
  return !pulledIds.has(rowComposite);
}

/**
 * Build the reconcile patch for an existing meeting row — field-partitioned,
 * no-LWW: always snapshot time + modality + sync_state; fill the two provider
 * qualifiers ONLY when the existing row had them NULL (never overwrite, never
 * touch kind/status).
 *
 * @param {{external_account_id:?string, provider_calendar_id:?string}} existing
 * @param {DerivedMeetingFields} derived
 * @param {number} now  epoch ms for updated_at.
 * @returns {Record<string, unknown>}
 */
export function buildReconcilePatch(existing, derived, now) {
  const { startsAt, endsAt, modality, externalAccountId, providerCalendarId } = derived;
  const reconcilePatch = {
    starts_at: startsAt,
    ends_at: endsAt,
    modality,
    sync_state: 'linked',
    updated_at: now,
  };
  // Fill qualifiers if the existing row had them as NULL (e.g. re-run after partial backfill).
  if (existing.external_account_id == null && externalAccountId !== null) {
    reconcilePatch.external_account_id = externalAccountId;
  }
  if (existing.provider_calendar_id == null && providerCalendarId !== null) {
    reconcilePatch.provider_calendar_id = providerCalendarId;
  }
  return reconcilePatch;
}
