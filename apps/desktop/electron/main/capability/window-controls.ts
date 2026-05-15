import type { BrowserWindow } from 'electron';
import { registerCapability } from './registry';

export function registerWindowControlsCapability(getWindow: () => BrowserWindow | null): void {
  registerCapability('platform.window', '1.0', async (method) => {
    const win = getWindow();
    if (!win) throw new Error('No window available');
    switch (method) {
      case 'minimize':
        win.minimize();
        return null;
      case 'toggleMaximize':
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        win.isMaximized() ? win.unmaximize() : win.maximize();
        return null;
      case 'close':
        win.close();
        return null;
      case 'isMaximized':
        return win.isMaximized();
      default:
        throw new Error(`Method not found: ${method}`);
    }
  });
}
