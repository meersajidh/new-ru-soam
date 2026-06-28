/**
 * Auto-lock orchestrator.
 *
 * Three triggers per ADR-307:
 *   1. Idle timer (renderer heartbeat tracks lastActivityAt; Main polls).
 *   2. powerMonitor 'suspend' event.
 *   3. powerMonitor 'lock-screen' event.
 *
 * Does NOT lock on 'unlock-screen' or 'resume'.
 * Does NOT lock on window blur (too aggressive per ADR-307).
 *
 * All subscriptions are composable into a single root Disposable.
 */

import { powerMonitor } from 'electron';
import type { LockService, Disposable } from './service.js';

/** Default idle timeout: 5 minutes. Overridable via security.idleLockMin pref (O502). */
export const IDLE_TIMEOUT_MS = 300_000;

/** Minimum interval between renderer heartbeat processing (1 call / 5 s). */
const HEARTBEAT_INTERVAL_MS = 5_000;

export interface AutoLockOptions {
  service: LockService;
  /**
   * Idle timeout in ms. undefined = use IDLE_TIMEOUT_MS default. null = disable idle auto-lock.
   * suspend/lock-screen triggers are unaffected.
   */
  idleTimeoutMs?: number | null;
}

export interface AutoLockHandle extends Disposable {
  /** Called by the IPC heartbeat handler when the renderer signals activity. */
  recordHeartbeat(): void;
  /** Immediately fires the idle handler (for developer.lock.simulateIdle). */
  simulateIdle(): void;
  /**
   * Update idle timeout live (O502 — settings cascade without restart).
   * null = disable idle auto-lock; suspend/lock-screen still trigger.
   */
  setIdleTimeout(ms: number | null): void;
}

/**
 * Parse raw pref string `security.idleLockMin` → idle timeout ms.
 *   undefined/null/missing → undefined (caller uses IDLE_TIMEOUT_MS default).
 *   "0"                   → null     (disabled).
 *   "5"                   → 300_000  (5 × 60_000).
 *   non-numeric           → undefined (default).
 */
export function parseIdleLockPref(raw: string | null | undefined): number | null | undefined {
  if (raw === null || raw === undefined || raw === '') return undefined;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return undefined;
  if (n === 0) return null; // sentinel: disabled
  return n * 60_000;
}

/**
 * Start all auto-lock subscriptions.
 * Returns a single Disposable that tears down everything.
 */
export function startAutoLock({ service, idleTimeoutMs }: AutoLockOptions): AutoLockHandle {
  let lastActivityAt = Date.now();
  let disposed = false;

  // Mutable so setIdleTimeout() can update it live without replacing the interval.
  // The closure captures this variable by reference — each tick reads the current value.
  let currentTimeoutMs: number | null =
    idleTimeoutMs === undefined ? IDLE_TIMEOUT_MS : idleTimeoutMs;

  // ── Idle timer ──────────────────────────────────────────────────────────────
  const idleCheck = setInterval(() => {
    if (currentTimeoutMs === null) return; // idle auto-lock disabled
    if (service.isLocked()) {
      lastActivityAt = Date.now(); // reset while locked so we don't immediately re-lock on unlock
      return;
    }
    if (Date.now() - lastActivityAt > currentTimeoutMs) {
      console.log('[auto-lock] idle timeout reached — relocking');
      service.relock();
    }
  }, HEARTBEAT_INTERVAL_MS);

  // ── powerMonitor: suspend ───────────────────────────────────────────────────
  const onSuspend = (): void => {
    console.log('[auto-lock] system suspend — relocking');
    service.relock();
  };
  powerMonitor.on('suspend', onSuspend);

  // ── powerMonitor: lock-screen ───────────────────────────────────────────────
  const onLockScreen = (): void => {
    console.log('[auto-lock] OS screen locked — relocking');
    service.relock();
  };
  powerMonitor.on('lock-screen', onLockScreen);

  return {
    recordHeartbeat() {
      lastActivityAt = Date.now();
    },
    simulateIdle() {
      console.log('[auto-lock] simulateIdle invoked');
      service.relock();
    },
    setIdleTimeout(ms) {
      currentTimeoutMs = ms;
      console.log('[auto-lock] idle timeout updated →', ms === null ? 'disabled' : `${ms}ms`);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clearInterval(idleCheck);
      powerMonitor.off('suspend', onSuspend);
      powerMonitor.off('lock-screen', onLockScreen);
    },
  };
}
