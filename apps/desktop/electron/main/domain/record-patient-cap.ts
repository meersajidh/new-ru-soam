/**
 * record.patient@1.0 — canonical Patient record capability (ADR-504 / ADR-505).
 *
 * PHI-flagged (`phi: true`): the ADR-307 lock-gate in the registry rejects all
 * calls with `cap.locked` when the workspace is locked. No PHI enters the
 * Bundle Host — this handler runs in Main only.
 *
 * Backed by the per-workspace encrypted Local Store `patients` table
 * (migration version 4). Audit-on-write AND audit-on-view (ADR-502).
 *
 * Methods:
 *   create(input: PatientCreateInput)             → PatientRecord
 *   get(id: string)                               → PatientRecord | null
 *   list()                                        → PatientSummary[]
 *   update(id: string, patch: PatientUpdatePatch) → PatientRecord
 *   setStatus(id: string, status: PatientStatus)  → PatientRecord
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
import type {
  PatientCreateInput,
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

function methodNotFound(method: string): Error {
  return Object.assign(new Error(`record.patient: unknown method: ${method}`), {
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
      `SELECT id, given_name, family_name, status
       FROM patients
       ORDER BY family_name ASC, given_name ASC`,
    )
    .all() as Array<{
      id: string;
      given_name: string;
      family_name: string | null;
      status: string;
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

// ── Registration ──────────────────────────────────────────────────────────────

export function registerRecordPatientCapability(): void {
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
        case 'get': {
          const id = args[0];
          if (typeof id !== 'string') {
            throw validationError('record.patient.get: id must be a string');
          }
          return implGet(id);
        }
        case 'list': {
          return implList();
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
        default:
          throw methodNotFound(method);
      }
    },
    { phi: true },
  );
}
