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
        entry: 'electron/bundle-host/index.ts',
        formats: ['es'],
        fileName: () => 'index.mjs',
      },
      outDir: 'dist/bundle-host',
      emptyOutDir: true,
      sourcemap: true,
      rollupOptions: {
        output: { format: 'es' },
        external: ['electron', ...builtinModules, ...builtinModules.map((m) => `node:${m}`)],
      },
    },
  };
});
