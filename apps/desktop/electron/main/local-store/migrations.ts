/**
 * Schema migrations for the Local Store (Phase 10a).
 *
 * A single linear migration list. Each entry has a numeric `version` and an
 * `up` function that performs the schema change. Applied versions are tracked
 * in a `_schema_version` table (single-row, key = 'current').
 *
 * `runMigrations` is idempotent: on boot it reads the current version, then
 * runs every migration whose version is greater. New migrations are appended
 * to MIGRATIONS — never re-ordered or rewritten in place (the DB on disk is
 * the source of truth for what has actually been applied).
 */

import type DatabaseT from 'better-sqlite3';

export interface Migration {
  readonly version: number;
  readonly description: string;
  readonly up: (db: DatabaseT.Database) => void;
}

const MIGRATIONS: ReadonlyArray<Migration> = [
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
        CREATE TABLE audit_log (
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
        CREATE INDEX idx_audit_log_event ON audit_log(event);
        CREATE INDEX idx_audit_log_ts    ON audit_log(ts);
      `);
    },
  },
  {
    version: 3,
    description: 'Workspace settings: key/value table',
    up(db) {
      db.exec(`
        CREATE TABLE workspace_settings (
          key        TEXT PRIMARY KEY,
          value      TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);
    },
  },
  {
    version: 4,
    description: 'core-domain: patients roster table (ADR-504 / ADR-505)',
    up(db) {
      db.exec(`
        CREATE TABLE patients (
          id              TEXT PRIMARY KEY,
          created_at      INTEGER NOT NULL,
          updated_at      INTEGER NOT NULL,
          given_name      TEXT NOT NULL,
          family_name     TEXT,
          contact_phone   TEXT,
          contact_email   TEXT,
          dob             TEXT,
          status          TEXT NOT NULL DEFAULT 'active'
        );
        CREATE INDEX idx_patients_status     ON patients(status);
        CREATE INDEX idx_patients_updated_at ON patients(updated_at);
      `);
    },
  },
  {
    version: 5,
    description: 'codex: patient_profile adjunct table (ADR-505)',
    up(db) {
      db.exec(`
        CREATE TABLE patient_profile (
          patient_id           TEXT PRIMARY KEY REFERENCES patients(id),
          preferred_language   TEXT,
          medication_awareness TEXT,
          diagnosis            TEXT,
          updated_at           INTEGER NOT NULL
        );
      `);
    },
  },
];

function ensureSchemaVersionTable(db: DatabaseT.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _schema_version (
      id      INTEGER PRIMARY KEY CHECK (id = 1),
      version INTEGER NOT NULL
    );
  `);
  db.prepare(
    `INSERT OR IGNORE INTO _schema_version (id, version) VALUES (1, 0)`,
  ).run();
}

function readCurrentVersion(db: DatabaseT.Database): number {
  const row = db.prepare(`SELECT version FROM _schema_version WHERE id = 1`).get() as
    | { version: number }
    | undefined;
  return row?.version ?? 0;
}

function writeCurrentVersion(db: DatabaseT.Database, version: number): void {
  db.prepare(`UPDATE _schema_version SET version = ? WHERE id = 1`).run(version);
}

/**
 * Apply every pending migration. Called once when the store opens.
 * Idempotent: if all migrations are already applied this is a no-op.
 */
export function runMigrations(db: DatabaseT.Database): void {
  ensureSchemaVersionTable(db);
  const current = readCurrentVersion(db);

  const pending = MIGRATIONS.filter((m) => m.version > current).sort(
    (a, b) => a.version - b.version,
  );
  if (pending.length === 0) return;

  // Wrap the whole upgrade in a single transaction — partial migrations
  // would leave the schema-version pointer out of sync with the on-disk
  // shape. better-sqlite3 transactions are synchronous.
  const tx = db.transaction((list: ReadonlyArray<Migration>) => {
    for (const m of list) {
      m.up(db);
      writeCurrentVersion(db, m.version);
    }
  });
  tx(pending);
}
