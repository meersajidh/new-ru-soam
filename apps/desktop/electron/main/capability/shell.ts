import { shell } from 'electron';
import { CapErr } from '../../shared/ipc-protocol';
import { registerCapability } from './registry';

function methodNotFound(method: string): Error {
  return Object.assign(new Error(`shell: unknown method: ${method}`), {
    code: CapErr.MethodNotFound,
  });
}

function openExternal(input: unknown): Promise<void> {
  if (typeof input !== 'string' || input.trim() === '') {
    throw new Error('shell.openExternal: url must be a non-empty string');
  }

  const url = new URL(input);
  if (url.protocol !== 'https:') {
    throw new Error(`shell.openExternal: unsupported protocol: ${url.protocol}`);
  }
  if (url.hostname === '') {
    throw new Error('shell.openExternal: hostname must not be empty');
  }

  return shell.openExternal(url.toString());
}

export function registerShellCapability(): void {
  registerCapability('platform.shell', '1.0', async (method, args) => {
    switch (method) {
      case 'openExternal':
        return openExternal(args[0]);
      default:
        throw methodNotFound(method);
    }
  });
}
