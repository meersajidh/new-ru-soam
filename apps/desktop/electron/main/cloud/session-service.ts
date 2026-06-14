/**
 * CloudSessionService — owns the pending→committed refresh-token lifecycle
 * for the identity server (ADR-311 §4, O307f).
 *
 * Acquire flow:
 *   1. After Google OAuth, caller passes the id_token to acquire().
 *   2. acquire() posts to /v1/session (best-effort; never throws to caller).
 *   3. On success: access token held in memory; refresh token held as _pending.
 *   4. At the unlock seam (setup:acknowledge / unlock / unlock-recovery),
 *      lock-channel calls commitPending() which KEK-wraps and stores the refresh token.
 *
 * Renderer NEVER sees access or refresh tokens — only {signedIn: boolean} (ADR-202/304).
 *
 * TODO(11a.5b / O471):
 *   - Returning-user refresh-on-unlock: call POST /v1/refresh with stored token on unlock.
 *   - Sign-out revocation: call POST /v1/revoke before clearing stored token.
 *   - Offline event queue: queue failed acquire() events, flush on reconnect.
 */

import { app } from 'electron';
import { encryptToEnvelope, encodeEnvelope } from '../crypto/envelope.js';
import { credentialStore } from '../credentials/index.js';
import { postSession, isCloudConfigured, CloudOfflineError } from './identity-client.js';
import { getDeviceId } from './device-id.js';

/**
 * Build the AAD for the cloud-session-token KEK-wrap envelope.
 * Follows buildProtectedStoreKeyAad / buildProtectedBlobsKeyAad pattern from
 * crypto/envelope.ts: canonical-JSON with keys sorted alphabetically.
 * { purpose: 'cloud-session-token', workspaceId } → purpose < workspaceId ✓
 * Distinct purpose string prevents cross-substitution with other wrapped keys.
 */
function buildCloudSessionTokenAad(workspaceId: string): Buffer {
  const obj = JSON.stringify({ purpose: 'cloud-session-token', workspaceId });
  return Buffer.from(obj, 'utf8');
}

/** Singleton cloud session service. */
export class CloudSessionService {
  /** Refresh token waiting to be KEK-wrapped (not yet committed to CredentialStore). */
  private _pending: { refreshToken: string } | null = null;

  /** Current in-memory access token (short-lived; not persisted). */
  private _accessToken: string | null = null;

  /**
   * Best-effort: post the id_token to the identity server and hold the result
   * in memory.  Never throws — sign-in must never fail due to cloud state.
   *
   * If a KEK is already available (workspace already unlocked), the pending
   * refresh token is committed immediately.  Otherwise commitPending() is
   * called later at the next unlock seam.
   */
  async acquire(idToken: string): Promise<void> {
    if (!isCloudConfigured()) return;

    let tokens;
    try {
      tokens = await postSession(idToken, getDeviceId(), app.getVersion());
    } catch (err) {
      if (err instanceof CloudOfflineError) {
        console.warn('[CloudSessionService] acquire: server unreachable — continuing offline:', err.message);
        return;
      }
      // Unexpected error — log but don't propagate.
      console.error('[CloudSessionService] acquire: unexpected error:', err);
      return;
    }

    if (!tokens) return; // cloud not configured — no-op

    this._accessToken = tokens.accessToken;
    this._pending = { refreshToken: tokens.refreshToken };
    // commit deferred to next unlock seam (lock-channel calls commitPending).
    // If the workspace is already unlocked when acquire() runs, lock-channel
    // will call commitPending() at the *next* lock event — which for the new-user
    // setup:acknowledge seam happens moments after sign-in anyway.
  }

  /**
   * KEK-wrap the pending refresh token and persist it to CredentialStore.
   * Called at every unlock seam (setup:acknowledge, unlock, unlock-recovery)
   * by lock-channel.ts.  Idempotent: if no pending token, no-op.
   *
   * Best-effort: logs and swallows errors so the unlock path is never broken.
   */
  commitPending(workspaceId: string, kek: Buffer): void {
    if (!this._pending) return;
    const { refreshToken } = this._pending;
    try {
      const aad = buildCloudSessionTokenAad(workspaceId);
      const envelope = encryptToEnvelope(kek, Buffer.from(refreshToken, 'utf8'), aad);
      const bytes = Buffer.from(encodeEnvelope(envelope), 'utf8');
      credentialStore.set(workspaceId, 'cloud-session-token', bytes);
      this._pending = null;
    } catch (err) {
      console.error('[CloudSessionService] commitPending: failed to store refresh token:', err);
      // Do NOT re-throw — unlock must not fail.
    }
  }

  /**
   * Returns { signedIn: true } when either an in-memory access token exists
   * (current session) OR a stored cloud-session-token credential exists for
   * the workspace (persisted from a prior session).
   */
  getStatus(workspaceId: string): { signedIn: boolean } {
    if (this._accessToken !== null) return { signedIn: true };
    const stored = credentialStore.get(workspaceId, 'cloud-session-token');
    return { signedIn: stored !== null };
  }

  /**
   * Drop volatile state (in-memory access token + pending refresh).
   * Called on relock and sign-out.  The stored KEK-wrapped refresh token
   * persists in CredentialStore for the next unlock.
   */
  clearVolatile(): void {
    this._accessToken = null;
    this._pending = null;
  }
}

export const cloudSessionService = new CloudSessionService();
