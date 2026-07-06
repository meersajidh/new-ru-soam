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
import { CapErr } from '../../shared/ipc-protocol.js';
import { localStoreManager } from './index.js';
import { tableOwner, tableResidency, getOrderedMigrationSets } from './migrations.js';
import { auditService } from '../audit/index.js';
import type { AuditEventKind } from '../audit/audit-types.js';
import {
  PROTECTED_TABLES,
  denied,
  notFound,
  validationErr,
  validateColumns,
  enforceOwnership,
  enforceAudit,
  parseInsertArgs,
  parseUpdateArgs,
  parseDeleteArgs,
  parseDeleteWhereArgs,
  parseUpdateWhereArgs,
} from './store-write-validate.js';
import type { TableMeta } from './store-write-validate.js';

// AuditTag now lives in store-write-validate; re-export so existing importers
// (store-query-cap) keep resolving it from here.
export type { AuditTag } from './store-write-validate.js';

// ── Column-info cache ─────────────────────────────────────────────────────────

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

function doDeleteWhere(
  db: DatabaseT.Database,
  table: string,
  where: Record<string, string | number>,
  meta: TableMeta,
): { changes: number } {
  const whereCols = Object.keys(where);
  validateColumns(meta, whereCols, 'where predicate');
  const whereClauses = whereCols.map((c) => `${c} = ?`).join(' AND ');
  const whereValues = whereCols.map((c) => where[c]);
  const stmt = db.prepare(`DELETE FROM ${table} WHERE ${whereClauses}`);
  const result = stmt.run(...whereValues) as { changes: number };
  return { changes: result.changes };
}

