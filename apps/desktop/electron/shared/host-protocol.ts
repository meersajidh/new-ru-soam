/**
 * Wire protocol between Main and the Bundle Host (`utilityProcess`).
 *
 * Per ADR-410, Main is the sole broker for capability calls into the host.
 * Phase 1 ships only `host.ping`: enough to prove spawn / message-roundtrip /
 * teardown / crash-detection without loading any real bundle code.
 */

export type MainToHostMessage =
  | { readonly kind: 'host.ping'; readonly id: number; readonly message: string }
  | { readonly kind: 'host.shutdown' };

export type HostToMainMessage = {
  readonly kind: 'host.pong';
  readonly id: number;
  readonly echo: string;
  readonly pid: number;
};
