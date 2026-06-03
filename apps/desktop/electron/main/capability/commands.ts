import { CapErr } from '../../shared/ipc-protocol';
import { registerCapability } from './registry';
import { invokeBundleCommand, hasBundleCommand } from '../fp-host/manager';

function methodNotFound(method: string): Error {
  return Object.assign(new Error(`commands: unknown method: ${method}`), {
    code: CapErr.MethodNotFound,
  });
}

/**
 * `commands` capability — ADR-406 renderer→Bundle-Host command execution path.
 *
 * Methods:
 *   execute(commandId: string, ...args: unknown[]) → Promise<unknown>
 *     Delegates to the bundle that registered the command via
 *     `ctx.registerCommand`. Throws if no owner (COMMAND_NOT_REGISTERED).
 *
 *   has(commandId: string) → boolean
 *     Returns true if a bundle has registered the command id.
 *
 * Bound by the trusted renderer shell only (boot.ts). Bundle views (iframes)
 * must not bind this capability directly — that is a later slice.
 */
export function registerCommandsCapability(): void {
  registerCapability('commands', '1.0', async (method, args) => {
    switch (method) {
      case 'execute': {
        const commandId = args[0];
        if (typeof commandId !== 'string') {
          throw new Error('commands.execute: commandId must be a string');
        }
        const cmdArgs = args.slice(1);
        return invokeBundleCommand(commandId, cmdArgs);
      }
      case 'has': {
        const commandId = args[0];
        if (typeof commandId !== 'string') {
          throw new Error('commands.has: commandId must be a string');
        }
        return hasBundleCommand(commandId);
      }
      default:
        throw methodNotFound(method);
    }
  });
}
