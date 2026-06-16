// ru-soam-schedule bundle entry point.
//
// P0: storeless UI over Google Calendar (ADR-507 §1).
//
// This bundle exposes `schedule.calendar@1.0` (query cap). The FP-Host
// side holds NO credentials and makes NO outbound calls — it delegates
// every provider operation to the Main-resident `calendar.provider@1.0`
// capability via ctx.bindCapability (O449 rung-0 host→Main consume channel,
// ADR-203 brokered networking, ADR-304/305 Flow-A credential).
//
// schedule.calendar methods (relayed to calendar.provider):
//   getStatus()                  → { connected: boolean; providerName: string }
//   connect()                    → { ok: boolean; error?: string }
//   disconnect()                 → void
//   listEvents(from: string, to: string) → CalendarEvent[]
//
// CalendarEvent shape (P0 minimal, storeless):
//   { id, title, start, end, allDay, calendarId, calendarName }

export function activate(ctx) {
  // Bind to the Main-resident calendar provider capability (O449 host.consume.invoke).
  // The credential stays in Main; this bundle is a transparent relay.
  const providerCap = ctx.bindCapability('calendar.provider', '1.0');

  ctx.registerCapability('schedule.calendar', '1.0', async (method, args) => {
    switch (method) {
      case 'getStatus': {
        return providerCap.call('getStatus', []);
      }

      case 'connect': {
        return providerCap.call('connect', []);
      }

      case 'disconnect': {
        return providerCap.call('disconnect', []);
      }

      case 'listEvents': {
        const from = args[0];
        const to = args[1];
        if (typeof from !== 'string' || typeof to !== 'string') {
          throw Object.assign(
            new Error('schedule.calendar.listEvents: from and to must be ISO date strings'),
            { code: 'cap.handler_threw' },
          );
        }
        return providerCap.call('listEvents', [from, to]);
      }

      default:
        throw Object.assign(
          new Error(`schedule.calendar: unknown method: ${method}`),
          { code: 'cap.method_not_found' },
        );
    }
  });
}
