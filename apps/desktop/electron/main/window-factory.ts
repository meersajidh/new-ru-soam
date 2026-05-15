import path from 'path';
import { fileURLToPath } from 'url';
import { BrowserWindow, shell } from 'electron';
import { RENDERER_WEB_PREFERENCES, isAllowedNavigation } from './security';
import { SOAM_EVENT_CHANNEL } from '../shared/ipc-protocol';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface CreateWorkbenchWindowOptions {
  readonly devServerUrl: string | undefined;
  readonly isDev: boolean;
  readonly width?: number;
  readonly height?: number;
}

/**
 * Platform-owned BrowserWindow factory.
 *
 * Per ADR-201 §"Single enforcement point": all workbench windows go through
 * this factory. Feature code does not `new BrowserWindow(...)`. The factory
 * applies hardened `webPreferences`, denies open-window-by-default, denies
 * unauthorised navigation, and forwards external links to the OS shell.
 */
export function createWorkbenchWindow(opts: CreateWorkbenchWindowOptions): BrowserWindow {
  const win = new BrowserWindow({
    width: opts.width ?? 1280,
    height: opts.height ?? 800,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      ...RENDERER_WEB_PREFERENCES,
    },
  });

  win.on('maximize', () =>
    win.webContents.send(SOAM_EVENT_CHANNEL, { name: 'window.maximized', payload: true }),
  );
  win.on('unmaximize', () =>
    win.webContents.send(SOAM_EVENT_CHANNEL, { name: 'window.maximized', payload: false }),
  );

  win.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url, opts.devServerUrl, opts.isDev)) {
      event.preventDefault();
    }
  });

  // Deny-by-default for new windows. External links route to the OS shell;
  // everything else is silently denied.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // `<webview>` is forbidden by ADR-201. Refuse any attempt to attach one.
  win.webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });

  if (opts.isDev && opts.devServerUrl) {
    void win.loadURL(opts.devServerUrl);
  } else {
    void win.loadURL('app://app/index.html');
  }

  return win;
}
