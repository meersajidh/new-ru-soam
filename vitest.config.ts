import { defineConfig } from 'vitest/config';

// Vitest "projects" mode mirrors the pnpm workspace: one project per package
// that (will) hold tests. `environment: 'node'` everywhere for now — no jsdom
// tests (Tier-2), which are not yet in scope. See docs/Guides/testing.md.
//
// Vitest is the BEHAVIOR gate; `pnpm compile` stays the TYPE gate — esbuild
// transform here does NOT enforce tsc project-refs / erasableSyntaxOnly /
// verbatimModuleSyntax. Two separate CI jobs by design.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'desktop',
          root: './apps/desktop',
          environment: 'node',
          include: ['**/*.test.ts'],
          // The two pre-existing store tests use Node's built-in `node:test`
          // runner (driven by the apps/desktop `test` script), not Vitest.
          // Left as-is until a deliberate conversion (Lane B1).
          exclude: [
            '**/node_modules/**',
            '**/dist/**',
            'electron/main/store/backup.test.ts',
            'electron/main/store/schema-gate.test.ts',
          ],
        },
      },
      { test: { name: 'editor', root: './packages/editor', environment: 'node', include: ['**/*.test.ts'] } },
      { test: { name: 'domain', root: './packages/domain', environment: 'node', include: ['**/*.test.ts'] } },
      { test: { name: 'view-kit', root: './packages/view-kit', environment: 'node', include: ['**/*.test.ts'] } },
    ],
  },
});
