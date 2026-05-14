import { pingHost } from '../bundle-host/manager';
import { registerCapability } from './registry';

/**
 * Smoke capability proving the Renderer → Main → Bundle Host round trip.
 *
 * Renderer calls `platform.host_ping@1.0`.`ping(message)`. Main forwards to
 * the (lazy-spawned) Bundle Host, awaits the pong, returns the host's PID
 * and echoed message. Confirms ADR-410 Phase 1 exit criterion: the host is
 * a real, separate process Main brokers.
 */
export function registerPlatformHostPing(): void {
  registerCapability('platform.host_ping', '1.0', async (method, args) => {
    if (method !== 'ping') {
      throw new Error(`Unknown method: ${method}`);
    }
    const message = typeof args[0] === 'string' ? args[0] : '';
    return pingHost(message);
  });
}
