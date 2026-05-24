/**
 * Schema version gate — ADR-308 §4.
 *
 * Pure function. Does NOT open the DB. Compares `diskVersion` against the
 * compiled-in [MIN_SUPPORTED_SCHEMA, MAX_SUPPORTED_SCHEMA] window and returns
 * one of three outcomes:
 *
 *   'ok'       — disk version is within the supported window; open / migrate.
 *   'too-old'  — disk version is below the minimum; refuse, surface error.
 *   'too-new'  — disk version is above the maximum; refuse, surface error.
 *
 * Note on O182 (PRAGMA user_version vs. _schema_version table):
 *   ADR-308 §3 specifies PRAGMA user_version. The current migrations.ts uses a
 *   `_schema_version` table instead, so `PRAGMA user_version` currently reads 0
 *   on all existing DBs. This utility is written to the ADR spec (user_version)
 *   and is not wired into any live path yet (Phase 10b). The conflict must be
 *   resolved before live wiring — either by adopting user_version in migrations
 *   or by reading _schema_version here. Flag documented for Phase 10b.
 *
 * Constants:
 *   - MIN_SUPPORTED_SCHEMA: minimum disk schema this binary can open/migrate.
 *   - MAX_SUPPORTED_SCHEMA: maximum disk schema this binary understands.
 *     Must equal the highest migration version in migrations.ts.
 */

/** Minimum disk schema version this binary can open. */
export const MIN_SUPPORTED_SCHEMA = 0;

/**
 * Maximum disk schema version this binary understands.
 * Increment this when a new migration is added.
 * Phase A.1: matches the current migration ceiling (version 3).
 */
export const MAX_SUPPORTED_SCHEMA = 3;

export type SchemaGateResult = 'ok' | 'too-old' | 'too-new';

/**
 * Check whether `diskVersion` falls within the supported schema window.
 *
 * @param diskVersion - The version read from `PRAGMA user_version` (or
 *   `_schema_version` table, depending on the migration system in use).
 */
export function checkSchemaWindow(diskVersion: number): SchemaGateResult {
  if (diskVersion < MIN_SUPPORTED_SCHEMA) return 'too-old';
  if (diskVersion > MAX_SUPPORTED_SCHEMA) return 'too-new';
  return 'ok';
}
