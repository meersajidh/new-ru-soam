import path from 'path';
import { fileURLToPath } from 'url';
import { utilityProcess, type UtilityProcess } from 'electron';
import {
  type CapabilityDescriptor,
  type HostToMainMessage,
  type MainToHostMessage,
} from '../../shared/host-protocol';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOST_ENTRY = path.join(__dirname, '../bundle-host/index.mjs');

/**
 * Bundle Host process manager.
 *
 * Per ADR-410:
 *  - Lazy spawn: process does not exist until first call.
 *  - Main is sole broker; nothing else holds a reference to the host.
 *  - Crash semantics: host exit is logged, every pending reply rejects,
 *    every previously-activated bundle is marked inactive (no auto-restart
 *    in this phase). The next call respawns the host process.
 *
 * The manager maintains a single id namespace across ping / activate /
 * deactivate / cap.invoke. Replies carry the same id and the resolver
 * is keyed by id alone.
 */

interface PendingRequest {
  resolve: (value: HostToMainMessage) => void;
  reject: (err: Error) => void;
}

interface ActivatedBundle {
  readonly bundleId: string;
  readonly capabilities: ReadonlyArray<CapabilityDescriptor>;
}

let child: UtilityProcess | null = null;
let pending = new Map<number, PendingRequest>();
let nextId = 1;
let shuttingDown = false;
let activated = new Map<string, ActivatedBundle>();
let onBundlesCrashed: ((bundleIds: ReadonlyArray<string>) => void) | null = null;

export function setOnBundlesCrashed(
  cb: (bundleIds: ReadonlyArray<string>) => void,
): void {
  onBundlesCrashed = cb;
}

function spawn(): UtilityProcess {
  shuttingDown = false;
  const proc = utilityProcess.fork(HOST_ENTRY, [], {
    stdio: 'pipe',
    serviceName: 'ru-soam-bundle-host',
  });

  proc.on('message', (msg: HostToMainMessage) => {
    const req = pending.get(msg.id);
    if (!req) return;
    pending.delete(msg.id);
    req.resolve(msg);
  });

  proc.on('exit', (code) => {
    const wasCrash = !shuttingDown;
    if (wasCrash) {
      console.error(`[bundle-host] exited unexpectedly code=${code}`);
    } else {
      console.log(`[bundle-host] shutdown clean code=${code}`);
    }
    const inflight = pending;
    pending = new Map();
    child = null;
    for (const req of inflight.values()) {
      req.reject(new Error(`Bundle Host exited (code=${code}, crash=${wasCrash})`));
    }
    if (wasCrash && activated.size > 0) {
      const lostIds = [...activated.keys()];
      activated = new Map();
      onBundlesCrashed?.(lostIds);
    }
  });

  if (proc.stdout) {
    proc.stdout.on('data', (chunk: Buffer) =>
      process.stdout.write(`[bundle-host] ${chunk}`),
    );
  }
  if (proc.stderr) {
    proc.stderr.on('data', (chunk: Buffer) =>
      process.stderr.write(`[bundle-host] ${chunk}`),
    );
  }

  return proc;
}

function ensureChild(): UtilityProcess {
  if (!child) child = spawn();
  return child;
}

function send<R extends HostToMainMessage>(
  build: (id: number) => MainToHostMessage,
): Promise<R> {
  const proc = ensureChild();
  const id = nextId++;
  return new Promise<R>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: HostToMainMessage) => void, reject });
    proc.postMessage(build(id));
  });
}

export interface HostPingResult {
  readonly echo: string;
  readonly hostPid: number;
}

export async function pingHost(message: string): Promise<HostPingResult> {
  const reply = await send<HostToMainMessage>((id) => ({
    kind: 'host.ping',
    id,
    message,
  }));
  if (reply.kind !== 'host.pong') {
    throw new Error(`Unexpected reply for host.ping: ${reply.kind}`);
  }
  return { echo: reply.echo, hostPid: reply.pid };
}

export interface ActivateBundleResult {
  readonly capabilities: ReadonlyArray<CapabilityDescriptor>;
}

export async function activateBundle(
  bundleId: string,
  modulePath: string,
): Promise<ActivateBundleResult> {
  if (activated.has(bundleId)) {
    throw new Error(`Bundle already activated: ${bundleId}`);
  }
  const reply = await send<HostToMainMessage>((id) => ({
    kind: 'host.activate',
    id,
    bundleId,
    modulePath,
  }));
  if (reply.kind === 'host.activate.failed') {
    throw new Error(`Bundle activation failed (${bundleId}): ${reply.message}`);
  }
  if (reply.kind !== 'host.activated') {
    throw new Error(`Unexpected reply for host.activate: ${reply.kind}`);
  }
  activated.set(bundleId, { bundleId, capabilities: reply.capabilities });
  return { capabilities: reply.capabilities };
}

export async function deactivateBundle(bundleId: string): Promise<void> {
  if (!activated.has(bundleId)) return;
  const reply = await send<HostToMainMessage>((id) => ({
    kind: 'host.deactivate',
    id,
    bundleId,
  }));
  if (reply.kind !== 'host.deactivated') {
    throw new Error(`Unexpected reply for host.deactivate: ${reply.kind}`);
  }
  activated.delete(bundleId);
}

export interface InvokeBundleCapabilityError extends Error {
  readonly code: string;
}

export async function invokeBundleCapability(
  bundleId: string,
  capability: string,
  version: string,
  method: string,
  args: ReadonlyArray<unknown>,
): Promise<unknown> {
  if (!activated.has(bundleId)) {
    const err = new Error(`Bundle inactive: ${bundleId}`) as InvokeBundleCapabilityError;
    (err as { code: string }).code = 'cap.not_found';
    throw err;
  }
  const reply = await send<HostToMainMessage>((id) => ({
    kind: 'host.cap.invoke',
    id,
    bundleId,
    capability,
    version,
    method,
    args,
  }));
  if (reply.kind === 'host.cap.result') return reply.data;
  if (reply.kind === 'host.cap.error') {
    const err = new Error(reply.message) as InvokeBundleCapabilityError;
    (err as { code: string }).code = reply.code;
    throw err;
  }
  throw new Error(`Unexpected reply for host.cap.invoke: ${reply.kind}`);
}

export function listActivatedBundleIds(): ReadonlyArray<string> {
  return [...activated.keys()];
}

export async function shutdownHost(): Promise<void> {
  if (!child) return;
  // Best-effort graceful teardown: deactivate every bundle we know about,
  // then issue the host shutdown. Per-bundle errors are logged and swallowed
  // so we still hit the final shutdown.
  for (const id of [...activated.keys()]) {
    try {
      await deactivateBundle(id);
    } catch (err) {
      console.error(
        `[bundle-host] deactivate ${id} during shutdown failed:`,
        err instanceof Error ? err.message : err,
      );
      activated.delete(id);
    }
  }
  shuttingDown = true;
  const req: MainToHostMessage = { kind: 'host.shutdown' };
  child.postMessage(req);
}

export function isHostRunning(): boolean {
  return child !== null;
}
