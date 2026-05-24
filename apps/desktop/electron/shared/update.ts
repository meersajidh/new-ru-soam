/**
 * Shared types for the `platform.update@1.0` capability and the
 * `platform.update.state-changed` event channel.
 *
 * Owned by Main; renderer reaches it through `window.soam.bindCapability`.
 * Per ADR-202: renderer never imports electron-updater directly.
 */

/** Update lifecycle state machine per ADR-204 §4. */
export type UpdateState =
  | { readonly status: 'idle' }
  | { readonly status: 'checking' }
  | { readonly status: 'available'; readonly version: string; readonly releaseDate: string | null }
  | {
      readonly status: 'downloading';
      readonly version: string;
      readonly percent: number;
      readonly bytesPerSecond: number;
      readonly transferred: number;
      readonly total: number;
    }
  | { readonly status: 'ready'; readonly version: string }
  | { readonly status: 'error'; readonly message: string };

/** Event pushed on every state transition via `platform.update.state-changed`. */
export interface UpdateStateChangedPayload {
  readonly state: UpdateState;
}

/**
 * Linux-only: path to the downloaded .deb and the copyable install command.
 * Only present when `UpdateState.status === 'ready'` on Linux.
 */
export interface LinuxInstallInfo {
  readonly debPath: string;
  readonly installCommand: string;
}
