/**
 * Per-bundle React view builder (ADR-419 A7 build pipeline).
 *
 * Globs `bundles/<id>/vite.views.config.ts` and builds each via Vite's
 * programmatic API at mode:'production'.
 *
 * Exported function (for dev.mjs):
 *   buildAllViews({ watch?: boolean })
 *
 * CLI usage:
 *   node scripts/build-views.mjs
 */

import { build } from 'vite';
import { readdirSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(__dirname, '..');
const bundlesDir = resolve(desktopRoot, 'bundles');

// DEV: signal Main to reload the renderer so bundle-view iframes refetch their
// view:// assets. Views are static files (no process, no HMR); Main fs.watch-es
// this file (see electron/main/index.ts VIEW_TRIGGER).
const VIEW_TRIGGER = join(tmpdir(), 'ru-soam-view-reload');

/** Find all bundles that have a vite.views.config.ts. */
function findViewConfigs() {
  if (!existsSync(bundlesDir)) return [];
  return readdirSync(bundlesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => resolve(bundlesDir, d.name, 'vite.views.config.ts'))
    .filter((p) => existsSync(p));
}

/**
 * Build all bundles that have a vite.views.config.ts.
 *
 * @param {{ watch?: boolean }} [opts]
 * @param {boolean} [opts.watch=false] - Enable Rollup watch mode (dev.mjs use).
 */
export async function buildAllViews({ watch = false } = {}) {
  const configs = findViewConfigs();
  if (configs.length === 0) {
    console.log('[build-views] no vite.views.config.ts found in bundles/');
    return;
  }

  await Promise.all(
    configs.map(async (configFile) => {
      const bundleName = basename(dirname(configFile));
      console.log(`[build-views] ${bundleName} ${watch ? 'watching' : 'building'}…`);

      await build({
        configFile,
        // Mode follows watch: development for the dev inner loop (dev JSX + dev
        // React, HMR-friendly, warnings on), production for the packaged build
        // (minified, prod JSX + prod React). Vite replaces process.env.NODE_ENV
        // statically per mode, so no manual define is needed. Forcing production
        // under a watch build de-syncs the JSX transform from the React runtime
        // (`jsxDEV is not a function`) — keep them aligned via mode.
        mode: watch ? 'development' : 'production',
        logLevel: 'warn',
        clearScreen: false,
        ...(watch ? { build: { watch: {} } } : {}),
        plugins: watch
          ? [
              {
                name: 'views-log',
                closeBundle() {
                  console.log(`[views:${bundleName}] rebuilt`);
                  // Nudge Main to reload the renderer → iframes refetch view:// assets.
                  writeFileSync(VIEW_TRIGGER, Date.now().toString());
                },
              },
            ]
          : [],
      });

      if (!watch) console.log(`[build-views] ${bundleName} done`);
    }),
  );
}

// ── CLI entry point ───────────────────────────────────────────────────────────

const isMain =
  process.argv[1] != null &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  buildAllViews({ watch: false }).catch((err) => {
    console.error('[build-views] error:', err);
    process.exit(1);
  });
}
