/**
 * platform.auth@1.0 — Google OAuth PKCE identity capability (ADR-309 Part A).
 *
 * Method:
 *   signInWithGoogle(): SignInWithGoogleResult
 *     Opens system browser for Google OAuth PKCE flow. Returns { ok: true, email, googleId }
 *     on success. Returns { ok: false, code: 'not-configured' } when GOOGLE_CLIENT_ID /
 *     GOOGLE_CLIENT_SECRET are absent (renderer falls back to mock dialog in dev).
 *
 * ADR-202: renderer reaches this through bindCapability('platform.auth', '1.0').
 * ADR-304: tokens are discarded in oauth.ts — never returned to renderer.
 * NOT PHI-flagged: OAuth fires at step 1 BEFORE the workspace and KEK exist.
 */

import { signInWithGoogle } from '../auth/oauth.js';
import { registerCapability } from './registry.js';

export type SignInWithGoogleResult =
  | { readonly ok: true; readonly email: string; readonly googleId: string }
  | { readonly ok: false; readonly code: 'not-configured' | 'cancelled' | 'error'; readonly message?: string };

export function registerPlatformAuthCapability(): void {
  registerCapability(
    'platform.auth',
    '1.0',
    async (method) => {
      if (method === 'signInWithGoogle') {
        try {
          const identity = await signInWithGoogle();
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
      throw Object.assign(new Error(`platform.auth: unknown method: ${method}`), {
        code: 'cap.method_not_found',
      });
    },
  );
}
