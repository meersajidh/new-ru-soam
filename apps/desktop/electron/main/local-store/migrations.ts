/**
 * Per-owner schema migration registry for the Local Store (ADR-506 §4/§8, rung B / O444).
 *
 * Design:
 *   - Each subsystem declares a `MigrationSet` with a stable `owner` key (bundleId
 *     or the sentinel 'base') and an ordered list of `Migration` entries numbered
 *     within that owner's namespace (1, 2, 3, …).
 *   - `_schema_version` stores one row per owner: { owner TEXT PK, version INTEGER }.
 *     Default version for a fresh DB is 0 (no row present yet).
 *   - `runMigrations` iterates sets in deterministic order — 'base' ALWAYS first,
 *     then all other owners in registration order — wrapping the entire upgrade for
 *     ALL sets in ONE better-sqlite3 transaction (all-or-nothing).
 *   - Sets are registered via `registerMigrationSet`. The base set self-registers on
 *     module load. Domain sets register via `registerDomainMigrations()` in
 *     `electron/main/domain/bootstrap.ts`, which MUST be called before the store
 *     opens (before `localStoreManager.openFor()`).
 *
 * ADR-106 boundary: this is base code. Domain modules may import from here;
 * this module MUST NOT import from any domain module.
 */

import type DatabaseT from 'better-sqlite3';

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface Migration {
  readonly version: number;
  readonly description: string;
  readonly up: (db: DatabaseT.Database) => void;
}

/**
 * Residency class for a migration set (O452 / ADR-302 §"Residency split").
 * `operational` (default): lives in the always-open operational store.
 * `protected`: lives in the KEK-gated protected store; opened on unlock, closed on relock.
 */
export type StoreResidency = 'operational' | 'protected';

export interface MigrationSet {
  readonly owner: string;
  readonly migrations: ReadonlyArray<Migration>;
  /**
   * Tables this owner exclusively writes (ADR-506 §6 rung C / O446).
   * Used by `tableOwner()` to enforce sole-writer constraints in `store.write`.
   * Each table may appear in exactly one MigrationSet across all registered sets.
   */
  readonly ownedTables: ReadonlyArray<string>;
  /**
   * Which physical store this owner's tables live in (O452 / ADR-302).
   * Defaults to `'operational'` when absent.
   */
  readonly residency?: StoreResidency;
}

// ── Registry ──────────────────────────────────────────────────────────────────

const BASE_OWNER = 'base';

/** Ordered registration list for non-base sets (in call order). */
const _domainSets: MigrationSet[] = [];
let _baseSet: MigrationSet | null = null;

/**
 * Table-to-owner map for the store.write ownership gate (ADR-506 §6 rung C / O446).
 * Populated incrementally as MigrationSets register. Keyed by table name.
 */
const _tableOwnerMap = new Map<string, string>();

/**
 * Owner-to-MigrationSet map for residency lookup (O452).
 * Populated in tandem with _tableOwnerMap.
 */
const _setByOwner = new Map<string, MigrationSet>();

/**
 * Register a migration set. Throws on duplicate owner or duplicate table claim.
 * The 'base' owner is reserved for the set defined in this module.
 */
export function registerMigrationSet(set: MigrationSet): void {
  // Validate no table is claimed by two owners before mutating state.
  for (const table of set.ownedTables) {
    const existing = _tableOwnerMap.get(table);
    if (existing !== undefined) {
      throw new Error(
        `[migrations] Table '${table}' claimed by '${set.owner}' is already owned by '${existing}'`,
      );
    }
  }

  if (set.owner === BASE_OWNER) {
    if (_baseSet !== null) {
      throw new Error(`[migrations] Duplicate migration set owner: '${set.owner}'`);
    }
    _baseSet = set;
  } else {
    if (_domainSets.some((s) => s.owner === set.owner)) {
      throw new Error(`[migrations] Duplicate migration set owner: '${set.owner}'`);
    }
    _domainSets.push(set);
  }

  // Register table ownership and owner→set mapping after duplicate checks pass.
  for (const table of set.ownedTables) {
    _tableOwnerMap.set(table, set.owner);
  }
  _setByOwner.set(set.owner, set);
}

/**
 * Returns the bundleId / 'base' that owns `table`, or null if the table is
 * not declared by any registered MigrationSet (unowned or unknown table).
 * '_schema_version' is migration infra — never owned by any set → returns null.
 * (ADR-506 §6 rung C / O446)
 */
export function tableOwner(table: string): string | null {
  return _tableOwnerMap.get(table) ?? null;
}

/**
 * Returns the residency class of `table` based on its owner's MigrationSet.
 * Unowned / unknown tables default to `'operational'` (conservative — don't
 * assume protected for unknown tables).
 * (O452 / ADR-302 §"Residency split")
 */
export function tableResidency(table: string): StoreResidency {
  const owner = _tableOwnerMap.get(table);
  if (owner === undefined) return 'operational';
  const set = _setByOwner.get(owner);
  return set?.residency ?? 'operational';
}

