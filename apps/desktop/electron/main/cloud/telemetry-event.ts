/**
 * Pure telemetry-event constructor (O517 B2 — ADR-312 PHI-free invariant).
 *
 * Extracted from telemetry.ts `emit()` so the event SHAPE can be guarded in a
 * unit test without dragging in `electron` (app/net) or the local store. The
 * only fields that ever leave the process are event_type (enum), device_id
 * (install UUID) and app_version — NEVER PHI, email, sub, or name. A regression
 * that adds a PHI field here trips the colocated guard test in CI.
 */

import type { TelemetryEvent } from './identity-client.js';

/** Build a telemetry event from already-resolved, PHI-free values. */
export function buildTelemetryEvent(
  eventType: TelemetryEvent['event_type'],
  deviceId: string,
  appVersion: string,
): TelemetryEvent {
  return {
    event_type: eventType,
    device_id: deviceId,
    app_version: appVersion,
  };
}
