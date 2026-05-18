import { defineConfig, loadEnv } from 'vite';
import { builtinModules } from 'module';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    define: {
      'import.meta.env.DEV': JSON.stringify(mode === 'development'),
      'import.meta.env.PROD': JSON.stringify(mode === 'production'),
      'import.meta.env.MODE': JSON.stringify(mode),
      ...Object.fromEntries(
        Object.entries(env)
          .filter(([k]) => k.startsWith('VITE_'))
          .map(([k, v]) => [`import.meta.env.${k}`, JSON.stringify(v)]),
      ),
    },
    build: {
      lib: {
        entry: 'electron/main/index.ts',
        formats: ['es'],
        fileName: () => 'index.mjs',
      },
      outDir: 'dist/main',
      emptyOutDir: true,
      sourcemap: true,
      rollupOptions: {
        output: { format: 'es' },
        external: [
          'electron',
          ...builtinModules,
          ...builtinModules.map((m) => `node:${m}`),
          // Native / NAPI deps used Main-side only — must load at runtime, not bundle.
          // Pattern catches the package and any platform-tagged subpackages
          // (e.g. @node-rs/argon2-linux-x64-gnu).
          /^@node-rs\//,
          // Phase 10a: better-sqlite3 — native module rebuilt for the Electron
          // ABI by electron-builder install-app-deps (apps/desktop postinstall).
          /^better-sqlite3$/,
        ],
      },
    },
  };
});
