/**
 * Migration set for the ru-soam-practice bundle (ADR-506 §4/§8, rung B / O444).
 *
 * Owner = 'ru-soam-practice' (the bundle manifest id — bundleId, not Activity name).
 * Versions are numbered within this owner's namespace: 1, 2, 3, …
 *
 * ADR-106 boundary: domain code. Imports from base (local-store/migrations);
 * base MUST NOT import from here.
 */

import { type MigrationSet, registerMigrationSet } from '../local-store/migrations.js';

export const PRACTICE_BUNDLE_OWNER = 'ru-soam-practice';

const PRACTICE_MIGRATION_SET: MigrationSet = {
  owner: PRACTICE_BUNDLE_OWNER,
  migrations: [
    {
      version: 1,
      description: 'Practice: patients roster table (ADR-505)',
      up(db) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS patients (
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
          CREATE INDEX IF NOT EXISTS idx_patients_status     ON patients(status);
          CREATE INDEX IF NOT EXISTS idx_patients_updated_at ON patients(updated_at);
        `);
      },
    },
    {
      version: 2,
      description: 'Practice: patient_profile adjunct table (ADR-505)',
      up(db) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS patient_profile (
            patient_id           TEXT PRIMARY KEY REFERENCES patients(id),
            preferred_language   TEXT,
            medication_awareness TEXT,
            diagnosis            TEXT,
            updated_at           INTEGER NOT NULL
          );
        `);
      },
    },
    {
      version: 3,
      description: 'Practice: patient_lifecycle stage table (ADR-505 Am3)',
      up(db) {
        const now = Date.now();
        db.exec(`
          CREATE TABLE IF NOT EXISTS patient_lifecycle (
            patient_id       TEXT PRIMARY KEY REFERENCES patients(id),
            stage            TEXT NOT NULL,
            stage_updated_at INTEGER NOT NULL,
            stage_reason     TEXT
          );
        `);
        db.prepare(
          `INSERT OR IGNORE INTO patient_lifecycle (patient_id, stage, stage_updated_at)
           SELECT id, 'active', ${now} FROM patients`,
        ).run();
      },
    },
  ],
};

/**
 * Register the ru-soam-practice migration set with the base migration registry.
 * Must be called before the store opens (before `localStoreManager.openFor()`).
 * Called from `registerDomainMigrations()` in domain/bootstrap.ts.
 */
export function registerPracticeMigrations(): void {
  registerMigrationSet(PRACTICE_MIGRATION_SET);
}
