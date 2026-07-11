import { createServer, build } from 'vite';
import { spawn } from 'child_process';
import { writeFileSync, watch } from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { buildAllViews } from './build-views.mjs';

const require = createRequire(import.meta.url);
const electronBin = require('electron');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const PRELOAD_TRIGGER = path.join(os.tmpdir(), 'ru-soam-preload-reload');

let electronProcess = null;

function touchPreloadTrigger() {
  writeFileSync(PRELOAD_TRIGGER, Date.now().toString());
}

/**
 * Watch bundle command-logic + manifests and LOG that a manual restart is
 * required. Neither is hot-reloadable today:
 *  - bundles/<id>/index.mjs runs INSIDE the running fp-host process (loaded via
 *    activateBundle) → the process holds stale module-cached code (O521).
 *  - bundles/<id>/manifest.json fans out at boot into migrations (applied to an
 *    already-open encrypted DB) + a one-shot renderer contribution seed → a
 *    correct hot-apply is a real feature, not a watcher tweak (O522).
 * Until O521/O522 land, just surface the need to restart instead of failing
 * silently-stale. DEV-only.
 */
function installBundleSourceWatcher() {
  const bundlesDir = path.join(root, 'bundles');
  const lastLogged = new Map();
  const throttle = (key) => {
    const now = Date.now();
    if (now - (lastLogged.get(key) ?? 0) < 500) return true;
    lastLogged.set(key, now);
    return false;
  };
  watch(bundlesDir, { recursive: true }, (_event, filename) => {
    if (!filename) return;
    const base = path.basename(filename);
    if (base === 'index.mjs') {
      if (throttle(filename)) return;
      console.log(
        `[bundles] ${filename} changed — bundle logic runs in the fp-host; RESTART REQUIRED (just dev-desktop). Hot-recycle deferred: O521.`,
      );
    } else if (base === 'manifest.json') {
      if (throttle(filename)) return;
      console.log(
        `[bundles] ${filename} changed — manifest drives boot migrations + contribution seed; RESTART REQUIRED (just dev-desktop). Hot-reload deferred: O522.`,
      );
    }
  });
}

function pipeLines(stream, prefix) {
  let buffered = '';
  stream.on('data', (chunk) => {
    buffered += chunk.toString();
    let idx = buffered.indexOf('\n');
    while (idx !== -1) {
      const line = buffered.slice(0, idx).replace(/\r$/, '');
      if (line.length > 0) process.stdout.write(`${prefix} ${line}\n`);
      buffered = buffered.slice(idx + 1);
      idx = buffered.indexOf('\n');
    }
  });
  stream.on('end', () => {
    const line = buffered.replace(/\r$/, '');
    if (line.length > 0) process.stdout.write(`${prefix} ${line}\n`);
  });
}

function startElectron(url) {
  if (electronProcess) {
    electronProcess.removeAllListeners('exit');
    electronProcess.kill();
  }
  // For linux, specifically Ubuntu (22 and above),  `--no-sandbox` to circumvent AppArmor protection.
  // It should be noted that using `--no-sandbox` can have security implications,
  // so it should be used with caution and only in development environments.
  // Add `--ozone-platform=x11` flag to fix warning about wayland vulcan support
  const extraFlags =
    process.platform === 'linux'
      ? ['--ozone-platform=x11', '--no-sandbox', '--class=ru-soam']
      : [];
  electronProcess = spawn(electronBin, [...extraFlags, '--remote-debugging-port=9333', '--enable-logging', '.'], {
    cwd: root,
    env: { ...process.env, VITE_DEV_SERVER_URL: url },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (electronProcess.stdout) pipeLines(electronProcess.stdout, '[electron]');
  if (electronProcess.stderr) pipeLines(electronProcess.stderr, '[electron]');
  electronProcess.on('exit', () => process.exit(0));
}

async function main() {
  const server = await createServer({
    configFile: 'vite.config.ts',
    root,
    clearScreen: false,
    logLevel: 'error',
  });
  await server.listen();
  const url = server.resolvedUrls.local[0];
  console.log(`[renderer] dev server at ${url}`);

  await build({
    configFile: path.join(root, 'vite.preload.config.ts'),
    mode: 'development',
    clearScreen: false,
    logLevel: 'error',
    build: { watch: {} },
    plugins: [
      {
        name: 'preload-restart',
        closeBundle() {
          console.log('[preload] rebuilt');
          touchPreloadTrigger();
        },
      },
    ],
  });

  await build({
    configFile: path.join(root, 'vite.fp-host.config.ts'),
    mode: 'development',
    clearScreen: false,
    logLevel: 'error',
    build: { watch: {} },
    plugins: [
      {
        name: 'fp-host-log',
        closeBundle() {
          console.log(
            '[fp-host] runtime rebuilt — the live fp-host process holds stale code; RESTART REQUIRED (just dev-desktop). Hot-recycle deferred: O521.',
          );
        },
      },
    ],
  });

  // Watch React views — initial build before electron starts so first load has
  // built view-assets. Watchers continue in background after initial build.
  await buildAllViews({ watch: true });
  console.log('[views] initial build done; watching for changes');

  // Watch bundle index.mjs + manifest.json to LOG restart-required (O521/O522).
  installBundleSourceWatcher();

  await build({
    configFile: path.join(root, 'vite.main.config.ts'),
    mode: 'development',
    clearScreen: false,
    logLevel: 'error',
    build: { watch: {} },
    plugins: [
      {
        name: 'main-restart',
        closeBundle() {
          console.log('[main] rebuilt');
          startElectron(url);
        },
      },
    ],
  });
}

main().catch(console.error);
