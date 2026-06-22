// ru-soam-schedule bundle entry point.
//
// Slice 2 (O494): provider_account + calendar tables, account-aware port, registry,
// new CQRS methods. All P0 methods (getStatus, listEvents, connect, disconnect)
// kept unchanged for backward compat (Sessions + existing UI).
//
// Slice 6 (O495, ADR-507 Am2): persistent event cache + incremental sync.
//   - syncEvents command: upserts/deletes/prunes per calendar; writes nextSyncToken.
//   - listWindowEvents + listAggregatedEvents FLIPPED to read from `event` table.
//
// Consumes Main base caps:
//   - credential.broker@1.0   (OAuth2 Flow-A lifecycle)
//   - net.brokeredFetch@1.0   (authenticated outbound, apiHosts-gated)
//   - store.query@1.0         (SQL reads — new in slice 2)
//   - store.write@1.0         (SQL writes — new in slice 2)
//
// Exposes two CQRS-split caps:
//   - schedule.calendar.query@1.0  kind:query
//       getStatus, listEvents (P0)
//       listAccounts, listAddedCalendars, listProviderCalendars, getAccountStatus,
//       listAggregatedEvents (slice 2 — flipped to cache in slice 6)
//       listWindowEvents (window-cache fetch — ALL added calendars, flipped to cache in slice 6)
//   - schedule.calendar@1.0        kind:command
//       connect, disconnect (P0)
//       connectAccount, disconnectAccount, reconnectAccount,
//       addCalendar, updateCalendar, removeCalendar (slice 2)
//       syncEvents (slice 6)

import { createGoogleCalendarAdapter } from './google-calendar-adapter.mjs';

// ── Row → camelCase mappers ────────────────────────────────────────────────────

function mapAccount(row) {
  return {
    id:                row.id,
    providerType:      row.provider_type,
    externalAccountId: row.external_account_id,
    email:             row.email,
    displayName:       row.display_name,
    connectionState:   row.connection_state,
    createdAt:         row.created_at,
    updatedAt:         row.updated_at,
  };
}

function mapCalendar(row) {
  return {
    id:                 row.id,
    accountId:          row.account_id,
    providerCalendarId: row.provider_calendar_id,
    displayName:        row.display_name,
    color:              row.color,
    isPrimary:          !!row.is_primary,
    readOnly:           !!row.read_only,
    selected:           !!row.selected,
    addedAt:            row.added_at,
    createdAt:          row.created_at,
    updatedAt:          row.updated_at,
  };
}

/**
 * Map an `event` DB row to the CalendarEvent shape expected by callers
 * (schedule.html, Sessions sync, classify pass). Identical shape to the
 * live-adapter output so all downstream code is unchanged.
 */
function mapEventRow(row) {
  const ev = {
    id:                 row.provider_event_id,
    title:              row.title,
    start:              row.start,
    end:                row.end,
    allDay:             !!row.all_day,
    calendarId:         row.calendar_id,         // local cal_<uuid> handle
    calendarName:       row.calendar_display_name || row.calendar_id,
    calendarColor:      row.calendar_color || null,
    // Fields used by Sessions / classify pass (O493 triple).
    providerCalendarId: row.provider_calendar_id,
    externalAccountId:  row.external_account_id,
  };
  if (row.location)    ev.location    = row.location;
  if (row.meeting_link) ev.meetingLink = row.meeting_link;

  // Reconstruct organizer object.
  if (row.organizer_email || row.organizer_name) {
    ev.organizer = {};
    if (row.organizer_name  != null) ev.organizer.name  = row.organizer_name;
    if (row.organizer_email != null) ev.organizer.email = row.organizer_email;
    if (row.organizer_self  != null) ev.organizer.self  = !!row.organizer_self;
  }

  // Reconstruct attendees from JSON.
  if (row.attendees) {
    try {
      const parsed = JSON.parse(row.attendees);
      if (Array.isArray(parsed) && parsed.length > 0) ev.attendees = parsed;
    } catch (_) { /* skip malformed */ }
  }

  return ev;
}

// ── Error helpers ─────────────────────────────────────────────────────────────

function notFound(message) {
  return Object.assign(new Error(message), { code: 'cap.not_found' });
}

