/**
 * Thin HTTP client for the ru-soam identity service (ADR-311 §1–3).
 *
 * Base URL resolved from process.env first (dev / CI), then the build-time
 * baked constant __IDENTITY_BASE_URL__ (prod fallback) — same precedence as
 * OAuth credentials.
 *
 * When no URL is configured, cloud is DISABLED and all methods no-op (return
 * null / false).  Sign-in MUST NOT fail due to cloud being unconfigured or
 * unreachable — every call is best-effort.
 *
 * Phase α (O471): postSession / postRefresh / postRevoke are FUNCTIONAL AUTH only.
 * Telemetry (device_id / app_version / session_events) is decoupled to
 * POST /v1/events (Phase β / O468).
 */

// Build-time baked identity base URL (prod fallback). Baked by vite.main.config.ts
// from IDENTITY_BASE_URL env var at package time. Empty when not set.
declare const __IDENTITY_BASE_URL__: string;

/**
 * Thrown on non-retryable auth failure: HTTP 401 or other 4xx from the identity
 * server, indicating the refresh token is dead (reuse-detected / expired /
 * family revoked).  Distinct from CloudOfflineError (network/timeout/5xx = retryable).
 */
export class CloudAuthError extends Error {
  readonly statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'CloudAuthError';
    this.statusCode = statusCode;
  }
}

/** Thrown on network error, timeout, or non-2xx response from the identity server. */
export class CloudOfflineError extends Error {
  readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'CloudOfflineError';
    this.cause = cause;
  }
}

/** Resolved session tokens from POST /v1/session. */
export interface SessionTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresIn: number;
}

/** Server response shape (snake_case). */
interface SessionResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

/**
 * A single telemetry event posted to POST /v1/events.
 * account_id is derived server-side from the JWT — do NOT send it.
 */
export interface TelemetryEvent {
  event_type: 'login' | 'refresh' | 'signout';
  device_id?: string;
  app_version?: string;
}

const REQUEST_TIMEOUT_MS = 10_000;

function resolveBaseUrl(): string {
  return (process.env['IDENTITY_BASE_URL'] || __IDENTITY_BASE_URL__).replace(/\/$/, '');
}

/**
 * True when a non-empty identity base URL is configured (either at runtime
 * via IDENTITY_BASE_URL or baked at build time).
 */
export function isCloudConfigured(): boolean {
  return resolveBaseUrl().length > 0;
}

/**
 * POST /v1/session — exchange a verified Google ID-token for a session JWT +
 * rotating refresh token.
 *
 * Returns `null` when cloud is not configured (disabled, non-error).
 * Throws `CloudOfflineError` on network failure, timeout, or non-2xx response
 * so callers can treat cloud contact as best-effort.
 *
 * Note: device_id / app_version NOT sent here — telemetry decoupled to
 * POST /v1/events (Phase β / O468).
 */
export async function postSession(idToken: string): Promise<SessionTokens | null> {
  const baseUrl = resolveBaseUrl();
  if (!baseUrl) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    let resp: Response;
    try {
      resp = await fetch(`${baseUrl}/v1/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_token: idToken }),
        signal: controller.signal,
      });
    } catch (err) {
      throw new CloudOfflineError(`Identity server unreachable: ${String(err)}`, err);
    }

    if (!resp.ok) {
      let body = '';
      try {
        body = await resp.text();
      } catch {
        // ignore
      }
      throw new CloudOfflineError(`Identity server returned ${resp.status}: ${body}`);
    }

    const data = (await resp.json()) as SessionResponse;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * POST /v1/refresh — rotate the refresh token and get a fresh access JWT.
 *
 * Returns `null` when cloud is not configured (disabled, non-error).
 * Throws `CloudAuthError` on HTTP 401/4xx (token dead — reuse / expired / revoked).
 * Throws `CloudOfflineError` on network failure, timeout, or 5xx (retryable).
 */
export async function postRefresh(refreshToken: string): Promise<SessionTokens | null> {
  const baseUrl = resolveBaseUrl();
  if (!baseUrl) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    let resp: Response;
    try {
      resp = await fetch(`${baseUrl}/v1/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
        signal: controller.signal,
      });
    } catch (err) {
      throw new CloudOfflineError(`Identity server unreachable: ${String(err)}`, err);
    }

    if (resp.status >= 400 && resp.status < 500) {
      let body = '';
      try {
        body = await resp.text();
      } catch {
        // ignore
      }
      throw new CloudAuthError(
        `Refresh token rejected (${resp.status}): ${body}`,
        resp.status,
      );
    }

    if (!resp.ok) {
      let body = '';
      try {
        body = await resp.text();
      } catch {
        // ignore
      }
      throw new CloudOfflineError(`Identity server returned ${resp.status}: ${body}`);
    }

    const data = (await resp.json()) as SessionResponse;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * POST /v1/events — emit telemetry events (Phase β / O468).
 *
 * No-op when cloud is not configured.
 * Throws `CloudAuthError` on HTTP 401/4xx (token dead).
 * Throws `CloudOfflineError` on network failure, timeout, or 5xx (retryable).
 */
export async function postEvents(accessToken: string, events: TelemetryEvent[]): Promise<void> {
  const baseUrl = resolveBaseUrl();
  if (!baseUrl) return;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    let resp: Response;
    try {
      resp = await fetch(`${baseUrl}/v1/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ events }),
        signal: controller.signal,
      });
    } catch (err) {
      throw new CloudOfflineError(`Identity server unreachable: ${String(err)}`, err);
    }

    if (resp.status >= 400 && resp.status < 500) {
      let body = '';
      try {
        body = await resp.text();
      } catch {
        // ignore
      }
      throw new CloudAuthError(`Events rejected (${resp.status}): ${body}`, resp.status);
    }

    if (!resp.ok) {
      let body = '';
      try {
        body = await resp.text();
      } catch {
        // ignore
      }
      throw new CloudOfflineError(`Identity server returned ${resp.status}: ${body}`);
    }

    // 204 / 2xx → success
  } finally {
    clearTimeout(timer);
  }
}

/**
 * POST /v1/revoke — revoke the token family (best-effort, idempotent).
 *
 * No-op when cloud is not configured.
 * Throws `CloudOfflineError` on network failure, timeout, or non-2xx (caller swallows).
 * Server revoke is idempotent — offline failures are tolerable; family expires on its own.
 */
export async function postRevoke(refreshToken: string): Promise<void> {
  const baseUrl = resolveBaseUrl();
  if (!baseUrl) return;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    let resp: Response;
    try {
      resp = await fetch(`${baseUrl}/v1/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
        signal: controller.signal,
      });
    } catch (err) {
      throw new CloudOfflineError(`Identity server unreachable: ${String(err)}`, err);
    }

    if (!resp.ok) {
      let body = '';
      try {
        body = await resp.text();
      } catch {
        // ignore
      }
      throw new CloudOfflineError(`Identity server returned ${resp.status}: ${body}`);
    }
  } finally {
    clearTimeout(timer);
  }
}
