/**
 * LocalStore — SQLite-backed per-workspace key/value + table store.
 *
 * Phase 10b: at-rest encryption via better-sqlite3-multiple-ciphers
 * (better-sqlite3 is npm-aliased to it — see package.json). NOT SQLCipher:
 * the cipher is the library DEFAULT scheme `chacha20` (sqleet-compatible),
 * since no `cipher`/`legacy` pragma is set. The DB is opened with a 32-byte
 * raw key applied as `PRAGMA key = "x'<64hex>'"` before any other pragma or
 * migration. If the DB is plaintext (Phase 10a leftover) or corrupt the open
 * call will fail — in that case the DB is deleted and recreated encrypted.
 *
 * To inspect a workspace DB externally, use a chacha20-capable shell
 * (`sqlite3mc`), NOT `sqlcipher` — the latter cannot decrypt this format.
 * Helper: `just dev-db <name> --tables` (scripts/dev-localstore.mjs).
 *
 * Each write emits a change event via the injected `emitChange` callback.
 *
 * Lifecycle (per Phase 10b brief):
 *   - open(workspaceId, key) on workspace activate.
 *   - close() on workspace sign-out and on app `before-quit`.
 *   - NOT closed on lock — prefs are Operational class (ADR-302 §"Class 2").
 *
 * Disposable pattern (docs/Guides/disposable-pattern.md): `close()` is idempotent.
 */

import { createHash } from 'crypto';
import { unlinkSync } from 'fs';
import Database from 'better-sqlite3';
import type DatabaseT from 'better-sqlite3';
import { localStoreDbPath } from './paths.js';
import { runMigrations } from './migrations.js';
import type { StoreChangedPayload } from '../../shared/ipc-protocol.js';
import type { AuditEntry, AuditRow } from '../audit/audit-types.js';

export interface LocalStoreOptions {
  /**
   * Called after every successful write to broadcast a `store.changed`
   * platform event to the renderer. Receives the payload directly.
   */
  readonly emitChange: (payload: StoreChangedPayload) => void;
}

export interface PrefRow {
  readonly key: string;
  readonly value: string;
  readonly updatedAt: number;
}

/**
 * Open a fresh, keyed SQLite DB at `dbPath`.
 * Applies the cipher key pragma (default chacha20 scheme), then WAL +
 * foreign_keys, then migrations.
 *
 * The caller owns `key`'s lifecycle and is responsible for zeroing the buffer
 * after `open()` returns — `openEncryptedDb` may be called twice (initial +
 * recreate-on-plaintext path), so an internal `key.fill(0)` would break the
 * recreate scenario. `LocalStore.open` zeros the buffer in a `finally` block.
 *
 * Note: `key.toString('hex')` produces an immutable JS string that lingers in
 * V8 heap until GC. This is an accepted residue for Phase 10b (Main process,
 * OS-keychain-backed key, no untrusted code in this trust zone).
 */
