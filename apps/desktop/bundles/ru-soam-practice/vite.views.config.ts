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
 * Source:  bundles/ru-soam-practice/view-src/<view>.tsx
 * Output:  bundles/ru-soam-practice/view-assets/ (alongside legacy vanilla views)
 *
 * mode is supplied by build-views.mjs (development for the dev watch, production
 * for the packaged `build:views`). Vite statically replaces `process.env.NODE_ENV`
 * per mode itself, so no manual `define` is needed.
 *
 * emptyOutDir: false — MUST NOT wipe existing legacy .html views
 * (roster.html, overview.html, aspects.html, etc.) still in view-assets/.
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
        roster: resolve(__dirname, 'view-src/roster.html'),
        overview: resolve(__dirname, 'view-src/overview.html'),
        aspects: resolve(__dirname, 'view-src/aspects.html'),
        projections: resolve(__dirname, 'view-src/projections.html'),
        intake: resolve(__dirname, 'view-src/intake.html'),
        'safety-plan': resolve(__dirname, 'view-src/safety-plan.html'),
        form: resolve(__dirname, 'view-src/form.html'),
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
