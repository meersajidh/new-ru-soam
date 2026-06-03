import path from 'path';
import { fileURLToPath } from 'url';
import { utilityProcess, type UtilityProcess } from 'electron';
import {
  type CapabilityDescriptor,
  type HostToMainMessage,
  type MainToHostMessage,
  type TrustClass,
} from '../../shared/host-protocol';
import { invokeCapability } from '../capability/registry';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOST_ENTRY = path.join(__dirname, '../fp-host/index.mjs');

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
  bundleId?: string;
}

interface ActivatedBundle {
  readonly bundleId: string;
  readonly capabilities: ReadonlyArray<CapabilityDescriptor>;
  /** Assigned by Main from provenance at activation time (O449 rung-0). */
  readonly trustClass: TrustClass;
}

const OUTPUT_RING_CAPACITY = 256;

let child: UtilityProcess | null = null;
let pending = new Map<number, PendingRequest>();
let nextId = 1;
let shuttingDown = false;
let activated = new Map<string, ActivatedBundle>();
let commandOwners = new Map<string, string>(); // commandId → bundleId
let onBundlesCrashed: ((bundleIds: ReadonlyArray<string>) => void) | null = null;

// Per-bundle in-memory ring buffer of error-attribution lines. Phase 6.5 stub
// scope (see Implementation_Plan.md): populated by host.cap.error and
// host.activate.failed replies. Full per-line stdout/stderr attribution is
// deferred to O136.
const outputRings = new Map<string, string[]>();

function appendBundleOutput(bundleId: string, line: string): void {
  let ring = outputRings.get(bundleId);
  if (!ring) {
    ring = [];
    outputRings.set(bundleId, ring);
  }
  ring.push(`${new Date().toISOString()} ${line}`);
  if (ring.length > OUTPUT_RING_CAPACITY) {
    ring.splice(0, ring.length - OUTPUT_RING_CAPACITY);
  }
}

export function getBundleOutput(bundleId: string): ReadonlyArray<string> {
  return outputRings.get(bundleId) ?? [];
}

export function setOnBundlesCrashed(
  cb: (bundleIds: ReadonlyArray<string>) => void,
): void {
  onBundlesCrashed = cb;
}

/**
 * Handles a host.consume.invoke message (O449 rung-0 consumer channel).
 *
 * The host asks Main to invoke a Main-resident capability on behalf of a bundle.
 * Main resolves the caller's trustClass from its OWN activated-bundle record —
 * the host NEVER sends trustClass, so it cannot self-elevate.
 */
async function handleConsumeRequest(
  proc: UtilityProcess,
  msg: Extract<HostToMainMessage, { kind: 'host.consume.invoke' }>,
): Promise<void> {
  const record = activated.get(msg.bundleId);
  if (!record) {
    const reply: MainToHostMessage = {
      kind: 'host.consume.error',
      id: msg.id,
      code: 'cap.not_found',
      message: `Bundle not activated on Main side: ${msg.bundleId}`,
    };
    proc.postMessage(reply);
    return;
  }

  const result = await invokeCapability(msg.capability, msg.version, msg.method, msg.args, {
    caller: { bundleId: record.bundleId, trustClass: record.trustClass },
  });

  if (result.ok) {
    const reply: MainToHostMessage = {
      kind: 'host.consume.result',
      id: msg.id,
      data: result.value.data,
    };
    proc.postMessage(reply);
  } else {
    const reply: MainToHostMessage = {
      kind: 'host.consume.error',
      id: msg.id,
      code: result.value.code,
      message: result.value.message,
    };
    proc.postMessage(reply);
  }
}