/**
 * Returns true if at least one registered MigrationSet declares `protected` residency.
 * Used to decide whether to provision the protected store at all.
 * (O452 / ADR-302 §"Lazy provisioning")
 */
export function hasProtectedSets(): boolean {
  for (const set of _setByOwner.values()) {
    if (set.residency === 'protected') return true;
  }
  return false;
}

/**
 * Returns all registered sets in deterministic order:
 * 'base' first, then domain sets in registration order.
 * Throws if the base set has not been registered (should never happen — it
 * self-registers below on module load).
 */
export function getOrderedMigrationSets(): ReadonlyArray<MigrationSet> {
  if (_baseSet === null) {
    throw new Error('[migrations] Base migration set not registered');
  }
  return [_baseSet, ..._domainSets];
}

// ── Base migration set ────────────────────────────────────────────────────────

const BASE_MIGRATION_SET: MigrationSet = {
  owner: BASE_OWNER,
  // 'prefs', 'audit_log', 'workspace_settings' are base-owned tables.
  // '_schema_version' is migration infra — not a data table, not ownable.
  ownedTables: ['prefs', 'audit_log', 'workspace_settings'],
  migrations: [
    {
      version: 1,
      description: 'Initial schema: prefs table',
      up(db) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS prefs (
            key        TEXT PRIMARY KEY,
            value      TEXT NOT NULL,
            updated_at INTEGER NOT NULL
          );
        `);
      },
    },
    {
      version: 2,
      description: 'Audit ledger: append-only SHA-256 hash-chained log',
      up(db) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS audit_log (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            seq         INTEGER NOT NULL UNIQUE,
            ts          INTEGER NOT NULL,
            event       TEXT NOT NULL,
            principal   TEXT,
            entity_id   TEXT NOT NULL,
            record_id   TEXT,
            record_type TEXT,
            detail      TEXT,
            prev_hash   TEXT NOT NULL,
            entry_hash  TEXT NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_audit_log_event ON audit_log(event);
          CREATE INDEX IF NOT EXISTS idx_audit_log_ts    ON audit_log(ts);
        `);
      },
    },
    {
      version: 3,
      description: 'Workspace settings: key/value table',
      up(db) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS workspace_settings (
            key        TEXT PRIMARY KEY,
            value      TEXT NOT NULL,
            updated_at INTEGER NOT NULL
          );
        `);
      },
    },
  ],
};

// Self-register on module load.
registerMigrationSet(BASE_MIGRATION_SET);

// ── Schema version table ──────────────────────────────────────────────────────

function ensureSchemaVersionTable(db: DatabaseT.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _schema_version (
      owner   TEXT PRIMARY KEY,
      version INTEGER NOT NULL
    );
  `);
}

function readOwnerVersion(db: DatabaseT.Database, owner: string): number {
  const row = db
    .prepare(`SELECT version FROM _schema_version WHERE owner = ?`)
    .get(owner) as { version: number } | undefined;
  return row?.version ?? 0;
}

function writeOwnerVersion(db: DatabaseT.Database, owner: string, version: number): void {
  db
    .prepare(
      `INSERT INTO _schema_version (owner, version) VALUES (?, ?)
       ON CONFLICT(owner) DO UPDATE SET version = excluded.version`,
    )
    .run(owner, version);
}

// ── runMigrations ─────────────────────────────────────────────────────────────

/**
 * Apply all pending migrations for sets matching `residency`.
 * Called once when the relevant store opens. Idempotent: all-applied → no-op.
 *
 * Each physical DB has its own `_schema_version` table and only ever sees
 * the migration sets whose residency matches the DB being opened.
 * Execution order within a residency: 'base' first (operational only), then
 * domain sets in registration order.
 * The entire upgrade is wrapped in ONE better-sqlite3 transaction.
 * better-sqlite3 transactions are synchronous.
 *
 * `residency` defaults to `'operational'` for back-compat.
 * (O452 / ADR-302 §"Residency split")
 */
export function runMigrations(db: DatabaseT.Database, residency: StoreResidency = 'operational'): void {
  ensureSchemaVersionTable(db);

  const orderedSets = getOrderedMigrationSets().filter(
    (s) => (s.residency ?? 'operational') === residency,
  );

  // Collect all pending work outside the transaction (reads are fine outside).
  type PendingWork = { set: MigrationSet; pending: ReadonlyArray<Migration> };
  const allWork: PendingWork[] = orderedSets.map((set) => {
    const current = readOwnerVersion(db, set.owner);
    const pending = set.migrations
      .filter((m) => m.version > current)
      .sort((a, b) => a.version - b.version);
    return { set, pending };
  });

  const hasWork = allWork.some((w) => w.pending.length > 0);
  if (!hasWork) return;

  // One transaction wraps ALL sets' pending migrations.
  const tx = db.transaction(() => {
    for (const { set, pending } of allWork) {
      for (const m of pending) {
        m.up(db);
        writeOwnerVersion(db, set.owner, m.version);
      }
    }
  });
  tx();
}
