import { registerCapability } from './registry';

/**
 * Smoke capability for Phase 1 verification.
 *
 * Renderer calls `platform.ping@1.0`.`ping(message)` and receives an echo
 * plus the Main process PID. Proves the IPC spine end-to-end without
 * touching any real platform service.
 */
export function registerPlatformPing(): void {
  registerCapability('platform.ping', '1.0', async (method, args) => {
    if (method !== 'ping') {
      throw new Error(`Unknown method: ${method}`);
    }
    const message = typeof args[0] === 'string' ? args[0] : '';
    return { echo: message, pid: process.pid, ts: Date.now() };
  });
}
