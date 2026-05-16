// Lazy-activation test bundle. Manifest declares activationEvents=["lazy"],
// so the platform does not call activate() at boot — only on the first
// capability invocation. Concurrent first invocations share one activation
// promise (loader.ts ensures this); subsequent calls reuse the bundle.
//
// `activatedAt` is captured at activate-time. The Renderer can verify the
// timestamp stays constant across calls — proving no re-activation.

export function activate(ctx) {
  const activatedAt = Date.now();

  ctx.registerCapability('echo.lazy', '1.0', async (method, args) => {
    switch (method) {
      case 'whoami':
        return {
          bundleId: 'echo-lazy',
          activatedAt,
          now: Date.now(),
          hostPid: process.pid,
          echo: typeof args[0] === 'string' ? args[0] : '',
        };
      default:
        throw new Error(`echo.lazy: unknown method ${method}`);
    }
  });

  return {
    dispose() {
      // No external resources held. Per-bundle handler map dropped by host.
    },
  };
}
