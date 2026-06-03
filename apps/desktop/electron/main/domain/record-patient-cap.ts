/**
 * record.patient@1.0 — command cap (ADR-505 / ADR-506 §3 / O442 rung A).
 * record.patient.query@1.0 — query cap (same ADRs).
 *
 * CQRS split per ADR-506 §3: write-side (sole-writer, destined for FP-Host rung D)
 * vs read-side (many-consumer, destined for generic query executor rung C).
 * Both caps run in Main as a stopgap — rung D moves command logic to FP-Host.
 *
 * Both are PHI-flagged (`phi: true`): patient reads are PHI too (ADR-307).
 * The ADR-307 lock-gate in the registry rejects all calls with `cap.locked`
 * when the workspace is locked. No PHI enters the Bundle Host — both handlers
 * run in Main only.
 *
 * Backed by the per-workspace encrypted Local Store `patients` table
 * (migration version 4). Audit-on-write AND audit-on-view (ADR-502).
 *
 * record.patient (command) methods:
 *   create(input: PatientCreateInput)             → PatientRecord
 *   update(id: string, patch: PatientUpdatePatch) → PatientRecord
 *   setStatus(id: string, status: PatientStatus)  → PatientRecord
 *   setStage(id, stage, reason?)                  → PatientLifecycle
 *   updateProfile(id, patch)                      → PatientProfile
 *
 * record.patient.query (query) methods:
 *   get(id: string)                               → PatientRecord | null
 *   list()                                        → PatientSummary[]
 *   getProfile(id: string)                        → PatientProfile | null
 *   getLifecycle(id: string)                      → PatientLifecycle | null
 *   listLifecycleStages()                         → LifecycleStageDef[]
 *
 * Reactivity note: no `subscribe()` method is provided. The Local Store emits
 * `store.changed` (table: 'patients') after every write via `emitTableChange()`.
 * The renderer watches that platform event and refetches via TanStack Query —
 * no bespoke streaming protocol needed and the capability bridge (ADR-202/103)
 * does not support streams.
 */

import { randomUUID } from 'crypto';
import { registerCapability } from '../capability/registry.js';
import { localStoreManager } from '../local-store/index.js';
import { auditService } from '../audit/index.js';
import { CapErr } from '../../shared/ipc-protocol.js';
import { LIFECYCLE_STAGES, VALID_STAGES } from './lifecycle-stages.js';
import type { LifecycleStageDef } from './lifecycle-stages.js';
import type {
  LifecycleStage,
  PatientCreateInput,
  PatientLifecycle,
  PatientProfile,
  PatientProfilePatch,
  PatientRecord,
  PatientStatus,
  PatientSummary,
  PatientUpdatePatch,
} from '@ru-soam/domain';
import type { LocalStore } from '../local-store/store.js';
import type DatabaseT from 'better-sqlite3';

/** Derive `displayName` from given/family names. Pure function — no PHI logged. */
function deriveDisplayName(givenName: string, familyName: string | null): string {
  if (familyName && familyName.trim().length > 0) {
    return `${familyName.trim()}, ${givenName.trim()}`;
  }
  return givenName.trim();
}

// ── DB row shape ──────────────────────────────────────────────────────────────

interface PatientRow {
  readonly id: string;
  readonly created_at: number;
  readonly updated_at: number;
  readonly given_name: string;
  readonly family_name: string | null;
  readonly contact_phone: string | null;
  readonly contact_email: string | null;
  readonly dob: string | null;
  readonly status: string;
}

// ── Error factories ───────────────────────────────────────────────────────────

function notFound(message: string): Error {
  return Object.assign(new Error(message), { code: CapErr.NotFound });
}

function methodNotFound(cap: string, method: string): Error {
  return Object.assign(new Error(`${cap}: unknown method: ${method}`), {
    code: CapErr.MethodNotFound,
  });
}

function validationError(message: string): Error {
  return Object.assign(new Error(message), { code: CapErr.HandlerThrew });
}

// ── Store helpers ─────────────────────────────────────────────────────────────

function requireStore(): LocalStore {
  const store = localStoreManager.current();
  if (!store) throw notFound('record.patient: no active workspace');
  return store;
}

function requireDb(store: LocalStore): DatabaseT.Database {
  const db = store.rawDb();
  if (!db) throw notFound('record.patient: store not open');
  return db;
}

