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
        entry: 'electron/fp-host/index.ts',
        formats: ['es'],
        fileName: () => 'index.mjs',
      },
      outDir: 'dist/fp-host',
      emptyOutDir: true,
      sourcemap: true,
      rollupOptions: {
        output: {
          format: 'es',
          // Same as main: ESM bundle of CJS deps yields Rolldown's __require
          // helper, which throws without a real require. Provide one.
          banner:
            "import { createRequire } from 'node:module';\nconst require = createRequire(import.meta.url);",
        },
        external: ['electron', ...builtinModules, ...builtinModules.map((m) => `node:${m}`)],
      },
    },
  };
});
