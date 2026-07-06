import { describe, expect, it } from 'vitest';
import { buildTelemetryEvent } from './telemetry-event';

// Tier-1b (B2) invariant guard — ADR-312 PHI-free telemetry.
// The event a telemetry emit constructs must contain ONLY the three PHI-free
// fields. A regression that adds email / sub / name / patient data to the
// builder trips this test in CI.

describe('buildTelemetryEvent', () => {
  it('produces exactly the PHI-free key set — nothing more', () => {
    const ev = buildTelemetryEvent('login', 'device-uuid', '0.1.10');
    expect(Object.keys(ev).sort()).toEqual(['app_version', 'device_id', 'event_type']);
  });

  it('passes each resolved value through unchanged', () => {
    const ev = buildTelemetryEvent('account_deleted', 'dev-123', '9.9.9');
    expect(ev.event_type).toBe('account_deleted');
    expect(ev.device_id).toBe('dev-123');
    expect(ev.app_version).toBe('9.9.9');
  });

  it('carries no account / identity field regardless of event type', () => {
    for (const t of ['login', 'refresh', 'signout', 'account_deleted'] as const) {
      const ev = buildTelemetryEvent(t, 'd', 'v') as unknown as Record<string, unknown>;
      expect(ev['account_id']).toBeUndefined();
      expect(ev['email']).toBeUndefined();
      expect(ev['sub']).toBeUndefined();
    }
  });
});
