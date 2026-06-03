/**
 * Practice domain read templates (ADR-506 §6 rung C / O446).
 *
 * Declares the patient read-side SQL templates. These are pre-registered at
 * boot and executed by the generic `store.query@1.0` capability handler in
 * Main. First-Party-Host bundles call `store.query.run(templateId, params)` —
 * they never ship raw SQL.
 *
 * Templates return RAW ROWS. Row→record mapping (deriveDisplayName etc.) is
 * domain logic that stays in record.patient.query for now and moves to the
 * FP-Host at rung D. Templates are pure SQL.
 *
 * Named params use better-sqlite3 @name convention — bound from the params
 * object keys at execution time.
 *
 * NOT registered: patient.listLifecycleStages — that returns a static constant,
 * not a SQL query; it stays a record.patient.query method.
 *
 * ADR-106: domain code. May import from base (store-query-cap). MUST NOT import
 * store internals or other base modules directly.
 */

import { registerQueryTemplate } from '../local-store/store-query-cap.js';

/**
 * Register all practice patient read templates.
 * Called at boot (registerDomainQueries in bootstrap.ts) before any capability
 * invocation. The store need not be open at registration time.
 */
export function registerPracticeQueries(): void {
  // patient.get — fetch one patient row by id.
  // Mirrors dbGetById in record-patient-cap.ts.
  registerQueryTemplate({
    id: 'patient.get',
    sql: `SELECT id, created_at, updated_at, given_name, family_name,
                 contact_phone, contact_email, dob, status
          FROM patients WHERE id = @id`,
  });

  // patient.list — roster with lifecycle stage (LEFT JOIN).
  // Mirrors implList in record-patient-cap.ts.
  registerQueryTemplate({
    id: 'patient.list',
    sql: `SELECT p.id, p.given_name, p.family_name, p.status,
                 COALESCE(pl.stage, 'active') AS stage
          FROM patients p
          LEFT JOIN patient_lifecycle pl ON pl.patient_id = p.id
          ORDER BY p.family_name ASC, p.given_name ASC`,
  });

  // patient.getProfile — fetch one profile row by patient id.
  // Mirrors implGetProfile in record-patient-cap.ts.
  registerQueryTemplate({
    id: 'patient.getProfile',
    sql: `SELECT patient_id, preferred_language, medication_awareness, diagnosis, updated_at
          FROM patient_profile WHERE patient_id = @id`,
  });

  // patient.getLifecycle — fetch one lifecycle row by patient id.
  // Mirrors implGetLifecycle in record-patient-cap.ts.
  registerQueryTemplate({
    id: 'patient.getLifecycle',
    sql: `SELECT patient_id, stage, stage_updated_at, stage_reason
          FROM patient_lifecycle WHERE patient_id = @id`,
  });
}
