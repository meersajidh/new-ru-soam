import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

// Renderer trust-zone rules — enforce ADR-202 (no electron in renderer) and
// ADR-203 (brokered networking). Renderer code lives under apps/desktop/src
// and must reach Electron / external systems only via window.soam.*.
const RENDERER_RESTRICTED_IMPORTS = {
  paths: [
    // Runtime electron module — only the preload / main / bundle-host may import.
    // Type-only imports from `../electron/preload/...` are allowed (different specifier).
    { name: 'electron', message: 'ADR-202: renderer must not import electron. Use window.soam.*.' },
  ],
  patterns: [
    {
      group: ['electron/*'],
      message: 'ADR-202: renderer must not import electron submodules.',
    },
    {
      group: ['fs', 'fs/*', 'node:fs', 'node:fs/*', 'child_process', 'node:child_process', 'path', 'node:path', 'os', 'node:os'],
      message: 'ADR-202: renderer must not import node built-ins. Route through main process.',
    },
  ],
};

const RENDERER_RESTRICTED_SYNTAX = [
  {
    selector: "CallExpression[callee.object.name='window'][callee.property.name='open']",
    message: 'ADR-203: window.open is forbidden in renderer. Use window.soam.shell.openExternal.',
  },
  {
    selector: "NewExpression[callee.name='BrowserWindow']",
    message: 'ADR-201: BrowserWindow may only be constructed in electron/main/window-factory.ts.',
  },
  {
    selector: "JSXOpeningElement[name.name='webview']",
    message: 'ADR-201: <webview> is forbidden. Use sandboxed iframe + view:// bridge (ADR-411).',
  },
];

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', RENDERER_RESTRICTED_IMPORTS],
      'no-restricted-syntax': ['error', ...RENDERER_RESTRICTED_SYNTAX],
    },
  },
]);
