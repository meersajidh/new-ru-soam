/**
 * Google Calendar adapter — ADR-305 Flow-A provider for `calendar.readonly`.
 *
 * PHI / trust boundaries (ADR-203, ADR-304, ADR-305, ADR-418):
 *   - The credential NEVER leaves Main. Renderer/FP-Host never see the token.
 *   - OAuth grant is distinct from the identity grant (ADR-310 — separate CredentialStore
 *     entry 'google-calendar-token', separate scope set 'calendar.readonly').
 *   - Outbound HTTPS to Google Calendar API performed by Main (brokered networking).
 *   - Consent is incremental: triggered at Schedule "Connect" action, not at sign-in.
 *
 * Credential storage:
 *   CredentialType 'google-calendar-token', keyed per-workspace (ADR-304 §"namespace").
 *   Stored as JSON: { accessToken, refreshToken, expiresAt }.
 *   raw (not KEK-wrapped) in P0 — calendar.readonly walk-up impact is low (read-only,
 *   no PHI in P0). KEK-wrapping deferred to O307f.
 *
 * OAuth reuses shared helpers from ../auth/ (PKCE + loopback — same pattern
 * as identity OAuth, separate grant/scope/storage).
 */

import { randomBytes } from 'crypto';
import { shell } from 'electron';
import { generateVerifier, generateChallenge } from '../auth/pkce.js';
import { createLoopbackListener } from '../auth/loopback.js';
import { credentialStore } from '../credentials/index.js';
import { workspaceRegistry } from '../workspace/registry.js';
import type { CalendarProvider, CalendarEvent, EventRange, ProviderStatus } from './provider.js';

// Build-time baked OAuth credentials (same Vite `define` pattern as identity — O309c).
// Dev: process.env takes precedence. Prod: falls back to baked constants.
declare const __OAUTH_CLIENT_ID__: string;
declare const __OAUTH_CLIENT_SECRET__: string;

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

// Calendar-specific scope — DISTINCT from identity ('openid email profile').
// ADR-310: no calendar scope in identity grant.
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';

const GCAL_API_BASE = 'https://www.googleapis.com/calendar/v3';

interface StoredToken {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: number; // ms since epoch
}

function getWorkspaceId(): string | null {
  return workspaceRegistry.getActive() ?? null;
}

function readToken(workspaceId: string): StoredToken | null {
  const buf = credentialStore.get(workspaceId, 'google-calendar-token');
  if (!buf) return null;
  try {
    return JSON.parse(buf.toString('utf8')) as StoredToken;
  } catch {
    return null;
  }
}

function writeToken(workspaceId: string, token: StoredToken): void {
  credentialStore.set(workspaceId, 'google-calendar-token', Buffer.from(JSON.stringify(token), 'utf8'));
}

function deleteToken(workspaceId: string): void {
  credentialStore.delete(workspaceId, 'google-calendar-token');
}

function resolveOAuthCreds(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env['GOOGLE_CLIENT_ID'] ?? __OAUTH_CLIENT_ID__;
  const clientSecret = process.env['GOOGLE_CLIENT_SECRET'] ?? __OAUTH_CLIENT_SECRET__;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/**
 * Refresh an expired access token using the stored refresh token.
 * Returns updated StoredToken on success, null if refresh token is revoked.
 */
async function refreshAccessToken(
  workspaceId: string,
  stored: StoredToken,
): Promise<StoredToken | null> {
  const creds = resolveOAuthCreds();
  if (!creds) return null;

  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      refresh_token: stored.refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!resp.ok) {
    // 400 with "invalid_grant" = refresh token revoked — clear credential.
    if (resp.status === 400 || resp.status === 401) {
      deleteToken(workspaceId);
    }
    return null;
  }

  const data = (await resp.json()) as { access_token: string; expires_in?: number };
  const newToken: StoredToken = {
    accessToken: data.access_token,
    refreshToken: stored.refreshToken, // refresh token stays until explicitly revoked
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 - 60_000, // 1 min early buffer
  };
  writeToken(workspaceId, newToken);
  return newToken;
}

