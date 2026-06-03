import { pathToFileURL } from 'url';
import Module, { register } from 'node:module';
import type {
  CapabilityDescriptor,
  HostToMainMessage,
  MainToHostMessage,
} from '../shared/host-protocol';

/**
 * ─────────────────────────────────────────────────────────────────────────
 * Phase 6.5 — Bundle Host hardening (O65, partial)
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Default-deny dangerous Node surface BEFORE any bundle module is imported.
 * Two layers:
 *   - CJS `require()` denial via `Module._load` patch.
 *   - ESM `import` denial via a `module.register()` resolve hook (data URL).
 *
 * Globals neutered: `process.exit`, `process.dlopen`, `process.binding`.
 * The host's own shutdown / crash paths capture `process.exit` BEFORE the
 * neuter so internal exits still work; bundle-side calls throw.
 *
 * Defense-in-depth, not airtight sandbox. A determined adversary can still
 * smuggle via base64-eval, `Function()`, etc. — those holes are explicitly
 * out of scope for this phase. See O137 for deeper ESM loader-hook
 * hardening when the first untrusted bundle ships.
 */

const DENIED_MODULES: ReadonlySet<string> = new Set([
  'electron',
  'child_process',
  'fs',
  'net',
  'dgram',
  'worker_threads',
  'vm',
]);

function isDeniedModuleSpecifier(specifier: string): boolean {
  if (typeof specifier !== 'string') return false;
  const stripped = specifier.startsWith('node:') ? specifier.slice(5) : specifier;
  const head = stripped.split('/')[0];
  return DENIED_MODULES.has(head);
}

// CJS denial — patches `Module._load`. `_load` is a Node internal not
// exposed in @types/node; cast through unknown.
type ModuleLoad = (request: string, parent: unknown, isMain: boolean) => unknown;
const mod = Module as unknown as { _load: ModuleLoad };
const origLoad: ModuleLoad = mod._load;
mod._load = function patchedLoad(request, parent, isMain) {
  if (isDeniedModuleSpecifier(request)) {
    throw new Error(`module denied: ${request}`);
  }
  return origLoad.call(this, request, parent, isMain);
};

// ESM denial — `register()` a resolve hook delivered as a data URL.
const LOADER_HOOK_SOURCE = `
const DENIED = new Set(${JSON.stringify([...DENIED_MODULES])});
function isDenied(specifier) {
  if (typeof specifier !== 'string') return false;
  const stripped = specifier.startsWith('node:') ? specifier.slice(5) : specifier;
  const head = stripped.split('/')[0];
  return DENIED.has(head);
}
export async function resolve(specifier, context, nextResolve) {
  if (isDenied(specifier)) {
    throw new Error('module denied: ' + specifier);
  }
  return nextResolve(specifier, context);
}
`;
register(`data:text/javascript,${encodeURIComponent(LOADER_HOOK_SOURCE)}`);

// Capture internal exit BEFORE neutering — host's own crash + shutdown
// paths use this; bundle-side calls to `process.exit` throw.
const realExit: (code?: number) => never = process.exit.bind(process);

function defineLockedProp<K extends keyof NodeJS.Process>(
  key: K,
  value: NodeJS.Process[K],
): void {
  Object.defineProperty(process, key, {
    value,
    configurable: false,
    writable: false,
  });
}

defineLockedProp('exit', (() => {
  throw new Error('process.exit denied');
}) as NodeJS.Process['exit']);
defineLockedProp('dlopen', (() => {
  throw new Error('process.dlopen denied');
}) as NodeJS.Process['dlopen']);

interface ProcessWithBinding {
  binding?: (mod: string) => unknown;
}
const procExt = process as unknown as ProcessWithBinding;
if (typeof procExt.binding === 'function') {
  Object.defineProperty(process, 'binding', {
    value: () => {
      throw new Error('process.binding denied');
    },
    configurable: false,
    writable: false,
  });
}

// `process.env` snapshot — reads pass through; writes / deletes throw.
defineLockedProp('env', Object.freeze({ ...process.env }) as NodeJS.ProcessEnv);

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

// ─── Host-side consume channel (O449 rung-0) ────────────────────────────────
// The host ORIGINATES requests here; ids come from a host-allocated counter
// that is SEPARATE from Main's pending-id namespace. Main branches on kind
// before its own pending-map lookup to prevent id-collision false matches.

interface HostPendingRequest {
  resolve: (data: unknown) => void;
  reject: (err: Error) => void;
}

/** Host-allocated id counter — independent of Main's nextId. */
let hostNextId = 1;
const hostPending = new Map<number, HostPendingRequest>();

interface BoundCapability {
  call(method: string, args: ReadonlyArray<unknown>): Promise<unknown>;
  dispose(): void;
}

