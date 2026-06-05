// ru-soam-practice bundle entry point.
//
// Rung D2 (ADR-506 §4 spine): record.patient (command) moves from Main into
// this FP-Host bundle. record.patient.query (read path) was moved at rung D1.
//
// Consumes store.query@1.0 for all SQL reads and store.write@1.0 for all SQL
// writes. Row→record mapping is plain JS (no TypeScript, no platform imports
// — only what ctx provides + this bundle's own manifest).

import manifest from './manifest.json' with { type: 'json' };

// Owned adjunct tables = every owned table except the `patients` parent. Their PK
// is patient_id (FK child of patients.id). Derived from the manifest so the erase
// cascade auto-covers tables added in future phases — no "remember to extend a
// list" trap. `patients` is deleted last (FK order).
const OWNED_ADJUNCT_TABLES = (manifest.ownedTables ?? []).filter((t) => t !== 'patients');

// ── Lifecycle stage definitions (static domain data, no SQL) ─────────────────
// Copied from electron/main/domain/lifecycle-stages.ts — same values, no import.

const LIFECYCLE_STAGES = [
  { id: 'referral',   label: 'Referral'   },
  { id: 'intake',     label: 'Intake'     },
  { id: 'active',     label: 'Active'     },
  { id: 'on_hold',    label: 'On Hold'    },
  { id: 'discharged', label: 'Discharged' },
];

const VALID_STAGES = new Set(LIFECYCLE_STAGES.map((s) => s.id));
const VALID_STATUSES = new Set(['active', 'inactive', 'archived']);

// ── Row → record mappers (reproduce record-patient-cap.ts field-by-field) ─────

function deriveDisplayName(given, family) {
  if (family && family.trim().length > 0) {
    return family.trim() + ', ' + given.trim();
  }
  return given.trim();
}

function mapRecord(row) {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    givenName: row.given_name,
    familyName: row.family_name,
    contactPhone: row.contact_phone,
    contactEmail: row.contact_email,
    dob: row.dob,
    status: row.status,
    displayName: deriveDisplayName(row.given_name, row.family_name),
  };
}

function mapSummary(row) {
  return {
    id: row.id,
    displayName: deriveDisplayName(row.given_name, row.family_name),
    status: row.status,
    stage: row.stage,
  };
}

function mapProfile(row) {
  return {
    patientId: row.patient_id,
    preferredLanguage: row.preferred_language,
    medicationAwareness: row.medication_awareness,
    diagnosis: row.diagnosis,
    updatedAt: row.updated_at,
  };
}

function mapLifecycle(row) {
  return {
    patientId: row.patient_id,
    stage: row.stage,
    stageUpdatedAt: row.stage_updated_at,
    stageReason: row.stage_reason,
  };
}

// ── Error helpers ─────────────────────────────────────────────────────────────

function notFound(message) {
  return Object.assign(new Error(message), { code: 'cap.not_found' });
}

// ── Capability handler ────────────────────────────────────────────────────────

