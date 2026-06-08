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

// ── Circle / Consent domain vocab (ADR-506 §G — validate in host) ────────────

const VALID_CIRCLE_KINDS = new Set(['nominated_rep', 'caregiver', 'family', 'emergency_contact']);

// ── Risk / Safety domain vocab (ADR-505 Am4, ADR-506 §G) ─────────────────────

const VALID_RISK_KINDS = new Set([
  'si', 'self_harm', 'harm_to_others', 'means_restriction',
  'safety_plan_review', 's23_disclosure', 'capacity_change', 'other',
]);
const VALID_SEVERITY = new Set(['info', 'concern', 'elevated', 'critical']);
const VALID_CAPACITY = new Set(['intact', 'diminished', 'lacks', 'unassessed']);
const VALID_S23_GROUNDS = new Set([
  'harm_to_others', 'threat_to_life', 'nr_duty', 'professional_care', 'authority_order',
]);
const VALID_PLAN_STATUS = new Set(['none', 'active', 'under_review']);

// ── Intake completeness item set (P5 — read-derivation) ──────────────────────
const ON_HOLD_REVIEW_DAYS = 30;
const INTAKE_ITEMS = [
  { key: 'demographics',     label: 'Demographics',              col: 'has_demographics' },
  { key: 'language',         label: 'Preferred language',        col: 'has_language' },
  { key: 'diagnosis',        label: 'Diagnosis / problem list',  col: 'has_diagnosis' },
  { key: 'circle',           label: 'Circle / NR',               col: 'has_circle' },
  { key: 'informedConsent',  label: 'Informed consent',          col: 'has_informed_consent' },
  { key: 'teleConsent',      label: 'Tele-consent',              col: 'has_tele_consent' },
  { key: 'capacity',         label: 'Capacity assessed',         col: 'has_capacity' },
  { key: 'advanceDirective', label: 'Advance directive',         col: 'has_ad' },
  { key: 'riskScreen',       label: 'Initial risk screen',       col: 'has_risk_screen' },
  { key: 'documents',        label: 'Documents on file',         col: 'has_documents' },
];

function mapIntakeCompleteness(row) {
  const items = INTAKE_ITEMS.map((i) => ({ key: i.key, label: i.label, done: !!row[i.col] }));
  const doneCount = items.reduce((n, it) => n + (it.done ? 1 : 0), 0);
  return {
    clientId: row.patient_id,
    displayName: deriveDisplayName(row.given_name, row.family_name),
    stage: row.stage,
    items,
    doneCount,
    total: INTAKE_ITEMS.length,
    complete: doneCount === INTAKE_ITEMS.length,
  };
}

// Owned-derived Attention obligations (P5). Projection-derived obligations → P6.
function deriveObligations(row, now) {
  const stage = row.stage || 'active';
  const status = row.status || 'active';
  const obligations = [];
  // No noise on closed/archived records.
  if (status === 'archived' || stage === 'discharged') return obligations;
  const doneCount = INTAKE_ITEMS.reduce((n, i) => n + (row[i.col] ? 1 : 0), 0);
  const complete = doneCount === INTAKE_ITEMS.length;
  if (stage === 'intake' && !complete) {
    obligations.push({ key: 'intake_incomplete', label: 'Intake incomplete' });
  }
  if (!row.has_risk_screen) {
    obligations.push({ key: 'no_risk_screen', label: 'No risk screen' });
  }
  if (row.has_informed_consent && !row.has_documents) {
    obligations.push({ key: 'missing_consent_doc', label: 'Consent doc missing' });
  }
  if (stage === 'on_hold' && row.stage_updated_at != null &&
      (now - row.stage_updated_at) > ON_HOLD_REVIEW_DAYS * 24 * 60 * 60 * 1000) {
    obligations.push({ key: 'on_hold_stale', label: 'On-hold review due' });
  }
  return obligations;
}

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

function mapCircleMember(row) {
  return {
    id: row.id,
    patientId: row.patient_id,
    kind: row.kind,
    displayName: row.display_name,
    relationship: row.relationship,
    phone: row.phone,
    email: row.email,
    isPrimaryNr: !!row.is_primary_nr,
  };
}

function mapConsentState(row) {
  return {
    patientId: row.patient_id,
    advanceDirectiveStatus: row.advance_directive_status,
    advanceDirectiveDocumentId: row.advance_directive_document_id,
    informedConsentStatus: row.informed_consent_status,
    teleConsentMode: row.tele_consent_mode,
    capacityStatus: row.capacity_status,
    confidentialityExceptionActive: !!row.confidentiality_exception_active,
    updatedAt: row.updated_at,
  };
}

