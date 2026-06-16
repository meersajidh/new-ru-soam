/**
 * platform.auth@1.0 — Google OAuth PKCE identity capability (ADR-309 Part A).
 *
 * Methods:
 *   signInWithGoogle(): SignInWithGoogleResult
 *     Opens system browser for Google OAuth PKCE flow. Returns { ok: true, email, googleId }
 *     on success. Returns { ok: false, code: 'not-configured' } when GOOGLE_CLIENT_ID /
 *     GOOGLE_CLIENT_SECRET are absent — defensive guard only; the app now exits at launch
 *     if credentials are missing, so this code path is not normally reachable.
 *     After obtaining identity, best-effort contacts the identity server (ADR-311 §3) to
 *     acquire a session JWT + refresh token (CloudSessionService.acquire).  Server contact
 *     is never returned to the renderer — only { ok, email, googleId } crosses the IPC
 *     boundary (ADR-202/304).
 *
 *   getCloudSessionStatus(): CloudSessionStatusResult
 *     Returns { ok: true, signedIn: boolean } indicating whether a cloud session exists
 *     for the active workspace (in-memory access token OR stored refresh token).
 *     Returns { ok: false, code: 'no-active-workspace' } when no workspace is active.
 *
 * ADR-202: renderer reaches this through bindCapability('platform.auth', '1.0').
 * ADR-304: tokens are discarded in oauth.ts and never returned to renderer.
 * ADR-311: id_token posted to identity server in Main only; result stored KEK-wrapped.
 * NOT PHI-flagged: OAuth fires at step 1 BEFORE the workspace and KEK exist.
 */

import { signInWithGoogle } from '../auth/oauth.js';
import { registerCapability, getActiveLockService } from './registry.js';
import { cloudSessionService } from '../cloud/session-service.js';
import { isCloudConfigured } from '../cloud/identity-client.js';
import { workspaceRegistry } from '../workspace/registry.js';

export type SignInWithGoogleResult =
  | { readonly ok: true; readonly email: string; readonly googleId: string }
  | { readonly ok: false; readonly code: 'not-configured' | 'cancelled' | 'error'; readonly message?: string };

export type CloudSessionStatusResult =
  | { readonly ok: true; readonly signedIn: boolean; readonly configured: boolean }
  | { readonly ok: false; readonly code: 'no-active-workspace' };

export function registerPlatformAuthCapability(): void {
  registerCapability(
    'platform.auth',
    '1.0',
    async (method) => {
      if (method === 'signInWithGoogle') {
        try {
          const identity = await signInWithGoogle();

          // Best-effort: contact identity server and hold refresh token in memory.
          // Never throws — sign-in must not block on or fail due to server state.
          await cloudSessionService.acquire(identity.idToken);

          // O475 commit-while-unlocked: if a workspace is already active and
          // unlocked (e.g. Settings → Reconnect to sync), commit the pending
          // token immediately so the caller sees signedIn:true on the next
          // getCloudSessionStatus call without waiting for the next unlock seam.
          // Guard: both workspaceId and a live KEK must be present; onboarding
          // (no active workspace) and already-locked workspaces are unaffected.
          const reconnectWorkspaceId = workspaceRegistry.getActive();
          if (reconnectWorkspaceId) {
            const lockSvc = getActiveLockService();
            if (lockSvc) {
              const kek = lockSvc.kekHandle();
              if (kek !== null) {
                cloudSessionService.commitOrRefresh(reconnectWorkspaceId, kek);
              }
            }
          }

          const result: SignInWithGoogleResult = {
            ok: true,
            email: identity.email,
            googleId: identity.googleId,
          };
          return result;
        } catch (err) {
          const code =
            err instanceof Error && (err as Error & { code?: string }).code === 'not-configured'
              ? 'not-configured'
              : 'error';
          const result: SignInWithGoogleResult = {
            ok: false,
            code,
            message: err instanceof Error ? err.message : String(err),
          };
          return result;
        }
      }

      if (method === 'getCloudSessionStatus') {
        const workspaceId = workspaceRegistry.getActive();
        if (!workspaceId) {
          const result: CloudSessionStatusResult = { ok: false, code: 'no-active-workspace' };
          return result;
        }
        const { signedIn } = cloudSessionService.getStatus(workspaceId);
        const configured = isCloudConfigured();
        const result: CloudSessionStatusResult = { ok: true, signedIn, configured };
        return result;
      }

      throw Object.assign(new Error(`platform.auth: unknown method: ${method}`), {
        code: 'cap.method_not_found',
      });
    },
  );
}
