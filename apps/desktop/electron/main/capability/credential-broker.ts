/**
 * credential.broker@1.0 — provider-agnostic OAuth2 Flow-A token lifecycle.
 *
 * PHI / trust boundaries (ADR-203, ADR-304, ADR-305, ADR-418, ADR-506 Am1.1):
 *   - The credential NEVER leaves Main. FP-Host bundles never see the token.
 *   - OAuth grant reuses helpers from ../auth/ (PKCE + loopback).
 *   - Client id/secret resolved by Main from baked Vite `define` constants.
 *   - Token stored raw (not KEK-wrapped) — O307f deferred.
 *
 * Methods (called by FP-Host bundles via ctx.bindCapability):
 *   status({ provider })                                          → { connected: boolean }
 *   grant({ provider, authUrl, tokenUrl, scopes, revokeUrl? })   → { ok, error? }
 *   revoke({ provider, revokeUrl? })                             → null
 *
 * Internal (not a method — consumed by brokered-fetch):
 *   getValidAccessToken(provider)                                → string | null
 *
 * Credential key mapping:
 *   provider 'google-calendar' → credentialStore type 'google-calendar-token'
 *   (preserves existing stored grant — no re-auth after refactor).
 */

import { randomBytes } from 'crypto';
import { shell } from 'electron';
import { generateVerifier, generateChallenge } from '../auth/pkce.js';
import { createLoopbackListener } from '../auth/loopback.js';
import type { CredentialType } from '../credentials/index.js';
import { credentialStore } from '../credentials/index.js';
import { workspaceRegistry } from '../workspace/registry.js';
import { registerCapability } from './registry.js';

// Build-time baked OAuth credentials (same Vite `define` pattern as identity — O309c).
// Dev: process.env takes precedence. Prod: falls back to baked constants.
declare const __OAUTH_CLIENT_ID__: string;
declare const __OAUTH_CLIENT_SECRET__: string;

interface StoredToken {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: number; // ms since epoch
  readonly tokenUrl: string;
  readonly scopes: ReadonlyArray<string>;
}

/**
 * Map provider id → credentialStore type string.
 * Preserves the existing 'google-calendar-token' key so a connected user
 * does not have to re-authenticate after the refactor.
 *
 * Cast to CredentialType is intentional — the broker is the sole authority
 * over which providers are supported; the union is extended when a new
 * provider ships (O486, O307f). Unknown providers are rejected by the
 * credentialStore's runtime safeStorage layer rather than at compile time.
 */
function credKey(provider: string): CredentialType {
  if (provider === 'google-calendar') return 'google-calendar-token';
  // Convention for future providers — cast through the union.
  return `${provider}-token` as CredentialType;
}

function getWorkspaceId(): string | null {
  return workspaceRegistry.getActive() ?? null;
}

function readToken(workspaceId: string, provider: string): StoredToken | null {
  const buf = credentialStore.get(workspaceId, credKey(provider));
  if (!buf) return null;
  try {
    return JSON.parse(buf.toString('utf8')) as StoredToken;
  } catch {
    return null;
  }
}

function writeToken(workspaceId: string, provider: string, token: StoredToken): void {
  credentialStore.set(
    workspaceId,
    credKey(provider),
    Buffer.from(JSON.stringify(token), 'utf8'),
  );
}

function deleteToken(workspaceId: string, provider: string): void {
  credentialStore.delete(workspaceId, credKey(provider));
}

function resolveOAuthCreds(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env['GOOGLE_CLIENT_ID'] ?? __OAUTH_CLIENT_ID__;
  const clientSecret = process.env['GOOGLE_CLIENT_SECRET'] ?? __OAUTH_CLIENT_SECRET__;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

async function refreshAccessToken(
  workspaceId: string,
  provider: string,
  stored: StoredToken,
): Promise<StoredToken | null> {
  const creds = resolveOAuthCreds();
  if (!creds) return null;

  // A token persisted before this field existed (or any malformed entry) cannot
  // be refreshed generically — drop it and report disconnected so the UI shows a
  // clean "not connected" state and the user re-grants, rather than throwing
  // "Failed to parse URL from undefined" out of fetch().
  if (!stored.tokenUrl) {
    deleteToken(workspaceId, provider);
    return null;
  }

  let resp: Response;
  try {
    resp = await fetch(stored.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        refresh_token: stored.refreshToken,
        grant_type: 'refresh_token',
      }),
    });
  } catch {
    // Network failure — keep the credential, report transiently unrefreshable.
    return null;
  }

  if (!resp.ok) {
    // 400 with "invalid_grant" = refresh token revoked — clear credential.
    if (resp.status === 400 || resp.status === 401) {
      deleteToken(workspaceId, provider);
    }
    return null;
  }

  const data = (await resp.json()) as { access_token: string; expires_in?: number };
  const newToken: StoredToken = {
    accessToken: data.access_token,
    refreshToken: stored.refreshToken,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 - 60_000,
    tokenUrl: stored.tokenUrl,
    scopes: stored.scopes,
  };
  writeToken(workspaceId, provider, newToken);
  return newToken;
}