function mapRiskEvent(row) {
  return {
    id: row.id,
    patientId: row.patient_id,
    kind: row.kind,
    severity: row.severity,
    occurredAt: row.occurred_at,
    summary: row.summary,
  };
}

function mapDocument(row) {
  return {
    id: row.id,
    patientId: row.patient_id,
    kind: row.kind,
    title: row.title,
    storageRef: row.storage_ref,
    mimeType: row.mime_type,
    sha256: row.sha256,
    linkedKind: row.linked_kind,
    linkedId: row.linked_id,
    createdAt: row.created_at,
  };
}

function mapSafetyPlan(row) {
  return {
    patientId: row.patient_id,
    status: row.status,
    warningSigns: row.warning_signs,
    copingStrategies: row.coping_strategies,
    socialSettingsContacts: row.social_settings_contacts,
    helpContacts: row.help_contacts,
    professionalAgencies: row.professional_agencies,
    meansRestriction: row.means_restriction,
    reasonsForLiving: row.reasons_for_living,
    sharedWithNr: !!row.shared_with_nr,
    updatedAt: row.updated_at,
  };
}

// ── Error helpers ─────────────────────────────────────────────────────────────

function notFound(message) {
  return Object.assign(new Error(message), { code: 'cap.not_found' });
}

function parseBlobId(storageRef) {
  if (typeof storageRef !== 'string' || !storageRef.startsWith('blob:')) {
    throw new Error('parseBlobId: storageRef does not start with blob: ' + String(storageRef));
  }
  return storageRef.slice('blob:'.length);
}

// ── Capability handler ────────────────────────────────────────────────────────

