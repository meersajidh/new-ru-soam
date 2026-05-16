import { pathToFileURL } from 'url';
import type {
  CapabilityDescriptor,
  HostToMainMessage,
  MainToHostMessage,
} from '../shared/host-protocol';

/**
 * Bundle Host process entry — runs in `utilityProcess` per ADR-410.
 *
 * Responsibilities:
 *  - dynamically import each activated bundle's module,
 *  - run its `activate(ctx)`, capture the disposable + capability handlers,
 *  - dispatch capability invocations from Main to the right handler,
 *  - tear bundles down on `host.deactivate`,
 *  - never let a bundle throw bubble out of the process (handler errors
 *    are reported as `host.cap.error`, activation errors as
 *    `host.activate.failed`).
 *
 * The process *will* still exit on a true uncaughtException (Node default
 * with this handler is `process.exit(1)`); Main detects that and marks
 * every bundle hosted here as inactive. Crash isolation is at the host
 * boundary, not the per-bundle boundary, until per-bundle isolation
 * (ADR-410 O64/O65) lands.
 */

declare const process: NodeJS.Process & {
  readonly parentPort: {
    on(event: 'message', listener: (e: { data: MainToHostMessage }) => void): void;
    postMessage(msg: HostToMainMessage): void;
  };
};

type BundleHandler = (
  method: string,
  args: ReadonlyArray<unknown>,
) => unknown | Promise<unknown>;

interface ActivatedBundle {
  readonly bundleId: string;
  readonly capabilities: Map<string, BundleHandler>;
  readonly dispose?: () => void | Promise<void>;
}

const bundles = new Map<string, ActivatedBundle>();

function send(msg: HostToMainMessage): void {
  process.parentPort.postMessage(msg);
}

function capKey(name: string, version: string): string {
  return `${name}@${version}`;
}

async function activate(
  id: number,
  bundleId: string,
  modulePath: string,
): Promise<void> {
  if (bundles.has(bundleId)) {
    send({
      kind: 'host.activate.failed',
      id,
      bundleId,
      message: `Bundle already activated: ${bundleId}`,
    });
    return;
  }

  const capabilities = new Map<string, BundleHandler>();
  const declared: CapabilityDescriptor[] = [];

  const ctx = {
    registerCapability(name: string, version: string, handler: BundleHandler): void {
      const k = capKey(name, version);
      if (capabilities.has(k)) {
        throw new Error(`Bundle ${bundleId} double-registers ${k}`);
      }
      capabilities.set(k, handler);
      declared.push({ name, version });
    },
  };

  let mod: { activate?: (ctx: unknown) => unknown | Promise<unknown> };
  try {
    mod = (await import(pathToFileURL(modulePath).href)) as typeof mod;
  } catch (err) {
    send({
      kind: 'host.activate.failed',
      id,
      bundleId,
      message: `import failed: ${err instanceof Error ? err.message : String(err)}`,
    });
    return;
  }

  if (typeof mod.activate !== 'function') {
    send({
      kind: 'host.activate.failed',
      id,
      bundleId,
      message: `Bundle ${bundleId} has no exported activate(ctx) function`,
    });
    return;
  }

  let result: unknown;
  try {
    result = await mod.activate(ctx);
  } catch (err) {
    send({
      kind: 'host.activate.failed',
      id,
      bundleId,
      message: `activate threw: ${err instanceof Error ? err.message : String(err)}`,
    });
    return;
  }

  const dispose =
    result && typeof (result as { dispose?: unknown }).dispose === 'function'
      ? (result as { dispose: () => void | Promise<void> }).dispose.bind(result)
      : undefined;

  bundles.set(bundleId, { bundleId, capabilities, dispose });
  send({ kind: 'host.activated', id, bundleId, capabilities: declared });
}

async function deactivate(id: number, bundleId: string): Promise<void> {
  const bundle = bundles.get(bundleId);
  if (!bundle) {
    send({ kind: 'host.deactivated', id, bundleId });
    return;
  }
  bundles.delete(bundleId);
  if (bundle.dispose) {
    try {
      await bundle.dispose();
    } catch (err) {
      process.stderr.write(
        `[bundle-host] dispose threw for ${bundleId}: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`,
      );
    }
  }
  send({ kind: 'host.deactivated', id, bundleId });
}

async function invokeCapability(
  id: number,
  bundleId: string,
  capability: string,
  version: string,
  method: string,
  args: ReadonlyArray<unknown>,
): Promise<void> {
  const bundle = bundles.get(bundleId);
  if (!bundle) {
    send({ kind: 'host.cap.error', id, code: 'cap.not_found', message: `Bundle inactive: ${bundleId}` });
    return;
  }
  const handler = bundle.capabilities.get(capKey(capability, version));
  if (!handler) {
    send({
      kind: 'host.cap.error',
      id,
      code: 'cap.not_found',
      message: `Capability not registered by ${bundleId}: ${capability}@${version}`,
    });
    return;
  }
  try {
    const data = await handler(method, args);
    send({ kind: 'host.cap.result', id, data });
  } catch (err) {
    send({
      kind: 'host.cap.error',
      id,
      code: 'cap.handler_threw',
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

process.parentPort.on('message', (e) => {
  const msg = e.data;
  switch (msg.kind) {
    case 'host.ping':
      send({ kind: 'host.pong', id: msg.id, echo: msg.message, pid: process.pid });
      return;
    case 'host.shutdown':
      process.exit(0);
      return;
    case 'host.activate':
      void activate(msg.id, msg.bundleId, msg.modulePath);
      return;
    case 'host.deactivate':
      void deactivate(msg.id, msg.bundleId);
      return;
    case 'host.cap.invoke':
      void invokeCapability(
        msg.id,
        msg.bundleId,
        msg.capability,
        msg.version,
        msg.method,
        msg.args,
      );
      return;
  }
});

process.on('uncaughtException', (err) => {
  process.stderr.write(`[bundle-host] uncaughtException: ${err.stack ?? err.message}\n`);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? (reason.stack ?? reason.message) : String(reason);
  process.stderr.write(`[bundle-host] unhandledRejection: ${msg}\n`);
});
