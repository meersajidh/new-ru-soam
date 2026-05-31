// First first-party bundle. Proves Renderer → Main → Bundle Host
// round-trip via the capability proxy. No platform internals imported;
// the bundle only sees what `activate(ctx)` hands it.
//
// Phase 6.5 adds the `try-*` hardening probes. Each attempts a denied
// surface (electron, fs, child_process, process.exit) and reports
// success/failure back to the Renderer. The host's default-deny posture
// (Module._load patch + ESM loader hook + locked process props) must
// make every probe return ok=false.

async function probeImport(specifier) {
  try {
    await import(specifier);
    return { ok: true, errCode: 'none', message: 'IMPORT SUCCEEDED — hardening failed' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, errCode: 'import-rejected', message };
  }
}

export function activate(ctx) {
  ctx.registerCommand('echo-test.hello', (name) => 'hello from host: ' + (name ?? 'world'));

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
      case 'try-electron':
        return probeImport('electron');
      case 'try-fs':
        return probeImport('fs');
      case 'try-child-process':
        return probeImport('child_process');
      case 'try-process-exit':
        try {
          process.exit(0);
          return { ok: true, errCode: 'none', message: 'process.exit SUCCEEDED — hardening failed' };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return { ok: false, errCode: 'process-exit-rejected', message };
        }
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
