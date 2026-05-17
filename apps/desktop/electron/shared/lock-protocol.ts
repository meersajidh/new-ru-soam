/**
 * Types shared between Renderer and Main for the lock/setup/workspace IPC surface.
 *
 * These are plain-data discriminated unions — no Electron imports allowed here.
 * Per ADR-202, the preload bridge exposes these as `window.soam.lock.*`,
 * `window.soam.setup.*`, and `window.soam.workspace.*`.
 */

export interface LockState {
  readonly locked: boolean;
  readonly setupComplete: boolean;
  readonly mustResetPassphrase: boolean;
}

export type UnlockResult =
  | { ok: true }
  | { ok: false; code: 'bad-passphrase'; attemptsRemaining: number; backoffUntilMs?: number }
  | { ok: false; code: 'rate-limited'; backoffUntilMs: number }
  | { ok: false; code: 'not-set-up' }
  | { ok: false; code: 'no-recovery-pending' };

export type RecoveryUnlockResult =
  | { ok: true; mustResetPassphrase: true }
  | { ok: false; code: 'bad-recovery-code' }
  | { ok: false; code: 'not-set-up' };

export type SetupGenerateResult =
  | { ok: true; recoveryCode: string[] }
  | { ok: false; code: 'already-set-up' | 'no-active-workspace' };

export type SetupAcknowledgeResult =
  | { ok: true }
  | { ok: false; code: 'not-generated' | 'expired' | 'no-active-workspace' };

// ── Workspace types ────────────────────────────────────────────────────────────

export interface WorkspaceMeta {
  readonly workspaceId: string;
  readonly nickname: string;
  readonly createdAt: string;       // ISO-8601
  readonly lastSignedIn: string | null; // ISO-8601 or null
}

export interface WorkspaceChangedEvent {
  readonly activeId: string | null;
  readonly nickname: string; // '' when no active workspace
}

export type WorkspaceCreateResult =
  | { ok: true; workspaceId: string }
  | { ok: false; code: 'invalid-nickname' | 'invalid-email' };

export type WorkspaceSetActiveResult =
  | { ok: true }
  | { ok: false; code: 'unknown-workspace' };
