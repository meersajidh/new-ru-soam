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
 * Output:  bundles/ru-soam-practice/view-assets/
 *
 * mode is supplied by build-views.mjs (development for the dev watch, production
 * for the packaged `build:views`). Vite statically replaces `process.env.NODE_ENV`
 * per mode itself, so no manual `define` is needed.
 *
 * emptyOutDir is mode-gated (see the code comment): prod wipes the output
 * dir clean, dev stays incremental. view-assets/ is 100% build output now
 * (all views migrated to React) — nothing hand-authored to preserve.
 */
// mode is 'development' (dev watch) or 'production' (packaged build:views).
// sourcemaps ONLY in dev: shipping .map files packages full view source into the
// app (extraResources copies view-assets/) — reverse-engineerable leak. Dev keeps
// maps on disk for debugging (build is minified even in dev); 'hidden' drops the
// //# sourceMappingURL comment so DevTools does NOT auto-fetch (no connect-src 'none'
// violation). prod emits no maps at all — no source leak in the packaged app.
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), babel({ presets: [reactCompilerPreset()] })],
  root: resolve(__dirname, 'view-src'),
  base: './',
  build: {
    outDir: resolve(__dirname, 'view-assets'),
    // Prod wipes the output dir clean so no stale artifact (old hashed chunks,
    // dev 'hidden' .map files) can ship; every file in view-assets/ is build
    // output (gitignored, regenerated) — nothing hand-authored lives here since
    // the migration completed. Dev stays incremental to avoid watch-rebuild flicker.
    emptyOutDir: mode !== 'development',
    rollupOptions: {
      input: {
        roster: resolve(__dirname, 'view-src/roster.html'),
        overview: resolve(__dirname, 'view-src/overview.html'),
        aspects: resolve(__dirname, 'view-src/aspects.html'),
        projections: resolve(__dirname, 'view-src/projections.html'),
        intake: resolve(__dirname, 'view-src/intake.html'),
        'safety-plan': resolve(__dirname, 'view-src/safety-plan.html'),
        form: resolve(__dirname, 'view-src/form.html'),
        'client-migration': resolve(__dirname, 'view-src/client-migration.html'),
      },
    },
    target: 'es2020',
    sourcemap: mode === 'development' ? 'hidden' : false,
  },
  resolve: {
    alias: {
      // view-kit is a workspace package but not yet linked via pnpm install
      // in this bundle's dependency scope; resolve directly to source.
      // Subpath alias must precede the bare specifier (exact-match aliases only
      // hit the exact string; the bare alias would not match the /theme.css subpath).
      '@ru-soam/view-kit/theme.css': fileURLToPath(
        new URL('../../../../packages/view-kit/src/theme.css', import.meta.url),
      ),
      '@ru-soam/view-kit': fileURLToPath(
        new URL('../../../../packages/view-kit/src/index.ts', import.meta.url),
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
}));
