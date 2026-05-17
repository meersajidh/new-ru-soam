/**
 * Stub PHI capability — phi.demo.echo@1.0
 *
 * Registered with phi: true so the registry's lock-gate decorator rejects
 * with cap.locked whenever the workspace is locked (ADR-307, Phase 9b).
 *
 * Method:
 *   echo(input: unknown): { echoed: unknown; lockedWhenCalled: false }
 *
 * When called while locked the registry short-circuits this handler;
 * lockedWhenCalled is always false if the handler actually runs.
 */

import { registerCapability } from './registry.js';

export function registerPhiDemoEchoCapability(): void {
  registerCapability(
    'phi.demo.echo',
    '1.0',
    async (method, args) => {
      if (method === 'echo') {
        const input = args[0];
        return { echoed: input, lockedWhenCalled: false };
      }
      throw Object.assign(new Error(`phi.demo.echo: unknown method: ${method}`), {
        code: 'cap.method_not_found',
      });
    },
    { phi: true },
  );
}
