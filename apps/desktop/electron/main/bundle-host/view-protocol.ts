import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { net, protocol } from 'electron';
import type { DiscoveredBundle } from './manifest';
import { VIEW_BRIDGE_SOURCE } from './view-bridge';
import { VIEW_CODICONS_SOURCE } from './view-codicons';

/**
 * `view://` protocol handler per ADR-411 (Phase 7 trimmed scope).
 *
 * URL shape: `view://<bundleId>/<assetPath>`.
 *
 * Two responder branches:
 *   - `view://_platform_/bridge.js` — fixed bridge script (auto-injected into
 *     every HTML response). Reserved bundleId, never collides with a real one.
 *   - `view://_platform_/codicons.js` — platform-owned inline-SVG codicon
 *     helper (auto-injected after bridge.js into every HTML response).
 *   - `view://<bundleId>/...` — files under the bundle's `view-assets/` dir.
 *     HTML responses get the bridge `<script>` tag and a strict CSP injected.
 *     Other extensions are served as-is via `net.fetch`.
 *
 * Security gates:
 *   - bundleId must be in the registry (populated by the loader at boot).
 *   - asset path is normalised and rejected if it escapes the bundle's
 *     `view-assets/` root.
 *   - Sandbox + CSP block code that tries to break out of the iframe.
 *
 * Path security model is independent of the iframe sandbox; both layers must
 * fail open for an exploit to land.
 */

interface ViewBundleEntry {
  readonly viewAssetsDir: string;
  readonly views: ReadonlyMap<string, string>;
}

const viewRegistry = new Map<string, ViewBundleEntry>();

const RESERVED_PLATFORM_HOST = '_platform_';

// CSP for bundle-view documents. `frame-ancestors` is intentionally omitted:
// the workbench (origin `http://localhost:5173` in dev, `app://` in prod) is
// the only frame that ever embeds these documents, but its origin is
// different from `view://<bundleId>`. Adding `frame-ancestors 'self'` would
// block the workbench from embedding the view at all. Origin isolation and
// the sandbox attribute (no `allow-same-origin`) already enforce the trust
// model — see ADR-411 §Trust zone.
const VIEW_CSP = [
  "default-src 'none'",
  "script-src view: 'unsafe-inline'",
  "style-src view: 'unsafe-inline'",
  "img-src view: data:",
  "font-src view: data:",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

export function registerBundleViews(bundle: DiscoveredBundle): void {
  if (bundle.manifest.views.length === 0) return;
  if (bundle.manifest.id === RESERVED_PLATFORM_HOST) {
    console.error(`[view] bundle id "${RESERVED_PLATFORM_HOST}" is reserved; skipping`);
    return;
  }
  const views = new Map<string, string>();
  for (const v of bundle.manifest.views) views.set(v.id, v.path);
  viewRegistry.set(bundle.manifest.id, { viewAssetsDir: bundle.viewAssetsDir, views });
}

export function resolveViewPath(bundleId: string, viewId: string): string | undefined {
  const entry = viewRegistry.get(bundleId);
  const relPath = entry?.views.get(viewId);
  if (!entry || !relPath) return undefined;
  return relPath;
}

export function viewUrlFor(bundleId: string, viewId: string): string | undefined {
  const relPath = resolveViewPath(bundleId, viewId);
  if (!relPath) return undefined;
  return `view://${bundleId}/${relPath}`;
}

// Bridge + codicons are injected INLINE (not `<script src="view://_platform_/…">`).
// A sandboxed iframe without `allow-same-origin` has an opaque origin; a
// cross-origin subresource fetch to `view://_platform_/…` is intermittently
// blocked by Blink's canDisplay check ("Unsafe attempt to load URL … Domains,
// protocols and ports must match"). When codicons.js fails to load, every view
// that calls `window.codicon(…)` at module top-level throws and renders blank.
// Inlining (allowed by VIEW_CSP `script-src 'unsafe-inline'`) removes the fetch
// entirely → deterministic, always available before the page's own body script.
// Both sources are verified free of any `</script` sequence (would break out of
// the inline tag), so no escaping is required.
function injectBridgeAndCsp(html: string): string {
  const bridgeTag = `<script>${VIEW_BRIDGE_SOURCE}</script>`;
  const codiconsTag = `<script>${VIEW_CODICONS_SOURCE}</script>`;
  const cspMeta = `<meta http-equiv="Content-Security-Policy" content="${VIEW_CSP}">`;
  const headOpen = /<head\b[^>]*>/i;
  if (headOpen.test(html)) {
    return html.replace(headOpen, (m) => `${m}\n${cspMeta}\n${bridgeTag}\n${codiconsTag}`);
  }
  return `${cspMeta}\n${bridgeTag}\n${codiconsTag}\n${html}`;
}

function withinRoot(root: string, target: string): boolean {
  const r = path.resolve(root);
  const t = path.resolve(target);
  return t === r || t.startsWith(r + path.sep);
}

export function registerViewProtocol(): void {
  protocol.handle('view', async (request) => {
    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      return new Response('Invalid URL', { status: 400 });
    }

    const bundleId = url.hostname.toLowerCase();
    const subPath = decodeURIComponent(url.pathname).replace(/^\/+/, '');

    if (bundleId === RESERVED_PLATFORM_HOST) {
      if (subPath === 'bridge.js') {
        return new Response(VIEW_BRIDGE_SOURCE, {
          status: 200,
          headers: {
            'Content-Type': 'application/javascript; charset=utf-8',
            'Cross-Origin-Resource-Policy': 'cross-origin',
          },
        });
      }
      if (subPath === 'codicons.js') {
        return new Response(VIEW_CODICONS_SOURCE, {
          status: 200,
          headers: {
            'Content-Type': 'application/javascript; charset=utf-8',
            'Cross-Origin-Resource-Policy': 'cross-origin',
          },
        });
      }
      return new Response('Not found', { status: 404 });
    }

    const entry = viewRegistry.get(bundleId);
    if (!entry) return new Response('Bundle not found', { status: 404 });
    if (subPath.length === 0) return new Response('Path required', { status: 400 });
    if (subPath.includes('..')) return new Response('Path traversal denied', { status: 400 });

    const absPath = path.join(entry.viewAssetsDir, subPath);
    if (!withinRoot(entry.viewAssetsDir, absPath)) {
      return new Response('Path escapes view-assets root', { status: 400 });
    }

    const ext = path.extname(absPath).toLowerCase();
    if (ext === '.html' || ext === '.htm') {
      try {
        const raw = await fs.readFile(absPath, 'utf8');
        return new Response(injectBridgeAndCsp(raw), {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Content-Security-Policy': VIEW_CSP,
          },
        });
      } catch {
        return new Response('Not found', { status: 404 });
      }
    }

    return net.fetch(pathToFileURL(absPath).toString())
      .then((res) => {
        const headers = new Headers(res.headers);
        headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
        return new Response(res.body, { status: res.status, headers });
      })
      .catch(() => new Response('Not found', { status: 404 }));
  });
}
