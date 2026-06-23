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
    id:                 row.id,
    patientId:          row.patient_id,
    kind:               row.kind,
    status:             row.status,
    modality:           row.modality,
    startsAt:           row.starts_at,
    endsAt:             row.ends_at,
    sourceOrigin:       row.source_origin,
    syncState:          row.sync_state,
    providerId:         row.provider_id,
    providerEventId:    row.provider_event_id,
    calendarId:         row.calendar_id,
    externalAccountId:  row.external_account_id,
    providerCalendarId: row.provider_calendar_id,
    createdAt:          row.created_at,
    updatedAt:          row.updated_at,
  };
}

// ── Error helper ──────────────────────────────────────────────────────────────

function notFound(message) {
  return Object.assign(new Error(message), { code: 'cap.not_found' });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isoToMs(iso) {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}

// ── Capability handler ────────────────────────────────────────────────────────

export function activate(ctx) {
  // Bind store.query@1.0 — FP-Host consumer channel.
  const storeQuery = ctx.bindCapability('store.query', '1.0');
  // Bind store.write@1.0 — FP-Host consumer channel.
  const storeWrite = ctx.bindCapability('store.write', '1.0');
  // Bind schedule.calendar.query@1.0 — cross-bundle, pull calendar events from cache.
  const calendarQuery = ctx.bindCapability('schedule.calendar.query', '1.0');
  // Bind schedule.calendar@1.0 — cross-bundle command cap; used to freshen event cache
  // before reading listAggregatedEvents (ADR-507 Am2 ordering constraint).
  const calendarCommand = ctx.bindCapability('schedule.calendar', '1.0');
  // Bind record.patient.query@1.0 — cross-bundle, participant resolution.
  const recordPatientQuery = ctx.bindCapability('record.patient.query', '1.0');

  // ── linkEvent — shared upsert keyed on full provider triple (ADR-508 Am1, O493) ──
  //
  // Lookup order:
  //   1. Full triple (provider_id, external_account_id, provider_calendar_id, provider_event_id)
  //   2. Legacy fallback: bare provider_event_id with NULL qualifiers — upgrade in place.
  // Insert always writes all four key fields (nullable for app-origin rows).

  async function linkEvent(event, clientId, auditDetail = { source: 'provider' }, opts = {}) {
    if (opts.kind !== undefined && !VALID_KINDS.has(opts.kind)) {
      throw new Error('sessions.meeting.linkEvent: invalid kind: ' + opts.kind);
    }
    const eventId           = event.id ?? event.providerEventId;
    const externalAccountId = event.externalAccountId ?? null;
    const providerCalendarId = event.providerCalendarId ?? null;

    // 1. Full triple lookup.
    const rows = await storeQuery.call('run', [
      'meeting.getByProviderEventId',
      {
        providerId:         'google-calendar',
        eventId,
        externalAccountId,
        providerCalendarId,
      },
    ]);

    const startsAt = isoToMs(event.start);
    const endsAt = isoToMs(event.end);
    const modality = event.meetingLink ? 'online' : 'in_person';

    if (rows.length === 0) {
      // 2. Legacy backfill: check for a bare-event-id row with NULL qualifiers.
      //    If found, upgrade it in place (fill the two new qualifier cols).
      if (externalAccountId !== null || providerCalendarId !== null) {
        const legacyRows = await storeQuery.call('run', [
          'meeting.getByProviderEventIdLegacy',
          { providerId: 'google-calendar', eventId },
        ]);
        if (legacyRows.length > 0) {
          const legacy = legacyRows[0];
          const now = Date.now();
          await storeWrite.call('update', [
            'client_meeting',
            legacy.id,
            {
              external_account_id:  externalAccountId,
              provider_calendar_id: providerCalendarId,
              starts_at:            startsAt,
              ends_at:              endsAt,
              modality,
              sync_state:           'linked',
              updated_at:           now,
            },
            {
              event:      'sessions.meeting.reconciled',
              recordType: 'client_meeting',
              recordId:   legacy.id,
              detail:     auditDetail,
            },
          ]);
          return { action: 'reconciled', id: legacy.id };
        }
      }

      // No existing row — insert new linked row.
      const id = globalThis.crypto.randomUUID();
      const now = Date.now();
      const insertKind = opts.kind ?? 'session';
      await storeWrite.call('insert', [
        'client_meeting',
        {
          id,
          patient_id:           clientId,
          kind:                 insertKind,
          status:               'scheduled',
          modality,
          starts_at:            startsAt,
          ends_at:              endsAt,
          source_origin:        'provider',
          sync_state:           'linked',
          provider_id:          'google-calendar',
          provider_event_id:    eventId,
          calendar_id:          event.calendarId ?? null,
          external_account_id:  externalAccountId,
          provider_calendar_id: providerCalendarId,
          created_at:           now,
          updated_at:           now,
        },
        {
          event:      'sessions.meeting.linked',
          recordType: 'client_meeting',
          recordId:   id,
          detail:     opts.kind ? { ...auditDetail, kind: opts.kind } : auditDetail,
        },
      ]);
      return { action: 'linked', id };
    }

    // Reconcile — time snapshot + fill qualifiers if NULL; do NOT touch kind/status.
    const existing = rows[0];
    const now = Date.now();
    const reconcilePatch = {
      starts_at:  startsAt,
      ends_at:    endsAt,
      modality,
      sync_state: 'linked',
      updated_at: now,
    };
    // Fill qualifiers if the existing row had them as NULL (e.g. re-run after partial backfill).
    if (existing.external_account_id == null && externalAccountId !== null) {
      reconcilePatch.external_account_id = externalAccountId;
    }
    if (existing.provider_calendar_id == null && providerCalendarId !== null) {
      reconcilePatch.provider_calendar_id = providerCalendarId;
    }
    await storeWrite.call('update', [
      'client_meeting',
      existing.id,
      reconcilePatch,
      {
        event:      'sessions.meeting.reconciled',
        recordType: 'client_meeting',
        recordId:   existing.id,
        detail:     auditDetail,
      },
    ]);
    return { action: 'reconciled', id: existing.id };
  }

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

      case 'listLinkedProvider': {
        const arg = args[0] || {};
        const { providerId, from, to } = arg;
        if (typeof providerId !== 'string' || providerId.length === 0) {
          throw new Error('sessions.meeting.query.listLinkedProvider: providerId must be a non-empty string');
        }
        if (typeof from !== 'number') {
          throw new Error('sessions.meeting.query.listLinkedProvider: from must be a number');
        }
        if (typeof to !== 'number') {
          throw new Error('sessions.meeting.query.listLinkedProvider: to must be a number');
        }
        const rows = await storeQuery.call('run', [
          'meeting.listLinkedProvider',
          { providerId, from, to },
        ]);
        return rows;
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

      case 'sync': {
        const fromMs = Date.now();
        const toMs = fromMs + 90 * 24 * 60 * 60 * 1000;
        const from = new Date(fromMs).toISOString();
        const to = new Date(toMs).toISOString();

        // ADR-507 Am2 ordering constraint: freshen the schedule event cache BEFORE
        // reading listAggregatedEvents (which now reads from the event table, not live Google).
        // If syncEvents fails (offline / error) — fall through to read whatever is cached.
        // Non-fatal: eventual consistency is acceptable here.
        try {
          await calendarCommand.call('syncEvents', []);
        } catch (_syncErr) {
          // Offline or transient error — proceed with cached events.
        }

        // Use listAggregatedEvents (now reads event cache) — selected calendars across all accounts.
        // Events carry externalAccountId + providerCalendarId (from cache rows).
        let events;
        try {
          events = await calendarQuery.call('listAggregatedEvents', [from, to]);
        } catch (_err) {
          return { linked: 0, reconciled: 0, orphaned: 0 };
        }

        if (!Array.isArray(events) || events.length === 0) {
          return { linked: 0, reconciled: 0, orphaned: 0 };
        }

        // Composite key: "<externalAccountId>|<providerCalendarId>|<providerEventId>"
        // Used for pulled-ids set + orphan comparison.
        function compositeKey(extAcct, provCal, evId) {
          return `${extAcct ?? ''}|${provCal ?? ''}|${evId}`;
        }

        const pulledIds = new Set();
        // Track which (extAcct, provCal) pairs were actually pulled — calendars
        // that are de-selected or removed drop out of the aggregate; their linked
        // rows are NOT orphaned (absence ≠ orphaned for un-pulled calendars).
        const pulledCalendars = new Set(); // "<externalAccountId>|<providerCalendarId>"

        let linked = 0;
        let reconciled = 0;

        for (const event of events) {
          const extAcct  = event.externalAccountId ?? null;
          const provCal  = event.providerCalendarId ?? null;
          pulledIds.add(compositeKey(extAcct, provCal, event.id));
          pulledCalendars.add(`${extAcct ?? ''}|${provCal ?? ''}`);

          // Collect participants: attendees (!self) + organizer (deduped by email).
          const participantMap = new Map();

          if (Array.isArray(event.attendees)) {
            for (const a of event.attendees) {
              if (a.self) continue;
              const key = a.email || a.name || '';
              if (key && !participantMap.has(key)) {
                participantMap.set(key, { email: a.email, name: a.name });
              }
            }
          }

          if (event.organizer) {
            // Include organizer unless their email matches an attendee marked self.
            const selfEmail = Array.isArray(event.attendees)
              ? (event.attendees.find((a) => a.self)?.email ?? null)
              : null;
            const orgEmail = event.organizer.email;
            if (!orgEmail || orgEmail !== selfEmail) {
              const key = orgEmail || event.organizer.name || '';
              if (key && !participantMap.has(key)) {
                participantMap.set(key, { email: orgEmail, name: event.organizer.name });
              }
            }
          }

          const participants = Array.from(participantMap.values()).filter(
            (p) => p.email || p.name,
          );

          // Resolve each participant.
          const resolvedClientIds = new Set();

          for (const p of participants) {
            let resolution;
            try {
              resolution = await recordPatientQuery.call('resolveParticipant', [
                { email: p.email, name: p.name },
              ]);
            } catch (_err) {
              resolution = { outcome: 'none' };
            }
            if (resolution.outcome === 'match') {
              resolvedClientIds.add(resolution.clientId);
            }
          }

          if (resolvedClientIds.size === 1) {
            const [clientId] = resolvedClientIds;
            const r = await linkEvent(event, clientId);
            if (r.action === 'linked') {
              linked++;
            } else {
              reconciled++;
            }
          }
        }

        // Orphan pass — flag rows whose provider event is no longer in pull window.
        // Scoped to the SAME [from,to] window as the pull: a linked meeting in the
        // past or beyond the window was never pulled, so its absence ≠ orphaned.
        //
        // Additionally: skip rows whose (external_account_id, provider_calendar_id)
        // was not in the pulled set — those calendars are de-selected or removed and
        // simply weren't fetched this sync; their absence ≠ orphaned.
        const linkedRows = await storeQuery.call('run', [
          'meeting.listLinkedProvider',
          { providerId: 'google-calendar', from: fromMs, to: toMs },
        ]);
        let orphaned = 0;
        for (const row of linkedRows) {
          const rowCalKey = `${row.external_account_id ?? ''}|${row.provider_calendar_id ?? ''}`;
          // If this row's calendar wasn't in the aggregate pull, skip — not orphaned.
          if (!pulledCalendars.has(rowCalKey)) continue;

          const rowComposite = compositeKey(
            row.external_account_id,
            row.provider_calendar_id,
            row.provider_event_id,
          );
          if (!pulledIds.has(rowComposite)) {
            await storeWrite.call('update', [
              'client_meeting',
              row.id,
              { sync_state: 'orphaned', updated_at: Date.now() },
              {
                event:      'sessions.meeting.orphaned',
                recordType: 'client_meeting',
                recordId:   row.id,
              },
            ]);
            orphaned++;
          }
        }

        return { linked, reconciled, orphaned };
      }

      case 'linkProviderEvent': {
        const event    = args[0];
        const clientId = args[1];
        const opts     = args[2];

        if (!event || typeof event !== 'object') {
          throw new Error('sessions.meeting.linkProviderEvent: event must be an object');
        }
        const evId = event.providerEventId ?? event.id;
        if (typeof evId !== 'string' || evId.length === 0) {
          throw new Error('sessions.meeting.linkProviderEvent: event must have a non-empty providerEventId');
        }
        if (typeof clientId !== 'string' || clientId.length === 0) {
          throw new Error('sessions.meeting.linkProviderEvent: clientId must be a non-empty string');
        }
        if (opts !== undefined && (typeof opts !== 'object' || opts === null)) {
          throw new Error('sessions.meeting.linkProviderEvent: opts must be an object if provided');
        }

        // Validate client exists.
        const rec = await recordPatientQuery.call('get', [clientId]);
        if (!rec) {
          throw notFound('sessions.meeting.linkProviderEvent: client not found: ' + clientId);
        }

        const r = await linkEvent(event, clientId, { source: 'provider', via: 'triage' }, opts ?? {});
        return r;
      }

      default:
        throw new Error('sessions.meeting: unknown method ' + method);
    }
  });

  return {
    dispose() {
      storeQuery.dispose();
      storeWrite.dispose();
      calendarQuery.dispose();
      calendarCommand.dispose();
      recordPatientQuery.dispose();
    },
  };
}