/**
 * Get a valid access token, refreshing if expired. Returns null when disconnected.
 */
async function getValidAccessToken(workspaceId: string): Promise<string | null> {
  let token = readToken(workspaceId);
  if (!token) return null;

  if (Date.now() >= token.expiresAt) {
    token = await refreshAccessToken(workspaceId, token);
    if (!token) return null;
  }

  return token.accessToken;
}

export class GoogleCalendarAdapter implements CalendarProvider {
  async getStatus(): Promise<ProviderStatus> {
    const wsId = getWorkspaceId();
    if (!wsId) return { connected: false, providerName: 'Google Calendar' };
    const token = readToken(wsId);
    return { connected: token !== null, providerName: 'Google Calendar' };
  }

  async connect(): Promise<{ ok: boolean; error?: string }> {
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
        scope: CALENDAR_SCOPE,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state,
        access_type: 'offline',
        prompt: 'consent', // force refresh_token on every grant
      });

      await shell.openExternal(`${GOOGLE_AUTH_URL}?${params}`);
      const code = await waitForCode();

      const resp = await fetch(GOOGLE_TOKEN_URL, {
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
        // Google only returns refresh_token on first grant or with prompt=consent.
        return { ok: false, error: 'No refresh token received — please revoke and reconnect' };
      }

      const token: StoredToken = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 - 60_000,
      };
      writeToken(wsId, token);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async disconnect(): Promise<void> {
    const wsId = getWorkspaceId();
    if (!wsId) return;

    const token = readToken(wsId);
    deleteToken(wsId);

    // Best-effort revoke on Google's side.
    if (token) {
      try {
        await fetch(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(token.refreshToken)}`, {
          method: 'POST',
        });
      } catch {
        // Revoke is best-effort; local credential already cleared.
      }
    }
  }

  async listEvents(range: EventRange): Promise<ReadonlyArray<CalendarEvent>> {
    const wsId = getWorkspaceId();
    if (!wsId) throw new Error('No active workspace');

    const accessToken = await getValidAccessToken(wsId);
    if (!accessToken) {
      throw Object.assign(new Error('Google Calendar: not connected'), {
        code: 'calendar.not_connected',
      });
    }

    // Fetch from Google Calendar API — primary calendar only in P0.
    // ADR-203: Main makes the outbound call; credential injected here, never leaves.
    const params = new URLSearchParams({
      timeMin: new Date(range.from).toISOString(),
      timeMax: new Date(range.to).toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250',
    });

    const resp = await fetch(`${GCAL_API_BASE}/calendars/primary/events?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!resp.ok) {
      if (resp.status === 401) {
        // Access token invalid despite refresh attempt — clear and report.
        const wsIdForDelete = getWorkspaceId();
        if (wsIdForDelete) deleteToken(wsIdForDelete);
      }
      throw new Error(`Google Calendar API error: ${resp.status}`);
    }

    const data = (await resp.json()) as {
      items?: Array<{
        id: string;
        summary?: string;
        start?: { dateTime?: string; date?: string };
        end?: { dateTime?: string; date?: string };
        organizer?: { displayName?: string; email?: string };
      }>;
      summary?: string;
    };

    const calendarName = data.summary ?? 'Calendar';

    return (data.items ?? []).map((item) => {
      const startRaw = item.start?.dateTime ?? item.start?.date ?? '';
      const endRaw = item.end?.dateTime ?? item.end?.date ?? '';
      const allDay = !item.start?.dateTime;
      return {
        id: item.id,
        title: item.summary ?? '(No title)',
        start: startRaw,
        end: endRaw,
        allDay,
        calendarId: 'primary',
        calendarName,
      };
    });
  }
}

export const googleCalendarAdapter = new GoogleCalendarAdapter();
