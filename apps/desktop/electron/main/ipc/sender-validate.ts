import type { BrowserWindow, IpcMainInvokeEvent } from 'electron';

/**
 * Validate that an IPC `invoke` event originated from a frame the platform
 * itself created. Per ADR-201 §"IPC sender validation" (O12).
 *
 * The platform maintains an allowlist of registered WebContents IDs; every
 * handler must check the sender before doing any work.
 */
const platformWebContentsIds = new Set<number>();

export function registerPlatformWindow(win: BrowserWindow): void {
  const wcId = win.webContents.id;
  platformWebContentsIds.add(wcId);
  win.on('closed', () => platformWebContentsIds.delete(wcId));
}

export function isPlatformSender(event: IpcMainInvokeEvent): boolean {
  return platformWebContentsIds.has(event.sender.id);
}
