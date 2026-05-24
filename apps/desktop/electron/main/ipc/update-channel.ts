/**
 * `platform.update@1.0` capability registration — ADR-204 §4.
 *
 * Methods (all gated by isPlatformSender via the capability registry):
 *   getState()              → UpdateState
 *   checkNow()              → void
 *   downloadNow()           → void
 *   installAndRestart()     → void  (Windows only; no-op on Linux)
 *   getCopyInstallCommand() → string | null  (Linux only)
 *
 * Events pushed on every state transition:
 *   `platform.update.state-changed` → UpdateStateChangedPayload
 *
 * The event broadcast is owned by updater/index.ts and runs over
 * SOAM_EVENT_CHANNEL directly (same pattern as lock.changed).
 */

import { CapErr } from '../../shared/ipc-protocol.js';
import { registerCapability } from '../capability/registry.js';
import {
  getUpdateState,
  getLinuxInstallInfo,
  triggerCheck,
  triggerDownload,
  triggerInstallAndRestart,
} from '../updater/index.js';

function methodNotFound(method: string): Error {
  return Object.assign(new Error(`platform.update: unknown method: ${method}`), {
    code: CapErr.MethodNotFound,
  });
}

export function registerUpdateCapability(): void {
  registerCapability('platform.update', '1.0', async (method) => {
    switch (method) {
      case 'getState':
        return getUpdateState();

      case 'checkNow':
        await triggerCheck();
        return null;

      case 'downloadNow':
        await triggerDownload();
        return null;

      case 'installAndRestart':
        await triggerInstallAndRestart();
        return null;

      case 'getCopyInstallCommand': {
        const info = getLinuxInstallInfo();
        return info?.installCommand ?? null;
      }

      default:
        throw methodNotFound(method);
    }
  });
}
