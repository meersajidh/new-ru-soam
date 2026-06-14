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
 * TODO(11a.5b / O471): add postRefresh() and postRevoke() here once the
 * returning-user refresh-on-unlock and sign-out revocation paths are built.
 */

// Build-time baked identity base URL (prod fallback). Baked by vite.main.config.ts
// from IDENTITY_BASE_URL env var at package time. Empty when not set.
declare const __IDENTITY_BASE_URL__: string;

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
 */
export async function postSession(
  idToken: string,
  deviceId: string,
  appVersion: string,
): Promise<SessionTokens | null> {
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
        body: JSON.stringify({ id_token: idToken, device_id: deviceId, app_version: appVersion }),
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
      throw new CloudOfflineError(
        `Identity server returned ${resp.status}: ${body}`,
      );
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