function spawn(): UtilityProcess {
  shuttingDown = false;
  const proc = utilityProcess.fork(HOST_ENTRY, [], {
    stdio: 'pipe',
    serviceName: 'ru-soam-fp-host',
  });

  proc.on('message', (msg: HostToMainMessage) => {
    // CRITICAL (O449): host.consume.invoke is HOST-ORIGINATED (separate id namespace).
    // Must branch and return BEFORE the pending-map lookup or a host consume-id
    // could falsely match a Main pending-id.
    if (msg.kind === 'host.consume.invoke') {
      void handleConsumeRequest(proc, msg);
      return;
    }

    const req = pending.get(msg.id);
    if (!req) return;
    pending.delete(msg.id);
    if (msg.kind === 'host.cap.error' && req.bundleId !== undefined) {
      appendBundleOutput(req.bundleId, `[err] ${msg.code}: ${msg.message}`);
    } else if (msg.kind === 'host.activate.failed') {
      appendBundleOutput(msg.bundleId, `[activate-failed] ${msg.message}`);
    }
    req.resolve(msg);
  });

  proc.on('exit', (code) => {
    const wasCrash = !shuttingDown;
    if (wasCrash) {
      console.error(`[fp-host] exited unexpectedly code=${code}`);
    } else {
      console.log(`[fp-host] shutdown clean code=${code}`);
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
      commandOwners = new Map();
      onBundlesCrashed?.(lostIds);
    }
  });

  if (proc.stdout) {
    proc.stdout.on('data', (chunk: Buffer) =>
      process.stdout.write(`[fp-host] ${chunk}`),
    );
  }
  if (proc.stderr) {
    proc.stderr.on('data', (chunk: Buffer) =>
      process.stderr.write(`[fp-host] ${chunk}`),
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
  bundleId?: string,
): Promise<R> {
  const proc = ensureChild();
  const id = nextId++;
  return new Promise<R>((resolve, reject) => {
    pending.set(id, {
      resolve: resolve as (v: HostToMainMessage) => void,
      reject,
      bundleId,
    });
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
  trustClass: TrustClass = 'first-party',
): Promise<ActivateBundleResult> {
  if (activated.has(bundleId)) {
    throw new Error(`Bundle already activated: ${bundleId}`);
  }
  const reply = await send<HostToMainMessage>(
    (id) => ({ kind: 'host.activate', id, bundleId, modulePath }),
    bundleId,
  );
  if (reply.kind === 'host.activate.failed') {
    throw new Error(`Bundle activation failed (${bundleId}): ${reply.message}`);
  }
  if (reply.kind !== 'host.activated') {
    throw new Error(`Unexpected reply for host.activate: ${reply.kind}`);
  }
  activated.set(bundleId, { bundleId, capabilities: reply.capabilities, trustClass });
  for (const cmdId of reply.commandIds) {
    commandOwners.set(cmdId, bundleId);
  }
  return { capabilities: reply.capabilities };
}

export async function deactivateBundle(bundleId: string): Promise<void> {
  if (!activated.has(bundleId)) return;
  const reply = await send<HostToMainMessage>(
    (id) => ({ kind: 'host.deactivate', id, bundleId }),
    bundleId,
  );
  if (reply.kind !== 'host.deactivated') {
    throw new Error(`Unexpected reply for host.deactivate: ${reply.kind}`);
  }
  activated.delete(bundleId);
  // Remove all command owners registered by this bundle.
  for (const [cmdId, owner] of commandOwners) {
    if (owner === bundleId) commandOwners.delete(cmdId);
  }
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
  const reply = await send<HostToMainMessage>(
    (id) => ({
      kind: 'host.cap.invoke',
      id,
      bundleId,
      capability,
      version,
      method,
      args,
    }),
    bundleId,
  );
  if (reply.kind === 'host.cap.result') return reply.data;
  if (reply.kind === 'host.cap.error') {
    const err = new Error(reply.message) as InvokeBundleCapabilityError;
    (err as { code: string }).code = reply.code;
    throw err;
  }
  throw new Error(`Unexpected reply for host.cap.invoke: ${reply.kind}`);
}

export interface InvokeBundleCommandError extends Error {
  readonly code: string;
}

export async function invokeBundleCommand(
  commandId: string,
  args: ReadonlyArray<unknown>,
): Promise<unknown> {
  const bundleId = commandOwners.get(commandId);
  if (bundleId === undefined) {
    const err = new Error(
      `Command not registered by any active bundle: ${commandId}`,
    ) as InvokeBundleCommandError;
    (err as { code: string }).code = 'COMMAND_NOT_REGISTERED';
    throw err;
  }
  const reply = await send<HostToMainMessage>(
    (id) => ({
      kind: 'host.command.invoke',
      id,
      bundleId,
      commandId,
      args,
    }),
    bundleId,
  );
  if (reply.kind === 'host.cap.result') return reply.data;
  if (reply.kind === 'host.cap.error') {
    const err = new Error(reply.message) as InvokeBundleCommandError;
    (err as { code: string }).code = reply.code;
    throw err;
  }
  throw new Error(`Unexpected reply for host.command.invoke: ${reply.kind}`);
}

export function hasBundleCommand(commandId: string): boolean {
  return commandOwners.has(commandId);
}

export function listActivatedBundleIds(): ReadonlyArray<string> {
  return [...activated.keys()];
}

export function isBundleActivated(bundleId: string): boolean {
  return activated.has(bundleId);
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
        `[fp-host] deactivate ${id} during shutdown failed:`,
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