// ── Row ↔ record conversion ───────────────────────────────────────────────────

function rowToRecord(row: PatientRow): PatientRecord {
  const status = row.status as PatientStatus;
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    givenName: row.given_name,
    familyName: row.family_name,
    contactPhone: row.contact_phone,
    contactEmail: row.contact_email,
    dob: row.dob,
    status,
    displayName: deriveDisplayName(row.given_name, row.family_name),
  };
}

// ── Validation helpers ────────────────────────────────────────────────────────

const VALID_STATUSES: ReadonlySet<string> = new Set(['active', 'inactive', 'archived']);

function validateStatus(status: unknown): PatientStatus {
  if (typeof status !== 'string' || !VALID_STATUSES.has(status)) {
    throw validationError(`record.patient: invalid status: ${String(status)}`);
  }
  return status as PatientStatus;
}

// ── DB operations ─────────────────────────────────────────────────────────────

function dbInsert(db: DatabaseT.Database, record: PatientRecord): void {
  db.prepare(
    `INSERT INTO patients
       (id, created_at, updated_at, given_name, family_name,
        contact_phone, contact_email, dob, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    record.id,
    record.createdAt,
    record.updatedAt,
    record.givenName,
    record.familyName ?? null,
    record.contactPhone ?? null,
    record.contactEmail ?? null,
    record.dob ?? null,
    record.status,
  );
}

function dbGetById(db: DatabaseT.Database, id: string): PatientRow | null {
  const row = db
    .prepare(
      `SELECT id, created_at, updated_at, given_name, family_name,
              contact_phone, contact_email, dob, status
       FROM patients WHERE id = ?`,
    )
    .get(id) as PatientRow | undefined;
  return row ?? null;
}

function dbUpdate(
  db: DatabaseT.Database,
  id: string,
  fields: Partial<{
    given_name: string;
    family_name: string | null;
    contact_phone: string | null;
    contact_email: string | null;
    dob: string | null;
    status: string;
    updated_at: number;
  }>,
): void {
  const sets: string[] = [];
  const params: unknown[] = [];

  if (fields.given_name !== undefined) {
    sets.push('given_name = ?');
    params.push(fields.given_name);
  }
  if ('family_name' in fields) {
    sets.push('family_name = ?');
    params.push(fields.family_name ?? null);
  }
  if ('contact_phone' in fields) {
    sets.push('contact_phone = ?');
    params.push(fields.contact_phone ?? null);
  }
  if ('contact_email' in fields) {
    sets.push('contact_email = ?');
    params.push(fields.contact_email ?? null);
  }
  if ('dob' in fields) {
    sets.push('dob = ?');
    params.push(fields.dob ?? null);
  }
  if (fields.status !== undefined) {
    sets.push('status = ?');
    params.push(fields.status);
  }
  if (fields.updated_at !== undefined) {
    sets.push('updated_at = ?');
    params.push(fields.updated_at);
  }

  if (sets.length === 0) return;
  params.push(id);
  db.prepare(`UPDATE patients SET ${sets.join(', ')} WHERE id = ?`).run(...params);
}

// ── Profile row shape ─────────────────────────────────────────────────────────

interface PatientProfileRow {
  readonly patient_id: string;
  readonly preferred_language: string | null;
  readonly medication_awareness: string | null;
  readonly diagnosis: string | null;
  readonly updated_at: number;
}

function rowToProfile(row: PatientProfileRow): PatientProfile {
  return {
    patientId: row.patient_id,
    preferredLanguage: row.preferred_language,
    medicationAwareness: row.medication_awareness,
    diagnosis: row.diagnosis,
    updatedAt: row.updated_at,
  };
}

// ── Lifecycle row shape ────────────────────────────────────────────────────────

interface PatientLifecycleRow {
  readonly patient_id: string;
  readonly stage: string;
  readonly stage_updated_at: number;
  readonly stage_reason: string | null;
}

function rowToLifecycle(row: PatientLifecycleRow): PatientLifecycle {
  return {
    patientId: row.patient_id,
    stage: row.stage as LifecycleStage,
    stageUpdatedAt: row.stage_updated_at,
    stageReason: row.stage_reason,
  };
}

function validateStage(stage: unknown): LifecycleStage {
  if (typeof stage !== 'string' || !VALID_STAGES.has(stage)) {
    throw validationError(`record.patient: invalid stage: ${String(stage)}`);
  }
  return stage as LifecycleStage;
}

// ── Method implementations ────────────────────────────────────────────────────

function implCreate(input: PatientCreateInput): PatientRecord {
  const store = requireStore();
  const db = requireDb(store);
  const workspaceId = store.workspaceId() ?? 'unknown';

  if (!input.givenName || input.givenName.trim().length === 0) {
    throw validationError('record.patient.create: givenName is required');
  }

  const now = Date.now();
  const record: PatientRecord = {
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
    givenName: input.givenName.trim(),
    familyName: input.familyName?.trim() ?? null,
    contactPhone: input.contactPhone?.trim() ?? null,
    contactEmail: input.contactEmail?.trim() ?? null,
    dob: input.dob?.trim() ?? null,
    status: input.status ?? 'active',
    displayName: deriveDisplayName(
      input.givenName.trim(),
      input.familyName?.trim() ?? null,
    ),
  };

  dbInsert(db, record);

  // Every new patient gets a default 'active' lifecycle row (Am3 §A3.3).
  db.prepare(
    `INSERT INTO patient_lifecycle (patient_id, stage, stage_updated_at)
     VALUES (?, 'active', ?)`,
  ).run(record.id, now);

  store.emitTableChange('patients', 'set', [record.id]);

  auditService.emit({
    event: 'record.patient.created',
    entityId: workspaceId,
    recordId: record.id,
    recordType: 'patient',
    principal: 'system',
  });

  return record;
}

function implGet(id: string): PatientRecord | null {
  const store = requireStore();
  const db = requireDb(store);
  const workspaceId = store.workspaceId() ?? 'unknown';

  const row = dbGetById(db, id);

  auditService.emit({
    event: 'record.patient.viewed',
    entityId: workspaceId,
    recordId: id,
    recordType: 'patient',
    principal: 'system',
  });

  return row ? rowToRecord(row) : null;
}

function implList(): PatientSummary[] {
  const store = requireStore();
  const db = requireDb(store);
  const workspaceId = store.workspaceId() ?? 'unknown';

  const rows = db
    .prepare(
      `SELECT p.id, p.given_name, p.family_name, p.status,
              COALESCE(pl.stage, 'active') AS stage
       FROM patients p
       LEFT JOIN patient_lifecycle pl ON pl.patient_id = p.id
       ORDER BY p.family_name ASC, p.given_name ASC`,
    )
    .all() as Array<{
      id: string;
      given_name: string;
      family_name: string | null;
      status: string;
      stage: string;
    }>;

  auditService.emit({
    event: 'record.patient.listed',
    entityId: workspaceId,
    recordType: 'patient',
    principal: 'system',
    detail: { count: rows.length },
  });

  return rows.map((r) => ({
    id: r.id,
    displayName: deriveDisplayName(r.given_name, r.family_name),
    status: r.status as PatientStatus,
    stage: r.stage as LifecycleStage,
  }));
}

function implUpdate(id: string, patch: PatientUpdatePatch): PatientRecord {
  const store = requireStore();
  const db = requireDb(store);
  const workspaceId = store.workspaceId() ?? 'unknown';

  const existing = dbGetById(db, id);
  if (!existing) throw notFound(`record.patient.update: patient not found: ${id}`);

  if (patch.givenName !== undefined && patch.givenName.trim().length === 0) {
    throw validationError('record.patient.update: givenName must not be empty');
  }

  const now = Date.now();
  const fields: Parameters<typeof dbUpdate>[2] = { updated_at: now };

  if (patch.givenName !== undefined) fields.given_name = patch.givenName.trim();
  if ('familyName' in patch) fields.family_name = patch.familyName?.trim() ?? null;
  if ('contactPhone' in patch) fields.contact_phone = patch.contactPhone?.trim() ?? null;
  if ('contactEmail' in patch) fields.contact_email = patch.contactEmail?.trim() ?? null;
  if ('dob' in patch) fields.dob = patch.dob?.trim() ?? null;

  dbUpdate(db, id, fields);
  store.emitTableChange('patients', 'set', [id]);

  auditService.emit({
    event: 'record.patient.updated',
    entityId: workspaceId,
    recordId: id,
    recordType: 'patient',
    principal: 'system',
  });

  const updated = dbGetById(db, id);
  if (!updated) throw new Error(`record.patient.update: record disappeared after write: ${id}`);
  return rowToRecord(updated);
}

function implSetStatus(id: string, status: PatientStatus): PatientRecord {
  const store = requireStore();
  const db = requireDb(store);
  const workspaceId = store.workspaceId() ?? 'unknown';

  const existing = dbGetById(db, id);
  if (!existing) throw notFound(`record.patient.setStatus: patient not found: ${id}`);

  const now = Date.now();
  dbUpdate(db, id, { status, updated_at: now });
  store.emitTableChange('patients', 'set', [id]);

  auditService.emit({
    event: 'record.patient.status.changed',
    entityId: workspaceId,
    recordId: id,
    recordType: 'patient',
    principal: 'system',
    detail: { status },
  });

  const updated = dbGetById(db, id);
  if (!updated) throw new Error(`record.patient.setStatus: record disappeared after write: ${id}`);
  return rowToRecord(updated);
}

function implGetProfile(id: string): PatientProfile | null {
  const store = requireStore();
  const db = requireDb(store);
  const workspaceId = store.workspaceId() ?? 'unknown';

  const row = db
    .prepare(
      `SELECT patient_id, preferred_language, medication_awareness, diagnosis, updated_at
       FROM patient_profile WHERE patient_id = ?`,
    )
    .get(id) as PatientProfileRow | undefined;

  auditService.emit({
    event: 'record.patient.viewed',
    entityId: workspaceId,
    recordId: id,
    recordType: 'patient_profile',
    principal: 'system',
  });

  return row ? rowToProfile(row) : null;
}

function implUpdateProfile(id: string, patch: PatientProfilePatch): PatientProfile {
  const store = requireStore();
  const db = requireDb(store);
  const workspaceId = store.workspaceId() ?? 'unknown';

  // Patient must exist
  const patient = dbGetById(db, id);
  if (!patient) throw notFound(`record.patient.updateProfile: patient not found: ${id}`);

  const now = Date.now();
  db.prepare(
    `INSERT INTO patient_profile (patient_id, preferred_language, medication_awareness, diagnosis, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(patient_id) DO UPDATE SET
       preferred_language   = COALESCE(excluded.preferred_language,   preferred_language),
       medication_awareness = COALESCE(excluded.medication_awareness, medication_awareness),
       diagnosis            = COALESCE(excluded.diagnosis,            diagnosis),
       updated_at           = excluded.updated_at`,
  ).run(
    id,
    patch.preferredLanguage ?? null,
    patch.medicationAwareness ?? null,
    patch.diagnosis ?? null,
    now,
  );

  store.emitTableChange('patient_profile', 'set', [id]);

  auditService.emit({
    event: 'record.patient.profile.updated',
    entityId: workspaceId,
    recordId: id,
    recordType: 'patient_profile',
    principal: 'system',
  });

  const updated = db
    .prepare(
      `SELECT patient_id, preferred_language, medication_awareness, diagnosis, updated_at
       FROM patient_profile WHERE patient_id = ?`,
    )
    .get(id) as PatientProfileRow | undefined;
  if (!updated) throw new Error(`record.patient.updateProfile: row disappeared after write: ${id}`);
  return rowToProfile(updated);
}

function implGetLifecycle(id: string): PatientLifecycle | null {
  const store = requireStore();
  const db = requireDb(store);
  const workspaceId = store.workspaceId() ?? 'unknown';

  const row = db
    .prepare(
      `SELECT patient_id, stage, stage_updated_at, stage_reason
       FROM patient_lifecycle WHERE patient_id = ?`,
    )
    .get(id) as PatientLifecycleRow | undefined;

  auditService.emit({
    event: 'record.patient.viewed',
    entityId: workspaceId,
    recordId: id,
    recordType: 'patient_lifecycle',
    principal: 'system',
  });

  return row ? rowToLifecycle(row) : null;
}

function implSetStage(id: string, stage: LifecycleStage, reason?: string): PatientLifecycle {
  const store = requireStore();
  const db = requireDb(store);
  const workspaceId = store.workspaceId() ?? 'unknown';

  const existing = dbGetById(db, id);
  if (!existing) throw notFound(`record.patient.setStage: patient not found: ${id}`);

  const now = Date.now();
  db.prepare(
    `INSERT INTO patient_lifecycle (patient_id, stage, stage_updated_at, stage_reason)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(patient_id) DO UPDATE SET
       stage            = excluded.stage,
       stage_updated_at = excluded.stage_updated_at,
       stage_reason     = excluded.stage_reason`,
  ).run(id, stage, now, reason ?? null);

  store.emitTableChange('patient_lifecycle', 'set', [id]);

  // Audit detail contains only the enum stage — never reason (may be free-text PHI).
  auditService.emit({
    event: 'record.patient.lifecycle.changed',
    entityId: workspaceId,
    recordId: id,
    recordType: 'patient_lifecycle',
    principal: 'system',
    detail: { stage },
  });

  const updated = db
    .prepare(
      `SELECT patient_id, stage, stage_updated_at, stage_reason
       FROM patient_lifecycle WHERE patient_id = ?`,
    )
    .get(id) as PatientLifecycleRow | undefined;
  if (!updated) throw new Error(`record.patient.setStage: lifecycle row disappeared after write: ${id}`);
  return rowToLifecycle(updated);
}

function implListLifecycleStages(): LifecycleStageDef[] {
  return [...LIFECYCLE_STAGES];
}

// ── Registration ──────────────────────────────────────────────────────────────

export function registerRecordPatientCapability(): void {
  // ── Command cap: sole-writer methods (destined for FP-Host at rung D) ────────
  registerCapability(
    'record.patient',
    '1.0',
    async (method, args) => {
      switch (method) {
        case 'create': {
          const input = args[0] as PatientCreateInput;
          if (!input || typeof input !== 'object') {
            throw validationError('record.patient.create: input must be an object');
          }
          return implCreate(input);
        }
        case 'update': {
          const id = args[0];
          const patch = args[1] as PatientUpdatePatch;
          if (typeof id !== 'string') {
            throw validationError('record.patient.update: id must be a string');
          }
          if (!patch || typeof patch !== 'object') {
            throw validationError('record.patient.update: patch must be an object');
          }
          return implUpdate(id, patch);
        }
        case 'setStatus': {
          const id = args[0];
          const status = args[1];
          if (typeof id !== 'string') {
            throw validationError('record.patient.setStatus: id must be a string');
          }
          return implSetStatus(id, validateStatus(status));
        }
        case 'setStage': {
          const id = args[0];
          const stage = args[1];
          const reason = args[2];
          if (typeof id !== 'string') {
            throw validationError('record.patient.setStage: id must be a string');
          }
          if (reason !== undefined && typeof reason !== 'string') {
            throw validationError('record.patient.setStage: reason must be a string if provided');
          }
          return implSetStage(id, validateStage(stage), typeof reason === 'string' ? reason : undefined);
        }
        case 'updateProfile': {
          const id = args[0];
          const patch = args[1] as PatientProfilePatch;
          if (typeof id !== 'string') {
            throw validationError('record.patient.updateProfile: id must be a string');
          }
          if (!patch || typeof patch !== 'object') {
            throw validationError('record.patient.updateProfile: patch must be an object');
          }
          return implUpdateProfile(id, patch);
        }
        default:
          throw methodNotFound('record.patient', method);
      }
    },
    { phi: true, kind: 'command' },
  );

  // ── Query cap: read-only methods (many-consumer; destined for generic query executor at rung C) ─
  registerCapability(
    'record.patient.query',
    '1.0',
    async (method, args) => {
      switch (method) {
        case 'get': {
          const id = args[0];
          if (typeof id !== 'string') {
            throw validationError('record.patient.query.get: id must be a string');
          }
          return implGet(id);
        }
        case 'list': {
          return implList();
        }
        case 'getProfile': {
          const id = args[0];
          if (typeof id !== 'string') {
            throw validationError('record.patient.query.getProfile: id must be a string');
          }
          return implGetProfile(id);
        }
        case 'getLifecycle': {
          const id = args[0];
          if (typeof id !== 'string') {
            throw validationError('record.patient.query.getLifecycle: id must be a string');
          }
          return implGetLifecycle(id);
        }
        case 'listLifecycleStages': {
          return implListLifecycleStages();
        }
        default:
          throw methodNotFound('record.patient.query', method);
      }
    },
    { phi: true, kind: 'query' },
  );
}
