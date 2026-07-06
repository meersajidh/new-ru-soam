import { describe, expect, it } from 'vitest';
import {
  rotationDelayMs,
  ROTATION_LEAD_SEC,
  MIN_ROTATION_DELAY_MS,
} from './session-rotation.js';

// Tier-1 (B1) coverage of the proactive-rotation delay clamp (ADR-311).
// Security-adjacent: this decides how long before expiry a refresh token rotates.

describe('rotationDelayMs', () => {
  it('rotates ROTATION_LEAD_SEC before expiry for a normal 15-min token', () => {
    // 900 s token → (900 - 60) * 1000 = 840_000 ms.
    expect(rotationDelayMs(900)).toBe(840_000);
  });

  it('clamps to the floor when expiry is at the boundary', () => {
    // (90 - 60) * 1000 = 30_000 = MIN — the exact boundary.
    expect(rotationDelayMs(90)).toBe(MIN_ROTATION_DELAY_MS);
  });

  it('one second past the boundary exceeds the floor', () => {
    // (91 - 60) * 1000 = 31_000 > MIN.
    expect(rotationDelayMs(91)).toBe(31_000);
  });

  it('clamps short-lived tokens to the floor rather than rotating early/negative', () => {
    expect(rotationDelayMs(60)).toBe(MIN_ROTATION_DELAY_MS); // (60-60)*1000 = 0 → floor
    expect(rotationDelayMs(0)).toBe(MIN_ROTATION_DELAY_MS);
  });

  it('clamps a negative lifetime to the floor (never returns negative)', () => {
    expect(rotationDelayMs(-100)).toBe(MIN_ROTATION_DELAY_MS);
    expect(rotationDelayMs(-100)).toBeGreaterThan(0);
  });

  it('scales linearly for long-lived tokens', () => {
    expect(rotationDelayMs(3600)).toBe((3600 - ROTATION_LEAD_SEC) * 1000);
  });

  it('keeps the security-relevant constants at their expected values', () => {
    expect(ROTATION_LEAD_SEC).toBe(60);
    expect(MIN_ROTATION_DELAY_MS).toBe(30_000);
  });
});
