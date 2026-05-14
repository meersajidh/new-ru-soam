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
}

export type CapabilityCallResponse =
  | { readonly id: number; readonly ok: true; readonly data: unknown }
  | { readonly id: number; readonly ok: false; readonly error: { code: string; message: string } };

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
} as const;
export type CapErrCode = (typeof CapErr)[keyof typeof CapErr];
