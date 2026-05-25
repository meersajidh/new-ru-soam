/**
 * package.mjs
 *
 * Cross-platform packaging script.  Replaces the inline `electron-builder`
 * invocation in the `dist` npm script with a two-phase approach:
 *
 *   1. `pnpm --filter ru-soam --legacy deploy --prod --node-linker=hoisted`
 *      → flat, real-file node_modules in os.tmpdir().  Postinstall rebuilds
 *        native bindings (better-sqlite3-multiple-ciphers, @node-rs/argon2)
 *        against the Electron ABI.
 *
 *   2. electron-builder run from the deploy dir with a scrubbed env so it
 *      does NOT auto-detect pnpm and re-run `pnpm install --production`
 *      (which would wipe the flat layout and fail on headless runners).
 *
 *   3. Distributables are copied from <deployDir>/release/ to
 *      apps/desktop/release/ so existing CI upload globs keep working.
 *
 * Usage:
 *   node scripts/package.mjs
 *   node scripts/package.mjs --channel=beta
 *
 * Zero runtime dependencies — pure Node ESM.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// ── Paths ──────────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(DESKTOP_DIR, '..', '..');
const RELEASE_OUT = path.join(DESKTOP_DIR, 'release');

const DEPLOY_DIR = path.join(os.tmpdir(), 'ru-soam-deploy');

// ── Argument parsing ───────────────────────────────────────────────────────────

const args = process.argv.slice(2);
let channel = 'latest';

for (const arg of args) {
  const m = arg.match(/^--channel=(.+)$/);
  if (m) channel = m[1].trim();
}

console.log(`[package] channel=${channel}`);
console.log(`[package] deployDir=${DEPLOY_DIR}`);
console.log(`[package] repoRoot=${REPO_ROOT}`);

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Spawn a child process, inheriting stdio, and exit the parent with the child's
 * code if it fails.
 */
function run(cmd, args_, opts = {}) {
  console.log(`[package] $ ${cmd} ${args_.join(' ')}`);
  const result = spawnSync(cmd, args_, { stdio: 'inherit', ...opts });
  if (result.error) {
    console.error(`[package] spawn error: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`[package] command exited with code ${result.status}`);
    process.exit(result.status ?? 1);
  }
}

// ── Step 0: clean deploy dir ───────────────────────────────────────────────────

console.log('[package] cleaning deploy dir...');
fs.rmSync(DEPLOY_DIR, { recursive: true, force: true });
fs.rmSync(RELEASE_OUT, { recursive: true, force: true });

// ── Step 1: pnpm deploy ────────────────────────────────────────────────────────

// On Windows pnpm is a .cmd wrapper; shell:true lets Node find it via PATH.
const isWindows = process.platform === 'win32';
const pnpmCmd = isWindows ? 'pnpm.cmd' : 'pnpm';

run(
  pnpmCmd,
  ['--filter', 'ru-soam', '--legacy', 'deploy', '--prod', '--node-linker=hoisted', DEPLOY_DIR],
  {
    cwd: REPO_ROOT,
    // shell:true required on Windows so .cmd is found
    shell: isWindows,
  },
);

// ── Step 2: resolve Electron version + electron-builder CLI ───────────────────

// Resolve from apps/desktop so pnpm symlink resolution works correctly.
const desktopRequire = createRequire(path.join(DESKTOP_DIR, 'package.json'));

const electronPkgPath = desktopRequire.resolve('electron/package.json');
const electronVersion = JSON.parse(fs.readFileSync(electronPkgPath, 'utf8')).version;
console.log(`[package] electronVersion=${electronVersion}`);

const ebCliPath = desktopRequire.resolve('electron-builder/out/cli/cli.js');
console.log(`[package] ebCli=${ebCliPath}`);

// ── Step 3: scrub env so electron-builder uses npm collector, not pnpm ─────────

const env = { ...process.env };

// Remove npm_config_user_agent (contains "pnpm") and any PNPM_* / npm_config_*
// keys.  Without these, electron-builder falls back to the npm dependency
// collector and packs node_modules as-is (our flat real-file layout).
for (const key of Object.keys(env)) {
  if (
    key === 'npm_config_user_agent' ||
    key.startsWith('PNPM_') ||
    key.startsWith('npm_config_')
  ) {
    delete env[key];
  }
}

// ── Step 4: run electron-builder from the deploy dir ──────────────────────────

run(
  process.execPath,
  [
    ebCliPath,
    '--projectDir',
    DEPLOY_DIR,
    '--config',
    path.join(DEPLOY_DIR, 'electron-builder.yml'),
    `-c.electronVersion=${electronVersion}`,
    `-c.publish.channel=${channel}`,
    '--publish',
    'never',
  ],
  {
    cwd: DEPLOY_DIR,
    env,
  },
);

// ── Step 5: copy distributables to apps/desktop/release/ ─────────────────────

const srcRelease = path.join(DEPLOY_DIR, 'release');

// Clear stale top-level files in apps/desktop/release/ (not dirs like *-unpacked).
fs.mkdirSync(RELEASE_OUT, { recursive: true });
if (fs.existsSync(RELEASE_OUT)) {
  for (const entry of fs.readdirSync(RELEASE_OUT)) {
    const full = path.join(RELEASE_OUT, entry);
    if (fs.statSync(full).isFile()) {
      fs.rmSync(full);
    }
  }
}

// Copy only top-level files (skip *-unpacked dirs and other dirs).
const COPY_EXTS = new Set(['.deb', '.exe', '.blockmap', '.yml', '.AppImage', '.zip', '.dmg']);
let copied = 0;

for (const entry of fs.readdirSync(srcRelease)) {
  const srcPath = path.join(srcRelease, entry);
  if (!fs.statSync(srcPath).isFile()) continue;
  const ext = path.extname(entry).toLowerCase();
  if (!COPY_EXTS.has(ext)) continue;
  const destPath = path.join(RELEASE_OUT, entry);
  fs.copyFileSync(srcPath, destPath);
  console.log(`[package] copied ${entry}`);
  copied++;
}

console.log(`[package] done. ${copied} file(s) copied to ${RELEASE_OUT}`);
