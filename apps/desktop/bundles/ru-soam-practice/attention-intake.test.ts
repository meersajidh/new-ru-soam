import { describe, expect, it } from 'vitest';
// The bundle ships as raw ESM (.mjs, no build step) so the unit-under-test is a
// .mjs sibling with no type declarations — imported untyped here on purpose.
import {
  INTAKE_ITEMS,
  deriveDisplayName,
  mapIntakeCompleteness,
  deriveObligations,
} from './attention-intake.mjs';

// Tier-1 (B1) coverage of the Practice intake-completeness + Attention-lens
// read-derivation (P5): pure obligation rules + checklist over a store row.

const DAY_MS = 24 * 60 * 60 * 1000;
const ALL_COLS: string[] = INTAKE_ITEMS.map((i: { col: string }) => i.col);

/** Build an intake/attention row; `overrides` toggles individual columns. */
const row = (overrides: Record<string, unknown> = {}): Record<string, unknown> => {
  const base: Record<string, unknown> = {
    patient_id: 'p1',
    given_name: 'Jane',
    family_name: 'Doe',
    stage: 'active',
    status: 'active',
  };
  return { ...base, ...overrides };
};

/** A row with every intake column satisfied. */
const complete = (overrides: Record<string, unknown> = {}): Record<string, unknown> => {
  const cols: Record<string, unknown> = {};
  for (const c of ALL_COLS) cols[c] = 1;
  return row({ ...cols, ...overrides });
};

describe('deriveDisplayName', () => {
  it('formats "Family, Given" when a family name is present', () => {
    expect(deriveDisplayName('Jane', 'Doe')).toBe('Doe, Jane');
  });

  it('returns just the given name when family is empty or whitespace', () => {
    expect(deriveDisplayName('Jane', '')).toBe('Jane');
    expect(deriveDisplayName('Jane', '   ')).toBe('Jane');
  });

  it('trims surrounding whitespace on both parts', () => {
    expect(deriveDisplayName('  Jane  ', '  Doe  ')).toBe('Doe, Jane');
  });
});

describe('mapIntakeCompleteness', () => {
  it('reports complete with a full done count when every item is set', () => {
    const r = mapIntakeCompleteness(complete());
    expect(r.total).toBe(INTAKE_ITEMS.length);
    expect(r.doneCount).toBe(INTAKE_ITEMS.length);
    expect(r.complete).toBe(true);
    expect(r.displayName).toBe('Doe, Jane');
  });

  it('reports incomplete with the correct partial count', () => {
    const r = mapIntakeCompleteness(row({ has_demographics: 1, has_language: 1 }));
    expect(r.doneCount).toBe(2);
    expect(r.complete).toBe(false);
  });

  it('emits one item per checklist entry with a boolean done flag', () => {
    const r = mapIntakeCompleteness(row({ has_demographics: 1 }));
    expect(r.items).toHaveLength(INTAKE_ITEMS.length);
    const done = (key: string) =>
      r.items.find((it: { key: string }) => it.key === key)?.done;
    expect(done('demographics')).toBe(true);
    expect(done('language')).toBe(false);
  });
});

describe('deriveObligations', () => {
  it('returns no obligations for archived or discharged records', () => {
    expect(deriveObligations(complete({ status: 'archived', has_risk_screen: 0 }), 0)).toEqual([]);
    expect(deriveObligations(complete({ stage: 'discharged', has_risk_screen: 0 }), 0)).toEqual([]);
  });

  it('flags intake_incomplete only while in the intake stage and not complete', () => {
    const keys = (r: Record<string, unknown>) =>
      deriveObligations(r, 0).map((o: { key: string }) => o.key);
    expect(keys(row({ stage: 'intake' }))).toContain('intake_incomplete');
    // Complete intake → no intake_incomplete (risk screen is set, so no other noise).
    expect(keys(complete({ stage: 'intake' }))).not.toContain('intake_incomplete');
    // Incomplete but NOT in intake stage → no intake_incomplete.
    expect(keys(row({ stage: 'active' }))).not.toContain('intake_incomplete');
  });

  it('flags no_risk_screen exactly when the screen column is unset', () => {
    const has = (r: Record<string, unknown>) =>
      deriveObligations(r, 0).some((o: { key: string }) => o.key === 'no_risk_screen');
    expect(has(row({ has_risk_screen: 0 }))).toBe(true);
    expect(has(row({ has_risk_screen: 1 }))).toBe(false);
  });

  it('flags missing_consent_doc when consent is recorded but no document is on file', () => {
    const has = (r: Record<string, unknown>) =>
      deriveObligations(r, 0).some((o: { key: string }) => o.key === 'missing_consent_doc');
    expect(has(row({ has_informed_consent: 1, has_documents: 0, has_risk_screen: 1 }))).toBe(true);
    expect(has(row({ has_informed_consent: 1, has_documents: 1, has_risk_screen: 1 }))).toBe(false);
    expect(has(row({ has_informed_consent: 0, has_documents: 0, has_risk_screen: 1 }))).toBe(false);
  });

  it('flags on_hold_stale only past the review window with a known stage timestamp', () => {
    const now = 100 * DAY_MS;
    const has = (r: Record<string, unknown>) =>
      deriveObligations(r, now).some((o: { key: string }) => o.key === 'on_hold_stale');
    // 31 days old → stale.
    expect(has(complete({ stage: 'on_hold', stage_updated_at: now - 31 * DAY_MS }))).toBe(true);
    // 29 days old → not yet.
    expect(has(complete({ stage: 'on_hold', stage_updated_at: now - 29 * DAY_MS }))).toBe(false);
    // No timestamp → never stale.
    expect(has(complete({ stage: 'on_hold', stage_updated_at: null }))).toBe(false);
    // Stale age but not on_hold stage → not applicable.
    expect(has(complete({ stage: 'active', stage_updated_at: now - 31 * DAY_MS }))).toBe(false);
  });

  it('defaults missing stage/status to active (still evaluates risk screen)', () => {
    const keys = deriveObligations({ has_risk_screen: 0 }, 0).map((o: { key: string }) => o.key);
    expect(keys).toContain('no_risk_screen');
    expect(keys).not.toContain('intake_incomplete'); // default stage is active, not intake
  });
});
