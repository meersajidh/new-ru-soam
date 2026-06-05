/**
 * store.write@1.0 — Generic ownership-scoped write capability (ADR-506 §6 rung C / O446).
 *
 * Provides parameterized INSERT / UPDATE / DELETE for tables whose ownership
 * has been declared via `MigrationSet.ownedTables`. The caller must be the
 * declared owner of the target table; table + column names are validated
 * server-side (PRAGMA table_info); SQL is built in Main — callers never supply
 * raw SQL or unvalidated identifiers.
 *
 * PHI classification: `phi: true` (wholesale for this slice — all current owned
 * tables are PHI). Per-table PHI classification is a future refinement (rung C+).
 *
 * Enforcement order per call:
 *   1. Registry PHI-trustClass gate (first-party only when caller is present) — registry layer
 *   2. Registry lock-gate (rejects cap.locked when workspace locked) — registry layer
 *   3. Handler: tableOwner resolve → null ⇒ cap.not_found
 *   4. Handler: PROTECTED_TABLES check → cap.denied (integrity guard, even for Main-internal caller)
 *   5. Handler: ownership gate → caller.bundleId ≠ owner ⇒ cap.denied (dormant when caller === undefined)
 *   6. Handler: audit.event non-empty validation → cap.handler_threw
 *   7. Handler: PRAGMA column validation → cap.handler_threw
 *   8. Execute parameterized SQL → emit store.changed + audit entry
 *
 * ADR-106 boundary: base code. MUST NOT import any domain module.
 * Imports: tableOwner (migrations, base), localStoreManager (base), auditService (base).
 */

import type DatabaseT from 'better-sqlite3';
import { registerCapability } from '../capability/registry.js';
import type { CallerIdentity } from '../capability/registry.js';
import { CapErr } from '../../shared/ipc-protocol.js';
import { localStoreManager } from './index.js';
import { tableOwner, tableResidency } from './migrations.js';
import { auditService } from '../audit/index.js';
import type { AuditEventKind } from '../audit/audit-types.js';

// ── Protected tables ──────────────────────────────────────────────────────────

/**
 * Tables that must never be mutated via the generic write surface.
 *   audit_log    — append-only; written only by the audit service
 *   _schema_version — migration infra
 */
const PROTECTED_TABLES: ReadonlySet<string> = new Set(['audit_log', '_schema_version']);

// ── Column-info cache ─────────────────────────────────────────────────────────

interface TableMeta {
  readonly columns: ReadonlySet<string>;
  /** Name of the single-column primary key (pk=1 in PRAGMA table_info). */
  readonly pk: string;
}

/** Module-level cache. Keys are table names (post-validation). */
const _tableMeta = new Map<string, TableMeta>();

interface PragmaTableInfoRow {
  readonly name: string;
  readonly pk: number;
}

function getTableMeta(db: DatabaseT.Database, table: string): TableMeta {
  const cached = _tableMeta.get(table);
  if (cached !== undefined) return cached;

  // Table name comes from the validated ownership map — safe to interpolate.
  const rows = db.pragma(`table_info(${table})`) as PragmaTableInfoRow[];
  if (rows.length === 0) {
    throw Object.assign(new Error(`store.write: PRAGMA table_info returned no rows for '${table}'`), {
      code: CapErr.NotFound,
    });
  }

  const columns = new Set(rows.map((r) => r.name));
  const pkRow = rows.find((r) => r.pk === 1);
  if (!pkRow) {
    throw Object.assign(
      new Error(`store.write: table '${table}' has no single-column primary key (pk=1)`),
      { code: CapErr.HandlerThrew },
    );
  }

  const meta: TableMeta = { columns, pk: pkRow.name };
  _tableMeta.set(table, meta);
  return meta;
}

// ── Error factories ───────────────────────────────────────────────────────────

function denied(msg: string): Error {
  return Object.assign(new Error(msg), { code: CapErr.Denied });
}

function notFound(msg: string): Error {
  return Object.assign(new Error(msg), { code: CapErr.NotFound });
}

function validationErr(msg: string): Error {
  return Object.assign(new Error(msg), { code: CapErr.HandlerThrew });
}

// ── AuditTag ──────────────────────────────────────────────────────────────────

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

// ── Store / DB helpers ────────────────────────────────────────────────────────

/**
 * Resolve the correct store for `table` based on its declared residency.
 * Returns `protectedCurrent()` when the table lives in the protected store;
 * `current()` for operational tables. Throws `cap.not_found` if the chosen
 * store is null/closed (defensive — the PHI gate already blocks calls while
 * locked, but the protected store may genuinely be absent for non-PHI tables).
 * (O452 / ADR-302 §"Residency split")
 */
function requireStoreForTable(table: string) {
  const residency = tableResidency(table);
  const store = residency === 'protected'
    ? localStoreManager.protectedCurrent()
    : localStoreManager.current();
  if (!store) {
    throw notFound(
      residency === 'protected'
        ? 'store.write: protected store not open (workspace locked?)'
        : 'store.write: no active workspace',
    );
  }
  return store;
}

function requireDb(store: ReturnType<typeof requireStoreForTable>) {
  const db = store.rawDb();
  if (!db) throw notFound('store.write: store not open');
  return db;
}

// ── Enforcement helpers ───────────────────────────────────────────────────────

function enforceTable(table: string): string {
  const owner = tableOwner(table);
  if (owner === null) {
    throw notFound(`store.write: unknown or unowned table: ${table}`);
  }
  if (PROTECTED_TABLES.has(table)) {
    throw denied(
      `store.write: table '${table}' is protected (integrity-critical; use the dedicated service)`,
    );
  }
  return owner;
}

