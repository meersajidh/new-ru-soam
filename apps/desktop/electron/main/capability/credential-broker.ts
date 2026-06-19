/**
 * credential.broker@1.0 — provider-agnostic OAuth2 Flow-A token lifecycle.
 *
 * PHI / trust boundaries (ADR-203, ADR-304, ADR-305, ADR-418, ADR-506 Am1.1, ADR-314):
 *   - The credential NEVER leaves Main. FP-Host bundles never see the token.
 *   - OAuth grant reuses helpers from ../auth/ (PKCE + loopback).
 *   - Client id/secret resolved by Main from baked Vite `define` constants.
 *   - Token stored raw (not KEK-wrapped) — O307f deferred.
 *   - Account identity is broker-discovered, never bundle-asserted (ADR-314 §3).
 *
 * Methods (called by FP-Host bundles via ctx.bindCapability):
 *   status({ provider, accountId? })                                   → { connected: boolean }
 *   grant({ provider, authUrl, tokenUrl, scopes, revokeUrl?,
 *           accountInfoUrl? })                                          → { ok, account?, error? }
 *   revoke({ provider, accountId?, revokeUrl? })                       → null
 *
 * Internal (consumed by brokered-fetch and clearToken):
 *   getValidAccessToken(provider, accountId?, workspaceId?)            → string | null
 *   clearToken(provider, accountId?, workspaceId?)
 *
 * Credential key mapping:
 *   provider 'google-calendar' → credentialStore type 'google-calendar-token'
 *   Account-keyed ref: externalAccountId (e.g. 'user@example.com' or Google sub).
 *   Legacy no-ref key preserved for migration (ADR-314 §4).
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
  readonly externalAccountId: string; // ADR-314: account dimension of the storage key
}

/**
 * Map provider id → credentialStore type string.
 * Preserves the existing 'google-calendar-token' key so a connected user
 * does not have to re-authenticate after the refactor.
 */
function credKey(provider: string): CredentialType {
  if (provider === 'google-calendar') return 'google-calendar-token';
  return `${provider}-token` as CredentialType;
}

function getWorkspaceId(): string | null {
  return workspaceRegistry.getActive() ?? null;
}

/** Read account-keyed token (ref = externalAccountId). */
function readToken(workspaceId: string, provider: string, accountId: string): StoredToken | null {
  const buf = credentialStore.get(workspaceId, credKey(provider), accountId);
  if (!buf) return null;
  try {
    return JSON.parse(buf.toString('utf8')) as StoredToken;
  } catch {
    return null;
  }
}

/** Read legacy no-ref token (pre-ADR-314 single-grant). */
function readLegacyToken(workspaceId: string, provider: string): StoredToken | null {
  const buf = credentialStore.get(workspaceId, credKey(provider));
  if (!buf) return null;
  try {
    return JSON.parse(buf.toString('utf8')) as StoredToken;
  } catch {
    return null;
  }
}

/** Write account-keyed token (ref = externalAccountId). */
function writeToken(workspaceId: string, provider: string, token: StoredToken): void {
  credentialStore.set(
    workspaceId,
    credKey(provider),
    Buffer.from(JSON.stringify(token), 'utf8'),
    token.externalAccountId,
  );
}

/** Delete account-keyed token. */
function deleteToken(workspaceId: string, provider: string, accountId: string): void {
  credentialStore.delete(workspaceId, credKey(provider), accountId);
}

/** Delete legacy no-ref token. */
function deleteLegacyToken(workspaceId: string, provider: string): void {
  credentialStore.delete(workspaceId, credKey(provider));
}

