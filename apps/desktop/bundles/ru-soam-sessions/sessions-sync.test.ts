import { describe, expect, it } from 'vitest';
// The bundle ships as raw ESM (.mjs, no build step) so the unit-under-test is a
// .mjs sibling with no type declarations — imported untyped here on purpose.
import {
  isoToMs,
  deriveMeetingFields,
  collectParticipants,
  compositeKey,
  isOrphaned,
  buildReconcilePatch,
} from './sessions-sync.mjs';

// Tier-1 (B1) coverage of the sessions provider-sync decision core (ADR-508):
// field-partitioned / no-LWW reconcile, participant collection, orphan gating.

describe('isoToMs', () => {
  it('returns null for empty/absent input', () => {
    expect(isoToMs(undefined)).toBeNull();
    expect(isoToMs('')).toBeNull();
    expect(isoToMs(null)).toBeNull();
  });

  it('returns null for an unparseable string', () => {
    expect(isoToMs('not-a-date')).toBeNull();
  });

  it('parses an ISO datetime to epoch ms', () => {
    expect(isoToMs('1970-01-01T00:00:00.000Z')).toBe(0);
    expect(isoToMs('2020-01-01T00:00:00.000Z')).toBe(Date.parse('2020-01-01T00:00:00.000Z'));
  });
});

describe('deriveMeetingFields', () => {
  it('falls back from id to providerEventId', () => {
    expect(deriveMeetingFields({ providerEventId: 'pv1' }).eventId).toBe('pv1');
    expect(deriveMeetingFields({ id: 'e1', providerEventId: 'pv1' }).eventId).toBe('e1');
  });

  it('defaults absent qualifiers to null', () => {
    const d = deriveMeetingFields({ id: 'e1' });
    expect(d.externalAccountId).toBeNull();
    expect(d.providerCalendarId).toBeNull();
    expect(d.startsAt).toBeNull();
    expect(d.endsAt).toBeNull();
  });

  it('sets modality online only when a meeting link is present', () => {
    expect(deriveMeetingFields({ id: 'e1' }).modality).toBe('in_person');
    expect(deriveMeetingFields({ id: 'e1', meetingLink: 'https://meet' }).modality).toBe('online');
  });

  it('converts start/end ISO to epoch ms', () => {
    const d = deriveMeetingFields({
      id: 'e1',
      start: '2020-01-01T10:00:00.000Z',
      end: '2020-01-01T11:00:00.000Z',
    });
    expect(d.startsAt).toBe(Date.parse('2020-01-01T10:00:00.000Z'));
    expect(d.endsAt).toBe(Date.parse('2020-01-01T11:00:00.000Z'));
  });
});

describe('collectParticipants', () => {
  it('excludes attendees marked self', () => {
    const ps = collectParticipants({
      attendees: [
        { email: 'me@x.com', self: true },
        { email: 'client@x.com' },
      ],
    });
    expect(ps).toEqual([{ email: 'client@x.com', name: undefined }]);
  });

  it('dedupes attendees by email key, keeping the first', () => {
    const ps = collectParticipants({
      attendees: [
        { email: 'a@x.com', name: 'First' },
        { email: 'a@x.com', name: 'Dupe' },
      ],
    });
    expect(ps).toHaveLength(1);
    expect(ps[0].name).toBe('First');
  });

  it('includes the organizer when they are not self', () => {
    const ps = collectParticipants({
      attendees: [{ email: 'me@x.com', self: true }],
      organizer: { email: 'org@x.com', name: 'Org' },
    });
    expect(ps).toEqual([{ email: 'org@x.com', name: 'Org' }]);
  });

  it('drops the organizer when their email matches the self attendee', () => {
    const ps = collectParticipants({
      attendees: [{ email: 'me@x.com', self: true }],
      organizer: { email: 'me@x.com', name: 'Me' },
    });
    expect(ps).toEqual([]);
  });

  it('does not double-add an organizer already present as an attendee', () => {
    const ps = collectParticipants({
      attendees: [{ email: 'client@x.com', name: 'Client' }],
      organizer: { email: 'client@x.com', name: 'Client Org' },
    });
    expect(ps).toHaveLength(1);
    expect(ps[0].name).toBe('Client'); // attendee entry wins (added first)
  });

  it('keys an email-less organizer by name', () => {
    const ps = collectParticipants({ organizer: { name: 'No Email Org' } });
    expect(ps).toEqual([{ email: undefined, name: 'No Email Org' }]);
  });

  it('drops entries with neither email nor name', () => {
    const ps = collectParticipants({ attendees: [{}, { email: 'ok@x.com' }] });
    expect(ps).toEqual([{ email: 'ok@x.com', name: undefined }]);
  });

  it('returns empty for an event with no attendees or organizer', () => {
    expect(collectParticipants({})).toEqual([]);
  });
});

