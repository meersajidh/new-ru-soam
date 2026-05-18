/**
 * LocalStore — SQLite-backed per-workspace key/value + (future) table store.
 *
 * Phase 10a: plaintext SQLite. The DB file lives inside the workspace dir,
 * which is already under the user's protected app-data path. SQLCipher /
 * at-rest encryption lands in Phase 10b — the public surface here will not
 * change (the open path internally swaps in a keyed pragma).
 *
 * Each write emits a change event via the injected `emitChange` callback
 * (set by main/index.ts). The store stays uncoupled from the IPC layer —
 * tests can pass a no-op emitter; production passes a webContents broadcaster.
 *
 * Lifecycle (per Phase 10a brief):
 *   - open()  on workspace activate (after unlock, in practice — the registry
 *             only sets-active for an existing setup-complete workspace).
 *   - close() on workspace sign-out and on app `before-quit`.
 *   - NOT closed on lock — prefs are Operational class (ADR-302 §"Class 2"),
 *     they survive lock the same way Operational data survives lock.
 *
 * Follows the disposable pattern (docs/Guides/disposable-pattern.md): `close()`
 * is idempotent.
 */

import Database from 'better-sqlite3';
import type DatabaseT from 'better-sqlite3';
import { localStoreDbPath } from './paths.js';
import { runMigrations } from './migrations.js';
import type { StoreChangedPayload } from '../../shared/ipc-protocol.js';

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

export class LocalStore {
  private _db: DatabaseT.Database | null = null;
  private _workspaceId: string | null = null;
  private readonly _emitChange: (payload: StoreChangedPayload) => void;

  constructor(opts: LocalStoreOptions) {
    this._emitChange = opts.emitChange;
  }

  /**
   * Open (or create) the DB for `workspaceId`. Runs pending migrations.
   * Safe to call when already open with the same workspaceId (no-op);
   * throws if asked to open a different workspace without `close()` first.
   */
  open(workspaceId: string): void {
    if (this._db !== null) {
      if (this._workspaceId === workspaceId) return;
      throw new Error(
        `LocalStore.open(${workspaceId}) refused: already open for ${this._workspaceId}`,
      );
    }
    const dbPath = localStoreDbPath(workspaceId);
    const db = new Database(dbPath);
    // WAL = better concurrent-reader behavior; foreign_keys for any future
    // tables with references.
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
    this._db = db;
    this._workspaceId = workspaceId;
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

  isOpen(): boolean {
    return this._db !== null;
  }

  /** Returns the active workspace id, or null when closed. */
  workspaceId(): string | null {
    return this._workspaceId;
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
}
