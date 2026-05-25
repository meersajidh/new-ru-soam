// Rebuild native modules against the Electron ABI after `npm install`.
//
// npm workspaces hoist dependencies to the repo-root node_modules, so the
// native packages physically live there — while their dependency is *declared*
// in apps/desktop/package.json. @electron/rebuild splits these two concerns:
//   - buildPath        → drives discovery (reads this package.json's deps)
//   - projectRootPath  → drives location  (where the hoisted node_modules lives)
// Point them at the same dir (the default) and discovery and location disagree
// under the hoist, so it silently rebuilds nothing. They must straddle the
// app dir and the repo root respectively. (ADR-204 Amendment 2 / O191.)
import { rebuild } from '@electron/rebuild';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const electronVersion = createRequire(import.meta.url)('electron/package.json').version;

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..'); // apps/desktop
const projectRootPath = resolve(appDir, '..', '..'); // repo root (hoisted node_modules)

await rebuild({
  buildPath: appDir,
  projectRootPath,
  electronVersion,
  // better-sqlite3 is installed twice: under its own name and under the
  // `better-sqlite3` alias (npm:better-sqlite3-multiple-ciphers). Both ship a
  // native .node and both must match the Electron ABI. argon2 is napi/Node-API
  // (ABI-stable) so it is intentionally omitted.
  onlyModules: ['better-sqlite3', 'better-sqlite3-multiple-ciphers'],
  force: true,
});

console.log(`✓ Native modules rebuilt for Electron ${electronVersion}`);
