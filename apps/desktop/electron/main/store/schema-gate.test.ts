/**
 * Unit tests for schema-gate.ts (ADR-308 §4).
 * Uses node:test + node:assert. Run with:
 *   node --experimental-strip-types --test electron/main/store/schema-gate.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkSchemaWindow,
  MIN_SUPPORTED_SCHEMA,
  MAX_SUPPORTED_SCHEMA,
} from './schema-gate.ts';

test('checkSchemaWindow: returns ok for MIN_SUPPORTED_SCHEMA', () => {
  assert.equal(checkSchemaWindow(MIN_SUPPORTED_SCHEMA), 'ok');
});

test('checkSchemaWindow: returns ok for MAX_SUPPORTED_SCHEMA', () => {
  assert.equal(checkSchemaWindow(MAX_SUPPORTED_SCHEMA), 'ok');
});

test('checkSchemaWindow: returns ok for version within window', () => {
  const mid = Math.floor((MIN_SUPPORTED_SCHEMA + MAX_SUPPORTED_SCHEMA) / 2);
  if (mid >= MIN_SUPPORTED_SCHEMA && mid <= MAX_SUPPORTED_SCHEMA) {
    assert.equal(checkSchemaWindow(mid), 'ok');
  }
});

test('checkSchemaWindow: returns too-old for version below MIN', () => {
  assert.equal(checkSchemaWindow(MIN_SUPPORTED_SCHEMA - 1), 'too-old');
});

test('checkSchemaWindow: returns too-old for very negative version', () => {
  assert.equal(checkSchemaWindow(-999), 'too-old');
});

test('checkSchemaWindow: returns too-new for version above MAX', () => {
  assert.equal(checkSchemaWindow(MAX_SUPPORTED_SCHEMA + 1), 'too-new');
});

test('checkSchemaWindow: returns too-new for very large version', () => {
  assert.equal(checkSchemaWindow(9999), 'too-new');
});

test('checkSchemaWindow: version matrix covers all three outcomes', () => {
  const cases: Array<[number, 'ok' | 'too-old' | 'too-new']> = [
    [MIN_SUPPORTED_SCHEMA - 1, 'too-old'],
    [MIN_SUPPORTED_SCHEMA, 'ok'],
    [MAX_SUPPORTED_SCHEMA, 'ok'],
    [MAX_SUPPORTED_SCHEMA + 1, 'too-new'],
  ];

  for (const [version, expected] of cases) {
    assert.equal(
      checkSchemaWindow(version),
      expected,
      `version ${version} should be ${expected}`,
    );
  }
});
