/**
 * store.write / store.eraseSubject — pure validation core (ADR-506 §6 store ABI).
 *
 * Extracted from store-write-cap.ts (O517 B1) so the guards can be unit-tested
 * in isolation. Dependency-free at runtime except for the `CapErr` code enum (a
 * plain const object) and a type-only `CallerIdentity` import — no DB, no
 * electron, no registry runtime. Every function here is a pure guard over plain
 * values; store-write-validate.test.ts exercises them directly.
 *
 * Behaviour is IDENTICAL to the previously-inlined originals — the cap file
 * re-imports these. ADR-106 boundary: base code, MUST NOT import any domain module.
 */

import { CapErr } from '../../shared/ipc-protocol.js';
import type { CallerIdentity } from '../capability/registry.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TableMeta {
  readonly columns: ReadonlySet<string>;
  /** Name of the single-column primary key (pk=1 in PRAGMA table_info). */
  readonly pk: string;
}

/**
 * Caller-supplied audit metadata. `event` is a bundle-defined string — the
 * AuditEventKind closed enum is a TS-only constraint on platform events; we
 * cast at the call site since the audit ledger stores raw strings at runtime.
 */
export interface AuditTag {
  readonly event: string;
  readonly detail?: Record<string, unknown>;
  readonly recordType?: string;
  /** Non-PHI record identifier. For writes, derived from pk; for reads, caller-supplied. */
  readonly recordId?: string;
}

// ── Protected tables ────────────────────────────────────────────────────────────

/**
 * Tables that must never be mutated via the generic write surface.
 *   audit_log       — append-only; written only by the audit service
 *   _schema_version — migration infra
 */
export const PROTECTED_TABLES: ReadonlySet<string> = new Set(['audit_log', '_schema_version']);

export function isProtectedTable(table: string): boolean {
  return PROTECTED_TABLES.has(table);
}

// ── Error factories ─────────────────────────────────────────────────────────────

export function denied(msg: string): Error {
  return Object.assign(new Error(msg), { code: CapErr.Denied });
}

export function notFound(msg: string): Error {
  return Object.assign(new Error(msg), { code: CapErr.NotFound });
}

export function validationErr(msg: string): Error {
  return Object.assign(new Error(msg), { code: CapErr.HandlerThrew });
}

// ── Guards ──────────────────────────────────────────────────────────────────────

export function enforceOwnership(
  owner: string,
  caller: CallerIdentity | undefined,
  table: string,
): void {
  if (caller === undefined) return; // Main-internal caller → dormant
  if (caller.bundleId !== owner) {
    throw denied(
      `store.write: caller '${caller.bundleId}' is not the owner of '${table}' (owner: '${owner}')`,
    );
  }
}

export function enforceAudit(audit: AuditTag): void {
  if (typeof audit.event !== 'string' || audit.event.trim().length === 0) {
    throw validationErr('store.write: audit.event must be a non-empty string');
  }
}

export function validateColumns(
  meta: TableMeta,
  cols: ReadonlyArray<string>,
  context: string,
): void {
  for (const col of cols) {
    if (!meta.columns.has(col)) {
      throw validationErr(`store.write: unknown column '${col}' in ${context}`);
    }
  }
}

/** Validate where object: must be non-empty, plain object; values must be string|number only. */
export function validateWherePredicate(
  where: unknown,
  context: string,
): Record<string, string | number> {
  if (!where || typeof where !== 'object' || Array.isArray(where)) {
    throw validationErr(`store.write.${context}: where must be a plain object`);
  }
  const keys = Object.keys(where as object);
  if (keys.length === 0) {
    throw validationErr(
      `store.write.${context}: where predicate must not be empty (blast-radius guard)`,
    );
  }
  const typed = where as Record<string, unknown>;
  for (const k of keys) {
    const v = typed[k];
    if (typeof v !== 'string' && typeof v !== 'number') {
      throw validationErr(
        `store.write.${context}: where value for column '${k}' must be string or number (got ${typeof v})`,
      );
    }
  }
  return typed as Record<string, string | number>;
}

// ── Argument parsing ────────────────────────────────────────────────────────────

export function parseInsertArgs(args: ReadonlyArray<unknown>): {
  table: string;
  row: Record<string, unknown>;
  audit: AuditTag;
} {
  const [table, row, audit] = args;
  if (typeof table !== 'string') throw validationErr('store.write.insert: table must be a string');
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw validationErr('store.write.insert: row must be a plain object');
  }
  if (!audit || typeof audit !== 'object' || Array.isArray(audit)) {
    throw validationErr('store.write.insert: audit must be a plain object');
  }
  return { table, row: row as Record<string, unknown>, audit: audit as AuditTag };
}

export function parseUpdateArgs(args: ReadonlyArray<unknown>): {
  table: string;
  pkValue: unknown;
  patch: Record<string, unknown>;
  audit: AuditTag;
} {
  const [table, pkValue, patch, audit] = args;
  if (typeof table !== 'string') throw validationErr('store.write.update: table must be a string');
  if (pkValue === undefined || pkValue === null) {
    throw validationErr('store.write.update: pkValue must be provided');
  }
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw validationErr('store.write.update: patch must be a plain object');
  }
  if (!audit || typeof audit !== 'object' || Array.isArray(audit)) {
    throw validationErr('store.write.update: audit must be a plain object');
  }
  return { table, pkValue, patch: patch as Record<string, unknown>, audit: audit as AuditTag };
}

export function parseDeleteArgs(args: ReadonlyArray<unknown>): {
  table: string;
  pkValue: unknown;
  audit: AuditTag;
} {
  const [table, pkValue, audit] = args;
  if (typeof table !== 'string') throw validationErr('store.write.delete: table must be a string');
  if (pkValue === undefined || pkValue === null) {
    throw validationErr('store.write.delete: pkValue must be provided');
  }
  if (!audit || typeof audit !== 'object' || Array.isArray(audit)) {
    throw validationErr('store.write.delete: audit must be a plain object');
  }
  return { table, pkValue, audit: audit as AuditTag };
}

export function parseDeleteWhereArgs(args: ReadonlyArray<unknown>): {
  table: string;
  where: Record<string, string | number>;
  audit: AuditTag;
} {
  const [table, whereRaw, audit] = args;
  if (typeof table !== 'string') throw validationErr('store.write.deleteWhere: table must be a string');
  const where = validateWherePredicate(whereRaw, 'deleteWhere');
  if (!audit || typeof audit !== 'object' || Array.isArray(audit)) {
    throw validationErr('store.write.deleteWhere: audit must be a plain object');
  }
  return { table, where, audit: audit as AuditTag };
}

export function parseUpdateWhereArgs(args: ReadonlyArray<unknown>): {
  table: string;
  where: Record<string, string | number>;
  patch: Record<string, unknown>;
  audit: AuditTag;
} {
  const [table, whereRaw, patch, audit] = args;
  if (typeof table !== 'string') throw validationErr('store.write.updateWhere: table must be a string');
  const where = validateWherePredicate(whereRaw, 'updateWhere');
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw validationErr('store.write.updateWhere: patch must be a plain object');
  }
  if (!audit || typeof audit !== 'object' || Array.isArray(audit)) {
    throw validationErr('store.write.updateWhere: audit must be a plain object');
  }
  return { table, where, patch: patch as Record<string, unknown>, audit: audit as AuditTag };
}
