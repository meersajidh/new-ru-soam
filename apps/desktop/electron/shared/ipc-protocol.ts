/**
 * Wire protocol shared by Main, preload, and the Renderer for the
 * Renderer ↔ Main bridge.
 *
 * Per ADR-202, the Renderer's only IPC surface is `window.soam`. Every
 * capability call from the Renderer flows through `SOAM_CALL_CHANNEL`.
 * Every platform-level event flows through `SOAM_EVENT_CHANNEL`.
 */

export const SOAM_CALL_CHANNEL = 'soam:call';
export const SOAM_EVENT_CHANNEL = 'soam:event';

export interface CapabilityCallRequest {
  readonly id: number;
  readonly capability: string;
  readonly version: string;
  readonly method: string;
  readonly args: ReadonlyArray<unknown>;
  /** CQRS multiplexer hint (ADR-506 §7 / O447). Absent for unclassified caps. */
  readonly expectKind?: 'command' | 'query';
}

export type CapabilityCallResponse =
  | { readonly id: number; readonly ok: true; readonly data: unknown }
  | { readonly id: number; readonly ok: false; readonly error: { code: string; message: string } };

/**
 * Payload for `store.changed` platform events (ADR-302).
 *
 * Emitted by Main after every Local Store write. The renderer bridge
 * (`src/platform/data/store-events-bridge.ts`) maps these to
 * `queryClient.invalidateQueries({ queryKey: [table] })`, which prefix-matches
 * all keys under that capability namespace per ADR-412 §"Pattern 2".
 */
export interface StoreChangedPayload {
  readonly table: string;
  readonly op: 'set' | 'delete';
  readonly keys: ReadonlyArray<string>;
}

export interface PlatformEvent {
  readonly name: string;
  readonly payload: unknown;
}

/**
 * Error codes used in `CapabilityCallResponse.error.code`.
 * Stable strings — Renderer code may switch on them.
 */
export const CapErr = {
  NotFound: 'cap.not_found',
  MethodNotFound: 'cap.method_not_found',
  VersionMismatch: 'cap.version_mismatch',
  HandlerThrew: 'cap.handler_threw',
  SenderRejected: 'cap.sender_rejected',
  /** Capability refused because the workspace is locked (ADR-307). */
  Locked: 'cap.locked',
  /**
   * Capability refused because the caller's trustClass is insufficient for
   * a PHI-flagged capability (ADR-418, O449 rung-0 PHI gate).
   * Fires only when caller.trustClass !== 'first-party' and the cap is phi.
   */
  Denied: 'cap.denied',
  /**
   * Capability kind does not match the CQRS multiplexer used by the caller
   * (ADR-506 §7 / O447 rung-E). bindQuery rejects non-query caps; bindCommand
   * rejects non-command caps; unclassified caps (kind undefined) always mismatch.
   */
  KindMismatch: 'cap.kind_mismatch',
} as const;
export type CapErrCode = (typeof CapErr)[keyof typeof CapErr];
