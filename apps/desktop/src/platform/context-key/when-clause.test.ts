import { describe, expect, it } from 'vitest';
import { evaluateWhenClause, keysInWhenClause, parseWhenClause } from './when-clause';
import type { CtxValue } from './when-clause';

// Proof test for the Vitest foundation (O517 / B0) AND real Tier-1 coverage of
// the context-key when-clause parser+evaluator — a pure, dependency-free unit.

function evalExpr(expr: string, ctx: Record<string, CtxValue>): boolean {
  return evaluateWhenClause(parseWhenClause(expr), new Map(Object.entries(ctx)));
}

describe('when-clause', () => {
  it('truthy key: undefined / false / 0 / empty-string are falsey', () => {
    expect(evalExpr('flag', { flag: true })).toBe(true);
    expect(evalExpr('flag', { flag: 'x' })).toBe(true);
    expect(evalExpr('flag', {})).toBe(false);
    expect(evalExpr('flag', { flag: false })).toBe(false);
    expect(evalExpr('flag', { flag: 0 })).toBe(false);
    expect(evalExpr('flag', { flag: '' })).toBe(false);
  });

  it('equality / inequality compare by strict value', () => {
    expect(evalExpr("mode == 'edit'", { mode: 'edit' })).toBe(true);
    expect(evalExpr("mode == 'edit'", { mode: 'view' })).toBe(false);
    expect(evalExpr("mode != 'edit'", { mode: 'view' })).toBe(true);
    expect(evalExpr('count == 3', { count: 3 })).toBe(true);
  });

  it('numeric comparisons apply only to number/number operands', () => {
    expect(evalExpr('n > 5', { n: 6 })).toBe(true);
    expect(evalExpr('n >= 5', { n: 5 })).toBe(true);
    expect(evalExpr('n < 5', { n: 6 })).toBe(false);
    expect(evalExpr('n > 5', { n: 'six' })).toBe(false);
  });

  it('&& binds tighter than || (precedence)', () => {
    // a || b && c  ===  a || (b && c)
    expect(evalExpr('a || b && c', { a: true, b: false, c: false })).toBe(true);
    expect(evalExpr('a || b && c', { a: false, b: true, c: false })).toBe(false);
    expect(evalExpr('a || b && c', { a: false, b: true, c: true })).toBe(true);
  });

  it('parentheses override precedence', () => {
    expect(evalExpr('(a || b) && c', { a: true, b: false, c: false })).toBe(false);
    expect(evalExpr('(a || b) && c', { a: true, b: false, c: true })).toBe(true);
  });

  it('not operator', () => {
    expect(evalExpr('!flag', { flag: false })).toBe(true);
    expect(evalExpr('!flag', { flag: true })).toBe(false);
  });

  it('in-array membership', () => {
    expect(evalExpr("kind in ['a', 'b']", { kind: 'b' })).toBe(true);
    expect(evalExpr("kind in ['a', 'b']", { kind: 'c' })).toBe(false);
  });

  it('regex match applies only to string values', () => {
    expect(evalExpr('name =~ /^dr/i', { name: 'Dr Smith' })).toBe(true);
    expect(evalExpr('name =~ /^dr/', { name: 'Smith' })).toBe(false);
    expect(evalExpr('name =~ /x/', { name: 42 })).toBe(false);
  });

  it('malformed / empty expressions parse to a constant-false clause', () => {
    expect(evalExpr('&& ||', {})).toBe(false);
    expect(evalExpr('', {})).toBe(false);
  });

  it('keysInWhenClause collects every referenced context key', () => {
    const expr = parseWhenClause("a && b == 'x' || c in ['y'] && d =~ /z/");
    expect(keysInWhenClause(expr)).toEqual(new Set(['a', 'b', 'c', 'd']));
  });
});
