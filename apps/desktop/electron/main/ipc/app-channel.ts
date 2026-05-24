/**
 * IPC handler for the `app` bedrock surface.
 *
 * Channel:
 *   soam:app:get-version  → string  (the running app version from app.getVersion())
 *
 * Per ADR-202: renderer must never import `electron` — version reaches it
 * only through this channel → window.soam.app.getVersion().
 */

import { ipcMain, app } from 'electron';
import { isPlatformSender } from './sender-validate.js';

export function installAppChannel(): void {
  // ── soam:app:get-version ───────────────────────────────────────────────────
  ipcMain.handle('soam:app:get-version', (event) => {
    if (!isPlatformSender(event)) return null;
    return app.getVersion();
  });
}