/**
 * Get a valid access token for the given provider, refreshing if expired.
 * Returns null when not connected or refresh failed.
 * Exported for use by brokered-fetch.ts — access token stays in Main.
 */
export async function getValidAccessToken(
  provider: string,
  workspaceId?: string,
): Promise<string | null> {
  const wsId = workspaceId ?? getWorkspaceId();
  if (!wsId) return null;

  let token = readToken(wsId, provider);
  if (!token) return null;

  if (Date.now() >= token.expiresAt) {
    token = await refreshAccessToken(wsId, provider, token);
    if (!token) return null;
  }

  return token.accessToken;
}

/**
 * Clear the stored token for a provider (used by brokered-fetch on 401).
 * Exported for use by brokered-fetch.ts.
 */
export function clearToken(provider: string, workspaceId?: string): void {
  const wsId = workspaceId ?? getWorkspaceId();
  if (wsId) deleteToken(wsId, provider);
}

interface GrantArgs {
  provider: string;
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
  revokeUrl?: string;
}

interface RevokeArgs {
  provider: string;
  revokeUrl?: string;
}

interface StatusArgs {
  provider: string;
}

export function registerCredentialBrokerCapability(): void {
  registerCapability(
    'credential.broker',
    '1.0',
    async (method, args) => {
      switch (method) {
        case 'status': {
          const { provider } = args[0] as StatusArgs;
          const wsId = getWorkspaceId();
          if (!wsId) return { connected: false };
          const token = readToken(wsId, provider);
          return { connected: token !== null };
        }

        case 'grant': {
          const { provider, authUrl, tokenUrl, scopes } = args[0] as GrantArgs;

          const creds = resolveOAuthCreds();
          if (!creds) {
            return { ok: false, error: 'Google OAuth credentials not configured' };
          }

          const wsId = getWorkspaceId();
          if (!wsId) {
            return { ok: false, error: 'No active workspace' };
          }

          try {
            const verifier = generateVerifier();
            const challenge = generateChallenge(verifier);
            const state = randomBytes(16).toString('hex');

            const { port, waitForCode } = await createLoopbackListener(state);
            const redirectUri = `http://127.0.0.1:${port}/callback`;

            const params = new URLSearchParams({
              client_id: creds.clientId,
              redirect_uri: redirectUri,
              response_type: 'code',
              scope: scopes.join(' '),
              code_challenge: challenge,
              code_challenge_method: 'S256',
              state,
              access_type: 'offline',
              prompt: 'consent', // force refresh_token on every grant
            });

            await shell.openExternal(`${authUrl}?${params}`);
            const code = await waitForCode();

            const resp = await fetch(tokenUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                code,
                client_id: creds.clientId,
                client_secret: creds.clientSecret,
                redirect_uri: redirectUri,
                code_verifier: verifier,
                grant_type: 'authorization_code',
              }),
            });

            if (!resp.ok) {
              return { ok: false, error: `Token exchange failed: ${resp.status}` };
            }

            const data = (await resp.json()) as {
              access_token: string;
              refresh_token?: string;
              expires_in?: number;
            };

            if (!data.refresh_token) {
              return {
                ok: false,
                error: 'No refresh token received — please revoke and reconnect',
              };
            }

            const token: StoredToken = {
              accessToken: data.access_token,
              refreshToken: data.refresh_token,
              expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 - 60_000,
              tokenUrl,
              scopes,
            };
            writeToken(wsId, provider, token);
            return { ok: true };
          } catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
          }
        }

        case 'revoke': {
          const { provider, revokeUrl } = args[0] as RevokeArgs;
          const wsId = getWorkspaceId();
          if (!wsId) return null;

          const token = readToken(wsId, provider);
          deleteToken(wsId, provider);

          // Best-effort revoke on provider's side.
          if (token && revokeUrl) {
            try {
              await fetch(`${revokeUrl}?token=${encodeURIComponent(token.refreshToken)}`, {
                method: 'POST',
              });
            } catch {
              // Revoke is best-effort; local credential already cleared.
            }
          }
          return null;
        }

        default:
          throw Object.assign(new Error(`credential.broker: unknown method: ${method}`), {
            code: 'cap.method_not_found',
          });
      }
    },
    { phi: true }, // credential data is security-sensitive; lock-gated + first-party-only
  );
}
