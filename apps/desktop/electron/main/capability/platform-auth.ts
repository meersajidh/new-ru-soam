/**
 * platform.auth@1.0 — Google OAuth PKCE identity capability (ADR-309 Part A).
 *
 * Methods:
 *   signInWithGoogle(arg?: { intent?: 'signup' | 'reconnect' }): SignInWithGoogleResult
 *     Opens system browser for Google OAuth PKCE flow.
 *
 *     Intent routing (O479):
 *       'signup' (default): holdIdToken() only. No server contact. Exchange deferred to
 *         commitOrRefresh() at the unlock/acknowledge seam (ADR-311 §3). Ensures
 *         abandoning the wizard leaves no orphan server account.
 *       'reconnect': holdIdToken() + immediate commitOrRefresh() if the active workspace
 *         is unlocked. BEFORE committing, compares the authenticated googleId/email
 *         against the bound identity stored in the workspace. On mismatch returns
 *         { ok: false, code: 'identity-mismatch', boundEmail } without holding any
 *         token — prevents silently re-binding a workspace to a different account (O479).
 *
 *     Identity comparison is Main-side only (unspoofable). Intent from the renderer
 *     is a router hint, not a trust boundary — even a spoofed intent cannot bypass
 *     the mismatch gate because the bound identity is read from the KEK-encrypted
 *     identity.envelope on disk.
 *
 *     Tokens are never returned to the renderer — only { ok, email, googleId } or the
 *     mismatch failure crosses the IPC boundary (ADR-202/304).
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
  | {
      readonly ok: false;
      readonly code: 'not-configured' | 'cancelled' | 'error' | 'identity-mismatch';
      readonly message?: string;
      readonly boundEmail?: string;
    };

export type CloudSessionStatusResult =
  | { readonly ok: true; readonly signedIn: boolean; readonly configured: boolean }
  | { readonly ok: false; readonly code: 'no-active-workspace' };

export function registerPlatformAuthCapability(): void {
  registerCapability(
    'platform.auth',
    '1.0',
    async (method, args) => {
      if (method === 'signInWithGoogle') {
        try {
          const identity = await signInWithGoogle();

          // Read caller intent; defaults to 'signup' for the add-account wizard.
          const arg = args[0] as { intent?: 'signup' | 'reconnect' } | undefined;
          const intent = arg?.intent ?? 'signup';

          if (intent === 'reconnect') {
            // O479: gate — verify the authenticated account matches the workspace
            // bound identity before holding any token or contacting the server.
            // Identity comparison is Main-side (KEK-encrypted envelope on disk).
            const activeId = workspaceRegistry.getActive();
            const lockSvc = activeId ? getActiveLockService() : null;

            if (activeId && lockSvc && !lockSvc.isLocked()) {
              const bound = lockSvc.getIdentity();
              if (bound === null) {
                // Reconnect requires an established bound identity to verify against.
                // A null here means a missing/corrupt identity envelope — reject
                // rather than bind the workspace to an unverified account.
                const result: SignInWithGoogleResult = {
                  ok: false,
                  code: 'error',
                  message: 'Workspace identity unavailable',
                };
                return result;
              }
              // Prefer googleId (exact); fall back to case-insensitive email for
              // pre-O307g envelopes that lack googleId.
              const matches = bound.googleId
                ? bound.googleId === identity.googleId
                : bound.email.toLowerCase() === identity.email.toLowerCase();

              if (!matches) {
                // Reject — do NOT hold token, do NOT commit.
                const result: SignInWithGoogleResult = {
                  ok: false,
                  code: 'identity-mismatch',
                  boundEmail: bound.email,
                };
                return result;
              }

              // Match: hold and commit immediately.
              cloudSessionService.holdIdToken(identity.idToken);
              const kek = lockSvc.kekHandle();
              if (kek !== null) {
                cloudSessionService.commitOrRefresh(activeId, kek);
              }
            }
            // No active/unlocked workspace: do NOT hold. A lingering pending token
            // could bind to the wrong workspace at a later unlock seam. The
            // reconnect path normally only runs while unlocked, so this is a benign
            // no-op — the success result simply carries the authenticated identity.
          } else {
            // 'signup' (default): hold only. Exchange deferred to the
            // unlock/acknowledge seam so abandoning the wizard leaves no orphan
            // server account (ADR-311 §3).
            cloudSessionService.holdIdToken(identity.idToken);
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
