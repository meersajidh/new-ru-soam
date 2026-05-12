export const RENDERER_WEB_PREFERENCES = {
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: false,
  webSecurity: true,
  allowRunningInsecureContent: false,
} as const;

export function buildCsp(dev: boolean): string {
  const directives = dev
    ? [
        "default-src 'self' app: http://localhost:* ws://localhost:*",
        "script-src 'self' app: http://localhost:* 'unsafe-inline'",
        "style-src 'self' app: 'unsafe-inline' http://localhost:*",
        "img-src 'self' app: data: blob: http://localhost:*",
        "connect-src 'self' app: http://localhost:* ws://localhost:*",
        "font-src 'self' app: data: http://localhost:*",
        "object-src 'none'",
        "base-uri 'none'",
      ]
    : [
        "default-src 'self' app:",
        "script-src 'self' app:",
        "style-src 'self' app: 'unsafe-inline'",
        "img-src 'self' app: data: blob:",
        "connect-src 'self' app: https:", // TODO: Too permissive for production, lock it down when API endpoints are finalized
        "font-src 'self' app: data:",
        "object-src 'none'",
        "base-uri 'none'",
      ];
  return directives.join('; ');
}

export function isAllowedNavigation(
  url: string,
  devServerUrl: string | undefined,
  isDev: boolean,
): boolean {
  const allowed = isDev && devServerUrl ? [devServerUrl, 'app://'] : ['app://'];
  return allowed.some((prefix) => url.startsWith(prefix));
}
