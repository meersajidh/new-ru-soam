import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { app, BrowserWindow, net, protocol, session } from 'electron';
import { installCsp } from './security';
import { createWorkbenchWindow } from './window-factory';
import { installSoamChannel } from './ipc/soam-channel';
import { registerPlatformWindow } from './ipc/sender-validate';
import { shutdownHost } from './bundle-host/manager';
import { installBundleCrashEventBridge, loadAndActivateBundles } from './bundle-host/loader';
import { registerWindowControlsCapability } from './capability/window-controls';
import { registerBundlesOutputCapability } from './capability/bundles-output';

const DEV = !app.isPackaged;
const DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
const PRELOAD_TRIGGER = path.join(os.tmpdir(), 'ru-soam-preload-reload');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.setName('Ru-Soam');
if (process.platform === 'linux') {
  if (process.env['DISABLE_GPU'] === '1') app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('class', 'ru-soam');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const appAny = app as any;
  if (typeof appAny.setDesktopFileName === 'function') {
    appAny.setDesktopFileName('ru-soam.desktop');
  }
}

let mainWindow: BrowserWindow | null = null;

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);

app.whenReady().then(() => {
  installCsp(session.defaultSession, DEV);
  installSoamChannel();
  registerWindowControlsCapability(() => mainWindow);
  registerBundlesOutputCapability();

  protocol.handle('app', (request) => {
    const url = new URL(request.url);
    const filePath = path.join(__dirname, '../renderer', url.pathname);
    return net.fetch(pathToFileURL(filePath).toString()).catch(() => {
      if (path.extname(url.pathname) !== '') {
        return new Response(null, { status: 404 });
      }
      return net.fetch(pathToFileURL(path.join(__dirname, '../renderer/index.html')).toString());
    });
  });

  if (DEV) {
    fs.writeFileSync(PRELOAD_TRIGGER, '');
    fs.watch(PRELOAD_TRIGGER, () => mainWindow?.webContents.reload());
  }

  mainWindow = createWorkbenchWindow({ devServerUrl: DEV_SERVER_URL, isDev: DEV });
  registerPlatformWindow(mainWindow);

  installBundleCrashEventBridge(() => mainWindow);
  void loadAndActivateBundles().catch((err) =>
    console.error('[bundles] loader failed:', err instanceof Error ? err.stack : err),
  );

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWorkbenchWindow({ devServerUrl: DEV_SERVER_URL, isDev: DEV });
      registerPlatformWindow(mainWindow);
    }
  });
});

let shutdownStarted = false;
app.on('before-quit', (event) => {
  if (shutdownStarted) return;
  shutdownStarted = true;
  event.preventDefault();
  shutdownHost()
    .catch((err) =>
      console.error('[bundle-host] shutdown error:', err instanceof Error ? err.message : err),
    )
    .finally(() => app.quit());
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
