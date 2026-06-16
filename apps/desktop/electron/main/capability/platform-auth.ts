/**
 * platform.auth@1.0 — Google OAuth PKCE identity capability (ADR-309 Part A).
 *
 * Methods:
 *   signInWithGoogle(): SignInWithGoogleResult
 *     Opens system browser for Google OAuth PKCE flow. Returns { ok: true, email, googleId }
 *     on success. Returns { ok: false, code: 'not-configured' } when GOOGLE_CLIENT_ID /
 *     GOOGLE_CLIENT_SECRET are absent — defensive guard only; the app now exits at launch
 *     if credentials are missing, so this code path is not normally reachable.
 *     After obtaining identity, the ID-token is held in memory via holdIdToken() —
 *     NO server contact occurs here. The /v1/session exchange is deferred to
 *     commitOrRefresh() at the unlock/acknowledge seam (ADR-311 §3). This ensures that
 *     abandoning signup mid-wizard leaves no orphan server account or token.
 *     Tokens are never returned to the renderer — only { ok, email, googleId } crosses
 *     the IPC boundary (ADR-202/304).
 *
 *   getCloudSessionStatus(): CloudSessionStatusResult
 *     Returns { ok: true, signedIn: boolean } indicating whether a cloud session exists
 *     for the active workspace (in-memory access token OR stored refresh token).
 *     Returns { ok: false, code: 'no-active-workspace' } when no workspace is active.
 *
 * ADR-202: renderer reaches this through bindCapability('platform.auth', '1.0').
 * ADR-304: tokens are discarded in oauth.ts and never returned to renderer.
 * ADR-311: /v1/session exchange happens in Main at the unlock seam, not at OAuth time.
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

          // Hold the ID-token in memory; the /v1/session exchange is deferred to
          // commitOrRefresh() at the next unlock/acknowledge seam. No server
          // contact here — abandoning signup before that seam leaves no orphan
          // server account. Never throws.
          cloudSessionService.holdIdToken(identity.idToken);

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
