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
      // Preload must be CJS: Electron drops ESM preloads when the renderer is
      // sandboxed (ADR-201 O11/O15). Sandbox is non-negotiable, so the module
      // format adapts.
      lib: {
        entry: 'electron/preload/index.ts',
        formats: ['cjs'],
        fileName: () => 'index.cjs',
      },
      outDir: 'dist/preload',
      emptyOutDir: true,
      // No sourcemaps in the packaged app — .map files ship the main-process
      // source (IPC handlers, KEK/crypto, security gates) into a readable, leak-able
      // form. Dev keeps them for debugging; prod emits none.
      sourcemap: mode === 'development',
      rollupOptions: {
        output: { format: 'cjs' },
        external: ['electron', ...builtinModules, ...builtinModules.map((m) => `node:${m}`)],
      },
    },
  };
});
