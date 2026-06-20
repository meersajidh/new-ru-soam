/**
 * Generator: bundle @tanstack/query-core to a self-contained IIFE string,
 * then write view-query-vendor.ts exporting VIEW_QUERY_VENDOR_SOURCE.
 *
 * Committed-string pattern — regenerate on demand when query-core bumps:
 *   node scripts/gen-view-query-vendor.mjs
 *
 * Uses Vite's programmatic build API (vite is already a dep; esbuild not
 * separately installed). Output: electron/main/fp-host/view-query-vendor.ts
 */

import { build } from 'vite';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');
const outFile = resolve(__dirname, '../electron/main/fp-host/view-query-vendor.ts');

const entry = resolve(repoRoot, 'node_modules/@tanstack/query-core/build/modern/index.js');

console.log('[gen-view-query-vendor] bundling @tanstack/query-core as IIFE…');

const result = await build({
  logLevel: 'warn',
  // Sandboxed iframes have no `process` global. query-core guards dev-only
  // warnings behind `process.env.NODE_ENV` — without replacement the bundle
  // throws `ReferenceError: process is not defined` on first fetch. Production
  // mode + explicit define strips those branches so the bundle is browser-pure.
  mode: 'production',
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    lib: {
      entry,
      name: '__tanstackQueryCore',
      formats: ['iife'],
      fileName: () => 'query-core-vendor.js',
    },
    write: false,
    minify: true,
    target: 'es2020',
    rollupOptions: {
      external: [],
    },
  },
  configFile: false,
});

const output = result[0].output;
const chunk = output.find((c) => c.type === 'chunk');
if (!chunk) {
  console.error('[gen-view-query-vendor] ERROR: no chunk in build output');
  process.exit(1);
}

let bundle = chunk.code;

// Defensively escape any </script sequence (should be none but guard anyway).
bundle = bundle.replace(/<\/script/gi, '<\\/script');

const size = (bundle.length / 1024).toFixed(1);
console.log(`[gen-view-query-vendor] bundle size: ${size} KB`);
console.log(`[gen-view-query-vendor] contains </script: ${/<\/script/i.test(bundle)}`);

const ts = `/**
 * AUTO-GENERATED — do not edit by hand.
 * Run: node scripts/gen-view-query-vendor.mjs
 *
 * Bundles @tanstack/query-core as a self-contained IIFE that sets
 * window.__tanstackQueryCore when evaluated in a sandboxed iframe.
 * Injected inline by view-protocol.ts (no subresource fetch needed).
 *
 * Regenerate when @tanstack/query-core version changes.
 * Bundle size: ${size} KB (minified).
 */
export const VIEW_QUERY_VENDOR_SOURCE = ${JSON.stringify(bundle)};
`;

writeFileSync(outFile, ts, 'utf8');
console.log(`[gen-view-query-vendor] wrote ${outFile}`);