function doUpdateWhere(
  db: DatabaseT.Database,
  table: string,
  where: Record<string, string | number>,
  patch: Record<string, unknown>,
  meta: TableMeta,
): { changes: number } {
  const patchCols = Object.keys(patch);
  if (patchCols.length === 0) {
    // No-op: empty patch.
    return { changes: 0 };
  }
  const whereCols = Object.keys(where);
  validateColumns(meta, patchCols, 'update patch');
  validateColumns(meta, whereCols, 'where predicate');
  const setClauses = patchCols.map((c) => `${c} = ?`).join(', ');
  const whereClauses = whereCols.map((c) => `${c} = ?`).join(' AND ');
  const patchValues = patchCols.map((c) => patch[c]);
  const whereValues = whereCols.map((c) => where[c]);
  const stmt = db.prepare(`UPDATE ${table} SET ${setClauses} WHERE ${whereClauses}`);
  const result = stmt.run(...patchValues, ...whereValues) as { changes: number };
  return { changes: result.changes };
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

        case 'deleteWhere': {
          const { table, where, audit } = parseDeleteWhereArgs(args);
          const owner = enforceTable(table);
          enforceOwnership(owner, caller, table);
          enforceAudit(audit);

          const store = requireStoreForTable(table);
          const db = requireDb(store);
          const workspaceId = store.workspaceId()!;
          const meta = getTableMeta(db, table);

          const result = doDeleteWhere(db, table, where, meta);

          // Coarse emit — multi-row delete has no single pk; pass empty id array.
          store.emitTableChange(table, 'delete', []);
          auditService.emit({
            event: audit.event as AuditEventKind,
            entityId: workspaceId,
            recordId: audit.recordId !== undefined ? String(audit.recordId) : undefined,
            recordType: audit.recordType,
            detail: audit.detail as Record<string, string | number | boolean> | undefined,
            principal: caller?.bundleId ?? 'system',
          });

          return result;
        }

        case 'updateWhere': {
          const { table, where, patch, audit } = parseUpdateWhereArgs(args);
          const owner = enforceTable(table);
          enforceOwnership(owner, caller, table);
          enforceAudit(audit);

          const store = requireStoreForTable(table);
          const db = requireDb(store);
          const workspaceId = store.workspaceId()!;
          const meta = getTableMeta(db, table);

          const result = doUpdateWhere(db, table, where, patch, meta);

          // Coarse emit — multi-row update has no single pk; pass empty id array.
          store.emitTableChange(table, 'set', []);
          auditService.emit({
            event: audit.event as AuditEventKind,
            entityId: workspaceId,
            recordId: audit.recordId !== undefined ? String(audit.recordId) : undefined,
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

// ── store.eraseSubject@1.0 ────────────────────────────────────────────────────

/**
 * Register the `store.eraseSubject@1.0` capability.
 *
 * Cascades a subject-key DELETE across ALL registered bundles' owned tables that
 * contain `keyColumn`. Caller supplies the column name (e.g. 'patient_id') and
 * the value to delete. The cap is domain-free — it knows nothing about patients
 * or PHI; the DOMAIN caller supplies the column name.
 *
 * Enforcement:
 *   - phi:true + first-party gate (registry layer, same as store.write).
 *   - PROTECTED_TABLES are skipped (they cannot be mutated via the generic surface).
 *   - Tables that do NOT have `keyColumn` are silently skipped (PRAGMA-checked).
 *   - Runs through the Main-INTERNAL write path (caller===undefined bypass in
 *     enforceOwnership) so it can delete across owners without cap.denied.
 *
 * Returns: `{ deleted: Record<string, number> }` — per-table deleted-row counts
 * (only tables where at least one row was deleted are included).
 *
 * Audit: one entry per table touched (non-zero deletes); detail = { table, count }
 * — PHI-free (ADR-502). keyValue is NEVER logged.
 *
 * (O490 / ADR-506 domain purity)
 */
export function registerStoreEraseSubjectCapability(): void {
  registerCapability(
    'store.eraseSubject',
    '1.0',
    async (method, args) => {
      if (method !== 'eraseSubject') {
        throw Object.assign(
          new Error(`store.eraseSubject: unknown method: ${method}`),
          { code: CapErr.MethodNotFound },
        );
      }

      // ── Parse args ──────────────────────────────────────────────────────────
      const [keyColumn, keyValue, auditRaw] = args;
      if (typeof keyColumn !== 'string' || keyColumn.trim().length === 0) {
        throw validationErr('store.eraseSubject: keyColumn must be a non-empty string');
      }
      if (keyValue === undefined || keyValue === null) {
        throw validationErr('store.eraseSubject: keyValue must be provided');
      }
      if (
        typeof keyValue !== 'string' &&
        typeof keyValue !== 'number'
      ) {
        throw validationErr('store.eraseSubject: keyValue must be string or number');
      }
      // audit is optional at the top level; per-table audits are auto-generated.
      // We accept an optional caller-supplied audit.recordId for the subject.
      const subjectRecordId =
        auditRaw && typeof auditRaw === 'object' && !Array.isArray(auditRaw)
          ? String((auditRaw as Record<string, unknown>)['recordId'] ?? keyValue)
          : String(keyValue);

      // ── Enumerate all registered owned tables ────────────────────────────────
      const sets = getOrderedMigrationSets();
      const deleted: Record<string, number> = {};

      for (const set of sets) {
        for (const table of set.ownedTables) {
          // Skip integrity-critical tables — they must not be mutated here.
          if (PROTECTED_TABLES.has(table)) continue;

          // Route to the correct physical DB by residency.
          const residency = set.residency ?? 'operational';
          const store =
            residency === 'protected'
              ? localStoreManager.protectedCurrent()
              : localStoreManager.current();
          if (!store) {
            // Store not open (e.g. protected store locked). Skip — same behaviour
            // as requireStoreForTable: we must not abort the whole cascade.
            continue;
          }
          const db = store.rawDb();
          if (!db) continue;

          // PRAGMA-check whether keyColumn exists in this table.
          // Reuse _tableMeta cache when available; safe because getTableMeta
          // only throws for unknown tables (already covered by the ownedTables
          // iteration — all registered tables must exist post-migration).
          let meta: TableMeta;
          try {
            meta = getTableMeta(db, table);
          } catch {
            // Table doesn't exist yet (not yet migrated) — skip.
            continue;
          }
          if (!meta.columns.has(keyColumn)) continue;

          // Execute Main-INTERNAL deleteWhere (ownership bypass: no caller arg).
          const result = doDeleteWhere(
            db,
            table,
            { [keyColumn]: keyValue },
            meta,
          );

          if (result.changes > 0) {
            deleted[table] = result.changes;
            // Emit store.changed for subscribers.
            store.emitTableChange(table, 'delete', []);
            // One PHI-free audit entry per table touched.
            const workspaceId = store.workspaceId()!;
            auditService.emit({
              event: 'store.eraseSubject' as AuditEventKind,
              entityId: workspaceId,
              recordId: subjectRecordId,
              recordType: table,
              detail: { table, count: result.changes },
              principal: 'system',
            });
          }
        }
      }

      return { deleted };
    },
    { phi: true, kind: 'command' },
  );
}