function enforceOwnership(owner: string, caller: CallerIdentity | undefined, table: string): void {
  if (caller === undefined) return; // Main-internal caller → dormant
  if (caller.bundleId !== owner) {
    throw denied(
      `store.write: caller '${caller.bundleId}' is not the owner of '${table}' (owner: '${owner}')`,
    );
  }
}

function enforceAudit(audit: AuditTag): void {
  if (typeof audit.event !== 'string' || audit.event.trim().length === 0) {
    throw validationErr('store.write: audit.event must be a non-empty string');
  }
}

function validateColumns(
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

// ── Write operations ──────────────────────────────────────────────────────────

function doInsert(
  db: DatabaseT.Database,
  table: string,
  row: Record<string, unknown>,
  meta: TableMeta,
): { changes: number } {
  const cols = Object.keys(row);
  if (cols.length === 0) {
    throw validationErr('store.write: insert row must have at least one column');
  }
  validateColumns(meta, cols, 'insert row');

  const placeholders = cols.map(() => '?').join(', ');
  const colList = cols.join(', ');
  const values = cols.map((c) => row[c]);

  // Table name comes from validated ownership map; column names validated against PRAGMA.
  const stmt = db.prepare(`INSERT INTO ${table} (${colList}) VALUES (${placeholders})`);
  const result = stmt.run(...values) as { changes: number };
  return { changes: result.changes };
}

function doUpdate(
  db: DatabaseT.Database,
  table: string,
  pkValue: unknown,
  patch: Record<string, unknown>,
  meta: TableMeta,
): { changes: number } {
  const cols = Object.keys(patch);
  if (cols.length === 0) {
    // No-op: empty patch.
    return { changes: 0 };
  }
  validateColumns(meta, cols, 'update patch');

  const setClauses = cols.map((c) => `${c} = ?`).join(', ');
  const values = cols.map((c) => patch[c]);

  const stmt = db.prepare(`UPDATE ${table} SET ${setClauses} WHERE ${meta.pk} = ?`);
  const result = stmt.run(...values, pkValue) as { changes: number };
  return { changes: result.changes };
}

function doDelete(
  db: DatabaseT.Database,
  table: string,
  pkValue: unknown,
  meta: TableMeta,
): { changes: number } {
  const stmt = db.prepare(`DELETE FROM ${table} WHERE ${meta.pk} = ?`);
  const result = stmt.run(pkValue) as { changes: number };
  return { changes: result.changes };
}

// ── Argument parsing helpers ──────────────────────────────────────────────────

function parseInsertArgs(args: ReadonlyArray<unknown>): {
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

function parseUpdateArgs(args: ReadonlyArray<unknown>): {
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

function parseDeleteArgs(args: ReadonlyArray<unknown>): {
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

// ── Capability registration ───────────────────────────────────────────────────

/**
 * Register the `store.write@1.0` capability with the Main capability registry.
 * Call once at boot, after `setLockServiceGetter(...)`.
 * (ADR-506 §6 rung C / O446)
 */
export function registerStoreWriteCapability(): void {
  registerCapability(
    'store.write',
    '1.0',
    async (method, args, caller) => {
      switch (method) {
        case 'insert': {
          const { table, row, audit } = parseInsertArgs(args);
          const owner = enforceTable(table);
          enforceOwnership(owner, caller, table);
          enforceAudit(audit);

          const store = requireStoreForTable(table);
          const db = requireDb(store);
          const workspaceId = store.workspaceId()!;
          const meta = getTableMeta(db, table);

          const result = doInsert(db, table, row, meta);

          // Emit store.changed + audit after successful write.
          const pkValue = row[meta.pk];
          store.emitTableChange(table, 'set', [String(pkValue ?? '')]);
          auditService.emit({
            event: audit.event as AuditEventKind,
            entityId: workspaceId,
            recordId: pkValue !== undefined && pkValue !== null ? String(pkValue) : undefined,
            recordType: audit.recordType,
            detail: audit.detail as Record<string, string | number | boolean> | undefined,
            principal: caller?.bundleId ?? 'system',
          });

          return result;
        }

        case 'update': {
          const { table, pkValue, patch, audit } = parseUpdateArgs(args);
          const owner = enforceTable(table);
          enforceOwnership(owner, caller, table);
          enforceAudit(audit);

          const store = requireStoreForTable(table);
          const db = requireDb(store);
          const workspaceId = store.workspaceId()!;
          const meta = getTableMeta(db, table);

          const result = doUpdate(db, table, pkValue, patch, meta);

          store.emitTableChange(table, 'set', [String(pkValue)]);
          auditService.emit({
            event: audit.event as AuditEventKind,
            entityId: workspaceId,
            recordId: String(pkValue),
            recordType: audit.recordType,
            detail: audit.detail as Record<string, string | number | boolean> | undefined,
            principal: caller?.bundleId ?? 'system',
          });

          return result;
        }

        case 'delete': {
          const { table, pkValue, audit } = parseDeleteArgs(args);
          const owner = enforceTable(table);
          enforceOwnership(owner, caller, table);
          enforceAudit(audit);

          const store = requireStoreForTable(table);
          const db = requireDb(store);
          const workspaceId = store.workspaceId()!;
          const meta = getTableMeta(db, table);

          const result = doDelete(db, table, pkValue, meta);

          store.emitTableChange(table, 'delete', [String(pkValue)]);
          auditService.emit({
            event: audit.event as AuditEventKind,
            entityId: workspaceId,
            recordId: String(pkValue),
            recordType: audit.recordType,
            detail: audit.detail as Record<string, string | number | boolean> | undefined,
            principal: caller?.bundleId ?? 'system',
          });

          return result;
        }

        default:
          throw Object.assign(new Error(`store.write: unknown method: ${method}`), {
            code: CapErr.MethodNotFound,
          });
      }
    },
    { phi: true, kind: 'command' },
  );
}
