// ru-soam-sessions bundle entry point.
//
// Sessions Activity — Client Meeting store (ADR-508 P1 slice 2).
// Provides sessions.meeting.query (read) and sessions.meeting (command) caps.
//
// Consumes store.query@1.0 for all SQL reads and store.write@1.0 for all SQL
// writes. Row→record mapping is plain JS (no TypeScript, no platform imports
// — only what ctx provides).

// ── Domain vocab (validate in host — ADR-506 §G) ─────────────────────────────

const VALID_KINDS    = new Set(['intake', 'session', 'review', 'consult', 'other']);
const VALID_STATUS   = new Set(['scheduled', 'completed', 'cancelled', 'no_show']);
const VALID_MODALITY = new Set(['in_person', 'online']);

// ── Row → camelCase record mapper ─────────────────────────────────────────────

function mapMeeting(row) {
  return {
    id:              row.id,
    patientId:       row.patient_id,
    kind:            row.kind,
    status:          row.status,
    modality:        row.modality,
    startsAt:        row.starts_at,
    endsAt:          row.ends_at,
    sourceOrigin:    row.source_origin,
    syncState:       row.sync_state,
    providerId:      row.provider_id,
    providerEventId: row.provider_event_id,
    calendarId:      row.calendar_id,
    createdAt:       row.created_at,
    updatedAt:       row.updated_at,
  };
}

// ── Error helper ──────────────────────────────────────────────────────────────

function notFound(message) {
  return Object.assign(new Error(message), { code: 'cap.not_found' });
}

// ── Capability handler ────────────────────────────────────────────────────────

