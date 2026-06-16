/**
 * CloudSessionService — owns the pending→committed refresh-token lifecycle
 * for the identity server (ADR-311 §4, O307f).
 *
 * Acquire flow (new user / fresh sign-in):
 *   1. After Google OAuth, caller passes the id_token to acquire().
 *   2. acquire() posts to /v1/session (best-effort; never throws to caller).
 *   3. On success: access token held in memory; refresh token held as _pending.
 *      expiresIn is also stashed so commitOrRefresh can schedule rotation.
 *   4. At the unlock seam (setup:acknowledge / unlock / unlock-recovery),
 *      lock-channel calls commitOrRefresh() which detects _pending and KEK-wraps
 *      the refresh token into CredentialStore.
 *
 * Refresh flow (returning user):
 *   commitOrRefresh() finds no _pending → calls doRotate(), which unwraps the
 *   stored refresh token and rotates it via POST /v1/refresh. On success a
 *   proactive rotation timer is scheduled for (expiresIn - 60) seconds so the
 *   session never goes stale while the workspace is unlocked.
 *
 * Proactive rotation:
 *   scheduleRotation() sets a single _rotationTimer. When it fires, rotateNow()
 *   calls doRotate() silently (no telemetry). On CloudAuthError the credential
 *   is cleared, the session-change emitter fires signedIn=false, and the renderer
 *   shows the reconnect status-bar indicator. On CloudOfflineError a short retry
 *   (~60 s) is scheduled. clearVolatile() always calls stopRotation().
 *
 * Delete-account flow (explicit account-end, NOT routine sign-out):
 *   deleteCloudAccount() emits account_deleted telemetry (consent-gated), synchronously
 *   clears local credential, then fires best-effort POST /v1/account/delete (detached).
 *   Routine sign-out / lock keeps the credential and rotates it on next unlock.
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
  postAccountDelete,
  isCloudConfigured,
  CloudOfflineError,
  CloudAuthError,
} from './identity-client.js';
import { telemetryService } from './telemetry.js';

/**
 * Minimum delay before proactive rotation fires, even when expiresIn is very short.
 * Prevents rapid-fire retries on tokens that expire in < 60 s (unusual but safe).
 */
const MIN_ROTATION_DELAY_MS = 30_000;

/**
 * How far before expiry to rotate (seconds). Fires at expiresIn - ROTATION_LEAD_SEC.
 * Server access JWTs are currently 15 min (900 s); we rotate at 840 s = 60 s before expiry.
 */
const ROTATION_LEAD_SEC = 60;

/**
 * Retry delay on CloudOfflineError during proactive rotation (60 s).
 */