export function activate(ctx) {
  // Bind store.query@1.0 — FP-Host consumer channel (O449 rung-0).
  const storeQuery = ctx.bindCapability('store.query', '1.0');
  // Bind store.write@1.0 — FP-Host consumer channel (O449 rung-0, rung D2).
  const storeWrite = ctx.bindCapability('store.write', '1.0');
  // Bind blob.write@1.0 — protected blob store (O454 / ADR-302 P3).
  const blobWrite = ctx.bindCapability('blob.write', '1.0');

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

      case 'getCircle': {
        const clientId = args[0];
        const rows = await storeQuery.call('run', [
          'patient.getCircle',
          { id: clientId },
          { event: 'record.patient.viewed', recordType: 'patient_circle_member', recordId: clientId },
        ]);
        return rows.map(mapCircleMember);
      }

      case 'getConsentState': {
        const clientId = args[0];
        const rows = await storeQuery.call('run', [
          'patient.getConsentState',
          { id: clientId },
          { event: 'record.patient.viewed', recordType: 'patient_consent_state', recordId: clientId },
        ]);
        return rows.length > 0 ? mapConsentState(rows[0]) : null;
      }

      case 'listRiskEvents': {
        const clientId = args[0];
        const rows = await storeQuery.call('run', [
          'patient.listRiskEvents',
          { id: clientId },
          { event: 'record.patient.viewed', recordType: 'patient_risk_event', recordId: clientId },
        ]);
        return rows.map(mapRiskEvent);
      }

      case 'getSafetyPlan': {
        const clientId = args[0];
        const rows = await storeQuery.call('run', [
          'patient.getSafetyPlan',
          { id: clientId },
          { event: 'record.patient.viewed', recordType: 'patient_safety_plan', recordId: clientId },
        ]);
        return rows.length > 0 ? mapSafetyPlan(rows[0]) : null;
      }

      case 'listDocuments': {
        const clientId = args[0];
        const rows = await storeQuery.call('run', [
          'patient.listDocuments',
          { id: clientId },
          { event: 'record.patient.viewed', recordType: 'patient_document', recordId: clientId },
        ]);
        return rows.map(mapDocument);
      }

      case 'getIntakeCompleteness': {
        const clientId = args[0];
        const rows = await storeQuery.call('run', [
          'patient.intakeCompleteness',
          { id: clientId },
          { event: 'record.patient.viewed', recordType: 'patient', recordId: clientId },
        ]);
        return rows.length > 0 ? mapIntakeCompleteness(rows[0]) : null;
      }

      case 'listAttention': {
        const rows = await storeQuery.call('run', [
          'patient.attentionScan',
          {},
          { event: 'record.patient.listed', recordType: 'patient' },
        ]);
        const now = Date.now();
        const out = [];
        for (const row of rows) {
          const obligations = deriveObligations(row, now);
          if (obligations.length === 0) continue;
          const doneCount = INTAKE_ITEMS.reduce((n, i) => n + (row[i.col] ? 1 : 0), 0);
          out.push({
            id: row.patient_id,
            displayName: deriveDisplayName(row.given_name, row.family_name),
            stage: row.stage,
            status: row.status,
            doneCount,
            total: INTAKE_ITEMS.length,
            obligations,
          });
        }
        return out;
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

        // Unlink blob files for this patient's documents BEFORE the row cascade.
        // The DB deleteWhere loop below deletes the patient_document rows; if we
        // unlinked after, a crash between row-delete and unlink would orphan files.
        // Each unlink is wrapped so a single failure cannot abort the full erasure.
        const docRowsErase = await storeQuery.call('run', ['patient.listDocuments', { id }]);
        for (const docRow of docRowsErase) {
          try {
            const blobId = parseBlobId(docRow.storage_ref);
            await blobWrite.call('delete', [blobId]);
          } catch (unlinkErr) {
            // Log but do not rethrow — DPDP erasure must complete even if a blob
            // file is already missing or the store is partially closed.
            console.error('record.patient.erase: blob unlink failed (continuing):', unlinkErr);
          }
        }

        // Delete adjunct tables (children) first, then the parent.
        // deleteWhere correctly handles both multi-row tables (patient_circle_member)
        // and PK=patient_id tables (profile/lifecycle/consent) uniformly.
        for (const table of OWNED_ADJUNCT_TABLES) {
          await storeWrite.call('deleteWhere', [
            table,
            { patient_id: id },
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

      case 'addCircleMember': {
        const clientId = args[0];
        const input = args[1];
        if (typeof clientId !== 'string') {
          throw new Error('record.patient.addCircleMember: clientId must be a string');
        }
        if (!input || typeof input !== 'object') {
          throw new Error('record.patient.addCircleMember: input must be an object');
        }
        if (!input.kind || !VALID_CIRCLE_KINDS.has(input.kind)) {
          throw new Error('record.patient.addCircleMember: invalid kind: ' + String(input.kind));
        }
        if (!input.displayName || String(input.displayName).trim().length === 0) {
          throw new Error('record.patient.addCircleMember: displayName is required');
        }

        // Patient existence check — no audit tag.
        const existRowsAdd = await storeQuery.call('run', ['patient.get', { id: clientId }]);
        if (!existRowsAdd.length) {
          throw notFound('record.patient.addCircleMember: patient not found: ' + clientId);
        }

        const memberId = globalThis.crypto.randomUUID();
        const isPrimaryNr = input.isPrimaryNr ? 1 : 0;

        // If new member is primary NR, demote all existing primary NR members first.
        if (isPrimaryNr) {
          await storeWrite.call('updateWhere', [
            'patient_circle_member',
            { patient_id: clientId },
            { is_primary_nr: 0 },
            {
              event: 'record.patient.circle.nr.changed',
              recordType: 'patient_circle_member',
              recordId: clientId,
            },
          ]);
        }

        await storeWrite.call('insert', [
          'patient_circle_member',
          {
            id: memberId,
            patient_id: clientId,
            kind: input.kind,
            display_name: String(input.displayName).trim(),
            relationship: input.relationship != null ? String(input.relationship) : null,
            phone: input.phone != null ? String(input.phone) : null,
            email: input.email != null ? String(input.email) : null,
            is_primary_nr: isPrimaryNr,
          },
          {
            event: 'record.patient.circle.added',
            recordType: 'patient_circle_member',
            recordId: memberId,
            detail: { kind: input.kind },
          },
        ]);

        // Build return value from known fields — no read-back needed.
        return mapCircleMember({
          id: memberId,
          patient_id: clientId,
          kind: input.kind,
          display_name: String(input.displayName).trim(),
          relationship: input.relationship != null ? String(input.relationship) : null,
          phone: input.phone != null ? String(input.phone) : null,
          email: input.email != null ? String(input.email) : null,
          is_primary_nr: isPrimaryNr,
        });
      }

      case 'updateCircleMember': {
        const memberId = args[0];
        const patch = args[1];
        if (typeof memberId !== 'string') {
          throw new Error('record.patient.updateCircleMember: memberId must be a string');
        }
        if (!patch || typeof patch !== 'object') {
          throw new Error('record.patient.updateCircleMember: patch must be an object');
        }

        // Existence check via getCircleMember query.
        const memberRows = await storeQuery.call('run', ['patient.getCircleMember', { id: memberId }]);
        if (!memberRows.length) {
          throw notFound('record.patient.updateCircleMember: member not found: ' + memberId);
        }

        // Build patch: only contact/identity fields; isPrimaryNr not settable here.
        const patchCols = {};
        if (patch.kind !== undefined) {
          if (!VALID_CIRCLE_KINDS.has(patch.kind)) {
            throw new Error('record.patient.updateCircleMember: invalid kind: ' + String(patch.kind));
          }
          patchCols.kind = patch.kind;
        }
        if (patch.displayName !== undefined) {
          if (String(patch.displayName).trim().length === 0) {
            throw new Error('record.patient.updateCircleMember: displayName must not be empty');
          }
          patchCols.display_name = String(patch.displayName).trim();
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'relationship')) {
          patchCols.relationship = patch.relationship != null ? String(patch.relationship) : null;
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'phone')) {
          patchCols.phone = patch.phone != null ? String(patch.phone) : null;
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'email')) {
          patchCols.email = patch.email != null ? String(patch.email) : null;
        }

        await storeWrite.call('update', [
          'patient_circle_member',
          memberId,
          patchCols,
          {
            event: 'record.patient.circle.updated',
            recordType: 'patient_circle_member',
            recordId: memberId,
          },
        ]);

        // Read-back.
        const updMemberRows = await storeQuery.call('run', ['patient.getCircleMember', { id: memberId }]);
        if (!updMemberRows.length) {
          throw new Error('record.patient.updateCircleMember: row disappeared after write: ' + memberId);
        }
        return mapCircleMember(updMemberRows[0]);
      }

      case 'setNR': {
        const clientId = args[0];
        const nrMemberId = args[1]; // string to promote, or null/'' to clear
        if (typeof clientId !== 'string') {
          throw new Error('record.patient.setNR: clientId must be a string');
        }

        // Patient existence check — no audit tag.
        const existRowsNR = await storeQuery.call('run', ['patient.get', { id: clientId }]);
        if (!existRowsNR.length) {
          throw notFound('record.patient.setNR: patient not found: ' + clientId);
        }

        // Validate the target member BEFORE any write — a failed cross-patient
        // guard must be a no-op. Demoting first would clear this patient's existing
        // NR even on a rejected call. Atomicity order: validate → demote-all → promote.
        const promoteId = nrMemberId && typeof nrMemberId === 'string' ? nrMemberId : null;
        if (promoteId) {
          const nrMemberRows = await storeQuery.call('run', ['patient.getCircleMember', { id: promoteId }]);
          if (!nrMemberRows.length) {
            throw notFound('record.patient.setNR: member not found: ' + promoteId);
          }
          if (nrMemberRows[0].patient_id !== clientId) {
            throw Object.assign(
              new Error('record.patient.setNR: member does not belong to this patient'),
              { code: 'cap.denied' },
            );
          }
        }

        // Demote all existing primary NR members.
        await storeWrite.call('updateWhere', [
          'patient_circle_member',
          { patient_id: clientId },
          { is_primary_nr: 0 },
          {
            event: 'record.patient.circle.nr.changed',
            recordType: 'patient_circle_member',
            recordId: clientId,
            detail: { cleared: true },
          },
        ]);

        // Promote the validated member if provided.
        if (promoteId) {
          await storeWrite.call('update', [
            'patient_circle_member',
            promoteId,
            { is_primary_nr: 1 },
            {
              event: 'record.patient.circle.nr.changed',
              recordType: 'patient_circle_member',
              recordId: clientId,
              detail: { memberId: promoteId },
            },
          ]);
        }

        // Return the updated circle so view can re-render.
        const circleRows = await storeQuery.call('run', [
          'patient.getCircle',
          { id: clientId },
          { event: 'record.patient.viewed', recordType: 'patient_circle_member', recordId: clientId },
        ]);
        return circleRows.map(mapCircleMember);
      }

      case 'setConsentState': {
        const clientId = args[0];
        const patch = args[1];
        if (typeof clientId !== 'string') {
          throw new Error('record.patient.setConsentState: clientId must be a string');
        }
        if (!patch || typeof patch !== 'object') {
          throw new Error('record.patient.setConsentState: patch must be an object');
        }

        // Patient existence check — no audit tag.
        const existRowsConsent = await storeQuery.call('run', ['patient.get', { id: clientId }]);
        if (!existRowsConsent.length) {
          throw notFound('record.patient.setConsentState: patient not found: ' + clientId);
        }

        const now = Date.now();

        // Map camelCase patch keys → snake_case DB columns.
        const CONSENT_COL_MAP = {
          advanceDirectiveStatus:          'advance_directive_status',
          advanceDirectiveDocumentId:      'advance_directive_document_id',
          informedConsentStatus:           'informed_consent_status',
          teleConsentMode:                 'tele_consent_mode',
          capacityStatus:                  'capacity_status',
          confidentialityExceptionActive:  'confidentiality_exception_active',
        };

        // Existing row check — no audit.
        const consentRows = await storeQuery.call('run', ['patient.getConsentState', { id: clientId }]);

        if (consentRows.length > 0) {
          // Update: only provided keys (including '' and null — clear semantics).
          const patchCols = { updated_at: now };
          for (const [camel, snake] of Object.entries(CONSENT_COL_MAP)) {
            if (Object.prototype.hasOwnProperty.call(patch, camel)) {
              if (camel === 'confidentialityExceptionActive') {
                patchCols[snake] = patch[camel] ? 1 : 0;
              } else {
                // Type-validate: must be string or null.
                const val = patch[camel];
                if (val !== null && val !== undefined && typeof val !== 'string') {
                  throw new Error('record.patient.setConsentState: ' + camel + ' must be a string or null');
                }
                patchCols[snake] = val !== undefined ? val : null;
              }
            }
          }
          await storeWrite.call('update', [
            'patient_consent_state',
            clientId,
            patchCols,
            {
              event: 'record.patient.consent.updated',
              recordType: 'patient_consent_state',
              recordId: clientId,
            },
          ]);
        } else {
          // Insert full row with nulls for absent fields.
          const row = {
            patient_id: clientId,
            advance_directive_status: null,
            advance_directive_document_id: null,
            informed_consent_status: null,
            tele_consent_mode: null,
            capacity_status: null,
            confidentiality_exception_active: 0,
            updated_at: now,
          };
          for (const [camel, snake] of Object.entries(CONSENT_COL_MAP)) {
            if (Object.prototype.hasOwnProperty.call(patch, camel)) {
              if (camel === 'confidentialityExceptionActive') {
                row[snake] = patch[camel] ? 1 : 0;
              } else {
                const val = patch[camel];
                if (val !== null && val !== undefined && typeof val !== 'string') {
                  throw new Error('record.patient.setConsentState: ' + camel + ' must be a string or null');
                }
                row[snake] = val !== undefined ? val : null;
              }
            }
          }
          await storeWrite.call('insert', [
            'patient_consent_state',
            row,
            {
              event: 'record.patient.consent.updated',
              recordType: 'patient_consent_state',
              recordId: clientId,
            },
          ]);
        }

        // Read-back.
        const updConsentRows = await storeQuery.call('run', ['patient.getConsentState', { id: clientId }]);
        if (!updConsentRows.length) {
          throw new Error('record.patient.setConsentState: row disappeared after write: ' + clientId);
        }
        return mapConsentState(updConsentRows[0]);
      }

      case 'addRiskEvent': {
        const clientId = args[0];
        const input = args[1];
        if (typeof clientId !== 'string') {
          throw new Error('record.patient.addRiskEvent: clientId must be a string');
        }
        if (!input || typeof input !== 'object') {
          throw new Error('record.patient.addRiskEvent: input must be an object');
        }
        if (!input.kind || !VALID_RISK_KINDS.has(input.kind)) {
          throw new Error('record.patient.addRiskEvent: invalid kind: ' + String(input.kind));
        }
        if (input.severity !== undefined && input.severity !== null && !VALID_SEVERITY.has(input.severity)) {
          throw new Error('record.patient.addRiskEvent: invalid severity: ' + String(input.severity));
        }

        // Patient existence check — no audit tag.
        const existRowsRisk = await storeQuery.call('run', ['patient.get', { id: clientId }]);
        if (!existRowsRisk.length) {
          throw notFound('record.patient.addRiskEvent: patient not found: ' + clientId);
        }

        const eventId = globalThis.crypto.randomUUID();
        const occurredAt = (typeof input.occurredAt === 'number') ? input.occurredAt : Date.now();
        const riskRow = {
          id: eventId,
          patient_id: clientId,
          kind: input.kind,
          severity: input.severity ?? null,
          occurred_at: occurredAt,
          // summary is PHI — stored in DB, NEVER in audit detail
          summary: input.summary != null ? String(input.summary) : null,
          audit_event_id: null,
        };

        await storeWrite.call('insert', [
          'patient_risk_event',
          riskRow,
          {
            event: 'record.patient.risk.added',
            recordType: 'patient_risk_event',
            recordId: eventId,
            detail: { kind: input.kind, severity: input.severity ?? null },
          },
        ]);

        return mapRiskEvent(riskRow);
      }

      case 'setCapacity': {
        const clientId = args[0];
        const status = args[1];
        if (typeof clientId !== 'string') {
          throw new Error('record.patient.setCapacity: clientId must be a string');
        }
        if (typeof status !== 'string' || !VALID_CAPACITY.has(status)) {
          throw new Error('record.patient.setCapacity: invalid status: ' + String(status));
        }

        // Patient existence check — no audit tag.
        const existRowsCap = await storeQuery.call('run', ['patient.get', { id: clientId }]);
        if (!existRowsCap.length) {
          throw notFound('record.patient.setCapacity: patient not found: ' + clientId);
        }

        const nowCap = Date.now();
        const consentRowsCap = await storeQuery.call('run', ['patient.getConsentState', { id: clientId }]);

        if (consentRowsCap.length > 0) {
          await storeWrite.call('update', [
            'patient_consent_state',
            clientId,
            { capacity_status: status, updated_at: nowCap },
            {
              event: 'record.patient.capacity.changed',
              recordType: 'patient_consent_state',
              recordId: clientId,
              detail: { status },
            },
          ]);
        } else {
          await storeWrite.call('insert', [
            'patient_consent_state',
            {
              patient_id: clientId,
              advance_directive_status: null,
              advance_directive_document_id: null,
              informed_consent_status: null,
              tele_consent_mode: null,
              capacity_status: status,
              confidentiality_exception_active: 0,
              updated_at: nowCap,
            },
            {
              event: 'record.patient.capacity.changed',
              recordType: 'patient_consent_state',
              recordId: clientId,
              detail: { status },
            },
          ]);
        }

        // Read-back.
        const updCapRows = await storeQuery.call('run', ['patient.getConsentState', { id: clientId }]);
        if (!updCapRows.length) {
          throw new Error('record.patient.setCapacity: row disappeared after write: ' + clientId);
        }
        return mapConsentState(updCapRows[0]);
      }

      case 'toggleException': {
        const clientId = args[0];
        const active = args[1];
        const payload = args[2] || {};
        if (typeof clientId !== 'string') {
          throw new Error('record.patient.toggleException: clientId must be a string');
        }
        const flag = active ? 1 : 0;

        if (active) {
          if (!payload.ground || !VALID_S23_GROUNDS.has(payload.ground)) {
            throw new Error('record.patient.toggleException: invalid or missing ground: ' + String(payload.ground));
          }
        }

        // Patient existence check — no audit tag.
        const existRowsS23 = await storeQuery.call('run', ['patient.get', { id: clientId }]);
        if (!existRowsS23.length) {
          throw notFound('record.patient.toggleException: patient not found: ' + clientId);
        }

        const nowS23 = Date.now();
        const consentRowsS23 = await storeQuery.call('run', ['patient.getConsentState', { id: clientId }]);

        if (consentRowsS23.length > 0) {
          await storeWrite.call('update', [
            'patient_consent_state',
            clientId,
            { confidentiality_exception_active: flag, updated_at: nowS23 },
            {
              event: 'record.patient.s23.changed',
              recordType: 'patient_consent_state',
              recordId: clientId,
              detail: { action: active ? 'invoke' : 'revoke', ground: active ? payload.ground : null },
            },
          ]);
        } else {
          await storeWrite.call('insert', [
            'patient_consent_state',
            {
              patient_id: clientId,
              advance_directive_status: null,
              advance_directive_document_id: null,
              informed_consent_status: null,
              tele_consent_mode: null,
              capacity_status: null,
              confidentiality_exception_active: flag,
              updated_at: nowS23,
            },
            {
              event: 'record.patient.s23.changed',
              recordType: 'patient_consent_state',
              recordId: clientId,
              detail: { action: active ? 'invoke' : 'revoke', ground: active ? payload.ground : null },
            },
          ]);
        }

        // Insert a risk event for the §23 toggle.
        // summary is PHI (ground + disclosedTo + reason) — stored in DB only.
        const s23EventId = globalThis.crypto.randomUUID();
        const s23Summary = (payload.ground || '') + '|' + (payload.disclosedTo || '') + '|' + (payload.reason || '');
        const s23RiskRow = {
          id: s23EventId,
          patient_id: clientId,
          kind: 's23_disclosure',
          severity: 'elevated',
          occurred_at: nowS23,
          summary: s23Summary,
          audit_event_id: null,
        };
        await storeWrite.call('insert', [
          'patient_risk_event',
          s23RiskRow,
          {
            event: 'record.patient.risk.added',
            recordType: 'patient_risk_event',
            recordId: s23EventId,
            // ground is enum — allowed; disclosedTo + reason are PHI — omitted
            detail: { kind: 's23_disclosure' },
          },
        ]);

        // Read-back consent.
        const updS23Rows = await storeQuery.call('run', ['patient.getConsentState', { id: clientId }]);
        if (!updS23Rows.length) {
          throw new Error('record.patient.toggleException: consent row disappeared after write: ' + clientId);
        }
        return { consent: mapConsentState(updS23Rows[0]), event: mapRiskEvent(s23RiskRow) };
      }

      case 'setSafetyPlan': {
        const clientId = args[0];
        const patch = args[1];
        if (typeof clientId !== 'string') {
          throw new Error('record.patient.setSafetyPlan: clientId must be a string');
        }
        if (!patch || typeof patch !== 'object') {
          throw new Error('record.patient.setSafetyPlan: patch must be an object');
        }
        if (patch.status !== undefined && !VALID_PLAN_STATUS.has(patch.status)) {
          throw new Error('record.patient.setSafetyPlan: invalid status: ' + String(patch.status));
        }

        // Patient existence check — no audit tag.
        const existRowsSP = await storeQuery.call('run', ['patient.get', { id: clientId }]);
        if (!existRowsSP.length) {
          throw notFound('record.patient.setSafetyPlan: patient not found: ' + clientId);
        }

        const nowSP = Date.now();
        // camelCase → snake_case mapping for text fields (PHI — only in DB, never in audit).
        const SP_COL_MAP = {
          warningSigns:            'warning_signs',
          copingStrategies:        'coping_strategies',
          socialSettingsContacts:  'social_settings_contacts',
          helpContacts:            'help_contacts',
          professionalAgencies:    'professional_agencies',
          meansRestriction:        'means_restriction',
          reasonsForLiving:        'reasons_for_living',
        };

        const spRows = await storeQuery.call('run', ['patient.getSafetyPlan', { id: clientId }]);

        if (spRows.length > 0) {
          // Update: only provided keys; '' and null both write (clear semantics).
          const patchColsSP = { updated_at: nowSP };
          if (Object.prototype.hasOwnProperty.call(patch, 'status')) {
            patchColsSP.status = patch.status;
          }
          if (Object.prototype.hasOwnProperty.call(patch, 'sharedWithNr')) {
            patchColsSP.shared_with_nr = patch.sharedWithNr ? 1 : 0;
          }
          for (const [camel, snake] of Object.entries(SP_COL_MAP)) {
            if (Object.prototype.hasOwnProperty.call(patch, camel)) {
              const val = patch[camel];
              if (val !== null && val !== undefined && typeof val !== 'string') {
                throw new Error('record.patient.setSafetyPlan: ' + camel + ' must be a string or null');
              }
              patchColsSP[snake] = val !== undefined ? val : null;
            }
          }
          await storeWrite.call('update', [
            'patient_safety_plan',
            clientId,
            patchColsSP,
            {
              event: 'record.patient.safetyplan.updated',
              recordType: 'patient_safety_plan',
              recordId: clientId,
              // No PHI in detail — plan text is PHI.
            },
          ]);
        } else {
          // Insert full row; absent text fields default null; status defaults 'none'.
          const spInsertRow = {
            patient_id: clientId,
            status: patch.status ?? 'none',
            warning_signs: null,
            coping_strategies: null,
            social_settings_contacts: null,
            help_contacts: null,
            professional_agencies: null,
            means_restriction: null,
            reasons_for_living: null,
            shared_with_nr: patch.sharedWithNr ? 1 : 0,
            updated_at: nowSP,
          };
          for (const [camel, snake] of Object.entries(SP_COL_MAP)) {
            if (Object.prototype.hasOwnProperty.call(patch, camel)) {
              const val = patch[camel];
              if (val !== null && val !== undefined && typeof val !== 'string') {
                throw new Error('record.patient.setSafetyPlan: ' + camel + ' must be a string or null');
              }
              spInsertRow[snake] = val !== undefined ? val : null;
            }
          }
          await storeWrite.call('insert', [
            'patient_safety_plan',
            spInsertRow,
            {
              event: 'record.patient.safetyplan.updated',
              recordType: 'patient_safety_plan',
              recordId: clientId,
            },
          ]);
        }

        // Read-back.
        const updSPRows = await storeQuery.call('run', ['patient.getSafetyPlan', { id: clientId }]);
        if (!updSPRows.length) {
          throw new Error('record.patient.setSafetyPlan: row disappeared after write: ' + clientId);
        }
        return mapSafetyPlan(updSPRows[0]);
      }

      case 'attachDocument': {
        const clientId = args[0];
        const input = args[1];
        if (typeof clientId !== 'string' || clientId.length === 0) {
          throw new Error('record.patient.attachDocument: clientId must be a non-empty string');
        }
        if (!input || typeof input !== 'object') {
          throw new Error('record.patient.attachDocument: input must be an object');
        }
        if (!input.fileName || String(input.fileName).trim().length === 0) {
          throw new Error('record.patient.attachDocument: fileName must be a non-empty string');
        }
        if (!input.base64 || String(input.base64).length === 0) {
          throw new Error('record.patient.attachDocument: base64 must be a non-empty string');
        }

        // Decode base64 → Buffer (Node process; Buffer is available in FP-Host).
        const buffer = Buffer.from(String(input.base64), 'base64');
        if (buffer.length === 0) {
          throw new Error('record.patient.attachDocument: base64 decoded to empty buffer');
        }

        // Patient existence check — no audit tag.
        const existRowsDoc = await storeQuery.call('run', ['patient.get', { id: clientId }]);
        if (!existRowsDoc.length) {
          throw notFound('record.patient.attachDocument: patient not found: ' + clientId);
        }

        // Write encrypted blob — returns { id, sha256, size }.
        const { id: blobId, sha256, size } = await blobWrite.call('put', [buffer]);

        const docRow = {
          id: globalThis.crypto.randomUUID(),
          patient_id: clientId,
          kind: 'document',
          title: String(input.fileName).trim(),
          storage_ref: 'blob:' + blobId,
          mime_type: input.mimeType != null ? String(input.mimeType) : null,
          sha256,
          linked_kind: null,
          linked_id: null,
          created_at: Date.now(),
        };

        await storeWrite.call('insert', [
          'patient_document',
          docRow,
          {
            event: 'record.patient.document.attached',
            recordType: 'patient_document',
            recordId: docRow.id,
            // fileName/title is PHI-adjacent — NEVER in audit detail.
            // Omit mime_type when null (ledger detail = string|number|boolean only).
            detail: docRow.mime_type != null ? { mime_type: docRow.mime_type, size } : { size },
          },
        ]);

        return mapDocument(docRow);
      }

      case 'removeDocument': {
        const clientId = args[0];
        const docId = args[1];
        if (typeof clientId !== 'string' || clientId.length === 0) {
          throw new Error('record.patient.removeDocument: clientId must be a non-empty string');
        }
        if (typeof docId !== 'string' || docId.length === 0) {
          throw new Error('record.patient.removeDocument: docId must be a non-empty string');
        }

        // Look up document via list (no audit tag on the read).
        const docRows = await storeQuery.call('run', ['patient.listDocuments', { id: clientId }]);
        const docRow = docRows.find(function (r) { return r.id === docId; });

        // Not found OR cross-patient guard.
        if (!docRow || docRow.patient_id !== clientId) {
          throw notFound('record.patient.removeDocument: document not found: ' + docId);
        }

        const blobId = parseBlobId(docRow.storage_ref);

        // Delete DB row first, then unlink blob (blob-first would be inconsistent on crash).
        await storeWrite.call('delete', [
          'patient_document',
          docId,
          {
            event: 'record.patient.document.removed',
            recordType: 'patient_document',
            recordId: docId,
          },
        ]);

        // Unlink the blob file after row is gone.
        await blobWrite.call('delete', [blobId]);

        return { removed: docId };
      }

      default:
        throw new Error('record.patient: unknown method ' + method);
    }
  });

  return {
    dispose() {
      storeQuery.dispose();
      storeWrite.dispose();
      blobWrite.dispose();
    },
  };
}
