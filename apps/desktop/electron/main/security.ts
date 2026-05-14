import type { Session } from 'electron';

/**
 * Hardened webPreferences applied by the platform's BrowserWindow factory.
 * Per ADR-201 §"Window settings". Sandbox is non-negotiable.
 */
export const RENDERER_WEB_PREFERENCES = {
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
  nodeIntegrationInWorker: false,
  nodeIntegrationInSubFrames: false,
  webSecurity: true,
  allowRunningInsecureContent: false,
} as const;

/**
 * Build the platform Content Security Policy header value.
 *
 * Per ADR-201 §"Content Security Policy". Strawman tightened over time (O10).
 *
 * Fonts: `fonts.googleapis.com` + `fonts.gstatic.com` are temporarily
 * allowlisted while typography is decorative. Phase 2 (theming / token
 * catalogue) self-hosts fonts and removes these entries.
 */
export function buildCsp(dev: boolean): string {
  const scriptSrc = dev
    ? ["'self'", 'app:', 'http://localhost:*', "'unsafe-inline'", "'unsafe-eval'"]
    : ["'self'", 'app:'];

  const connectSrc = dev
    ? ["'self'", 'app:', 'http://localhost:*', 'ws://localhost:*']
    : ["'self'", 'app:'];

  const directives: Record<string, string[]> = {
    'default-src': ["'self'", 'app:'],
    'script-src': scriptSrc,
    'style-src': ["'self'", 'app:', "'unsafe-inline'", 'https://fonts.googleapis.com'],
    'img-src': ["'self'", 'app:', 'data:', 'blob:'],
    'font-src': ["'self'", 'app:', 'data:', 'https://fonts.gstatic.com'],
    'connect-src': connectSrc,
    'object-src': ["'none'"],
    'base-uri': ["'none'"],
    'frame-ancestors': ["'none'"],
    'form-action': ["'none'"],
  };

  return Object.entries(directives)
    .map(([k, v]) => `${k} ${v.join(' ')}`)
    .join('; ');
}

/**
 * Install the CSP as a response header on every request handled by the given
 * session. Covers Vite dev-server responses and `app://` protocol responses.
 *
 * Defence in depth: even if a future regression strips a meta tag or the
 * protocol handler omits the header, every response still carries one.
 */
export function installCsp(session: Session, dev: boolean): void {
  const csp = buildCsp(dev);
  session.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders };
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === 'content-security-policy') delete headers[key];
    }
    headers['Content-Security-Policy'] = [csp];
    callback({ responseHeaders: headers });
  });
}

/**
 * Allow a navigation only to (a) the Vite dev server in dev mode, or
 * (b) the platform's `app://` protocol. Everything else is denied.
 */
export function isAllowedNavigation(
  url: string,
  devServerUrl: string | undefined,
  isDev: boolean,
): boolean {
  const allowed = isDev && devServerUrl ? [devServerUrl, 'app://'] : ['app://'];
  return allowed.some((prefix) => url.startsWith(prefix));
}
