import { describe, expect, it } from 'vitest';
// The bundle ships as raw ESM (.mjs, no build step) so the unit-under-test is a
// .mjs sibling with no type declarations — imported untyped here on purpose.
import { clusterDuplicates } from './migration-dedup.mjs';

// Tier-1 (B1) coverage of the migration duplicate-clustering core (ADR-509 §7):
// union-find + confirmed(contact)/heuristic edges + the co-attendee anti-signal.

/** Strip non-digits — a stand-in for the bundle's real normalizePhone. */
const normalizePhone = (p: string): string => String(p).replace(/\D/g, '');

type Cand = {
  participantKey: string;
  seedName?: string;
  seedEmail?: string;
  seedPhone?: string;
  eventRefs?: string[];
};

const run = (
  cands: Cand[],
  emailGroupMap: Record<string, string> = {},
): Array<{ clusterId: string; reason: string; members: Cand[] }> =>
  clusterDuplicates(cands, emailGroupMap, normalizePhone);

describe('clusterDuplicates', () => {
  it('returns no clusters for fewer than two candidates', () => {
    expect(run([])).toEqual([]);
    expect(run([{ participantKey: 'a', seedName: 'Solo' }])).toEqual([]);
  });

  it('merges on identical normalized name (heuristic)', () => {
    const clusters = run([
      { participantKey: 'a', seedName: 'Jane Doe' },
      { participantKey: 'b', seedName: 'jane doe.' }, // trailing dot + case → normalizes equal
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].reason).toBe('heuristic');
    expect(clusters[0].members).toHaveLength(2);
  });

  it('clusterId is deterministic on the smallest participantKey', () => {
    const clusters = run([
      { participantKey: 'pk_b', seedName: 'Sam Roy' },
      { participantKey: 'pk_a', seedName: 'Sam Roy' },
    ]);
    expect(clusters[0].clusterId).toBe('cl_pk_a');
  });

  it('merges on matching normalized phone despite different formatting', () => {
    const clusters = run([
      { participantKey: 'a', seedName: 'X', seedPhone: '555-1000' },
      { participantKey: 'b', seedName: 'Y', seedPhone: '(555) 1000' },
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].reason).toBe('heuristic');
  });

  it('merges a single-token name into a matching full-name prefix', () => {
    const clusters = run([
      { participantKey: 'a', seedName: 'Jane' }, // single token, no email/phone
      { participantKey: 'b', seedName: 'Jane Doe' },
    ]);
    expect(clusters).toHaveLength(1);
  });

  it('marks a cluster as contact when linked by shared Google resourceName', () => {
    const clusters = run(
      [
        { participantKey: 'a', seedName: 'J. Doe', seedEmail: 'A@x.com' },
        { participantKey: 'b', seedName: 'Jane', seedEmail: 'b@x.com' },
      ],
      { 'a@x.com': 'people/1', 'b@x.com': 'people/1' },
    );
    expect(clusters).toHaveLength(1);
    expect(clusters[0].reason).toBe('contact');
  });

  it('never merges co-attendees of the same event (anti-signal wins over name)', () => {
    const clusters = run([
      { participantKey: 'a', seedName: 'Same Name', eventRefs: ['ev1'] },
      { participantKey: 'b', seedName: 'Same Name', eventRefs: ['ev1'] },
    ]);
    expect(clusters).toEqual([]);
  });

  it('contact edge dominates the reason even when heuristic edges also join', () => {
    // a—b confirmed (contact), b—c heuristic name → one cluster, reason contact.
    const clusters = run(
      [
        { participantKey: 'a', seedName: 'A One', seedEmail: 'a@x.com' },
        { participantKey: 'b', seedName: 'B Two', seedEmail: 'b@x.com' },
        { participantKey: 'c', seedName: 'B Two' },
      ],
      { 'a@x.com': 'people/9', 'b@x.com': 'people/9' },
    );
    expect(clusters).toHaveLength(1);
    expect(clusters[0].members).toHaveLength(3);
    expect(clusters[0].reason).toBe('contact');
  });

  it('unions transitively (A~B, B~C ⇒ one cluster of three)', () => {
    const clusters = run([
      { participantKey: 'a', seedName: 'Ravi Kumar' },
      { participantKey: 'b', seedName: 'ravi kumar' },
      { participantKey: 'c', seedName: 'RAVI KUMAR' },
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].members).toHaveLength(3);
  });

  it('keeps unrelated candidates in separate (dropped) singletons', () => {
    const clusters = run([
      { participantKey: 'a', seedName: 'Alpha' },
      { participantKey: 'b', seedName: 'Beta' },
      { participantKey: 'c', seedName: 'Alpha' },
    ]);
    // a+c merge; b is a singleton → dropped.
    expect(clusters).toHaveLength(1);
    expect(clusters[0].members.map((m) => m.participantKey).sort()).toEqual(['a', 'c']);
  });
});
