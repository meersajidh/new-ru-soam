import { defineConfig } from 'vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import tanstackRouter from '@tanstack/router-plugin/vite';
import svgr from 'vite-plugin-svgr';
import { fileURLToPath } from 'url';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    svgr(),
    tailwindcss(),
    babel({ presets: [reactCompilerPreset()] }),
  ],
  resolve: {
    alias: {
      // '@': path.resolve(__dirname, './src'),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // Scope the dep scanner to the shell's own entry. Otherwise Vite's optimizeDeps
  // scanner discovers the React bundle views under `bundles/*/view-src/*.html`
  // (which import `@ru-soam/view-kit` via their own per-bundle config alias the
  // shell doesn't know) and logs "Failed to run dependency scan". Those views are
  // built separately (scripts/build-views.mjs) and served pre-built by the
  // fp-host view protocol — never by this dev server. ADR-419.
  optimizeDeps: {
    entries: ['index.html'],
  },
  build: {
    outDir: 'dist/renderer',
  },
});
