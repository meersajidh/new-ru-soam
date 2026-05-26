/**
 * Google OAuth PKCE + loopback flow (ADR-309 Part A).
 *
 * Scopes: openid email profile ONLY (ADR-310 defers calendar).
 * Client secret read from process.env (Google "Desktop app" clients require
 * it for code exchange even with PKCE).
 *
 * After exchange: decode id_token payload locally → { email, googleId, name?, picture? }.
 * Access token, refresh token, and id_token are discarded immediately.
 * Nothing is written to CredentialStore (deferred O309a).
 */

import { randomBytes } from 'crypto';
import { shell } from 'electron';
import { generateVerifier, generateChallenge } from './pkce.js';
import { createLoopbackListener } from './loopback.js';

export interface GoogleIdentityClaims {
  readonly email: string;
  readonly googleId: string;
  readonly name?: string;
  readonly picture?: string;
}

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

// Identity-only scopes — no calendar (ADR-310).
const SCOPES = 'openid email profile';

/**
 * Decode the JWT payload section without signature verification.
 * Signature verification is deferred to the backend (ADR-309 Part B).
 */
function decodeIdToken(idToken: string): {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
} {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('invalid id_token structure');
  const payload = Buffer.from(parts[1]!, 'base64url').toString('utf8');
  return JSON.parse(payload) as { sub: string; email?: string; name?: string; picture?: string };
}

/**
 * Run the full PKCE + loopback OAuth flow.
 *
 * Returns verified identity claims extracted from the id_token.
 * All tokens are discarded after claim extraction — never returned to caller.
 *
 * @throws if GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are unset, OAuth fails,
 *         or the id_token is malformed.
 */
export async function signInWithGoogle(): Promise<GoogleIdentityClaims> {
  const clientId = process.env['GOOGLE_CLIENT_ID'];
  const clientSecret = process.env['GOOGLE_CLIENT_SECRET'];

  if (!clientId || !clientSecret) {
    throw Object.assign(new Error('Google OAuth credentials not configured'), {
      code: 'not-configured',
    });
  }

  const verifier = generateVerifier();
  const challenge = generateChallenge(verifier);
  const state = randomBytes(16).toString('hex');

  const { port, waitForCode } = await createLoopbackListener(state);
  const redirectUri = `http://127.0.0.1:${port}/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    access_type: 'offline',
    prompt: 'consent',
  });

  await shell.openExternal(`${GOOGLE_AUTH_URL}?${params}`);

  const code = await waitForCode();

  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code_verifier: verifier,
      grant_type: 'authorization_code',
    }),
  });

  if (!resp.ok) {
    throw new Error(`Google token exchange failed: ${resp.status} ${await resp.text()}`);
  }

  const data = (await resp.json()) as {
    id_token: string;
    access_token?: string;
    refresh_token?: string;
  };

  // Decode id_token to extract claims — no signature verification (Part B).
  const claims = decodeIdToken(data.id_token);

  if (!claims.sub) {
    throw new Error('id_token missing sub claim');
  }
  if (!claims.email) {
    throw new Error('id_token missing email claim');
  }

  // Discard all tokens immediately — never expose to caller or renderer.
  const identity: GoogleIdentityClaims = {
    email: claims.email,
    googleId: claims.sub,
    ...(claims.name !== undefined ? { name: claims.name } : {}),
    ...(claims.picture !== undefined ? { picture: claims.picture } : {}),
  };

  return identity;
}
