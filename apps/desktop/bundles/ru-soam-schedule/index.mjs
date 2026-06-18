// ru-soam-schedule bundle entry point.
//
// P1 (F1 residency refactor): domain adapter now lives here in the FP-Host bundle.
// Consumes two provider-agnostic Main base caps (ADR-506 Am1.1):
//   - credential.broker@1.0  (OAuth2 Flow-A lifecycle)
//   - net.brokeredFetch@1.0  (Main-brokered outbound calls, apiHosts-gated)
//
// Exposes two CQRS-split caps (mirrors practice module pattern):
//   - schedule.calendar.query@1.0  kind:query   → getStatus, listEvents
//   - schedule.calendar@1.0        kind:command  → connect, disconnect
//
// The view uses:
//   soamView.bindQuery('schedule.calendar.query', '1.0')   for getStatus / listEvents
//   soamView.bindCommand('schedule.calendar', '1.0')        for connect / disconnect

import { createGoogleCalendarAdapter } from './google-calendar-adapter.mjs';

export function activate(ctx) {
  // Bind Main base caps — no credentials or egress in the bundle.
  const broker   = ctx.bindCapability('credential.broker', '1.0');
  const netFetch = ctx.bindCapability('net.brokeredFetch', '1.0');

  // Instantiate the Google Calendar adapter with the bound caps.
  const adapter = createGoogleCalendarAdapter(broker, netFetch);

  // ── Query cap (read-only: getStatus, listEvents) ──────────────────────────
  ctx.registerCapability('schedule.calendar.query', '1.0', async (method, args) => {
    switch (method) {
      case 'getStatus': {
        return adapter.getStatus();
      }

      case 'listEvents': {
        const from = args[0];
        const to   = args[1];
        return adapter.listEvents(from, to);
      }

      default:
        throw Object.assign(
          new Error(`schedule.calendar.query: unknown method: ${method}`),
          { code: 'cap.method_not_found' },
        );
    }
  });

  // ── Command cap (mutating: connect, disconnect) ───────────────────────────
  ctx.registerCapability('schedule.calendar', '1.0', async (method, args) => {
    switch (method) {
      case 'connect': {
        return adapter.connect();
      }

      case 'disconnect': {
        return adapter.disconnect();
      }

      default:
        throw Object.assign(
          new Error(`schedule.calendar: unknown method: ${method}`),
          { code: 'cap.method_not_found' },
        );
    }
  });
}
