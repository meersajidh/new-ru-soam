// First first-party bundle. Proves Renderer → Main → Bundle Host
// round-trip via the capability proxy. No platform internals imported;
// the bundle only sees what `activate(ctx)` hands it.

export function activate(ctx) {
  ctx.registerCapability('echo.ping', '1.0', async (method, args) => {
    switch (method) {
      case 'echo': {
        const message = typeof args[0] === 'string' ? args[0] : '';
        return { pong: message, hostPid: process.pid, ts: Date.now() };
      }
      case 'crash':
        // Test hook: throw inside the handler. Should surface to the
        // Renderer as `cap.handler_threw`, not crash the host.
        throw new Error('echo.ping requested-crash');
      case 'fatal':
        // Test hook: take down the entire Bundle Host process. Used to
        // verify crash isolation (workbench must survive).
        setTimeout(() => { throw new Error('echo.ping requested-fatal'); }, 0);
        return null;
      default:
        throw new Error(`echo.ping: unknown method ${method}`);
    }
  });

  return {
    dispose() {
      // Bundle teardown — nothing to release in this stub. Host will drop
      // its own per-bundle handler map.
    },
  };
}