/**
 * Ask Main to invoke a capability on behalf of the calling bundle (O449 rung-0).
 *
 * bundleId is carried so Main can resolve trustClass from its own records;
 * trustClass is NEVER sent — Main resolves it from provenance.
 *
 * Returns a handle whose `call(method, args)` dispatches over the wire and
 * whose `dispose()` is a no-op placeholder (for future subscription cleanup).
 */
function bindCapabilityForBundle(
  bundleId: string,
  capabilityName: string,
  version: string,
): BoundCapability {
  return {
    call(method: string, args: ReadonlyArray<unknown>): Promise<unknown> {
      const id = hostNextId++;
      return new Promise<unknown>((resolve, reject) => {
        hostPending.set(id, { resolve, reject });
        const msg: HostToMainMessage = {
          kind: 'host.consume.invoke',
          id,
          bundleId,
          capability: capabilityName,
          version,
          method,
          args,
        };
        send(msg);
      });
    },
    dispose(): void {
      // No-op placeholder — future subscription cleanup goes here.
    },
  };
}

type BundleHandler = (
  method: string,
  args: ReadonlyArray<unknown>,
) => unknown | Promise<unknown>;

type CommandHandler = (...args: unknown[]) => unknown | Promise<unknown>;

interface ActivatedBundle {
  readonly bundleId: string;
  readonly capabilities: Map<string, BundleHandler>;
  readonly commands: Map<string, CommandHandler>;
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
  const commands = new Map<string, CommandHandler>();
  const declared: CapabilityDescriptor[] = [];
  const declaredCommandIds: string[] = [];

  const ctx = {
    registerCapability(name: string, version: string, handler: BundleHandler): void {
      const k = capKey(name, version);
      if (capabilities.has(k)) {
        throw new Error(`Bundle ${bundleId} double-registers ${k}`);
      }
      capabilities.set(k, handler);
      declared.push({ name, version });
    },
    registerCommand(commandId: string, handler: CommandHandler): void {
      if (commands.has(commandId)) {
        throw new Error(`Bundle ${bundleId} double-registers command ${commandId}`);
      }
      commands.set(commandId, handler);
      declaredCommandIds.push(commandId);
    },
    /**
     * Bind a Main-resident capability for consumption by this bundle (O449 rung-0).
     *
     * Returns a handle with `call(method, args)` that sends a host.consume.invoke
     * to Main and awaits the reply. Main resolves the caller's trustClass from its
     * own provenance record — the bundle never sends trustClass.
     */
    bindCapability(name: string, version: string): BoundCapability {
      return bindCapabilityForBundle(bundleId, name, version);
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

  bundles.set(bundleId, { bundleId, capabilities, commands, dispose });
  send({ kind: 'host.activated', id, bundleId, capabilities: declared, commandIds: declaredCommandIds });
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
        `[fp-host] dispose threw for ${bundleId}: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`,
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

async function invokeCommand(
  id: number,
  bundleId: string,
  commandId: string,
  args: ReadonlyArray<unknown>,
): Promise<void> {
  const bundle = bundles.get(bundleId);
  if (!bundle) {
    send({
      kind: 'host.cap.error',
      id,
      code: 'COMMAND_NOT_FOUND',
      message: `Bundle inactive: ${bundleId}`,
    });
    return;
  }
  const handler = bundle.commands.get(commandId);
  if (!handler) {
    send({
      kind: 'host.cap.error',
      id,
      code: 'COMMAND_NOT_FOUND',
      message: `Command not registered by ${bundleId}: ${commandId}`,
    });
    return;
  }
  try {
    const data = await handler(...args);
    send({ kind: 'host.cap.result', id, data });
  } catch (err) {
    send({
      kind: 'host.cap.error',
      id,
      code: 'COMMAND_THREW',
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
      realExit(0);
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
    case 'host.command.invoke':
      void invokeCommand(msg.id, msg.bundleId, msg.commandId, msg.args);
      return;
    // O449 rung-0: replies to host-originated consume requests.
    // These resolve the host's OWN pending map (hostPending), keyed by the
    // host-allocated id. Must be handled here (not in manager.ts) since this
    // is the host process.
    case 'host.consume.result': {
      const req = hostPending.get(msg.id);
      if (req) {
        hostPending.delete(msg.id);
        req.resolve(msg.data);
      }
      return;
    }
    case 'host.consume.error': {
      const req = hostPending.get(msg.id);
      if (req) {
        hostPending.delete(msg.id);
        req.reject(Object.assign(new Error(msg.message), { code: msg.code }));
      }
      return;
    }
  }
});

process.on('uncaughtException', (err) => {
  process.stderr.write(`[fp-host] uncaughtException: ${err.stack ?? err.message}\n`);
  realExit(1);
});

process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? (reason.stack ?? reason.message) : String(reason);
  process.stderr.write(`[fp-host] unhandledRejection: ${msg}\n`);
});
