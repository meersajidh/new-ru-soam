// ru-soam-schedule bundle entry point.
//
// Slice 2 (O494): provider_account + calendar tables, account-aware port, registry,
// new CQRS methods. All P0 methods (getStatus, listEvents, connect, disconnect)
// kept unchanged for backward compat (Sessions + existing UI).
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
//       listAggregatedEvents (slice 2)
//   - schedule.calendar@1.0        kind:command
//       connect, disconnect (P0)
//       connectAccount, disconnectAccount, reconnectAccount,
//       addCalendar, updateCalendar, removeCalendar (slice 2)

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

// ── Error helpers ─────────────────────────────────────────────────────────────

function notFound(message) {
  return Object.assign(new Error(message), { code: 'cap.not_found' });
}

// ── Capability handler ─────────────────────────────────────────────────────────

export function activate(ctx) {
  // Bind Main base caps.
  const broker     = ctx.bindCapability('credential.broker', '1.0');
  const netFetch   = ctx.bindCapability('net.brokeredFetch', '1.0');
  const storeQuery = ctx.bindCapability('store.query', '1.0');
  const storeWrite = ctx.bindCapability('store.write', '1.0');

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
        // Fetch events across all SELECTED calendars, aggregated into one flat array.
        // Remaps provider-level calendarId → local cal_<uuid> handle + attaches color.
        const from = args[0];
        const to   = args[1];
        if (typeof from !== 'string' || typeof to !== 'string') {
          throw new Error('schedule.calendar.query.listAggregatedEvents: from and to must be ISO date strings');
        }

        // Load selected calendar rows.
        const calRows = await storeQuery.call('run', ['calendar.listSelected', {}]);
        if (calRows.length === 0) return [];

        // Group provider calendar ids by (account_id) for batching.
        // Map: localAccountId → { externalAccountId, providerType, cals: [{localId, providerCalendarId, color}] }
        const byAccount = new Map();
        for (const cal of calRows) {
          if (!byAccount.has(cal.account_id)) {
            // Lazy: fetch account row on first encounter.
            const acctRows = await storeQuery.call('run', ['account.getById', { id: cal.account_id }]);
            if (acctRows.length === 0) continue; // orphaned calendar row — skip
            const acct = acctRows[0];
            byAccount.set(cal.account_id, {
              externalAccountId: acct.external_account_id,
              providerType:      acct.provider_type,
              cals: [],
            });
          }
          byAccount.get(cal.account_id).cals.push({
            localId:            cal.id,
            providerCalendarId: cal.provider_calendar_id,
            color:              cal.color,
          });
        }

        // Build local-id and color lookup keyed by provider_calendar_id per account.
        // (Within an account, provider_calendar_ids are unique per UNIQUE constraint.)
        const allEvents = [];

        for (const [, { externalAccountId, providerType, cals }] of byAccount) {
          let a;
          try {
            a = getAdapter(providerType);
          } catch {
            continue; // unknown adapter — skip account
          }

          const providerCalendarIds = cals.map((c) => c.providerCalendarId);
          // Build provider-id → { localId, color } for remapping.
          const calMeta = new Map(
            cals.map((c) => [c.providerCalendarId, { localId: c.localId, color: c.color }]),
          );

          let events;
          try {
            events = await a.listEventsForCalendars(externalAccountId, providerCalendarIds, from, to);
          } catch {
            continue; // account fetch failed — skip, don't take down other accounts
          }

          for (const ev of events) {
            const meta = calMeta.get(ev.calendarId);
            if (meta) {
              // Stamp provider-level ids BEFORE remapping calendarId to the local handle.
              ev.providerCalendarId = ev.calendarId;
              ev.externalAccountId  = externalAccountId;
              // Remap provider-level calendarId → local cal_<uuid> handle; attach color.
              ev.calendarId    = meta.localId;
              ev.calendarColor = meta.color;
            } else {
              // Calendar not in selected set (shouldn't happen in normal flow, but be defensive).
              ev.providerCalendarId = ev.calendarId;
              ev.externalAccountId  = externalAccountId;
            }
            allEvents.push(ev);
          }
        }

        return allEvents;
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
        const calRows = await storeQuery.call('run', ['calendar.listForAccount', { accountId: localAccountId }]);
        const uncheckedAt = Date.now();
        for (const cal of calRows) {
          if (cal.selected) {
            await storeWrite.call('update', [
              'calendar',
              cal.id,
              { selected: 0, updated_at: uncheckedAt },
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

        // Cascade-delete all calendars of this account.
        const calRows = await storeQuery.call('run', ['calendar.listForAccount', { accountId: localAccountId }]);
        for (const cal of calRows) {
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
    },
  };
}
