import path from 'path';
import { fileURLToPath } from 'url';
import { utilityProcess, type UtilityProcess } from 'electron';
import type {
  HostToMainMessage,
  MainToHostMessage,
} from '../../shared/host-protocol';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOST_ENTRY = path.join(__dirname, '../bundle-host/index.mjs');

/**
 * Bundle Host process manager.
 *
 * Per ADR-410:
 *  - Lazy spawn: process does not exist until first call.
 *  - Main is sole broker; nothing else holds a reference to the host.
 *  - Crash semantics: host exit is logged; pending replies reject; the next
 *    call respawns. A host crash never propagates to Main.
 */

interface PendingRequest {
  resolve: (value: HostToMainMessage) => void;
  reject: (err: Error) => void;
}

let child: UtilityProcess | null = null;
let pending = new Map<number, PendingRequest>();
let nextId = 1;
let shuttingDown = false;

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

export interface HostPingResult {
  readonly echo: string;
  readonly hostPid: number;
}

export async function pingHost(message: string): Promise<HostPingResult> {
  const proc = ensureChild();
  const id = nextId++;
  const reply = await new Promise<HostToMainMessage>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    const req: MainToHostMessage = { kind: 'host.ping', id, message };
    proc.postMessage(req);
  });
  return { echo: reply.echo, hostPid: reply.pid };
}

export async function shutdownHost(): Promise<void> {
  if (!child) return;
  shuttingDown = true;
  const req: MainToHostMessage = { kind: 'host.shutdown' };
  child.postMessage(req);
  // The `exit` handler clears state. Caller may still race; the next call
  // will respawn cleanly.
}

export function isHostRunning(): boolean {
  return child !== null;
}
