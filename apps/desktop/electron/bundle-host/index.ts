import type { MainToHostMessage, HostToMainMessage } from '../shared/host-protocol';

/**
 * Bundle Host process entry — runs in `utilityProcess` per ADR-410.
 *
 * Phase 1 scope: respond to platform pings and shut down cleanly. Bundle
 * manifest reading, activation, and capability hosting land in Phase 6.
 * Hardening (no `electron`, no fs/net/child_process by default) lands when
 * the first real bundle ships.
 */

declare const process: NodeJS.Process & {
  readonly parentPort: {
    on(event: 'message', listener: (e: { data: MainToHostMessage }) => void): void;
    postMessage(msg: HostToMainMessage): void;
  };
};

function send(msg: HostToMainMessage): void {
  process.parentPort.postMessage(msg);
}

process.parentPort.on('message', (e) => {
  const msg = e.data;
  switch (msg.kind) {
    case 'host.ping':
      send({ kind: 'host.pong', id: msg.id, echo: msg.message, pid: process.pid });
      return;
    case 'host.shutdown':
      // Main has asked us to leave. Exit cleanly so the parent's `exit` event
      // fires with code 0 and the manager records a clean teardown.
      process.exit(0);
  }
});

process.on('uncaughtException', (err) => {
  // Log to stderr; Main will route to the per-bundle Output channel when
  // bundle support lands. For Phase 1 the message just dies with the process.
  process.stderr.write(`[bundle-host] uncaughtException: ${err.stack ?? err.message}\n`);
  process.exit(1);
});
