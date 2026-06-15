/**
 * CloudSessionService — owns the pending→committed refresh-token lifecycle
 * for the identity server (ADR-311 §4, O307f).
 *
 * Acquire flow (new user / fresh sign-in):
 *   1. After Google OAuth, caller passes the id_token to acquire().
 *   2. acquire() posts to /v1/session (best-effort; never throws to caller).
 *   3. On success: access token held in memory; refresh token held as _pending.
 *   4. At the unlock seam (setup:acknowledge / unlock / unlock-recovery),
 *      lock-channel calls commitOrRefresh() which detects _pending and KEK-wraps
 *      the refresh token into CredentialStore.
 *
 * Refresh flow (returning user):
 *   commitOrRefresh() finds no _pending → calls refreshOnUnlock(), which unwraps
 *   the stored refresh token and rotates it via POST /v1/refresh.
 *
 * Revoke flow (sign-out):
 *   revokeOnSignOut() synchronously clears local credential then fires best-effort
 *   POST /v1/revoke (detached, never blocks sign-out).
 *
 * Renderer NEVER sees access or refresh tokens — only {signedIn: boolean} (ADR-202/304).
 *
 * KEK lifetime note: kekHandle() returns the live Buffer held in LockService memory
 * until the next relock event. The async refresh window (postRefresh network call)
 * completes well before any relock could fire — the KEK is NOT zeroed by the unlock
 * seam itself, only by the onDidChange(locked=true) handler. Therefore we reuse the
 * live kek reference directly for the post-success re-wrap, without copying. This is
 * documented and intentional (Phase α / O471).
 */

