import { defineConfig } from 'vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Per-bundle Vite config for React views (ADR-419 + ADR-411 Am1).
 *
 * Source:  bundles/ru-soam-sessions/view-src/<view>.tsx
 * Output:  bundles/ru-soam-sessions/view-assets/ (alongside legacy vanilla views)
 *
 * mode is supplied by build-views.mjs (development for the dev watch, production
 * for the packaged `build:views`). Vite statically replaces `process.env.NODE_ENV`
 * per mode itself, so no manual `define` is needed — and forcing a production
 * NODE_ENV define under a development (watch) build de-syncs React: plugin-react
 * emits the dev JSX runtime (`jsxDEV`) while the bundled React resolves to
 * production (no `jsxDEV`) → `jsxDEV is not a function` at first render. Letting
 * mode drive both keeps the JSX transform and the React runtime consistent.
 *
 * emptyOutDir: false — MUST NOT wipe existing legacy .html views
 * (e.g. meeting-record.html) that still live in view-assets/.
 */
export default defineConfig({
  plugins: [react(), tailwindcss(), babel({ presets: [reactCompilerPreset()] })],
  root: resolve(__dirname, 'view-src'),
  base: './',
  build: {
    outDir: resolve(__dirname, 'view-assets'),
    emptyOutDir: false,
    rollupOptions: {
      input: {
        meetings: resolve(__dirname, 'view-src/meetings.html'),
        'meeting-record': resolve(__dirname, 'view-src/meeting-record.html'),
      },
    },
    target: 'es2020',
    sourcemap: true,
  },
  resolve: {
    alias: {
      // view-kit is a workspace package but not yet linked via pnpm install
      // in this bundle's dependency scope; resolve directly to source.
      '@ru-soam/view-kit': fileURLToPath(
        new URL('../../../../packages/view-kit/src/index.ts', import.meta.url),
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
});