export function activate(ctx) {
  // Bind store.query@1.0 — FP-Host consumer channel.
  const storeQuery = ctx.bindCapability('store.query', '1.0');
  // Bind store.write@1.0 — FP-Host consumer channel.
  const storeWrite = ctx.bindCapability('store.write', '1.0');

  // ── sessions.meeting.query (read cap) ─────────────────────────────────────

  ctx.registerCapability('sessions.meeting.query', '1.0', async (method, args) => {
    switch (method) {
      case 'get': {
        const id = args[0];
        if (typeof id !== 'string' || id.length === 0) {
          throw new Error('sessions.meeting.query.get: id must be a non-empty string');
        }
        const rows = await storeQuery.call('run', [
          'meeting.get',
          { id },
          { event: 'sessions.meeting.viewed', recordType: 'client_meeting', recordId: id },
        ]);
        return rows.length > 0 ? mapMeeting(rows[0]) : null;
      }

      case 'listForPatient': {
        const patientId = args[0];
        if (typeof patientId !== 'string' || patientId.length === 0) {
          throw new Error('sessions.meeting.query.listForPatient: patientId must be a non-empty string');
        }
        const rows = await storeQuery.call('run', [
          'meeting.listForPatient',
          { patientId },
          { event: 'sessions.meeting.viewed', recordType: 'client_meeting', recordId: patientId },
        ]);
        return rows.map(mapMeeting);
      }

      case 'listUpcoming': {
        const fromMs = typeof args[0] === 'number' ? args[0] : Date.now();
        const rows = await storeQuery.call('run', [
          'meeting.listUpcoming',
          { from: fromMs },
          { event: 'sessions.meeting.viewed', recordType: 'client_meeting' },
        ]);
        return rows.map(mapMeeting);
      }

      default:
        throw new Error('sessions.meeting.query: unknown method ' + method);
    }
  });

  // ── sessions.meeting (command cap) ────────────────────────────────────────

  ctx.registerCapability('sessions.meeting', '1.0', async (method, args) => {
    switch (method) {
      case 'create': {
        const input = args[0];
        if (!input || typeof input !== 'object') {
          throw new Error('sessions.meeting.create: input must be an object');
        }
        if (!input.patientId || typeof input.patientId !== 'string' || input.patientId.trim().length === 0) {
          throw new Error('sessions.meeting.create: patientId is required');
        }
        if (typeof input.startsAt !== 'number') {
          throw new Error('sessions.meeting.create: startsAt must be a number');
        }

        const kind = input.kind ?? 'session';
        if (!VALID_KINDS.has(kind)) {
          throw new Error('sessions.meeting.create: invalid kind: ' + String(kind));
        }

        const status = input.status ?? 'scheduled';
        if (!VALID_STATUS.has(status)) {
          throw new Error('sessions.meeting.create: invalid status: ' + String(status));
        }

        const modality = input.modality ?? null;
        if (modality !== null && !VALID_MODALITY.has(modality)) {
          throw new Error('sessions.meeting.create: invalid modality: ' + String(modality));
        }

        const endsAt = (typeof input.endsAt === 'number') ? input.endsAt : null;

        const id  = globalThis.crypto.randomUUID();
        const now = Date.now();
        const row = {
          id,
          patient_id:        input.patientId.trim(),
          kind,
          status,
          modality,
          starts_at:         input.startsAt,
          ends_at:           endsAt,
          source_origin:     'app',
          sync_state:        'local',
          provider_id:       null,
          provider_event_id: null,
          calendar_id:       null,
          created_at:        now,
          updated_at:        now,
        };

        await storeWrite.call('insert', [
          'client_meeting',
          row,
          {
            event:      'sessions.meeting.created',
            recordType: 'client_meeting',
            recordId:   id,
            detail:     { kind, status },
          },
        ]);

        return mapMeeting(row);
      }

      case 'update': {
        const id    = args[0];
        const patch = args[1];
        if (typeof id !== 'string' || id.length === 0) {
          throw new Error('sessions.meeting.update: id must be a non-empty string');
        }
        if (!patch || typeof patch !== 'object') {
          throw new Error('sessions.meeting.update: patch must be an object');
        }

        // Existence check — no audit tag.
        const existRows = await storeQuery.call('run', ['meeting.get', { id }]);
        if (!existRows.length) {
          throw notFound('sessions.meeting.update: meeting not found: ' + id);
        }

        const patchCols = { updated_at: Date.now() };

        if (patch.kind !== undefined) {
          if (!VALID_KINDS.has(patch.kind)) {
            throw new Error('sessions.meeting.update: invalid kind: ' + String(patch.kind));
          }
          patchCols.kind = patch.kind;
        }
        if (patch.status !== undefined) {
          if (!VALID_STATUS.has(patch.status)) {
            throw new Error('sessions.meeting.update: invalid status: ' + String(patch.status));
          }
          patchCols.status = patch.status;
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'modality')) {
          const mod = patch.modality;
          if (mod !== null && !VALID_MODALITY.has(mod)) {
            throw new Error('sessions.meeting.update: invalid modality: ' + String(mod));
          }
          patchCols.modality = mod;
        }
        if (patch.startsAt !== undefined) {
          if (typeof patch.startsAt !== 'number') {
            throw new Error('sessions.meeting.update: startsAt must be a number');
          }
          patchCols.starts_at = patch.startsAt;
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'endsAt')) {
          const ea = patch.endsAt;
          if (ea !== null && typeof ea !== 'number') {
            throw new Error('sessions.meeting.update: endsAt must be a number or null');
          }
          patchCols.ends_at = ea;
        }

        await storeWrite.call('update', [
          'client_meeting',
          id,
          patchCols,
          { event: 'sessions.meeting.updated', recordType: 'client_meeting', recordId: id },
        ]);

        // Read-back.
        const updRows = await storeQuery.call('run', ['meeting.get', { id }]);
        if (!updRows.length) {
          throw new Error('sessions.meeting.update: record disappeared after write: ' + id);
        }
        return mapMeeting(updRows[0]);
      }

      case 'setStatus': {
        const id     = args[0];
        const status = args[1];
        if (typeof id !== 'string' || id.length === 0) {
          throw new Error('sessions.meeting.setStatus: id must be a non-empty string');
        }
        if (typeof status !== 'string' || !VALID_STATUS.has(status)) {
          throw new Error('sessions.meeting.setStatus: invalid status: ' + String(status));
        }

        // Existence check — no audit tag.
        const existRows = await storeQuery.call('run', ['meeting.get', { id }]);
        if (!existRows.length) {
          throw notFound('sessions.meeting.setStatus: meeting not found: ' + id);
        }

        await storeWrite.call('update', [
          'client_meeting',
          id,
          { status, updated_at: Date.now() },
          {
            event:      'sessions.meeting.status.changed',
            recordType: 'client_meeting',
            recordId:   id,
            detail:     { status },
          },
        ]);

        // Read-back.
        const updRows = await storeQuery.call('run', ['meeting.get', { id }]);
        if (!updRows.length) {
          throw new Error('sessions.meeting.setStatus: record disappeared after write: ' + id);
        }
        return mapMeeting(updRows[0]);
      }

      case 'delete': {
        const id = args[0];
        if (typeof id !== 'string' || id.length === 0) {
          throw new Error('sessions.meeting.delete: id must be a non-empty string');
        }

        // Existence check — no audit tag.
        const existRows = await storeQuery.call('run', ['meeting.get', { id }]);
        if (!existRows.length) {
          throw notFound('sessions.meeting.delete: meeting not found: ' + id);
        }

        await storeWrite.call('delete', [
          'client_meeting',
          id,
          { event: 'sessions.meeting.deleted', recordType: 'client_meeting', recordId: id },
        ]);

        return { deleted: id };
      }

      default:
        throw new Error('sessions.meeting: unknown method ' + method);
    }
  });

  return {
    dispose() {
      storeQuery.dispose();
      storeWrite.dispose();
    },
  };
}
