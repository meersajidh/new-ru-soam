import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { net, protocol } from 'electron';
import type { DiscoveredBundle } from './manifest';
import { VIEW_BRIDGE_SOURCE } from './view-bridge';
import { VIEW_BOOTSTRAP_SOURCE } from './view-bootstrap';
import { VIEW_CODICONS_SOURCE } from './view-codicons';
import { VIEW_FONTS_SOURCE } from './view-fonts';
import { VIEW_MATURITY_CSS, VIEW_MATURITY_SOURCE } from './view-maturity';
import { VIEW_QUERY_VENDOR_SOURCE } from './view-query-vendor';
import { VIEW_QUERY_SOURCE } from './view-query';

/**
 * `view://` protocol handler per ADR-411 Am1 (real per-bundle origin + trust-tiered CSP).
 *
 * URL shape: `view://<bundleId>/<assetPath>`.
 *
 * Three responder branches:
 *   - `view://_platform_/bridge.js` — fixed bridge script (backward-compat explicit path).
 *   - `view://_platform_/codicons.js` — platform-owned codicon helper.
 *   - `view://<bundleId>/_seam/<name>` — virtual seam assets served from platform constants
 *     (bridge.js, bootstrap.js, fonts.css, maturity.css, maturity.js). Reserved path prefix;
 *     never collides with real bundle view assets. Same-host for `script-src 'self'`.
 *   - `view://<bundleId>/...` — files under the bundle's `view-assets/` dir.
 *     HTML responses get seams + CSP injected (legacy inline or react external, by runtime).
 *     Other extensions served as-is via `net.fetch`.
 *
 * CSP / sandbox model (ADR-411 Am1):
 *   - Each view iframe now uses `sandbox="allow-scripts allow-forms allow-same-origin"`.
 *     `allow-same-origin` keeps the real `view://<bundleId>` origin (not opaque), so
 *     same-host subresources load reliably. The shell (`app://`) is still cross-origin —
 *     SOP enforces the trust boundary. See `References/View_Sandbox_Origin_And_CSP_Reasoning.md`.
 *   - CSP is selected per-view by `f(trustClass, viewRuntime)` (ADR-418 trust tiers ×
 *     ADR-411 Am1 runtime signal). Today `trustClass` is always `'first-party'`; the
 *     `trustClass` param is threaded for O512 (untrusted tier) without rework.
 *   - `'vanilla'` runtime → LEGACY_VIEW_CSP (keeps `'unsafe-inline'`, inline seam injection).
 *     All 13 existing views use this path — zero behaviour change.
 *   - `'react'` runtime → STRICT_VIEW_CSP (`script-src 'self'`, no `'unsafe-inline'`);
 *     seams injected as same-host `<script src>` / `<link>` references.
 *   - `connect-src 'none'` retained in both tiers — views never reach the network;
 *     the bridge is postMessage, which `connect-src` does not govern.
 *
 * Security gates:
 *   - bundleId must be in the registry (populated by the loader at boot).
 *   - asset path normalised and rejected if it escapes `view-assets/`.
 *   - `_seam/` prefix is virtual (served from constants, never disk).
 *   - Sandbox + CSP are independent layers; both must fail open for an exploit to land.
 */

// ── trust / runtime types ────────────────────────────────────────────────────

/** Per-bundle trust tier (ADR-418). Today only first-party exists; O512 adds untrusted. */
type TrustClass = 'first-party';

/** Per-view render runtime declared in the bundle manifest. Default: 'vanilla'. */
type ViewRuntime = 'vanilla' | 'react';

// ── view registry ────────────────────────────────────────────────────────────

interface ViewBundleEntry {
  readonly viewAssetsDir: string;
  /** viewId → relative path within viewAssetsDir */
  readonly views: ReadonlyMap<string, string>;
  /** relative path → runtime (default 'vanilla'); keyed the same way as views values */
  readonly runtimeByPath: ReadonlyMap<string, ViewRuntime>;
  /** trust tier of the bundle that owns these views */
  readonly trustClass: TrustClass;
}

const viewRegistry = new Map<string, ViewBundleEntry>();

const RESERVED_PLATFORM_HOST = '_platform_';

// ── CSP tiers ────────────────────────────────────────────────────────────────

// `frame-ancestors` omitted: the workbench embeds views but its origin differs
// from `view://<bundleId>`. `frame-ancestors 'self'` would block the embed.
// The trust model is enforced by the distinct per-bundle origin (cross-origin
// with app:// and every other bundle) + the tier-appropriate CSP. ADR-411 Am1.

/**
 * Legacy (vanilla) view CSP. Keeps `'unsafe-inline'` so existing inline-script
 * views are unaffected during the incremental migration to the react/strict tier.
 * `view:` in script/style/font-src allows same-host and cross-host view:// URLs,
 * matching the inline-seam injection model. Transitional; removed once the last
 * vanilla view migrates (O513 tracks it).
 */
