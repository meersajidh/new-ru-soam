import { describe, expect, it } from 'vitest';
import {
  addDays,
  classClass,
  classLabel,
  eventDisplayTitle,
  endOfMonth,
  fmtDuration,
  isEventDeclined,
  isToday,
  modalitySubline,
  participantClassHint,
  responseIcon,
  sameDay,
  startOfDay,
  startOfMonth,
  startOfWeek,
  type CalendarEvent,
} from './schedule-lib';

// Tier-1 (B1) coverage of the schedule view's pure date/formatting/classification
// helpers (the 4 grid classes + supporting pure functions). Locale/timezone-
// sensitive formatters (fmtTime, minOfDay, evDate) are intentionally excluded —
// they parse ISO strings and would be flaky across CI locale/TZ. Everything here
// uses local Date constructors + getters, so it is internally consistent.

function ev(partial: Partial<CalendarEvent> = {}): CalendarEvent {
  return { id: 'e1', calendarId: 'c1', ...partial };
}

describe('date math', () => {
  it('addDays rolls over month boundaries', () => {
    const r = addDays(new Date(2026, 0, 31), 1); // Jan 31 + 1
    expect([r.getFullYear(), r.getMonth(), r.getDate()]).toEqual([2026, 1, 1]); // Feb 1
  });

  it('startOfWeek is Monday-anchored at midnight (Wednesday input)', () => {
    // Jan 1 2026 is a Thursday → Jan 7 is a Wednesday → its week starts Mon Jan 5.
    const r = startOfWeek(new Date(2026, 0, 7));
    expect([r.getFullYear(), r.getMonth(), r.getDate()]).toEqual([2026, 0, 5]);
    expect(r.getDay()).toBe(1);
    expect(r.getHours()).toBe(0);
  });

  it('startOfWeek handles the Sunday edge (wraps back to previous Monday)', () => {
    // Jan 4 2026 is a Sunday → week starts Mon Dec 29 2025.
    const r = startOfWeek(new Date(2026, 0, 4));
    expect([r.getFullYear(), r.getMonth(), r.getDate()]).toEqual([2025, 11, 29]);
    expect(r.getDay()).toBe(1);
  });

  it('startOfDay zeroes the time', () => {
    const r = startOfDay(new Date(2026, 0, 7, 13, 45, 30));
    expect(r.getHours()).toBe(0);
    expect(r.getMinutes()).toBe(0);
    expect(r.getDate()).toBe(7);
  });

  it('startOfMonth / endOfMonth bound the month (Feb 2026 = 28 days)', () => {
    expect(startOfMonth(new Date(2026, 1, 15)).getDate()).toBe(1);
    const eom = endOfMonth(new Date(2026, 1, 15));
    expect(eom.getDate()).toBe(28);
    expect([eom.getHours(), eom.getMinutes(), eom.getSeconds()]).toEqual([23, 59, 59]);
  });

  it('sameDay / isToday', () => {
    expect(sameDay(new Date(2026, 0, 7, 1), new Date(2026, 0, 7, 23))).toBe(true);
    expect(sameDay(new Date(2026, 0, 7), new Date(2026, 0, 8))).toBe(false);
    expect(isToday(new Date())).toBe(true);
    expect(isToday(addDays(new Date(), 1))).toBe(false);
  });
});

describe('fmtDuration', () => {
  it('formats hours and minutes, dropping zero parts', () => {
    expect(fmtDuration(0)).toBe('');
    expect(fmtDuration(-5)).toBe('');
    expect(fmtDuration(45)).toBe('45 min');
    expect(fmtDuration(60)).toBe('1 hr');
    expect(fmtDuration(120)).toBe('2 hr');
    expect(fmtDuration(90)).toBe('1 hr 30 min');
  });
});

describe('classification (4 grid classes)', () => {
  it('classClass maps each classification, falling back to unclassified', () => {
    expect(classClass(ev({ classification: 'client_session' }))).toBe('cls-client');
    expect(classClass(ev({ classification: 'not_client_session' }))).toBe('cls-not');
    expect(classClass(ev({ classification: 'personal' }))).toBe('cls-personal');
    expect(classClass(ev({ classification: 'unclassified' }))).toBe('cls-unclassified');
    expect(classClass(ev({ classification: 'garbage' }))).toBe('cls-unclassified');
    expect(classClass(undefined)).toBe('cls-unclassified');
  });

  it('classLabel mirrors classClass with human labels', () => {
    expect(classLabel(ev({ classification: 'client_session' }))).toBe('CLIENT');
    expect(classLabel(ev({ classification: 'not_client_session' }))).toBe('EXCLUDED');
    expect(classLabel(ev({ classification: 'personal' }))).toBe('PERSONAL');
    expect(classLabel(ev())).toBe('UNCLASSIFIED');
  });
});