function resolveOAuthCreds(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env['GOOGLE_CLIENT_ID'] ?? __OAUTH_CLIENT_ID__;
  const clientSecret = process.env['GOOGLE_CLIENT_SECRET'] ?? __OAUTH_CLIENT_SECRET__;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

interface AccountMeta {
  externalId: string;
  email: string;
  displayName: string;
}

/**
 * Broker-internal account discovery (ADR-314 §3).
 * NOT apiHosts-gated — same posture as tokenUrl call (Main-internal egress).
 * provider 'google-calendar' → GET https://www.googleapis.com/calendar/v3/calendars/primary
 */
async function discoverAccount(
  provider: string,
  accessToken: string,
  accountInfoUrl?: string,
): Promise<AccountMeta | null> {
  let url: string;
  if (accountInfoUrl) {
    url = accountInfoUrl;
  } else if (provider === 'google-calendar') {
    url = 'https://www.googleapis.com/calendar/v3/calendars/primary';
  } else {
    // Unknown provider — discovery not supported; caller must supply accountInfoUrl.
    return null;
  }

  try {
    const resp = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { id?: string; summary?: string };
    if (!data.id) return null;
    return {
      externalId: data.id,
      email: data.id,
      displayName: data.summary ?? data.id,
    };
  } catch {
    return null;
  }
}

async function refreshAccessToken(
  workspaceId: string,
  provider: string,
  stored: StoredToken,
): Promise<StoredToken | null> {
  const creds = resolveOAuthCreds();
  if (!creds) return null;

  if (!stored.tokenUrl) {
    deleteToken(workspaceId, provider, stored.externalAccountId);
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
    return null;
  }

  if (!resp.ok) {
    if (resp.status === 400 || resp.status === 401) {
      deleteToken(workspaceId, provider, stored.externalAccountId);
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
    externalAccountId: stored.externalAccountId, // preserve account key
  };
  writeToken(workspaceId, provider, newToken);
  return newToken;
}

/** Refresh a legacy (no-ref) token, writing back to the legacy slot. */
async function refreshLegacyToken(
  workspaceId: string,
  provider: string,
  stored: StoredToken,
): Promise<StoredToken | null> {
  const creds = resolveOAuthCreds();
  if (!creds) return null;
  if (!stored.tokenUrl) {
    deleteLegacyToken(workspaceId, provider);
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
    return null;
  }

  if (!resp.ok) {
    if (resp.status === 400 || resp.status === 401) {
      deleteLegacyToken(workspaceId, provider);
    }
    return null;
  }

  const data = (await resp.json()) as { access_token: string; expires_in?: number };
  // Write back to the legacy slot (still no ref) — migration will re-key shortly.
  const refreshed: StoredToken = {
    ...stored,
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 - 60_000,
  };
  credentialStore.set(
    workspaceId,
    credKey(provider),
    Buffer.from(JSON.stringify(refreshed), 'utf8'),
  );
  return refreshed;
}

/**
 * Migrate a legacy provider-keyed grant to an account-keyed grant (ADR-314 §4).
 * Idempotent: no-op if legacy token absent OR account-keyed refs already exist.
 * On failure: leaves state as-is; caller treats provider as disconnected.
 */
async function migrateLegacyGrant(workspaceId: string, provider: string): Promise<void> {
  const existingRefs = credentialStore.listRefs(workspaceId, credKey(provider));
  if (existingRefs.length > 0) return; // already migrated

  let legacy = readLegacyToken(workspaceId, provider);
  if (!legacy) return; // nothing to migrate

  // Ensure a fresh access token before discovery.
  if (Date.now() >= legacy.expiresAt) {
    const refreshed = await refreshLegacyToken(workspaceId, provider, legacy);
    if (!refreshed) return; // can't refresh — leave as-is, force re-grant
    legacy = refreshed;
  }

  const account = await discoverAccount(provider, legacy.accessToken);
  if (!account) return; // discovery failed — leave as-is, force re-grant

  const migratedToken: StoredToken = {
    ...legacy,
    externalAccountId: account.externalId,
  };
  writeToken(workspaceId, provider, migratedToken);
  deleteLegacyToken(workspaceId, provider);
}

/**
 * Return the single account ref for a provider after running migration.
 * Returns null if 0 or >1 account refs exist (caller treats as disconnected/ambiguous).
 */
async function resolveSingleAccountRef(
  workspaceId: string,
  provider: string,
): Promise<string | null> {
  await migrateLegacyGrant(workspaceId, provider);
  const refs = credentialStore.listRefs(workspaceId, credKey(provider));
  return refs.length === 1 ? (refs[0] ?? null) : null;
}

/**
 * Get a valid access token for the given provider, refreshing if expired.
 * Returns null when not connected or refresh failed.
 * Exported for use by brokered-fetch.ts — access token stays in Main.
 */
export async function getValidAccessToken(
  provider: string,
  accountId?: string,
  workspaceId?: string,
): Promise<string | null> {
  const wsId = workspaceId ?? getWorkspaceId();
  if (!wsId) return null;

  const ref = accountId ?? (await resolveSingleAccountRef(wsId, provider));
  if (!ref) return null;

  let token = readToken(wsId, provider, ref);
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
export function clearToken(provider: string, accountId?: string, workspaceId?: string): void {
  const wsId = workspaceId ?? getWorkspaceId();
  if (!wsId) return;
  if (accountId) {
    deleteToken(wsId, provider, accountId);
  } else {
    // Legacy path: clear whatever exists (migration may not have run yet).
    const refs = credentialStore.listRefs(wsId, credKey(provider));
    for (const ref of refs) {
      deleteToken(wsId, provider, ref);
    }
    deleteLegacyToken(wsId, provider);
  }
}

interface GrantArgs {
  provider: string;
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
  revokeUrl?: string;
  accountInfoUrl?: string;
}

interface RevokeArgs {
  provider: string;
  accountId?: string;
  revokeUrl?: string;
}

interface StatusArgs {
  provider: string;
  accountId?: string;
}

export function registerCredentialBrokerCapability(): void {
  registerCapability(
    'credential.broker',
    '1.0',
    async (method, args) => {
      switch (method) {
        case 'status': {
          const { provider, accountId } = args[0] as StatusArgs;
          const wsId = getWorkspaceId();
          if (!wsId) return { connected: false };

          if (accountId) {
            const token = readToken(wsId, provider, accountId);
            return { connected: token !== null };
          }

          // No accountId: run migration then check for any account ref.
          await migrateLegacyGrant(wsId, provider);
          const refs = credentialStore.listRefs(wsId, credKey(provider));
          return { connected: refs.length > 0 };
        }

        case 'grant': {
          const { provider, authUrl, tokenUrl, scopes, accountInfoUrl } = args[0] as GrantArgs;

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

            // Broker-internal account discovery (ADR-314 §3) — not apiHosts-gated.
            const account = await discoverAccount(provider, data.access_token, accountInfoUrl);
            if (!account) {
              return { ok: false, error: 'Account discovery failed — cannot key the grant' };
            }

            const token: StoredToken = {
              accessToken: data.access_token,
              refreshToken: data.refresh_token,
              expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 - 60_000,
              tokenUrl,
              scopes,
              externalAccountId: account.externalId,
            };
            writeToken(wsId, provider, token);
            return { ok: true, account };
          } catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
          }
        }

        case 'revoke': {
          const { provider, accountId, revokeUrl } = args[0] as RevokeArgs;
          const wsId = getWorkspaceId();
          if (!wsId) return null;

          // accountId direct, else resolve the single account via migration.
          const ref = accountId ?? (await resolveSingleAccountRef(wsId, provider));
          const token = ref ? readToken(wsId, provider, ref) : null;
          if (ref) deleteToken(wsId, provider, ref);

          if (token && revokeUrl) {
            try {
              await fetch(`${revokeUrl}?token=${encodeURIComponent(token.refreshToken)}`, {
                method: 'POST',
              });
            } catch {
              // Best-effort; local credential already cleared.
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
