/**
 * CloudSessionService — owns the held-ID-token→committed refresh-token lifecycle
 * for the identity server (ADR-311 §4, O307f).
 *
 * Sign-in flow (new user / fresh sign-in):
 *   1. After Google OAuth, caller passes the id_token to holdIdToken().
 *   2. holdIdToken() stores it in _pendingIdToken — NO server contact yet.
 *   3. At the unlock/acknowledge seam (setup:acknowledge / unlock / unlock-recovery),
 *      lock-channel calls commitOrRefresh() which detects _pendingIdToken and posts
 *      to /v1/session, then KEK-wraps the returned refresh token into CredentialStore.
 *      If the user abandons signup before that seam, no server account is created.
 *
 * Refresh flow (returning user):
 *   commitOrRefresh() finds no _pendingIdToken → calls doRotate(), which unwraps the
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
 * Renderer NEVER sees access, refresh, or ID tokens — only {signedIn: boolean} (ADR-202/304).
 *
 * KEK lifetime note: kekHandle() returns the live Buffer held in LockService memory
 * until the next relock event. The async refresh window (postRefresh / postSession
 * network call) completes well before any relock could fire — the KEK is NOT zeroed
 * by the unlock seam itself, only by the onDidChange(locked=true) handler. Therefore
 * we reuse the live kek reference directly for the post-success re-wrap, without
 * copying. This is documented and intentional (Phase α / O471).
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
  /** ID-token from OAuth, held in memory until the unlock/acknowledge seam.
   *  The /v1/session exchange (and server account creation) is deferred to
   *  commitOrRefresh(). Never sent to renderer. Cleared on clearVolatile(). */
  private _pendingIdToken: string | null = null;

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
   * Hold the OAuth ID-token in memory; the /v1/session exchange is deferred to
   * commitOrRefresh() at the next unlock/acknowledge seam. No server contact here.
   * If cloud is not configured, no-op. Never throws.
   */
  holdIdToken(idToken: string): void {
    if (!isCloudConfigured()) return;
    this._pendingIdToken = idToken;
  }

  /**
   * Detached: POST /v1/session with the held ID-token, then KEK-wrap+store the
   * returned refresh token, schedule rotation, emit login telemetry + session-change.
   * Best-effort — never throws. On offline/auth failure the sign-in simply does not
   * complete (no credential stored); the workspace stays cloud-disconnected.
   */
  private exchangeAndCommit(workspaceId: string, kek: Buffer, idToken: string): void {
    void (async () => {
      try {
        const tokens = await postSession(idToken);
        if (!tokens) return; // cloud unconfigured — no-op
        this._accessToken = tokens.accessToken;
        this.storeRefreshToken(workspaceId, kek, tokens.refreshToken);
        this.scheduleRotation(tokens.expiresIn);
        telemetryService.emit('login', this._accessToken);
        this._emitSessionChange?.(true);
      } catch (err) {
        if (err instanceof CloudOfflineError) {
          console.warn('[CloudSessionService] exchangeAndCommit: server offline — sign-in deferred:', err.message);
        } else if (err instanceof CloudAuthError) {
          console.warn('[CloudSessionService] exchangeAndCommit: id-token rejected:', err.message);
        } else {
          console.error('[CloudSessionService] exchangeAndCommit: unexpected error:', err);
        }
        // Do NOT emit session-change(false) — renderer default is disconnected.
      }
    })();
  }

  /**
   * KEK-wrap and persist a refresh token to CredentialStore.
   * Extracted as a private helper — called by exchangeAndCommit and doRotate.
   */
  private storeRefreshToken(workspaceId: string, kek: Buffer, refreshToken: string): void {
    const aad = buildCloudSessionTokenAad(workspaceId);
    const envelope = encryptToEnvelope(kek, Buffer.from(refreshToken, 'utf8'), aad);
    const bytes = Buffer.from(encodeEnvelope(envelope), 'utf8');
    credentialStore.set(workspaceId, 'cloud-session-token', bytes);
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
   * If _pendingIdToken and the workspace has no stored credential (fresh signup):
   *   exchangeAndCommit — POST /v1/session with the held ID-token, KEK-wrap +
   *   store the result, schedule rotation, emit login telemetry, notify renderer.
   *   All network I/O is detached (best-effort); the unlock seam never blocks.
   * Otherwise (returning user, or no held ID-token):
   *   drop any stale held ID-token, doRotate with telemetry.
   *
   * The `!hasStored` guard prevents re-exchanging an ID-token for a DIFFERENT
   * workspace (e.g. token survived a setActive switch via takePending/restorePending)
   * from overwriting an existing credential on an unrelated workspace.
   *
   * Replaces the per-seam commitPending call in lock-channel.ts.
   */
  commitOrRefresh(workspaceId: string, kek: Buffer): void {
    this._activeWorkspaceId = workspaceId;
    const hasStored = credentialStore.get(workspaceId, 'cloud-session-token') !== null;
    if (this._pendingIdToken && !hasStored) {
      // Fresh workspace, never signed in — exchange the held ID-token now and commit.
      const idToken = this._pendingIdToken;
      this._pendingIdToken = null;
      this.exchangeAndCommit(workspaceId, kek, idToken);
    } else {
      // Existing workspace (or no held token) — drop any stale held token, rotate.
      this._pendingIdToken = null;
      this.doRotate(workspaceId, kek, { emitTelemetry: true });
    }
  }

  /**
   * Temporarily extract the held ID-token so a workspace switch (`setActive`)
   * can preserve it across the outgoing relock, which would otherwise zero it
   * via clearVolatile().
   *
   * Caller is responsible for restoring via restorePending().
   *
   * @returns The current held ID-token (or null if none), clearing _pendingIdToken.
   */
  takePending(): string | null {
    const idToken = this._pendingIdToken;
    this._pendingIdToken = null;
    return idToken;
  }

  /**
   * Restore a held ID-token previously taken with takePending().
   * Replaces any current _pendingIdToken (in practice it is null at this point
   * because clearVolatile() ran during the relock that prompted the take).
   *
   * @param idToken  The snapshot returned by takePending(), or null for no-op.
   */
  restorePending(idToken: string | null): void {
    this._pendingIdToken = idToken;
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
    this._pendingIdToken = null;
    this._activeWorkspaceId = null;
  }
}

export const cloudSessionService = new CloudSessionService();