describe('responseIcon', () => {
  it('maps known response statuses, null otherwise', () => {
    expect(responseIcon('accepted')).toMatchObject({ icon: 'thumbsup', cls: 'resp-yes' });
    expect(responseIcon('declined')).toMatchObject({ icon: 'thumbsdown', cls: 'resp-no' });
    expect(responseIcon('tentative')).toMatchObject({ cls: 'resp-maybe' });
    expect(responseIcon('needsAction')).toMatchObject({ cls: 'resp-none' });
    expect(responseIcon(undefined)).toBeNull();
    expect(responseIcon('weird')).toBeNull();
  });
});

describe('eventDisplayTitle', () => {
  it('uses the raw title by default', () => {
    expect(eventDisplayTitle(ev({ title: 'Weekly review' }))).toBe('Weekly review');
    expect(eventDisplayTitle(ev())).toBe('(No title)');
  });

  it('prefers the client label only for a client_session in clientName mode', () => {
    expect(
      eventDisplayTitle(
        ev({ classification: 'client_session', _clientLabel: 'Jane D', title: 'raw' }),
        'clientName',
      ),
    ).toBe('Jane D');
    // Non-client_session ignores the label → falls back to title.
    expect(
      eventDisplayTitle(ev({ classification: 'personal', _clientLabel: 'Jane D', title: 'raw' }), 'clientName'),
    ).toBe('raw');
  });
});

describe('isEventDeclined', () => {
  it('is false without attendee data', () => {
    expect(isEventDeclined(ev())).toBe(false);
    expect(isEventDeclined(ev({ attendees: [] }))).toBe(false);
  });

  it('is true when the organizer declined', () => {
    expect(
      isEventDeclined(
        ev({
          attendees: [
            { email: 'org@x', organizer: true, responseStatus: 'declined' },
            { email: 'me@x', responseStatus: 'accepted' },
          ],
        }),
      ),
    ).toBe(true);
  });

  it('is true when every attendee declined, false when mixed', () => {
    expect(
      isEventDeclined(
        ev({ attendees: [{ responseStatus: 'declined' }, { responseStatus: 'declined' }] }),
      ),
    ).toBe(true);
    expect(
      isEventDeclined(
        ev({ attendees: [{ responseStatus: 'accepted' }, { responseStatus: 'declined' }] }),
      ),
    ).toBe(false);
  });
});

describe('participantClassHint', () => {
  it('counts non-declined others plus self, labelling groups', () => {
    expect(participantClassHint(ev())).toBe('');
    // one other + self → 2 participants
    expect(participantClassHint(ev({ attendees: [{ self: true }, { email: 'a@x' }] }))).toBe(
      '2 participants',
    );
    // one other, no self → 1 participant
    expect(participantClassHint(ev({ attendees: [{ email: 'a@x' }] }))).toBe('1 participant');
    // two others + self → Group · 3 participants
    expect(
      participantClassHint(ev({ attendees: [{ email: 'a@x' }, { email: 'b@x' }, { self: true }] })),
    ).toBe('Group · 3 participants');
    // declined others are excluded
    expect(
      participantClassHint(ev({ attendees: [{ self: true }, { email: 'a@x', responseStatus: 'declined' }] })),
    ).toBe('');
  });
});

describe('modalitySubline', () => {
  it('describes online vs in-person, appending the participant hint', () => {
    expect(modalitySubline(ev({ meetingLink: 'https://m', meetingProvider: 'Meet' }))).toBe(
      'Online · Meet',
    );
    expect(modalitySubline(ev({ meetingLink: 'https://m' }))).toBe('Online · Video call');
    expect(modalitySubline(ev({ location: 'Room 2' }))).toBe('In person · Room 2');
    expect(
      modalitySubline(ev({ location: 'Room 2', attendees: [{ self: true }, { email: 'a@x' }] })),
    ).toBe('In person · Room 2 · 2 participants');
    expect(modalitySubline(ev())).toBe('');
  });
});