function openEncryptedDb(dbPath: string, key: Buffer): DatabaseT.Database {
  const db = new Database(dbPath);
  // Cipher key must be applied before any other operation.
  // Hex form: key = "x'<64 hex chars>'" for a raw 32-byte key.
  db.pragma(`key = "x'${key.toString('hex')}'"`);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

export class LocalStore {
  private _db: DatabaseT.Database | null = null;
  private _workspaceId: string | null = null;
  private readonly _emitChange: (payload: StoreChangedPayload) => void;

  constructor(opts: LocalStoreOptions) {
    this._emitChange = opts.emitChange;
  }

  /**
   * Open (or create) the encrypted DB for `workspaceId`. Runs pending
   * migrations. Safe to call when already open for same workspaceId (no-op).
   * Throws if asked to open a different workspace without `close()` first.
   *
   * If the DB is plaintext (Phase 10a leftover) or corrupt, it is deleted and
   * recreated encrypted — a single console.warn is emitted.
   */
  open(workspaceId: string, key: Buffer): void {
    if (this._db !== null) {
      if (this._workspaceId === workspaceId) return;
      throw new Error(
        `LocalStore.open(${workspaceId}) refused: already open for ${this._workspaceId}`,
      );
    }
    const dbPath = localStoreDbPath(workspaceId);
    let db: DatabaseT.Database | undefined;
    try {
      try {
        db = openEncryptedDb(dbPath, key);
        // Verify the key worked — integrity_check returns 'ok' on a properly
        // keyed DB. On a plaintext DB the pragma will return a garbage string
        // (because it's reading ciphertext as page data) or throw.
        const check = db.pragma('integrity_check', { simple: true }) as string;
        if (check !== 'ok') {
          throw new Error(`integrity_check returned: ${check}`);
        }
      } catch {
        // Plaintext DB from Phase 10a or corrupt file — close handle (if open),
        // delete, and recreate encrypted.
        if (db) {
          try { db.close(); } catch { /* ignore */ }
        }
        try { unlinkSync(dbPath); } catch { /* file may not exist */ }
        console.warn('[local-store] plaintext DB detected — recreated encrypted', { workspaceId });
        db = openEncryptedDb(dbPath, key);
      }
      this._db = db;
      this._workspaceId = workspaceId;
    } finally {
      // Zero the key buffer regardless of success/exception. Caller may
      // double-zero; that's a harmless no-op on the same Buffer reference.
      key.fill(0);
    }
  }

  /** Close the DB if open. Idempotent. */
  close(): void {
    if (this._db === null) return;
    try {
      this._db.close();
    } finally {
      this._db = null;
      this._workspaceId = null;
    }
  }

  /**
   * Quiesce the DB for update-time safety (ADR-308 §6).
   * Runs PRAGMA wal_checkpoint(TRUNCATE) if WAL mode is active, then closes.
   * Safe to call when already closed (no-op).
   */
  quiesce(): void {
    if (this._db === null) return;
    try {
      const mode = this._db.pragma('journal_mode', { simple: true });
      if (mode === 'wal') {
        this._db.pragma('wal_checkpoint(TRUNCATE)');
      }
    } catch (err) {
      console.warn('[local-store] quiesce WAL checkpoint failed:', err);
    }
    this.close();
  }

  isOpen(): boolean {
    return this._db !== null;
  }

  /** Returns the active workspace id, or null when closed. */
  workspaceId(): string | null {
    return this._workspaceId;
  }

  /**
   * Expose the raw SQLite database handle for domain modules that need to
   * execute their own SQL (ADR-504: domain capabilities in Main that own their
   * own tables but must not import domain SQL into the base store class).
   *
   * Returns null when the store is not open. Callers MUST check for null.
   * Only domain modules inside `electron/main/domain/` should use this.
   */
  rawDb(): DatabaseT.Database | null {
    return this._db;
  }

  /**
   * Broadcast a `store.changed` event for a table write performed outside of
   * the built-in store methods (e.g. domain module SQL). Mirrors the internal
   * `_emitChange` call that prefs/settings methods make automatically.
   */
  emitTableChange(table: string, op: 'set' | 'delete', keys: ReadonlyArray<string>): void {
    this._emitChange({ table, op, keys });
  }

  private requireDb(): DatabaseT.Database {
    if (this._db === null) {
      throw Object.assign(new Error('LocalStore is not open'), {
        code: 'cap.not_found',
      });
    }
    return this._db;
  }

  // ── Prefs operations ───────────────────────────────────────────────────────

  getPref(key: string): string | null {
    const db = this.requireDb();
    const row = db.prepare(`SELECT value FROM prefs WHERE key = ?`).get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }

  setPref(key: string, value: string): void {
    const db = this.requireDb();
    const now = Date.now();
    db.prepare(
      `INSERT INTO prefs (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    ).run(key, value, now);
    this._emitChange({ table: 'prefs', op: 'set', keys: [key] });
  }

  listPrefs(): PrefRow[] {
    const db = this.requireDb();
    const rows = db
      .prepare(`SELECT key, value, updated_at AS updatedAt FROM prefs ORDER BY key ASC`)
      .all() as Array<{ key: string; value: string; updatedAt: number }>;
    return rows;
  }

  // ── Workspace settings operations ─────────────────────────────────────────

  getSetting(key: string): string | null {
    const db = this.requireDb();
    const row = db.prepare(`SELECT value FROM workspace_settings WHERE key = ?`).get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }

  setSetting(key: string, value: string): void {
    const db = this.requireDb();
    const now = Date.now();
    db.prepare(
      `INSERT INTO workspace_settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    ).run(key, value, now);
    this._emitChange({ table: 'workspace_settings', op: 'set', keys: [key] });
  }

  // ── Audit ledger operations ────────────────────────────────────────────────

  /**
   * Append an audit entry to the hash-chained audit_log table.
   *
   * Hash canonicalization: explicit field-order concatenation into a single
   * JSON object literal — fields are written in source order (seq, ts, event,
   * principal, entityId, recordId, recordType, detail, prevHash). This avoids
   * relying on JSON.stringify key-ordering guarantees while keeping the
   * canonical form reproducible outside the DB.
   *
   * The entire operation runs in a single better-sqlite3 transaction so the
   * read-max-seq → compute-hash → insert is atomic.
   */
  appendAuditEntry(entry: AuditEntry): void {
    const db = this.requireDb();

    const tx = db.transaction(() => {
      // Read max seq (returns -1 if table is empty via COALESCE).
      const maxRow = db
        .prepare(`SELECT COALESCE(MAX(seq), -1) AS maxSeq FROM audit_log`)
        .get() as { maxSeq: number };
      const maxSeq = maxRow.maxSeq;
      const seq = maxSeq + 1;

      // Determine prevHash.
      let prevHash: string;
      if (seq === 0) {
        prevHash = '0'.repeat(64);
      } else {
        const lastRow = db
          .prepare(`SELECT entry_hash FROM audit_log WHERE seq = ?`)
          .get(maxSeq) as { entry_hash: string } | undefined;
        prevHash = lastRow?.entry_hash ?? '0'.repeat(64);
      }

      const ts = Date.now();
      const { event, principal = null, entityId, recordId = null, recordType = null, detail = null } = entry;
      const detailJson = detail !== null ? JSON.stringify(detail) : null;

      // Canonical hash input: explicit key order — seq, ts, event, principal,
      // entityId, recordId, recordType, detail, prevHash.
      // We build a JSON string with sorted top-level keys in this exact order
      // rather than using JSON.stringify on a plain object (insertion-order is
      // stable in V8/Node but not guaranteed by the JSON spec, so we control
      // the order explicitly for cross-platform reproducibility).
      const canonicalInput =
        `{"seq":${seq},"ts":${ts},"event":${JSON.stringify(event)}` +
        `,"principal":${JSON.stringify(principal)}` +
        `,"entityId":${JSON.stringify(entityId)}` +
        `,"recordId":${JSON.stringify(recordId)}` +
        `,"recordType":${JSON.stringify(recordType)}` +
        `,"detail":${JSON.stringify(detailJson)}` +
        `,"prevHash":${JSON.stringify(prevHash)}}`;

      const entryHash = createHash('sha256').update(canonicalInput).digest('hex');

      db.prepare(
        `INSERT INTO audit_log
           (seq, ts, event, principal, entity_id, record_id, record_type, detail, prev_hash, entry_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(seq, ts, event, principal, entityId, recordId, recordType, detailJson, prevHash, entryHash);
    });

    tx();
  }

  /**
   * List audit entries ordered by seq ASC. Default limit 100.
   * Used by the audit@1.0 capability for developer verification.
   */
  listAuditEntries(opts?: { limit?: number; offset?: number }): AuditRow[] {
    const db = this.requireDb();
    const limit = opts?.limit ?? 100;
    const offset = opts?.offset ?? 0;
    const rows = db
      .prepare(
        `SELECT id, seq, ts, event, principal,
                entity_id AS entityId, record_id AS recordId,
                record_type AS recordType, detail,
                prev_hash AS prevHash, entry_hash AS entryHash
         FROM audit_log
         ORDER BY seq ASC
         LIMIT ? OFFSET ?`,
      )
      .all(limit, offset) as AuditRow[];
    return rows;
  }
}