import { encryptToEnvelope, encodeEnvelope, decodeEnvelope, decryptFromEnvelope } from '../crypto/envelope.js';
import { credentialStore } from '../credentials/index.js';
import {
  postSession,
  postRefresh,
  postRevoke,
  isCloudConfigured,
  CloudOfflineError,
  CloudAuthError,
} from './identity-client.js';
import { telemetryService } from './telemetry.js';

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
   * Current in-memory access token. Main-internal only — renderer never sees it.
   * Used by TelemetryService (injected via init()) to authenticate event POSTs.
   */
  accessToken(): string | null {
    return this._accessToken;
  }

  /**
   * Best-effort: post the id_token to the identity server and hold the result
   * in memory.  Never throws — sign-in must never fail due to cloud state.
   *
   * Note: device_id / app_version NOT sent — telemetry decoupled to
   * POST /v1/events (Phase β / O468). getDeviceId() and device-id.ts remain
   * in place for Phase β use.
   *
   * If a KEK is already available (workspace already unlocked), the pending
   * refresh token is committed immediately.  Otherwise commitOrRefresh() is
   * called later at the next unlock seam.
   */
  async acquire(idToken: string): Promise<void> {
    if (!isCloudConfigured()) return;

    let tokens;
    try {
      tokens = await postSession(idToken);
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
    // commit deferred to next unlock seam (lock-channel calls commitOrRefresh).
  }

  /**
   * KEK-wrap and persist a refresh token to CredentialStore.
   * Extracted as a private helper — called by commitPending and refreshOnUnlock.
   */
  private storeRefreshToken(workspaceId: string, kek: Buffer, refreshToken: string): void {
    const aad = buildCloudSessionTokenAad(workspaceId);
    const envelope = encryptToEnvelope(kek, Buffer.from(refreshToken, 'utf8'), aad);
    const bytes = Buffer.from(encodeEnvelope(envelope), 'utf8');
    credentialStore.set(workspaceId, 'cloud-session-token', bytes);
  }

  /**
   * KEK-wrap the pending refresh token and persist it to CredentialStore.
   * Called by commitOrRefresh when _pending is set (new-user / fresh-sign-in path).
   * Idempotent: if no pending token, no-op.
   *
   * Best-effort: logs and swallows errors so the unlock path is never broken.
   */
  private commitPending(workspaceId: string, kek: Buffer): void {
    if (!this._pending) return;
    const { refreshToken } = this._pending;
    try {
      this.storeRefreshToken(workspaceId, kek, refreshToken);
      this._pending = null;
    } catch (err) {
      console.error('[CloudSessionService] commitPending: failed to store refresh token:', err);
      // Do NOT re-throw — unlock must not fail.
    }
  }

  /**
   * Returning-user path: unwrap the stored refresh token, call POST /v1/refresh,
   * and rotate the stored credential on success.
   *
   * Runs the network call in a detached async IIFE so the unlock seam returns
   * immediately. The KEK reference is reused directly — it stays live in
   * LockService memory until the next relock event, which cannot fire during
   * the (short) network window (see module-level KEK lifetime note).
   *
   * Best-effort: no cloud/network failure ever throws out of an unlock seam.
   */
  private refreshOnUnlock(workspaceId: string, kek: Buffer): void {
    const stored = credentialStore.get(workspaceId, 'cloud-session-token');
    if (!stored) return; // no stored credential — no-op

    let refreshToken: string;
    try {
      const env = decodeEnvelope(stored.toString('utf8'));
      const plain = decryptFromEnvelope(kek, env);
      refreshToken = plain.toString('utf8');
    } catch (err) {
      // Tampered or wrong-key envelope — treat as dead token.
      console.warn('[CloudSessionService] refreshOnUnlock: failed to unwrap stored token — clearing:', err);
      credentialStore.delete(workspaceId, 'cloud-session-token');
      this.clearVolatile();
      return;
    }

    // Detached async: unlock seam must not block on network.
    void (async () => {
      try {
        const tokens = await postRefresh(refreshToken);
        if (!tokens) return; // cloud unconfigured — no-op
        this._accessToken = tokens.accessToken;
        // Rotate: replace stored credential with new refresh token (KEK still live).
        this.storeRefreshToken(workspaceId, kek, tokens.refreshToken);
        // Emit refresh telemetry after successful rotation.
        // emit() drains any queued backlog itself on success (mode 'on') — no
        // separate flush() call here (a redundant flush double-sends the queue).
        telemetryService.emit('refresh', tokens.accessToken);
      } catch (err) {
        if (err instanceof CloudAuthError) {
          // Token dead (reuse / expired / family revoked) — clear credential, user must re-sign-in.
          console.warn('[CloudSessionService] refreshOnUnlock: refresh token rejected — clearing credential:', err.message);
          credentialStore.delete(workspaceId, 'cloud-session-token');
          this.clearVolatile();
        } else if (err instanceof CloudOfflineError) {
          // Retryable — keep stored token, retry next unlock.
          console.warn('[CloudSessionService] refreshOnUnlock: server offline — will retry next unlock:', err.message);
        } else {
          console.error('[CloudSessionService] refreshOnUnlock: unexpected error:', err);
        }
      }
    })();
  }

  /**
   * Called at every unlock seam (setup:acknowledge, unlock, unlock-recovery).
   *
   * If _pending (new-user / fresh sign-in): commitPending — KEK-wrap and store.
   * Otherwise (returning user): refreshOnUnlock — unwrap, rotate via /v1/refresh.
   *
   * Replaces the per-seam commitPending call in lock-channel.ts.
   */
  commitOrRefresh(workspaceId: string, kek: Buffer): void {
    if (this._pending) {
      this.commitPending(workspaceId, kek);
      // Emit login telemetry AFTER commit succeeds (token committed = new session).
      // emit() drains any queued backlog itself on success — no separate flush().
      telemetryService.emit('login', this._accessToken);
    } else {
      this.refreshOnUnlock(workspaceId, kek);
    }
  }

  /**
   * Sign-out path: synchronously clear local credential (regardless of network),
   * then fire best-effort POST /v1/revoke detached.
   *
   * MUST be called BEFORE relock() evaporates the KEK — the KEK is needed to
   * unwrap the stored refresh token for the revoke call.
   */
  revokeOnSignOut(workspaceId: string, kek: Buffer): void {
    const stored = credentialStore.get(workspaceId, 'cloud-session-token');
    if (!stored) {
      this.clearVolatile();
      return;
    }

    let refreshToken: string;
    try {
      const env = decodeEnvelope(stored.toString('utf8'));
      const plain = decryptFromEnvelope(kek, env);
      refreshToken = plain.toString('utf8');
    } catch (err) {
      console.warn('[CloudSessionService] revokeOnSignOut: failed to unwrap stored token — skipping revoke:', err);
      credentialStore.delete(workspaceId, 'cloud-session-token');
      this.clearVolatile();
      return;
    }

    // Emit signout telemetry BEFORE clearVolatile() — token still held in memory.
    telemetryService.emit('signout', this._accessToken);

    // Synchronous local sign-out — must complete regardless of network.
    credentialStore.delete(workspaceId, 'cloud-session-token');
    this.clearVolatile();

    // Best-effort: fire revoke detached. Server family expires on its own if offline.
    void postRevoke(refreshToken).catch((err) => {
      console.warn('[CloudSessionService] revokeOnSignOut: revoke request failed (best-effort):', err instanceof Error ? err.message : String(err));
    });
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