export function activate(ctx) {
  // Bind store.query@1.0 — FP-Host consumer channel (O449 rung-0).
  const storeQuery = ctx.bindCapability('store.query', '1.0');
  // Bind store.write@1.0 — FP-Host consumer channel (O449 rung-0, rung D2).
  const storeWrite = ctx.bindCapability('store.write', '1.0');

  // ── record.patient.query (read cap, rung D1) ───────────────────────────────

  ctx.registerCapability('record.patient.query', '1.0', async (method, args) => {
    switch (method) {
      case 'get': {
        const id = args[0];
        const rows = await storeQuery.call('run', [
          'patient.get',
          { id },
          { event: 'record.patient.viewed', recordType: 'patient', recordId: id },
        ]);
        return rows.length > 0 ? mapRecord(rows[0]) : null;
      }

      case 'list': {
        // Audit note: count is unavailable before the query runs; store.query
        // emits the audit tag at execution time. Pass event without detail
        // (non-essential — count dropped; acceptable per rung D1 brief).
        const rows = await storeQuery.call('run', [
          'patient.list',
          {},
          { event: 'record.patient.listed', recordType: 'patient' },
        ]);
        return rows.map(mapSummary);
      }

      case 'getProfile': {
        const id = args[0];
        const rows = await storeQuery.call('run', [
          'patient.getProfile',
          { id },
          { event: 'record.patient.viewed', recordType: 'patient_profile', recordId: id },
        ]);
        return rows.length > 0 ? mapProfile(rows[0]) : null;
      }

      case 'getLifecycle': {
        const id = args[0];
        const rows = await storeQuery.call('run', [
          'patient.getLifecycle',
          { id },
          { event: 'record.patient.viewed', recordType: 'patient_lifecycle', recordId: id },
        ]);
        return rows.length > 0 ? mapLifecycle(rows[0]) : null;
      }

      case 'listLifecycleStages': {
        // Static data — no SQL. Return a copy to prevent mutation.
        return LIFECYCLE_STAGES.map((s) => ({ id: s.id, label: s.label }));
      }

      default:
        throw new Error('record.patient.query: unknown method ' + method);
    }
  });

  // ── record.patient (command cap, rung D2) ──────────────────────────────────

  ctx.registerCapability('record.patient', '1.0', async (method, args) => {
    switch (method) {

      case 'create': {
        const input = args[0];
        if (!input || typeof input !== 'object') {
          throw new Error('record.patient.create: input must be an object');
        }
        if (!input.givenName || String(input.givenName).trim().length === 0) {
          throw new Error('record.patient.create: givenName is required');
        }

        const id = globalThis.crypto.randomUUID();
        const now = Date.now();
        const row = {
          id,
          created_at: now,
          updated_at: now,
          given_name: String(input.givenName).trim(),
          family_name: input.familyName != null ? String(input.familyName).trim() : null,
          contact_phone: input.contactPhone != null ? String(input.contactPhone).trim() : null,
          contact_email: input.contactEmail != null ? String(input.contactEmail).trim() : null,
          dob: input.dob != null ? String(input.dob).trim() : null,
          status: input.status ?? 'active',
        };

        await storeWrite.call('insert', [
          'patients',
          row,
          { event: 'record.patient.created', recordType: 'patient', recordId: id },
        ]);

        // Every new patient gets a default 'active' lifecycle row (Am3 §A3.3).
        // 2nd audit entry — accepted (per rung D2 brief).
        await storeWrite.call('insert', [
          'patient_lifecycle',
          { patient_id: id, stage: 'active', stage_updated_at: now },
          {
            event: 'record.patient.lifecycle.changed',
            recordType: 'patient_lifecycle',
            recordId: id,
            detail: { stage: 'active' },
          },
        ]);

        // Return mapped record — host knows all fields; no read-back needed.
        return mapRecord(row);
      }

      case 'update': {
        const id = args[0];
        const patch = args[1];
        if (typeof id !== 'string') {
          throw new Error('record.patient.update: id must be a string');
        }
        if (!patch || typeof patch !== 'object') {
          throw new Error('record.patient.update: patch must be an object');
        }
        if (patch.givenName !== undefined && String(patch.givenName).trim().length === 0) {
          throw new Error('record.patient.update: givenName must not be empty');
        }

        // Existence check — no audit tag on this read-back (avoid spurious viewed event).
        const existRows = await storeQuery.call('run', ['patient.get', { id }]);
        if (!existRows.length) {
          throw notFound('record.patient.update: patient not found: ' + id);
        }

        // Build patch fields: only include keys present in patch.
        const patchFields = { updated_at: Date.now() };
        if (patch.givenName !== undefined) {
          patchFields.given_name = String(patch.givenName).trim();
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'familyName')) {
          patchFields.family_name = patch.familyName != null ? String(patch.familyName).trim() : null;
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'contactPhone')) {
          patchFields.contact_phone = patch.contactPhone != null ? String(patch.contactPhone).trim() : null;
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'contactEmail')) {
          patchFields.contact_email = patch.contactEmail != null ? String(patch.contactEmail).trim() : null;
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'dob')) {
          patchFields.dob = patch.dob != null ? String(patch.dob).trim() : null;
        }

        await storeWrite.call('update', [
          'patients',
          id,
          patchFields,
          { event: 'record.patient.updated', recordType: 'patient', recordId: id },
        ]);

        // Read-back — form.populateForm uses the return value.
        const updRows = await storeQuery.call('run', ['patient.get', { id }]);
        if (!updRows.length) {
          throw new Error('record.patient.update: record disappeared after write: ' + id);
        }
        return mapRecord(updRows[0]);
      }

      case 'setStatus': {
        const id = args[0];
        const status = args[1];
        if (typeof id !== 'string') {
          throw new Error('record.patient.setStatus: id must be a string');
        }
        if (typeof status !== 'string' || !VALID_STATUSES.has(status)) {
          throw new Error('record.patient: invalid status: ' + String(status));
        }

        // Existence check — no audit tag.
        const existRows = await storeQuery.call('run', ['patient.get', { id }]);
        if (!existRows.length) {
          throw notFound('record.patient.setStatus: patient not found: ' + id);
        }

        await storeWrite.call('update', [
          'patients',
          id,
          { status, updated_at: Date.now() },
          {
            event: 'record.patient.status.changed',
            recordType: 'patient',
            recordId: id,
            detail: { status },
          },
        ]);

        // Read-back.
        const updRows = await storeQuery.call('run', ['patient.get', { id }]);
        if (!updRows.length) {
          throw new Error('record.patient.setStatus: record disappeared after write: ' + id);
        }
        return mapRecord(updRows[0]);
      }

      case 'setStage': {
        const id = args[0];
        const stage = args[1];
        const reason = args[2];
        if (typeof id !== 'string') {
          throw new Error('record.patient.setStage: id must be a string');
        }
        if (typeof stage !== 'string' || !VALID_STAGES.has(stage)) {
          throw new Error('record.patient: invalid stage: ' + String(stage));
        }
        if (reason !== undefined && typeof reason !== 'string') {
          throw new Error('record.patient.setStage: reason must be a string if provided');
        }

        // Existence check — no audit tag.
        const existRows = await storeQuery.call('run', ['patient.get', { id }]);
        if (!existRows.length) {
          throw notFound('record.patient.setStage: patient not found: ' + id);
        }

        // Lifecycle row always exists (created with the patient) → update, not insert.
        // Audit detail is { stage } only — never include reason (potential free-text PHI).
        await storeWrite.call('update', [
          'patient_lifecycle',
          id,
          { stage, stage_updated_at: Date.now(), stage_reason: reason ?? null },
          {
            event: 'record.patient.lifecycle.changed',
            recordType: 'patient_lifecycle',
            recordId: id,
            detail: { stage },
          },
        ]);

        // Read-back lifecycle.
        const lcRows = await storeQuery.call('run', ['patient.getLifecycle', { id }]);
        if (!lcRows.length) {
          throw new Error('record.patient.setStage: lifecycle row disappeared after write: ' + id);
        }
        return mapLifecycle(lcRows[0]);
      }

      case 'erase': {
        // DPDP right-to-erasure (irreversible hard delete).
        // Delete order: adjunct children (by patient_id) BEFORE patients parent (by id)
        // to satisfy the FK constraint enforced by SQLite's PRAGMA foreign_keys.
        // OWNED_ADJUNCT_TABLES is derived from the manifest (see module top) so this
        // cascade auto-covers every owned table — adding a Phase-2+ table needs no edit here.
        const id = args[0];
        if (typeof id !== 'string' || id.length === 0) {
          throw new Error('record.patient.erase: id must be a non-empty string');
        }

        // Existence check — no audit tag (avoid spurious viewed event before erasure).
        const existRows = await storeQuery.call('run', ['patient.get', { id }]);
        if (!existRows.length) {
          throw notFound('record.patient.erase: patient not found: ' + id);
        }

        // Delete adjunct tables (children) first, then the parent.
        for (const table of OWNED_ADJUNCT_TABLES) {
          await storeWrite.call('delete', [
            table,
            id,
            {
              event: 'record.patient.erased',
              recordType: table,
              recordId: id,
              detail: { table },
            },
          ]);
        }

        // Delete parent row — canonical erasure audit event.
        await storeWrite.call('delete', [
          'patients',
          id,
          {
            event: 'record.patient.erased',
            recordType: 'patient',
            recordId: id,
            detail: { table: 'patients', dpdp: true },
          },
        ]);

        return { erased: id };
      }

      case 'updateProfile': {
        const id = args[0];
        const patch = args[1];
        if (typeof id !== 'string') {
          throw new Error('record.patient.updateProfile: id must be a string');
        }
        if (!patch || typeof patch !== 'object') {
          throw new Error('record.patient.updateProfile: patch must be an object');
        }

        // Patient existence check — no audit tag.
        const existRows = await storeQuery.call('run', ['patient.get', { id }]);
        if (!existRows.length) {
          throw notFound('record.patient.updateProfile: patient not found: ' + id);
        }

        // Read existing profile — no audit tag.
        const profileRows = await storeQuery.call('run', ['patient.getProfile', { id }]);
        const now = Date.now();

        if (profileRows.length > 0) {
          // Profile exists — build patch of only provided-non-null columns.
          // COALESCE-merge semantics: provided non-null fields overwrite; null/absent keep existing.
          const patchCols = { updated_at: now };
          if (patch.preferredLanguage != null) {
            patchCols.preferred_language = String(patch.preferredLanguage);
          }
          if (patch.medicationAwareness != null) {
            patchCols.medication_awareness = String(patch.medicationAwareness);
          }
          if (patch.diagnosis != null) {
            patchCols.diagnosis = String(patch.diagnosis);
          }
          await storeWrite.call('update', [
            'patient_profile',
            id,
            patchCols,
            { event: 'record.patient.profile.updated', recordType: 'patient_profile', recordId: id },
          ]);
        } else {
          // No profile row yet — insert with provided fields (nulls for absent).
          await storeWrite.call('insert', [
            'patient_profile',
            {
              patient_id: id,
              preferred_language: patch.preferredLanguage ?? null,
              medication_awareness: patch.medicationAwareness ?? null,
              diagnosis: patch.diagnosis ?? null,
              updated_at: now,
            },
            { event: 'record.patient.profile.updated', recordType: 'patient_profile', recordId: id },
          ]);
        }

        // Read-back profile.
        const updRows = await storeQuery.call('run', ['patient.getProfile', { id }]);
        if (!updRows.length) {
          throw new Error('record.patient.updateProfile: row disappeared after write: ' + id);
        }
        return mapProfile(updRows[0]);
      }

      default:
        throw new Error('record.patient: unknown method ' + method);
    }
  });

  return {
    dispose() {
      storeQuery.dispose();
      storeWrite.dispose();
    },
  };
}
