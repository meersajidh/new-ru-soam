/**
 * Pre-migration backup helper — ADR-308 §2.
 *
 * `createPreMigrationBackup(dbPath, fromSchema)`:
 *   - Makes a byte-for-byte copy of the SQLCipher file before migration runs.
 *   - Rotates backups older than N = 3.
 *   - Emits audit-ledger entries `update.backup.created` and
 *     `update.backup.rotated` via the existing AuditService.
 *
 * The backup file name includes the schema version and a unix timestamp so
 * multiple backups from different upgrade steps are distinguishable.
 *
 * PHI safety: the copy is byte-for-byte SQLCipher. No plaintext leaves the
 * device at any point (ADR-301). Key material is never touched here.
 *
 * NOT wired into a live migration runner — that is Phase 10b. This file is
 * unit-tested only; live wiring is deferred per the Phase A.1 brief.
 */

import fs from 'fs';
import path from 'path';
import type { AuditEntry } from '../audit/audit-types.js';
import { auditService } from '../audit/index.js';

/** Maximum number of backup files retained per database path. */
const MAX_BACKUPS = 3;

/** Shape returned by createPreMigrationBackup. */
export interface BackupResult {
  /** Absolute path to the newly created backup file. */
  readonly path: string;
}

/**
 * Build the backup file path for a given DB path, schema version, and
 * unix timestamp (ms). Exported for test determinism.
 */
export function buildBackupPath(dbPath: string, fromSchema: number, timestampMs: number): string {
  const dir = path.dirname(dbPath);
  const base = path.basename(dbPath);
  return path.join(dir, `${base}.backup-v${fromSchema}-${timestampMs}`);
}

/**
 * List all existing backup files for `dbPath`, sorted by timestamp ascending
 * (oldest first). Returns full paths.
 */
export function listBackups(dbPath: string): string[] {
  const dir = path.dirname(dbPath);
  const base = path.basename(dbPath);
  const prefix = `${base}.backup-v`;

  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return [];
  }

  // Sort by the trailing timestamp integer (digits after the final '-') ascending
  // (oldest first). Lexicographic sort would mis-order schema segments once they
  // reach two digits (e.g. "v10" sorts before "v2").
  return entries
    .filter((e) => e.startsWith(prefix))
    .map((e) => path.join(dir, e))
    .sort((a, b) => {
      const tsA = parseInt(a.slice(a.lastIndexOf('-') + 1), 10);
      const tsB = parseInt(b.slice(b.lastIndexOf('-') + 1), 10);
      return tsA - tsB;
    });
}

/** Optional injected audit emitter. Defaults to the global auditService. */
export type AuditEmitter = (entry: AuditEntry) => void;

/**
 * Create a pre-migration backup of the SQLCipher DB at `dbPath`.
 *
 * Steps:
 *   1. Copy `dbPath` → backup path (byte-for-byte via fs.copyFileSync).
 *   2. Rotate backups older than MAX_BACKUPS.
 *   3. Emit audit entries.
 *
 * Throws if the copy fails (disk full, IO error). Caller must not proceed
 * with migration if this throws (ADR-308 §2).
 *
 * @param emitAudit - Optional audit emitter. Defaults to `auditService.emit`.
 *   Pass a custom emitter in tests to capture events without a live store.
 */
export function createPreMigrationBackup(
  dbPath: string,
  fromSchema: number,
  emitAudit: AuditEmitter = (e) => auditService.emit(e),
): BackupResult {
  const timestampMs = Date.now();
  const backupPath = buildBackupPath(dbPath, fromSchema, timestampMs);

  // Byte-for-byte copy — SQLCipher file stays encrypted.
  fs.copyFileSync(dbPath, backupPath);

  const stat = fs.statSync(backupPath);
  const byteSize = stat.size;

  // Emit audit entry for the new backup.
  emitAudit({
    event: 'update.backup.created',
    principal: 'system',
    entityId: 'system',
    detail: {
      path: backupPath,
      fromSchema,
      byteSize,
    },
  });

  // Rotate: keep only the MAX_BACKUPS most recent. The newly created backup is
  // already on disk; listBackups now includes it.
  const all = listBackups(dbPath);
  const toRotate = all.slice(0, Math.max(0, all.length - MAX_BACKUPS));
  for (const old of toRotate) {
    try {
      fs.unlinkSync(old);
      emitAudit({
        event: 'update.backup.rotated',
        principal: 'system',
        entityId: 'system',
        detail: { path: old },
      });
    } catch {
      // Rotation failure is non-fatal — log but do not block the migration.
      console.warn('[backup] failed to rotate old backup:', old);
    }
  }

  return { path: backupPath };
}