const OFFLINE_RETRY_DELAY_MS = 60_000;

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
  private _pending: { refreshToken: string; expiresIn: number } | null = null;

  /** Current in-memory access token (short-lived; not persisted). */
  private _accessToken: string | null = null;

  /** Workspace id of the currently active session (set at commitOrRefresh, cleared at clearVolatile). */
  private _activeWorkspaceId: string | null = null;

  /** Proactive rotation timer. Unref'd so it never holds the process open. */
  private _rotationTimer: NodeJS.Timeout | null = null;

  /**
   * Injected KEK provider — returns live KEK Buffer if workspace is unlocked,
   * null if locked. Avoids import cycle (injected from main/index.ts).
   */
  private _kekProvider: (() => Buffer | null) | null = null;

  /**
   * Injected session-change emitter. Called with signedIn=true when rotation
   * succeeds or a pending commit occurs; signedIn=false when the token is dead.
   * Drives the renderer status-bar indicator via cloud.session.changed event.
   * Never called from clearVolatile (relock ≠ dead token — the cred survives).
   */
  private _emitSessionChange: ((signedIn: boolean) => void) | null = null;

  /**
   * Wire injected dependencies. Called once at Main boot (mirror telemetry.init).
   *
   * @param kekProvider    Returns live KEK when workspace unlocked, null when locked.
   * @param emitSessionChange  Called with signedIn when session state changes.
   */
  init(kekProvider: () => Buffer | null, emitSessionChange: (signedIn: boolean) => void): void {
    this._kekProvider = kekProvider;
    this._emitSessionChange = emitSessionChange;
  }

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
    this._pending = { refreshToken: tokens.refreshToken, expiresIn: tokens.expiresIn };
    // commit deferred to next unlock seam (lock-channel calls commitOrRefresh).
  }

  /**
   * KEK-wrap and persist a refresh token to CredentialStore.
   * Extracted as a private helper — called by commitPending and doRotate.
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
    const { refreshToken, expiresIn } = this._pending;
    try {
      this.storeRefreshToken(workspaceId, kek, refreshToken);
      this._pending = null;
      // Schedule proactive rotation from the stashed expiresIn.
      this.scheduleRotation(expiresIn);
    } catch (err) {
      console.error('[CloudSessionService] commitPending: failed to store refresh token:', err);
      // Do NOT re-throw — unlock must not fail.
    }
  }

  /**
   * Core rotation logic shared between the unlock path and the proactive timer.
   *
   * Steps:
   *   1. Unwrap stored refresh token from CredentialStore.
   *   2. POST /v1/refresh.
   *   3. On success: update _accessToken, rotate stored credential, schedule next
   *      rotation, emit session-change(true). If emitTelemetry, emit 'refresh' event.
   *   4. On CloudAuthError: credential dead — delete it, clearVolatile,
   *      emit session-change(false).
   *   5. On CloudOfflineError: keep cred, schedule a short offline retry.
   *   6. On unwrap failure: treat as dead — delete cred, clearVolatile,
   *      emit session-change(false).
   *
   * Runs the network call in a detached async IIFE so the caller returns
   * immediately. Best-effort — never throws.
   *
   * @param opts.emitTelemetry  True for unlock path (heartbeat); false for silent timer rotations.
   */
  private doRotate(workspaceId: string, kek: Buffer, opts: { emitTelemetry: boolean }): void {
    const stored = credentialStore.get(workspaceId, 'cloud-session-token');
    if (!stored) return; // no stored credential — no-op

    let refreshToken: string;
    try {
      const env = decodeEnvelope(stored.toString('utf8'));
      const plain = decryptFromEnvelope(kek, env);
      refreshToken = plain.toString('utf8');
    } catch (err) {
      // Tampered or wrong-key envelope — treat as dead token.
      console.warn('[CloudSessionService] doRotate: failed to unwrap stored token — clearing:', err);
      credentialStore.delete(workspaceId, 'cloud-session-token');
      this.clearVolatile();
      this._emitSessionChange?.(false);
      return;
    }

    // Detached async: unlock seam / timer must not block on network.
    void (async () => {
      try {
        const tokens = await postRefresh(refreshToken);
        if (!tokens) return; // cloud unconfigured — no-op
        this._accessToken = tokens.accessToken;
        // Rotate: replace stored credential with new refresh token (KEK still live).
        this.storeRefreshToken(workspaceId, kek, tokens.refreshToken);
        // Schedule next proactive rotation.
        this.scheduleRotation(tokens.expiresIn);
        // Notify renderer of live session.
        this._emitSessionChange?.(true);
        if (opts.emitTelemetry) {
          // Emit refresh telemetry after successful rotation.
          // emit() drains any queued backlog itself on success (mode 'on') — no
          // separate flush() call here (a redundant flush double-sends the queue).
          telemetryService.emit('refresh', tokens.accessToken);
        }
      } catch (err) {
        if (err instanceof CloudAuthError) {
          // Token dead (reuse / expired / family revoked) — clear credential, user must re-sign-in.
          console.warn('[CloudSessionService] doRotate: refresh token rejected — clearing credential:', err.message);
          credentialStore.delete(workspaceId, 'cloud-session-token');
          this.clearVolatile();
          this._emitSessionChange?.(false);
        } else if (err instanceof CloudOfflineError) {
          // Retryable — keep stored token, retry after short delay.
          console.warn('[CloudSessionService] doRotate: server offline — scheduling retry:', err.message);
          this.scheduleRotation(OFFLINE_RETRY_DELAY_MS / 1000);
        } else {
          console.error('[CloudSessionService] doRotate: unexpected error:', err);
        }
      }
    })();
  }

  /**
   * Called at every unlock seam (setup:acknowledge, unlock, unlock-recovery).
   *
   * If _pending (new-user / fresh sign-in): commitPending — KEK-wrap and store.
   * Otherwise (returning user): doRotate with telemetry.
   *
   * Replaces the per-seam commitPending call in lock-channel.ts.
   */
  commitOrRefresh(workspaceId: string, kek: Buffer): void {
    this._activeWorkspaceId = workspaceId;
    if (this._pending) {
      this.commitPending(workspaceId, kek);
      // Emit login telemetry AFTER commit succeeds (token committed = new session).
      // emit() drains any queued backlog itself on success — no separate flush().
      telemetryService.emit('login', this._accessToken);
      // Notify renderer: session is live.
      this._emitSessionChange?.(true);
    } else {
      this.doRotate(workspaceId, kek, { emitTelemetry: true });
    }
  }

  /**
   * Schedule the next proactive rotation.
   *
   * Delay = max((expiresInSec - ROTATION_LEAD_SEC) * 1000, MIN_ROTATION_DELAY_MS).
   * Timer is unref'd so it never holds the process open.
   * Replaces any existing timer.
   */
  private scheduleRotation(expiresInSec: number): void {
    this.stopRotation();
    const delayMs = Math.max((expiresInSec - ROTATION_LEAD_SEC) * 1000, MIN_ROTATION_DELAY_MS);
    const timer = setTimeout(() => {
      this.rotateNow();
    }, delayMs);
    timer.unref();
    this._rotationTimer = timer;
  }

  /**
   * Fire a proactive rotation. Called by the timer.
   * Bails early if no active workspace (signed out) or KEK unavailable (relocked).
   * On relock: stop timer, do NOT clear credential (credential survives lock/relock).
   */
  private rotateNow(): void {
    const wsId = this._activeWorkspaceId;
    if (!wsId) {
      this.stopRotation();
      return;
    }
    const kek = this._kekProvider?.() ?? null;
    if (kek === null) {
      // Workspace relocked mid-session — stop rotation, keep credential.
      this.stopRotation();
      return;
    }
    // Silent rotation: no telemetry.
    this.doRotate(wsId, kek, { emitTelemetry: false });
  }

  /**
   * Cancel any pending rotation timer.
   */
  private stopRotation(): void {
    if (this._rotationTimer !== null) {
      clearTimeout(this._rotationTimer);
      this._rotationTimer = null;
    }
  }

  /**
   * Explicit account-end path (delete-account only — NOT routine sign-out or lock).
   * Routine sign-out keeps the credential; this is reserved for when the user
   * deliberately destroys the workspace (ADR-311 Am1 A1.1/A1.2, Am2 O477).
   *
   * Synchronously clears the local credential, emits the `account_deleted`
   * telemetry event (consent-gated via TelemetryService), then fires best-effort
   * POST /v1/account/delete detached (revokes family + soft-deletes account server-side).
   *
   * MUST be called BEFORE relock() evaporates the KEK — the KEK is needed to
   * unwrap the stored refresh token for the delete call.
   */
  deleteCloudAccount(workspaceId: string, kek: Buffer): void {
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
      console.warn('[CloudSessionService] deleteCloudAccount: failed to unwrap stored token — skipping delete:', err);
      credentialStore.delete(workspaceId, 'cloud-session-token');
      this.clearVolatile();
      return;
    }

    // Emit account_deleted telemetry BEFORE clearVolatile() — token still held in memory.
    // Consent-gated by TelemetryService (cloud.telemetryMode); no-op if off.
    telemetryService.emit('account_deleted', this._accessToken);

    // Synchronous local disconnect — must complete regardless of network.
    credentialStore.delete(workspaceId, 'cloud-session-token');
    this.clearVolatile();

    // Best-effort: fire account delete detached. Server records soft-delete; family
    // expires on its own if offline. Unknown token → server returns 204 (idempotent).
    void postAccountDelete(refreshToken).catch((err) => {
      console.warn('[CloudSessionService] deleteCloudAccount: account delete request failed (best-effort):', err instanceof Error ? err.message : String(err));
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
   * Drop volatile state (in-memory access token + pending refresh + rotation timer).
   * Called on relock, sign-out, and delete-account. The stored KEK-wrapped refresh
   * token persists in CredentialStore for the next unlock (relock/sign-out) or is
   * absent (delete-account already deleted it before calling this).
   *
   * Does NOT emit session-change — relock ≠ dead token. The renderer's
   * workspace-scoped status-bar entry hides on the lock screen automatically.
   */
  clearVolatile(): void {
    this.stopRotation();
    this._accessToken = null;
    this._pending = null;
    this._activeWorkspaceId = null;
  }
}

export const cloudSessionService = new CloudSessionService();
