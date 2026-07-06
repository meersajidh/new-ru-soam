import { describe, expect, it } from 'vitest';
import { CapErr } from '../../shared/ipc-protocol.js';
import type { CallerIdentity } from '../capability/registry.js';
import {
  enforceAudit,
  enforceOwnership,
  isProtectedTable,
  parseDeleteArgs,
  parseDeleteWhereArgs,
  parseInsertArgs,
  parseUpdateArgs,
  parseUpdateWhereArgs,
  validateColumns,
  validateWherePredicate,
  type TableMeta,
} from './store-write-validate.js';

// Tier-1 (B1) coverage of the store.write pure validation core (ADR-506 store
// ABI): column allowlist, where-predicate blast-radius guard, ownership +
// audit gates, and per-method arg parsing. These guard a PHI write surface, so
// their failure modes (missing guard, wrong error code) are high-cost.

const META: TableMeta = { columns: new Set(['id', 'name', 'patient_id']), pk: 'id' };

/** Capture a thrown Error + its attached CapErr code. Fails if fn does not throw. */
function grab(fn: () => unknown): { message: string; code: unknown } {
  try {
    fn();
  } catch (e) {
    const err = e as Error & { code?: unknown };
    return { message: err.message, code: err.code };
  }
  throw new Error('expected function to throw, but it did not');
}

function caller(bundleId: string): CallerIdentity {
  // enforceOwnership only reads bundleId; trustClass is irrelevant here.
  return { bundleId } as unknown as CallerIdentity;
}

describe('validateColumns', () => {
  it('accepts known columns (and an empty column list)', () => {
    expect(() => validateColumns(META, ['id', 'name'], 'insert row')).not.toThrow();
    expect(() => validateColumns(META, [], 'insert row')).not.toThrow();
  });

  it('rejects an unknown column with a HandlerThrew code and contextual message', () => {
    const { message, code } = grab(() => validateColumns(META, ['id', 'bogus'], 'insert row'));
    expect(code).toBe(CapErr.HandlerThrew);
    expect(message).toContain("unknown column 'bogus' in insert row");
  });
});

describe('validateWherePredicate', () => {
  it('returns the typed predicate when valid', () => {
    expect(validateWherePredicate({ patient_id: 'p1', name: 7 }, 'deleteWhere')).toEqual({
      patient_id: 'p1',
      name: 7,
    });
  });

  it('rejects non-objects and arrays as not-a-plain-object (context in message)', () => {
    expect(grab(() => validateWherePredicate(null, 'deleteWhere')).message).toBe(
      'store.write.deleteWhere: where must be a plain object',
    );
    expect(grab(() => validateWherePredicate([], 'updateWhere')).message).toContain(
      'store.write.updateWhere: where must be a plain object',
    );
  });

  it('rejects an empty predicate (blast-radius guard)', () => {
    const { message, code } = grab(() => validateWherePredicate({}, 'deleteWhere'));
    expect(code).toBe(CapErr.HandlerThrew);
    expect(message).toContain('where predicate must not be empty (blast-radius guard)');
  });

  it('rejects non-string/number values, reporting the offending type', () => {
    expect(grab(() => validateWherePredicate({ a: true }, 'deleteWhere')).message).toContain(
      "column 'a' must be string or number (got boolean)",
    );
    // typeof null === 'object'
    expect(grab(() => validateWherePredicate({ a: null }, 'deleteWhere')).message).toContain(
      '(got object)',
    );
  });
});

describe('enforceOwnership', () => {
  it('is dormant for the Main-internal caller (undefined)', () => {
    expect(() => enforceOwnership('owner', undefined, 't')).not.toThrow();
  });

  it('allows the declared owner', () => {
    expect(() => enforceOwnership('owner', caller('owner'), 't')).not.toThrow();
  });

  it('denies a non-owner with a Denied code', () => {
    const { message, code } = grab(() => enforceOwnership('owner', caller('other'), 't'));
    expect(code).toBe(CapErr.Denied);
    expect(message).toContain("caller 'other' is not the owner of 't' (owner: 'owner')");
  });
});

describe('enforceAudit', () => {
  it('accepts a non-empty event', () => {
    expect(() => enforceAudit({ event: 'patient.create' })).not.toThrow();
  });

  it('rejects empty, whitespace-only, or non-string events', () => {
    expect(grab(() => enforceAudit({ event: '' })).code).toBe(CapErr.HandlerThrew);
    expect(() => enforceAudit({ event: '   ' })).toThrow('non-empty string');
    // Runtime guard defends against a mistyped caller.
    expect(() => enforceAudit({ event: 123 as unknown as string })).toThrow('non-empty string');
  });
});

describe('isProtectedTable', () => {
  it('flags integrity-critical tables only', () => {
    expect(isProtectedTable('audit_log')).toBe(true);
    expect(isProtectedTable('_schema_version')).toBe(true);
    expect(isProtectedTable('patients')).toBe(false);
  });
});

describe('argument parsers', () => {
  it('parseInsertArgs: parses valid args, rejects bad shapes', () => {
    expect(parseInsertArgs(['patients', { name: 'x' }, { event: 'e' }])).toEqual({
      table: 'patients',
      row: { name: 'x' },
      audit: { event: 'e' },
    });
    expect(() => parseInsertArgs([1, {}, {}])).toThrow('table must be a string');
    expect(() => parseInsertArgs(['t', [], {}])).toThrow('row must be a plain object');
    expect(() => parseInsertArgs(['t', { c: 1 }, null])).toThrow('audit must be a plain object');
  });

  it('parseUpdateArgs / parseDeleteArgs: require a pkValue', () => {
    expect(() => parseUpdateArgs(['t', null, { c: 1 }, { event: 'e' }])).toThrow(
      'pkValue must be provided',
    );
    expect(() => parseDeleteArgs(['t', undefined, { event: 'e' }])).toThrow(
      'pkValue must be provided',
    );
    expect(parseDeleteArgs(['t', 'pk1', { event: 'e' }])).toEqual({
      table: 't',
      pkValue: 'pk1',
      audit: { event: 'e' },
    });
  });

  it('parseDeleteWhereArgs: routes the predicate through the blast-radius guard', () => {
    expect(parseDeleteWhereArgs(['t', { patient_id: 'p1' }, { event: 'e' }])).toEqual({
      table: 't',
      where: { patient_id: 'p1' },
      audit: { event: 'e' },
    });
    expect(() => parseDeleteWhereArgs(['t', {}, { event: 'e' }])).toThrow('must not be empty');
  });

  it('parseUpdateWhereArgs: validates both predicate and patch', () => {
    expect(parseUpdateWhereArgs(['t', { patient_id: 'p1' }, { name: 'x' }, { event: 'e' }])).toEqual({
      table: 't',
      where: { patient_id: 'p1' },
      patch: { name: 'x' },
      audit: { event: 'e' },
    });
    expect(() => parseUpdateWhereArgs(['t', { patient_id: 'p1' }, 'bad', { event: 'e' }])).toThrow(
      'patch must be a plain object',
    );
  });
});
