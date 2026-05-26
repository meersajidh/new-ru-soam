// Rebuild native modules against the Electron ABI after install (postinstall).
//
// We invoke node-gyp DIRECTLY, once per physical module dir, instead of going
// through @electron/rebuild. Under pnpm with nodeLinker: hoisted, @electron/
// rebuild's module discovery silently finds nothing to build — it prints
// success while leaving the store-hardlinked Node-ABI (v137) binary in place,
// so the app crashes "Module did not self-register" under Electron (ABI v145).
// Driving node-gyp per dir skips discovery and is deterministic.
//
// better-sqlite3 ships a native .node and is present as TWO physical dirs in
// the hoisted repo-root node_modules: the real package and the `better-sqlite3`
// alias (npm:better-sqlite3-multiple-ciphers) that the app actually require()s.
// They are hardlinked from pnpm's store, so a fresh compile must run in EACH
// dir (node-gyp writes a new file, breaking the shared inode — rebuild one and
// the other stays v137). @node-rs/argon2 is napi/Node-API (ABI-stable) → not
// rebuilt. (ADR-204 Amendment 2/3 / O191.)
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const electronVersion = require('electron/package.json').version;

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..'); // apps/desktop
const repoRoot = resolve(appDir, '..', '..'); // repo root — hoisted node_modules
const nodeGyp = require.resolve('node-gyp/bin/node-gyp.js');

// node-gyp reads these npm_config_* vars to target the Electron headers/ABI
// (same set @electron/rebuild would have configured), and build_from_source
// forces a compile instead of fetching a Node-ABI prebuild.
const env = {
  ...process.env,
  npm_config_target: electronVersion,
  npm_config_runtime: 'electron',
  npm_config_disturl: 'https://electronjs.org/headers',
  npm_config_arch: process.arch,
  npm_config_target_arch: process.arch,
  npm_config_build_from_source: 'true',
};

const dirs = ['better-sqlite3', 'better-sqlite3-multiple-ciphers'].map((d) =>
  resolve(repoRoot, 'node_modules', d),
);

for (const cwd of dirs) {
  if (!existsSync(resolve(cwd, 'binding.gyp'))) {
    throw new Error(`rebuild-natives: no binding.gyp in ${cwd} — layout changed?`);
  }
  console.log(`→ node-gyp rebuild (electron ${electronVersion}) in ${cwd}`);
  execFileSync(process.execPath, [nodeGyp, 'rebuild'], { cwd, env, stdio: 'inherit' });
}

console.log(`✓ Native modules rebuilt for Electron ${electronVersion}`);