describe('compositeKey', () => {
  it('joins the triple with pipes', () => {
    expect(compositeKey('acct', 'cal', 'ev')).toBe('acct|cal|ev');
  });

  it('collapses null/undefined qualifiers to empty string', () => {
    expect(compositeKey(null, undefined, 'ev')).toBe('||ev');
  });
});

describe('isOrphaned', () => {
  const row = {
    external_account_id: 'acct',
    provider_calendar_id: 'cal',
    provider_event_id: 'ev',
  };

  it('is not orphaned when the row calendar was not in the pull', () => {
    const pulledIds = new Set<string>();
    const pulledCalendars = new Set<string>(); // calendar absent
    expect(isOrphaned(row, pulledIds, pulledCalendars)).toBe(false);
  });

  it('is not orphaned when the row composite is present in the pull', () => {
    const pulledCalendars = new Set(['acct|cal']);
    const pulledIds = new Set(['acct|cal|ev']);
    expect(isOrphaned(row, pulledIds, pulledCalendars)).toBe(false);
  });

  it('is orphaned when the calendar was pulled but the event was not', () => {
    const pulledCalendars = new Set(['acct|cal']);
    const pulledIds = new Set(['acct|cal|OTHER']);
    expect(isOrphaned(row, pulledIds, pulledCalendars)).toBe(true);
  });

  it('matches null-qualifier rows via the empty-string collapse', () => {
    const nullRow = {
      external_account_id: null,
      provider_calendar_id: null,
      provider_event_id: 'ev',
    };
    const pulledCalendars = new Set(['|']);
    const pulledIds = new Set<string>(); // ev not pulled
    expect(isOrphaned(nullRow, pulledIds, pulledCalendars)).toBe(true);
  });
});

describe('buildReconcilePatch', () => {
  const derived = {
    eventId: 'e1',
    startsAt: 1000,
    endsAt: 2000,
    modality: 'online' as const,
    externalAccountId: 'acct',
    providerCalendarId: 'cal',
  };
  const noQualifiers = { external_account_id: null, provider_calendar_id: null };

  it('always snapshots time, modality, sync_state, and updated_at', () => {
    const patch = buildReconcilePatch(noQualifiers, derived, 555);
    expect(patch).toMatchObject({
      starts_at: 1000,
      ends_at: 2000,
      modality: 'online',
      sync_state: 'linked',
      updated_at: 555,
    });
  });

  it('fills qualifiers only when the existing row had them NULL', () => {
    const patch = buildReconcilePatch(noQualifiers, derived, 1);
    expect(patch.external_account_id).toBe('acct');
    expect(patch.provider_calendar_id).toBe('cal');
  });

  it('never overwrites qualifiers the existing row already has', () => {
    const patch = buildReconcilePatch(
      { external_account_id: 'old-acct', provider_calendar_id: 'old-cal' },
      derived,
      1,
    );
    expect(patch).not.toHaveProperty('external_account_id');
    expect(patch).not.toHaveProperty('provider_calendar_id');
  });

  it('does not set a qualifier when the incoming value is null', () => {
    const patch = buildReconcilePatch(
      noQualifiers,
      { ...derived, externalAccountId: null, providerCalendarId: null },
      1,
    );
    expect(patch).not.toHaveProperty('external_account_id');
    expect(patch).not.toHaveProperty('provider_calendar_id');
  });

  it('never touches kind or status (field-partitioned merge)', () => {
    const patch = buildReconcilePatch(noQualifiers, derived, 1);
    expect(patch).not.toHaveProperty('kind');
    expect(patch).not.toHaveProperty('status');
  });
});
