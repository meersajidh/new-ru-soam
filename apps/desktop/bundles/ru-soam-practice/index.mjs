// ru-soam-practice bundle entry point.
//
// Rung D1 (ADR-506 §4 spine): record.patient.query moves from Main into this
// FP-Host bundle. Read path only — command cap (record.patient) stays Main-
// resident until rung D2.
//
// Consumes store.query@1.0 for all SQL reads. Row→record mapping is plain JS
// (no TypeScript, no platform imports — only what ctx provides).

// ── Lifecycle stage definitions (static domain data, no SQL) ─────────────────
// Copied from electron/main/domain/lifecycle-stages.ts — same values, no import.

const LIFECYCLE_STAGES = [
  { id: 'referral',   label: 'Referral'   },
  { id: 'intake',     label: 'Intake'     },
  { id: 'active',     label: 'Active'     },
  { id: 'on_hold',    label: 'On Hold'    },
  { id: 'discharged', label: 'Discharged' },
];

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

// ── Capability handler ────────────────────────────────────────────────────────

export function activate(ctx) {
  // Bind store.query@1.0 — FP-Host consumer channel (O449 rung-0).
  const storeQuery = ctx.bindCapability('store.query', '1.0');

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

  return {
    dispose() {
      storeQuery.dispose();
    },
  };
}
