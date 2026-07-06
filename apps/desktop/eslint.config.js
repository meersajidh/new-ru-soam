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

// ADR-106: base→domain import boundary.
// All files under src/** EXCEPT src/domain/** and the composition-root
// (src/App.tsx) must not import from src/domain/**. The composition root
// is the single seam where the domain bootstrap is wired into the base.
const DOMAIN_BOUNDARY_RESTRICTED_IMPORTS = {
  patterns: [
    {
      group: [
        './domain/*', './domain/**',
        '../domain/*', '../domain/**',
        '../../domain/*', '../../domain/**',
        '../../../domain/*', '../../../domain/**',
        '../../../../domain/*', '../../../../domain/**',
      ],
      message: 'ADR-106: base layer must not import from src/domain/**. Use the ProductConfigService seam (platform/services/ids ProductConfigServiceId) instead.',
    },
  ],
};

// ADR-420: design-system boundary — each render surface imports only its own kit.
// Shell (app://, src/**) uses @basebench/ui; view (view://, bundles/*/view-src)
// uses @ru-soam/view-kit. No deep imports past a package's public root, and no
// cross-surface kit import (the two kits are permanently separate — ADR-420 D4).
// NOTE (deferred): cross-bundle view-src imports (one bundle reaching into
// another bundle's view-src) are not yet path-restricted here — follow-up.
const DESIGN_SYSTEM_SHELL_RESTRICTED = {
  paths: [
    {
      name: '@ru-soam/view-kit',
      message: 'ADR-420: @ru-soam/view-kit is the view:// (iframe) kit; shell (app://) code uses @basebench/ui.',
    },
  ],
  patterns: [
    {
      group: ['@basebench/ui/*'],
      message: 'ADR-420: import @basebench/ui from its public root, not internals.',
    },
    {
      group: ['@ru-soam/view-kit/*'],
      message: 'ADR-420: @ru-soam/view-kit is the view kit; shell (app://) code uses @basebench/ui.',
    },
  ],
};

const DESIGN_SYSTEM_VIEW_RESTRICTED = {
  paths: [
    {
      name: '@basebench/ui',
      message: 'ADR-420: @basebench/ui is the shell (app://) kit; view (view://) code uses @ru-soam/view-kit.',
    },
  ],
  patterns: [
    {
      group: ['@basebench/ui/*'],
      message: 'ADR-420: @basebench/ui is the shell kit; view (view://) code uses @ru-soam/view-kit.',
    },
    {
      group: ['@ru-soam/view-kit/src/*'],
      message: 'ADR-420: import @ru-soam/view-kit from its public root (or /theme.css), not src internals.',
    },
  ],
};

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
      'no-restricted-imports': [
        'error',
        {
          paths: [...RENDERER_RESTRICTED_IMPORTS.paths, ...DESIGN_SYSTEM_SHELL_RESTRICTED.paths],
          patterns: [...RENDERER_RESTRICTED_IMPORTS.patterns, ...DESIGN_SYSTEM_SHELL_RESTRICTED.patterns],
        },
      ],
      'no-restricted-syntax': ['error', ...RENDERER_RESTRICTED_SYNTAX],
    },
  },
  // ADR-106: enforce one-way base→domain boundary for all base files.
  // Excludes: src/domain/** (domain-internal imports OK) and src/App.tsx (composition seam).
  // Both option objects are passed so this block does NOT clobber the ADR-202/203
  // electron/node-builtin restriction (flat-config rules are last-wins, not merged).
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/domain/**', 'src/App.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [...RENDERER_RESTRICTED_IMPORTS.paths, ...DESIGN_SYSTEM_SHELL_RESTRICTED.paths],
          patterns: [
            ...RENDERER_RESTRICTED_IMPORTS.patterns,
            ...DOMAIN_BOUNDARY_RESTRICTED_IMPORTS.patterns,
            ...DESIGN_SYSTEM_SHELL_RESTRICTED.patterns,
          ],
        },
      ],
    },
  },
  // ADR-420: view-surface kit boundary — bundle view-src (view://) uses
  // @ru-soam/view-kit and must not reach the shell kit @basebench/ui.
  // Also (S3): no raw <svg> in view-src — use <Icon> from @ru-soam/view-kit.
  {
    files: ['bundles/*/view-src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', DESIGN_SYSTEM_VIEW_RESTRICTED],
      'no-restricted-syntax': ['error', {
        selector: "JSXOpeningElement[name.name='svg']",
        message: 'ADR-420: no inline <svg> in view-src — use <Icon> from @ru-soam/view-kit. Brand logos / bespoke markers may opt out with an eslint-disable-next-line no-restricted-syntax and a reason.',
      }],
    },
  },
]);