const LEGACY_VIEW_CSP = [
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

/**
 * Strict (react) view CSP. `script-src 'self'` (no `'unsafe-inline'`): the XSS
 * backstop is live — injected inline scripts are blocked even if external data
 * is carelessly interpolated. Seams load as same-host `view://<bundleId>/_seam/*`.
 * `style-src 'self' 'unsafe-inline'` is transitional pending O513 (bundler CSS
 * strategy); `script-src` is the security-critical directive.
 * `font-src 'self' data:` — 'self' for same-origin font files, data: for the
 * inline base64 @font-face URIs in fonts.css.
 */
const STRICT_VIEW_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src view: data:",
  "font-src 'self' data:",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

/**
 * Select the view CSP as a function of trust tier and view runtime.
 * `trustClass` is always `'first-party'` today; the parameter is threaded
 * for O512 (untrusted TP-Host tier) so it can layer in without rework.
 */
function viewCsp(trustClass: TrustClass, runtime: ViewRuntime): string {
  switch (trustClass) {
    case 'first-party':
      return runtime === 'react' ? STRICT_VIEW_CSP : LEGACY_VIEW_CSP;
  }
}

// ── seam asset registry ──────────────────────────────────────────────────────

/**
 * Virtual seam assets served at `view://<bundleId>/_seam/<name>`.
 * The `_seam/` prefix is reserved — never collides with bundle disk assets.
 * Used by the react/strict runtime: seams are same-host external files rather
 * than inline injections, so `script-src 'self'` permits them.
 * Codicons, query-vendor, __viewQuery are NOT included — those are superseded
 * by view-kit / react-query / inline-SVG for react views.
 */
const SEAM_ASSETS = new Map<string, { readonly source: string; readonly contentType: string }>([
  ['bridge.js',    { source: VIEW_BRIDGE_SOURCE,    contentType: 'application/javascript; charset=utf-8' }],
  ['bootstrap.js', { source: VIEW_BOOTSTRAP_SOURCE, contentType: 'application/javascript; charset=utf-8' }],
  ['fonts.css',    { source: VIEW_FONTS_SOURCE,     contentType: 'text/css; charset=utf-8' }],
  ['maturity.css', { source: VIEW_MATURITY_CSS,     contentType: 'text/css; charset=utf-8' }],
  ['maturity.js',  { source: VIEW_MATURITY_SOURCE,  contentType: 'application/javascript; charset=utf-8' }],
]);

// ── public API ───────────────────────────────────────────────────────────────

export function registerBundleViews(bundle: DiscoveredBundle): void {
  if (bundle.manifest.views.length === 0) return;
  if (bundle.manifest.id === RESERVED_PLATFORM_HOST) {
    console.error(`[view] bundle id "${RESERVED_PLATFORM_HOST}" is reserved; skipping`);
    return;
  }
  const views = new Map<string, string>();
  const runtimeByPath = new Map<string, ViewRuntime>();
  for (const v of bundle.manifest.views) {
    views.set(v.id, v.path);
    runtimeByPath.set(v.path, v.runtime);
  }
  // trustClass defaults to 'first-party'. O512 threads per-bundle trustClass
  // when the DiscoveredBundle carries it from the loader.
  const trustClass: TrustClass = 'first-party';
  viewRegistry.set(bundle.manifest.id, { viewAssetsDir: bundle.viewAssetsDir, views, runtimeByPath, trustClass });
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

// ── seam injection helpers ───────────────────────────────────────────────────

/**
 * Legacy (vanilla) seam injection. Inlines bridge, codicons, bootstrap, query-core,
 * and maturity as `<script>` / `<style>` tags directly in `<head>`. The inline
 * approach was required for opaque-origin iframes (pre-Am1); it is kept intact
 * for all vanilla views during the incremental migration so their behaviour is
 * byte-for-byte unchanged. `allow-same-origin` now gives these views a real
 * origin too, but they still use LEGACY_VIEW_CSP with `'unsafe-inline'`, so
 * the inline scripts continue to run.
 */
function injectBridgeAndCsp(html: string): string {
  const fontsTag = `<style>${VIEW_FONTS_SOURCE}</style>`;
  const maturityCssTag = `<style>${VIEW_MATURITY_CSS}</style>`;
  const bridgeTag = `<script>${VIEW_BRIDGE_SOURCE}</script>`;
  const codiconsTag = `<script>${VIEW_CODICONS_SOURCE}</script>`;
  // Shared view bootstrap (awaitBridge/isLockedError/parseQuery/applyTheme/
  // applyCodicons) — injected after codicons so window.codicon exists.
  const bootstrapTag = `<script>${VIEW_BOOTSTRAP_SOURCE}</script>`;
  // TanStack Query Core vendor IIFE (sets window.__tanstackQueryCore).
  // Injected after bootstrap so __viewBoot is available if needed.
  const queryVendorTag = `<script>${VIEW_QUERY_VENDOR_SOURCE}</script>`;
  // Platform query wrapper (sets window.__viewQuery using window.__tanstackQueryCore).
  // Injected after vendor so __tanstackQueryCore is already set.
  const queryTag = `<script>${VIEW_QUERY_SOURCE}</script>`;
  const maturityTag = `<script>${VIEW_MATURITY_SOURCE}</script>`;
  const cspMeta = `<meta http-equiv="Content-Security-Policy" content="${LEGACY_VIEW_CSP}">`;
  const headOpen = /<head\b[^>]*>/i;
  if (headOpen.test(html)) {
    return html.replace(
      headOpen,
      (m) =>
        `${m}\n${cspMeta}\n${fontsTag}\n${maturityCssTag}\n${bridgeTag}\n${codiconsTag}\n${bootstrapTag}\n${queryVendorTag}\n${queryTag}\n${maturityTag}`,
    );
  }
  return `${cspMeta}\n${fontsTag}\n${maturityCssTag}\n${bridgeTag}\n${codiconsTag}\n${bootstrapTag}\n${queryVendorTag}\n${queryTag}\n${maturityTag}\n${html}`;
}

/**
 * React (strict) seam injection. Injects seams as same-host external
 * `<script src>` / `<link rel=stylesheet>` references so `script-src 'self'`
 * permits them (no `'unsafe-inline'` required). Codicons, query-vendor, and
 * __viewQuery are intentionally omitted — react views use view-kit /
 * react-query / inline-SVG instead (ADR-419).
 */
function injectReactSeams(html: string, bundleId: string, csp: string): string {
  const cspMeta = `<meta http-equiv="Content-Security-Policy" content="${csp}">`;
  // Fonts + maturity as linked stylesheets (within style-src 'self').
  const fontsCssTag = `<link rel="stylesheet" href="view://${bundleId}/_seam/fonts.css">`;
  const maturityCssTag = `<link rel="stylesheet" href="view://${bundleId}/_seam/maturity.css">`;
  // Bridge + bootstrap + maturity-js as external same-host scripts (within script-src 'self').
  const bridgeTag = `<script src="view://${bundleId}/_seam/bridge.js"></script>`;
  const bootstrapTag = `<script src="view://${bundleId}/_seam/bootstrap.js"></script>`;
  const maturityJsTag = `<script src="view://${bundleId}/_seam/maturity.js"></script>`;
  const injection = `${cspMeta}\n${fontsCssTag}\n${maturityCssTag}\n${bridgeTag}\n${bootstrapTag}\n${maturityJsTag}`;
  const headOpen = /<head\b[^>]*>/i;
  if (headOpen.test(html)) {
    return html.replace(headOpen, (m) => `${m}\n${injection}`);
  }
  return `${injection}\n${html}`;
}

function withinRoot(root: string, target: string): boolean {
  const r = path.resolve(root);
  const t = path.resolve(target);
  return t === r || t.startsWith(r + path.sep);
}

// ── protocol handler ─────────────────────────────────────────────────────────

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

    // _seam/ prefix: virtual seam assets served from platform constants.
    // Handled before disk resolution — _seam/ files never exist on disk.
    // Served at view://<bundleId>/_seam/<name> so they are same-origin with
    // the view; `script-src 'self'` (STRICT_VIEW_CSP) permits them.
    if (subPath.startsWith('_seam/')) {
      const seamName = subPath.slice('_seam/'.length);
      const seam = SEAM_ASSETS.get(seamName);
      if (!seam) return new Response('Not found', { status: 404 });
      return new Response(seam.source, {
        status: 200,
        headers: {
          'Content-Type': seam.contentType,
          'Cross-Origin-Resource-Policy': 'cross-origin',
        },
      });
    }

    const absPath = path.join(entry.viewAssetsDir, subPath);
    if (!withinRoot(entry.viewAssetsDir, absPath)) {
      return new Response('Path escapes view-assets root', { status: 400 });
    }

    const ext = path.extname(absPath).toLowerCase();
    if (ext === '.html' || ext === '.htm') {
      try {
        const raw = await fs.readFile(absPath, 'utf8');
        // Look up runtime by relative path (same key used in runtimeByPath map).
        const runtime = entry.runtimeByPath.get(subPath) ?? 'vanilla';
        const csp = viewCsp(entry.trustClass, runtime);
        const injected =
          runtime === 'react'
            ? injectReactSeams(raw, bundleId, csp)
            : injectBridgeAndCsp(raw);
        return new Response(injected, {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Content-Security-Policy': csp,
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
