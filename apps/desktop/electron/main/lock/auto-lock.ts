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

/** Idle timeout: hardcoded 5 minutes this phase. Phase 10 wires settings cascade per O307b. */
export const IDLE_TIMEOUT_MS = 300_000;

/** Minimum interval between renderer heartbeat processing (1 call / 5 s). */
const HEARTBEAT_INTERVAL_MS = 5_000;

export interface AutoLockOptions {
  service: LockService;
  idleTimeoutMs?: number;
}

export interface AutoLockHandle extends Disposable {
  /** Called by the IPC heartbeat handler when the renderer signals activity. */
  recordHeartbeat(): void;
  /** Immediately fires the idle handler (for developer.lock.simulateIdle). */
  simulateIdle(): void;
}

/**
 * Start all auto-lock subscriptions.
 * Returns a single Disposable that tears down everything.
 */
export function startAutoLock({ service, idleTimeoutMs = IDLE_TIMEOUT_MS }: AutoLockOptions): AutoLockHandle {
  let lastActivityAt = Date.now();
  let disposed = false;

  // ── Idle timer ──────────────────────────────────────────────────────────────
  const idleCheck = setInterval(() => {
    if (service.isLocked()) {
      lastActivityAt = Date.now(); // reset while locked so we don't immediately re-lock on unlock
      return;
    }
    if (Date.now() - lastActivityAt > idleTimeoutMs) {
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
    dispose() {
      if (disposed) return;
      disposed = true;
      clearInterval(idleCheck);
      powerMonitor.off('suspend', onSuspend);
      powerMonitor.off('lock-screen', onLockScreen);
    },
  };
}
