import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { app, BrowserWindow, net, protocol } from 'electron';
import { RENDERER_WEB_PREFERENCES, isAllowedNavigation } from './security';

const DEV = !app.isPackaged;
const DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
const PRELOAD_TRIGGER = path.join(os.tmpdir(), 'ru-soam-preload-reload');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log(__dirname, DEV, DEV_SERVER_URL, PRELOAD_TRIGGER);

// const CSP = buildCsp(DEV);

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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.mjs'),
      ...RENDERER_WEB_PREFERENCES,
    },
  });

  mainWindow!.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url, DEV_SERVER_URL, DEV)) event.preventDefault();
  });

  if (DEV && DEV_SERVER_URL) {
    mainWindow.loadURL(DEV_SERVER_URL);
  } else {
    mainWindow.loadURL('app://app/index.html');
  }

  // mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
}

// Register the custom protocol "app://" before the app is ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);

app.whenReady().then(() => {
  // Handle requests to the "app://" protocol by serving files from the renderer directory
  protocol.handle('app', (request) => {
    const url = new URL(request.url);
    // Strip leading slash, resolve against renderer dist
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

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