// ── Capability handler ─────────────────────────────────────────────────────────

// Pref keys for refresh settings.
const REFRESH_MODE_KEY     = 'schedule.refreshMode';
const REFRESH_INTERVAL_KEY = 'schedule.refreshIntervalMin';

export function activate(ctx) {
  // Bind Main base caps.
  const broker     = ctx.bindCapability('credential.broker', '1.0');
  const netFetch   = ctx.bindCapability('net.brokeredFetch', '1.0');
  const storeQuery = ctx.bindCapability('store.query', '1.0');
  const storeWrite = ctx.bindCapability('store.write', '1.0');
  const prefs      = ctx.bindCapability('prefs', '1.0');

  // Instantiate Google adapter bound to broker + netFetch.
  const adapter = createGoogleCalendarAdapter(broker, netFetch);

  // ── Provider registry (v1: Google only) ───────────────────────────────────

  const registry = new Map([[adapter.providerType, adapter]]);

  function getAdapter(providerType) {
    const a = registry.get(providerType);
    if (!a) {
      throw Object.assign(
        new Error(`schedule: no adapter registered for providerType: ${providerType}`),
        { code: 'cap.not_found' },
      );
    }
    return a;
  }

  // ── Store helpers ─────────────────────────────────────────────────────────

  async function getAccountOrThrow(localId) {
    const rows = await storeQuery.call('run', ['account.getById', { id: localId }]);
    if (rows.length === 0) {
      throw notFound(`schedule: provider_account not found: ${localId}`);
    }
    return rows[0];
  }

  // ── Arg coercion helpers ──────────────────────────────────────────────────

  /**
   * Accepts a range bound as either an ISO date string or an epoch-ms number.
   * Coerces epoch-ms to ISO; passes strings through unchanged.
   * Throws a clear error on any other type.
   */
  function toISOArg(val, callerName) {
    if (typeof val === 'string' && val.length > 0) return val;
    if (typeof val === 'number' && isFinite(val)) return new Date(val).toISOString();
    throw new Error(`${callerName}: from/to must be an ISO date string or epoch-ms number; got ${typeof val}`);
  }

  // ── schedule.calendar.query (read cap) ─────────────────────────────────────

  ctx.registerCapability('schedule.calendar.query', '1.0', async (method, args) => {
    switch (method) {

      // ── P0 methods (unchanged) ────────────────────────────────────────────

      case 'getStatus': {
        return adapter.getStatus();
      }

      case 'listEvents': {
        const from = args[0];
        const to   = args[1];
        return adapter.listEvents(from, to);
      }

      // ── Slice 2 query methods ─────────────────────────────────────────────

      case 'listAccounts': {
        const rows = await storeQuery.call('run', ['account.list', {}]);
        return rows.map(mapAccount);
      }

      case 'listAddedCalendars': {
        const rows = await storeQuery.call('run', ['calendar.list', {}]);
        return rows.map(mapCalendar);
      }

      case 'listProviderCalendars': {
        const localAccountId = args[0];
        if (typeof localAccountId !== 'string' || localAccountId.length === 0) {
          throw new Error('schedule.calendar.query.listProviderCalendars: localAccountId must be a non-empty string');
        }
        const row = await getAccountOrThrow(localAccountId);
        const a = getAdapter(row.provider_type);
        return a.listCalendars(row.external_account_id);
      }

      case 'getAccountStatus': {
        const localAccountId = args[0];
        if (typeof localAccountId !== 'string' || localAccountId.length === 0) {
          throw new Error('schedule.calendar.query.getAccountStatus: localAccountId must be a non-empty string');
        }
        const row = await getAccountOrThrow(localAccountId);
        const a = getAdapter(row.provider_type);
        const result = await a.getAccountStatus(row.external_account_id);
        return { connected: !!(result && result.connected) };
      }

      case 'listAggregatedEvents': {
        // Slice 6: READ FROM CACHE — `event` table joined to `calendar`.
        // Returns only SELECTED calendars' events (Sessions sync source — same
        // semantics as the pre-slice-6 live-fetch version: selected-only).
        // Return shape UNCHANGED so Sessions sync is untouched.
        const from = toISOArg(args[0], 'schedule.calendar.query.listAggregatedEvents');
        const to   = toISOArg(args[1], 'schedule.calendar.query.listAggregatedEvents');
        const rows = await storeQuery.call('run', ['event.listForWindowFiltered', { from, to }]);
        return rows.map(mapEventRow);
      }

      case 'listWindowEvents': {
        // Slice 6: READ FROM CACHE — `event` table joined to `calendar`.
        // Returns ALL added calendars (not just selected): visibility is
        // filtered client-side in schedule.html via _calVisibility so toggling
        // calendar.selected never triggers a re-fetch (preserves window-cache strategy).
        const from = toISOArg(args[0], 'schedule.calendar.query.listWindowEvents');
        const to   = toISOArg(args[1], 'schedule.calendar.query.listWindowEvents');
        const rows = await storeQuery.call('run', ['event.listForWindow', { from, to }]);
        return rows.map(mapEventRow);
      }

      case 'getRefreshSettings': {
        // Return persisted refresh settings (mode, intervalMin) with safe defaults.
        const modeResult     = await prefs.call('get', [REFRESH_MODE_KEY]);
        const intervalResult = await prefs.call('get', [REFRESH_INTERVAL_KEY]);
        const modeRaw = modeResult && modeResult.value;
        const mode = (modeRaw === 'auto' || modeRaw === 'manual') ? modeRaw : 'manual';
        const intervalRaw = parseInt(intervalResult && intervalResult.value, 10);
        const intervalMin = (Number.isInteger(intervalRaw) && intervalRaw >= 1) ? intervalRaw : 15;
        return { mode, intervalMin };
      }

      default:
        throw Object.assign(
          new Error(`schedule.calendar.query: unknown method: ${method}`),
          { code: 'cap.method_not_found' },
        );
    }
  });

  // ── schedule.calendar (command cap) ────────────────────────────────────────

  ctx.registerCapability('schedule.calendar', '1.0', async (method, args) => {
    switch (method) {

      // ── P0 methods (unchanged) ────────────────────────────────────────────

      case 'connect': {
        return adapter.connect();
      }

      case 'disconnect': {
        return adapter.disconnect();
      }

      // ── Slice 2 command methods ───────────────────────────────────────────

      case 'connectAccount': {
        // args[0] = providerType (default 'google')
        const pt = (typeof args[0] === 'string' && args[0].length > 0) ? args[0] : 'google';
        const a = getAdapter(pt);

        const grantResult = await a.authenticate();
        if (!grantResult || !grantResult.ok) {
          return { ok: false, error: (grantResult && grantResult.error) || 'OAuth grant failed' };
        }

        const { externalId, email, displayName } = grantResult.account;
        const now = Date.now();

        // UPSERT: query first to avoid UNIQUE constraint throw on reconnect.
        const existRows = await storeQuery.call('run', [
          'account.getByExternal',
          { providerType: pt, externalId },
        ]);

        let row;
        if (existRows.length > 0) {
          // Reconnect path — update connection_state + metadata.
          const existId = existRows[0].id;
          await storeWrite.call('update', [
            'provider_account',
            existId,
            {
              connection_state: 'connected',
              email:            email ?? existRows[0].email,
              display_name:     displayName ?? existRows[0].display_name,
              updated_at:       now,
            },
            {
              event:      'schedule.account.reconnected',
              recordType: 'provider_account',
              recordId:   existId,
              detail:     { providerType: pt },
            },
          ]);
          // Read-back.
          const updated = await storeQuery.call('run', ['account.getById', { id: existId }]);
          row = updated[0];
        } else {
          // New account.
          const id = `acct_${globalThis.crypto.randomUUID()}`;
          const newRow = {
            id,
            provider_type:        pt,
            external_account_id:  externalId,
            email:                email ?? null,
            display_name:         displayName ?? null,
            connection_state:     'connected',
            created_at:           now,
            updated_at:           now,
          };
          await storeWrite.call('insert', [
            'provider_account',
            newRow,
            {
              event:      'schedule.account.connected',
              recordType: 'provider_account',
              recordId:   id,
              detail:     { providerType: pt },
            },
          ]);
          row = newRow;
        }

        return { ok: true, account: mapAccount(row) };
      }

      case 'disconnectAccount': {
        const localAccountId = args[0];
        if (typeof localAccountId !== 'string' || localAccountId.length === 0) {
          throw new Error('schedule.calendar.disconnectAccount: localAccountId must be a non-empty string');
        }
        const row = await getAccountOrThrow(localAccountId);
        const a = getAdapter(row.provider_type);

        await a.disconnectAccount(row.external_account_id);

        const now = Date.now();
        await storeWrite.call('update', [
          'provider_account',
          localAccountId,
          { connection_state: 'disconnected', updated_at: now },
          {
            event:      'schedule.account.disconnected',
            recordType: 'provider_account',
            recordId:   localAccountId,
            detail:     { providerType: row.provider_type },
          },
        ]);

        // Uncheck all selected calendars of this account so they drop from the aggregate grid.
        // Also cascade-delete event rows for this account's calendars (PHI cleanup — ADR-507 Am2 §A2.5).
        const calRowsForDisconnect = await storeQuery.call('run', ['calendar.listForAccount', { accountId: localAccountId }]);
        const uncheckedAt = Date.now();
        for (const cal of calRowsForDisconnect) {
          // Cascade-delete event rows for this calendar.
          await storeWrite.call('deleteWhere', [
            'event',
            { calendar_id: cal.id },
            {
              event:      'schedule.event.purged',
              recordType: 'event',
              recordId:   cal.id,
              detail:     { reason: 'account_disconnected' },
            },
          ]);
          if (cal.selected) {
            await storeWrite.call('update', [
              'calendar',
              cal.id,
              { selected: 0, sync_token: null, last_synced_at: null, sync_status: null, updated_at: uncheckedAt },
              {
                event:      'schedule.calendar.updated',
                recordType: 'calendar',
                recordId:   cal.id,
              },
            ]);
          } else {
            // Still clear sync token so next reconnect does a full resync.
            await storeWrite.call('update', [
              'calendar',
              cal.id,
              { sync_token: null, last_synced_at: null, sync_status: null, updated_at: uncheckedAt },
              {
                event:      'schedule.calendar.updated',
                recordType: 'calendar',
                recordId:   cal.id,
              },
            ]);
          }
        }

        return { ok: true };
      }

      case 'reconnectAccount': {
        const localAccountId = args[0];
        if (typeof localAccountId !== 'string' || localAccountId.length === 0) {
          throw new Error('schedule.calendar.reconnectAccount: localAccountId must be a non-empty string');
        }
        const row = await getAccountOrThrow(localAccountId);
        const a = getAdapter(row.provider_type);

        const grantResult = await a.authenticate();
        if (!grantResult || !grantResult.ok) {
          return { ok: false, error: (grantResult && grantResult.error) || 'OAuth grant failed' };
        }

        // TODO: if grantResult.account.externalId differs from row.external_account_id,
        // we just update connection_state on the existing row. Full identity-mismatch
        // reconciliation (merge / reject) is deferred — O492.

        const now = Date.now();
        await storeWrite.call('update', [
          'provider_account',
          localAccountId,
          { connection_state: 'connected', updated_at: now },
          {
            event:      'schedule.account.reconnected',
            recordType: 'provider_account',
            recordId:   localAccountId,
            detail:     { providerType: row.provider_type },
          },
        ]);

        return { ok: true };
      }

      case 'addCalendar': {
        const input = args[0];
        if (!input || typeof input !== 'object') {
          throw new Error('schedule.calendar.addCalendar: input must be an object');
        }
        const { accountId, providerCalendarId, name, color, isPrimary, readOnly } = input;
        if (typeof accountId !== 'string' || accountId.length === 0) {
          throw new Error('schedule.calendar.addCalendar: accountId must be a non-empty string');
        }
        if (typeof providerCalendarId !== 'string' || providerCalendarId.length === 0) {
          throw new Error('schedule.calendar.addCalendar: providerCalendarId must be a non-empty string');
        }
        if (typeof name !== 'string' || name.length === 0) {
          throw new Error('schedule.calendar.addCalendar: name must be a non-empty string');
        }
        if (typeof color !== 'string' || color.length === 0) {
          throw new Error('schedule.calendar.addCalendar: color must be a non-empty string');
        }

        // Validate account exists.
        await getAccountOrThrow(accountId);

        const id = `cal_${globalThis.crypto.randomUUID()}`;
        const now = Date.now();
        const newRow = {
          id,
          account_id:          accountId,
          provider_calendar_id: providerCalendarId,
          display_name:        name,
          color,
          is_primary:          isPrimary ? 1 : 0,
          read_only:           readOnly  ? 1 : 0,
          selected:            1,
          added_at:            now,
          created_at:          now,
          updated_at:          now,
        };

        await storeWrite.call('insert', [
          'calendar',
          newRow,
          {
            event:      'schedule.calendar.added',
            recordType: 'calendar',
            recordId:   id,
            detail:     {},
          },
        ]);

        return mapCalendar(newRow);
      }

      case 'updateCalendar': {
        const id    = args[0];
        const patch = args[1];
        if (typeof id !== 'string' || id.length === 0) {
          throw new Error('schedule.calendar.updateCalendar: id must be a non-empty string');
        }
        if (!patch || typeof patch !== 'object') {
          throw new Error('schedule.calendar.updateCalendar: patch must be an object');
        }

        // Existence check.
        const existRows = await storeQuery.call('run', ['calendar.getById', { id }]);
        if (existRows.length === 0) {
          throw notFound(`schedule.calendar.updateCalendar: calendar not found: ${id}`);
        }

        const patchCols = { updated_at: Date.now() };
        if (patch.name !== undefined) {
          if (typeof patch.name !== 'string' || patch.name.length === 0) {
            throw new Error('schedule.calendar.updateCalendar: name must be a non-empty string');
          }
          patchCols.display_name = patch.name;
        }
        if (patch.color !== undefined) {
          if (typeof patch.color !== 'string' || patch.color.length === 0) {
            throw new Error('schedule.calendar.updateCalendar: color must be a non-empty string');
          }
          patchCols.color = patch.color;
        }
        if (patch.selected !== undefined) {
          patchCols.selected = patch.selected ? 1 : 0;
        }

        await storeWrite.call('update', [
          'calendar',
          id,
          patchCols,
          {
            event:      'schedule.calendar.updated',
            recordType: 'calendar',
            recordId:   id,
            detail:     {},
          },
        ]);

        // Read-back.
        const updRows = await storeQuery.call('run', ['calendar.getById', { id }]);
        if (updRows.length === 0) {
          throw new Error(`schedule.calendar.updateCalendar: record disappeared after write: ${id}`);
        }
        return mapCalendar(updRows[0]);
      }

      case 'deleteAccount': {
        const localAccountId = args[0];
        if (typeof localAccountId !== 'string' || localAccountId.length === 0) {
          throw new Error('schedule.calendar.deleteAccount: localAccountId must be a non-empty string');
        }
        const row = await getAccountOrThrow(localAccountId);
        const a = getAdapter(row.provider_type);

        // Revoke credential (broker revoke; tolerate error — still delete local records).
        try {
          await a.disconnectAccount(row.external_account_id);
        } catch (_err) {
          // Best-effort revoke — proceed with local delete regardless.
        }

        // Cascade-delete all calendars and their event rows (PHI cleanup — ADR-507 Am2 §A2.5).
        const calRows = await storeQuery.call('run', ['calendar.listForAccount', { accountId: localAccountId }]);
        for (const cal of calRows) {
          // Delete event rows first.
          await storeWrite.call('deleteWhere', [
            'event',
            { calendar_id: cal.id },
            {
              event:      'schedule.event.purged',
              recordType: 'event',
              recordId:   cal.id,
              detail:     { reason: 'account_deleted' },
            },
          ]);
          await storeWrite.call('delete', [
            'calendar',
            cal.id,
            {
              event:      'schedule.calendar.removed',
              recordType: 'calendar',
              recordId:   cal.id,
            },
          ]);
        }

        // Delete the account row. Audit detail PII-free (no email).
        await storeWrite.call('delete', [
          'provider_account',
          localAccountId,
          {
            event:      'schedule.account.deleted',
            recordType: 'provider_account',
            recordId:   localAccountId,
            detail:     { providerType: row.provider_type },
          },
        ]);

        return { deleted: localAccountId };
      }

      case 'removeCalendar': {
        const id = args[0];
        if (typeof id !== 'string' || id.length === 0) {
          throw new Error('schedule.calendar.removeCalendar: id must be a non-empty string');
        }

        // Existence check.
        const existRows = await storeQuery.call('run', ['calendar.getById', { id }]);
        if (existRows.length === 0) {
          throw notFound(`schedule.calendar.removeCalendar: calendar not found: ${id}`);
        }

        // Cascade-delete event rows for this calendar (PHI cleanup — ADR-507 Am2 §A2.5).
        await storeWrite.call('deleteWhere', [
          'event',
          { calendar_id: id },
          {
            event:      'schedule.event.purged',
            recordType: 'event',
            recordId:   id,
            detail:     { reason: 'calendar_removed' },
          },
        ]);

        await storeWrite.call('delete', [
          'calendar',
          id,
          {
            event:      'schedule.calendar.removed',
            recordType: 'calendar',
            recordId:   id,
          },
        ]);

        return { deleted: id };
      }

      case 'syncEvents': {
        // Slice 6 (ADR-507 Am2): sync the event cache for ALL added calendars.
        // For each calendar: read sync_token, call adapter.syncEvents, upsert/delete
        // event rows, prune old rows, write back nextSyncToken + last_synced_at.
        // Returns: { calendarCount, upserts, deletions, pruned, errors }
        // PHI-free audit (no titles, no emails).

        const calRows = await storeQuery.call('run', ['calendar.list', {}]);
        if (calRows.length === 0) return { calendarCount: 0, upserts: 0, deletions: 0, pruned: 0, errors: 0, disconnectedAccounts: [] };

        let totalUpserts   = 0;
        let totalDeletions = 0;
        let totalPruned    = 0;
        let totalErrors    = 0;
        const disconnectedAccounts = [];
        const now = Date.now();

        for (const cal of calRows) {
          // Fetch account row for this calendar.
          const acctRows = await storeQuery.call('run', ['account.getById', { id: cal.account_id }]);
          if (acctRows.length === 0) continue; // orphaned calendar — skip

          const acct = acctRows[0];
          /** @type {ReturnType<typeof getAdapter>} */
          let a;
          try {
            a = getAdapter(acct.provider_type);
          } catch {
            continue; // unknown adapter — skip
          }

          const syncWindowMin = cal.sync_window_min || 90 * 24 * 60 * 60 * 1000;

          // Mark as syncing.
          await storeWrite.call('update', [
            'calendar',
            cal.id,
            { sync_status: 'syncing', updated_at: now },
            {
              event:      'schedule.calendar.sync.started',
              recordType: 'calendar',
              recordId:   cal.id,
              detail:     { providerType: acct.provider_type },
            },
          ]);

          let upserts;
          let deletions;
          let nextSyncToken;
          let needsFullResync = false;

          try {
            const result = await a.syncEvents(
              acct.external_account_id,
              cal.provider_calendar_id,
              {
                syncToken: cal.sync_token || undefined,
                timeMin:   !cal.sync_token
                  ? new Date(now - syncWindowMin).toISOString()
                  : undefined,
              },
            );
            upserts       = result.upserts;
            deletions     = result.deletions;
            nextSyncToken = result.nextSyncToken;
          } catch (err) {
            if (err && err.code === 'sync.token_expired') {
              // 410 Gone — wipe token, flag for full resync in this same iteration.
              needsFullResync = true;
              await storeWrite.call('update', [
                'calendar',
                cal.id,
                { sync_token: null, sync_status: 'resync_needed', updated_at: now },
                {
                  event:      'schedule.calendar.sync.token_expired',
                  recordType: 'calendar',
                  recordId:   cal.id,
                  detail:     { providerType: acct.provider_type },
                },
              ]);

              // Attempt full resync immediately.
              try {
                const result2 = await a.syncEvents(
                  acct.external_account_id,
                  cal.provider_calendar_id,
                  { timeMin: new Date(now - syncWindowMin).toISOString() },
                );
                upserts       = result2.upserts;
                deletions     = result2.deletions;
                nextSyncToken = result2.nextSyncToken;
                needsFullResync = false;
              } catch (err2) {
                // Full resync also failed — mark error and move to next calendar.
                await storeWrite.call('update', [
                  'calendar',
                  cal.id,
                  { sync_status: 'error', updated_at: now },
                  {
                    event:      'schedule.calendar.sync.error',
                    recordType: 'calendar',
                    recordId:   cal.id,
                    detail:     { providerType: acct.provider_type },
                  },
                ]);
                totalErrors++;
                continue;
              }
            } else if (err && err.code === 'auth.invalid') {
              // Auth failure (401/403) — token revoked or access denied.
              // Disconnect the account and clear all its calendars' sync tokens,
              // matching exactly what the 'disconnectAccount' command does (minus
              // revoking the provider token, which is already invalid).
              const authNow = Date.now();
              await storeWrite.call('update', [
                'provider_account',
                acct.id,
                { connection_state: 'disconnected', updated_at: authNow },
                {
                  event:      'schedule.account.disconnected',
                  recordType: 'provider_account',
                  recordId:   acct.id,
                  detail:     { providerType: acct.provider_type, reason: 'auth_failure' },
                },
              ]);
              // Clear sync tokens + uncheck calendars for this account (mirrors disconnectAccount).
              const authCalRows = await storeQuery.call('run', ['calendar.listForAccount', { accountId: acct.id }]);
              for (const authCal of authCalRows) {
                if (authCal.selected) {
                  await storeWrite.call('update', [
                    'calendar',
                    authCal.id,
                    { selected: 0, sync_token: null, last_synced_at: null, sync_status: null, updated_at: authNow },
                    {
                      event:      'schedule.calendar.updated',
                      recordType: 'calendar',
                      recordId:   authCal.id,
                    },
                  ]);
                } else {
                  await storeWrite.call('update', [
                    'calendar',
                    authCal.id,
                    { sync_token: null, last_synced_at: null, sync_status: null, updated_at: authNow },
                    {
                      event:      'schedule.calendar.updated',
                      recordType: 'calendar',
                      recordId:   authCal.id,
                    },
                  ]);
                }
              }
              if (!disconnectedAccounts.includes(acct.id)) {
                disconnectedAccounts.push(acct.id);
              }
              totalErrors++;
              continue;
            } else {
              // Other error (network, 4xx, etc.) — mark error and move to next calendar.
              await storeWrite.call('update', [
                'calendar',
                cal.id,
                { sync_status: 'error', updated_at: now },
                {
                  event:      'schedule.calendar.sync.error',
                  recordType: 'calendar',
                  recordId:   cal.id,
                  detail:     { providerType: acct.provider_type },
                },
              ]);
              totalErrors++;
              continue;
            }
          }

          if (needsFullResync) continue; // Shouldn't reach here; guard.

          // ── Upsert events ──────────────────────────────────────────────────
          const syncedAt = now;
          for (const ev of upserts) {
            // Organizer fields.
            const orgEmail = (ev.organizer && ev.organizer.email) || null;
            const orgName  = (ev.organizer && ev.organizer.name)  || null;
            const orgSelf  = (ev.organizer && ev.organizer.self != null) ? (ev.organizer.self ? 1 : 0) : null;

            // Attendees → JSON string (PHI; stored in protected DB).
            const attendeesJson = (Array.isArray(ev.attendees) && ev.attendees.length > 0)
              ? JSON.stringify(ev.attendees)
              : null;

            const row = {
              id:                   `evt_${globalThis.crypto.randomUUID()}`,
              account_id:           cal.account_id,
              calendar_id:          cal.id,
              external_account_id:  acct.external_account_id,
              provider_calendar_id: cal.provider_calendar_id,
              provider_event_id:    ev.id,
              title:                ev.title || '(No title)',
              start:                ev.start,
              end:                  ev.end || null,
              all_day:              ev.allDay ? 1 : 0,
              location:             ev.location || null,
              meeting_link:         ev.meetingLink || null,
              organizer_email:      orgEmail,
              organizer_name:       orgName,
              organizer_self:       orgSelf,
              attendees:            attendeesJson,
              status:               null,
              updated_at:           ev.updatedAt || null,
              synced_at:            syncedAt,
            };

            // Query-first upsert: deterministic, no UNIQUE-string matching.
            const triple = {
              externalAccountId:  acct.external_account_id,
              providerCalendarId: cal.provider_calendar_id,
              providerEventId:    ev.id,
            };
            const existing = await storeQuery.call('run', ['event.getByProviderTriple', triple]);
            if (existing.length > 0) {
              // Row exists — update mutable fields by provider triple.
              await storeWrite.call('updateWhere', [
                'event',
                {
                  external_account_id:  acct.external_account_id,
                  provider_calendar_id: cal.provider_calendar_id,
                  provider_event_id:    ev.id,
                },
                {
                  title:           row.title,
                  start:           row.start,
                  end:             row.end,
                  all_day:         row.all_day,
                  location:        row.location,
                  meeting_link:    row.meeting_link,
                  organizer_email: row.organizer_email,
                  organizer_name:  row.organizer_name,
                  organizer_self:  row.organizer_self,
                  attendees:       row.attendees,
                  updated_at:      row.updated_at,
                  synced_at:       row.synced_at,
                },
                {
                  event:      'schedule.event.reconciled',
                  recordType: 'event',
                  recordId:   ev.id,
                  detail:     { providerType: acct.provider_type },
                },
              ]);
            } else {
              // New row — insert.
              await storeWrite.call('insert', [
                'event',
                row,
                {
                  event:      'schedule.event.synced',
                  recordType: 'event',
                  recordId:   row.id,
                  detail:     { providerType: acct.provider_type },
                },
              ]);
            }
            totalUpserts++;
          }

          // ── Delete cancelled events ────────────────────────────────────────
          for (const providerEventId of deletions) {
            await storeWrite.call('deleteWhere', [
              'event',
              {
                external_account_id:  acct.external_account_id,
                provider_calendar_id: cal.provider_calendar_id,
                provider_event_id:    providerEventId,
              },
              {
                event:      'schedule.event.deleted',
                recordType: 'event',
                recordId:   providerEventId,
                detail:     { providerType: acct.provider_type },
              },
            ]);
            totalDeletions++;
          }

          // ── Prune stale events older than sync_window_min ─────────────────
          // event.listStaleIds uses a < comparison (in SQL) — queryTemplate handles
          // range; deleteWhere equality-on-PK handles per-row deletion.
          let calPruned = 0;
          const cutoff = new Date(now - syncWindowMin).toISOString();
          const staleRows = await storeQuery.call('run', [
            'event.listStaleIds',
            { calendarId: cal.id, cutoff },
          ]);
          for (const staleRow of staleRows) {
            await storeWrite.call('deleteWhere', [
              'event',
              { id: staleRow.id },
              {
                event:      'schedule.event.pruned',
                recordType: 'event',
                recordId:   staleRow.id,
                detail:     { providerType: acct.provider_type },
              },
            ]);
            calPruned++;
          }
          totalPruned += calPruned;

          // ── Write back nextSyncToken + last_synced_at ─────────────────────
          await storeWrite.call('update', [
            'calendar',
            cal.id,
            {
              sync_token:     nextSyncToken || null,
              last_synced_at: now,
              sync_status:    'synced',
              updated_at:     now,
            },
            {
              event:      'schedule.calendar.sync.completed',
              recordType: 'calendar',
              recordId:   cal.id,
              detail:     { providerType: acct.provider_type },
            },
          ]);
        }

        // PHI-free audit summary return.
        return {
          calendarCount:        calRows.length,
          upserts:              totalUpserts,
          deletions:            totalDeletions,
          pruned:               totalPruned,
          errors:               totalErrors,
          disconnectedAccounts: disconnectedAccounts,
        };
      }

      default:
        throw Object.assign(
          new Error(`schedule.calendar: unknown method: ${method}`),
          { code: 'cap.method_not_found' },
        );
    }
  });

  return {
    dispose() {
      broker.dispose();
      netFetch.dispose();
      storeQuery.dispose();
      storeWrite.dispose();
      prefs.dispose();
    },
  };
}
