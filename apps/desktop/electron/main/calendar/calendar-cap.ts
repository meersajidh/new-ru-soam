/**
 * calendar.provider@1.0 — Main-resident provider capability (ADR-203 brokered networking).
 *
 * Consumed by the ru-soam-schedule FP-Host bundle via ctx.consume() and relayed
 * to the schedule.calendar@1.0 cap the bundle exposes to the view.
 *
 * NOT registered in the renderer-visible capability surface — this is a
 * host-to-main consume path only. PHI note: calendar event titles may contain
 * PHI, so this cap is `phi: true` — first-party callers only (ADR-418) and
 * refused while the workspace is locked (ADR-307). The PHI-read opt-in + opaque
 * vs PHI write ramp (ADR-313) lands in a later slice.
 *
 * Methods:
 *   getStatus()                   → { connected: boolean; providerName: string }
 *   connect()                     → { ok: boolean; error?: string }
 *   disconnect()                  → void
 *   listEvents(from: string, to: string) → CalendarEvent[]
 */

import { registerCapability } from '../capability/registry.js';
import { googleCalendarAdapter } from './google-adapter.js';

export function registerCalendarProviderCapability(): void {
  registerCapability(
    'calendar.provider',
    '1.0',
    async (method, args) => {
      switch (method) {
        case 'getStatus': {
          return googleCalendarAdapter.getStatus();
        }

        case 'connect': {
          return googleCalendarAdapter.connect();
        }

        case 'disconnect': {
          await googleCalendarAdapter.disconnect();
          return null;
        }

        case 'listEvents': {
          const from = args[0];
          const to = args[1];
          if (typeof from !== 'string' || typeof to !== 'string') {
            throw new Error('calendar.provider.listEvents: from and to must be strings');
          }
          return googleCalendarAdapter.listEvents({ from, to });
        }

        default:
          throw Object.assign(new Error(`calendar.provider: unknown method: ${method}`), {
            code: 'cap.method_not_found',
          });
      }
    },
    { phi: true }, // event titles may contain PHI → first-party-only (ADR-418) + lock-gated (ADR-307)
  );
}
