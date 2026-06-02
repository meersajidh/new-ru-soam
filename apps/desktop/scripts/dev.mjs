import { createServer, build } from 'vite';
import { spawn } from 'child_process';
import { writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const electronBin = require('electron');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const PRELOAD_TRIGGER = path.join(os.tmpdir(), 'ru-soam-preload-reload');

let electronProcess = null;

function touchPreloadTrigger() {
  writeFileSync(PRELOAD_TRIGGER, Date.now().toString());
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
    configFile: path.join(root, 'vite.bundle-host.config.ts'),
    mode: 'development',
    clearScreen: false,
    logLevel: 'error',
    build: { watch: {} },
    plugins: [
      {
        name: 'bundle-host-log',
        closeBundle() {
          console.log('[bundle-host] rebuilt');
        },
      },
    ],
  });

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
