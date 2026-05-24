/**
 * Update orchestrator — ADR-204 §4.
 *
 * Owns the electron-updater lifecycle. All state transitions are broadcast
 * to the renderer via `platform.update.state-changed` on SOAM_EVENT_CHANNEL.
 *
 * Guards:
 * - Only runs when app.isPackaged (no-op in dev / `just dev-desktop`).
 * - allowPrerelease = false (ADR-204 §6 roll-forward only).
 * - 6h check interval is disposable (cleaned up on app quit).
 *
 * Linux: download-and-guided-install path (ADR-204 §5). electron-updater
 * downloads the .deb to userData; Main surfaces path + install command via
 * the update capability. quitAndInstall is NOT called on Linux.
 *
 * Windows: seamless. electron-updater invokes NSIS in silent mode via
 * quitAndInstall after the quiesce sequence runs.
 */

import { app, BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';
import type { UpdateDownloadedEvent } from 'electron-updater';
import type { Disposable } from '../lock/service.js';
import { SOAM_EVENT_CHANNEL } from '../../shared/ipc-protocol.js';
import { quiesceForUpdate } from './db-quiesce.js';
import { buildLinuxInstallInfo } from './linux-deb.js';
import {
  makeIdle,
  makeChecking,
  makeAvailable,
  makeDownloading,
  makeReady,
  makeError,
  type UpdateState,
} from './state.js';
import type { UpdateStateChangedPayload, LinuxInstallInfo } from '../../shared/update.js';

// ── Internal state ─────────────────────────────────────────────────────────────

let _state: UpdateState = makeIdle();
/** Linux only: set when 'update-downloaded' fires. */
let _linuxInstallInfo: LinuxInstallInfo | null = null;

// ── Broadcast helpers ──────────────────────────────────────────────────────────

function broadcast(state: UpdateState): void {
  _state = state;
  const payload: UpdateStateChangedPayload = { state };
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(SOAM_EVENT_CHANNEL, {
        name: 'platform.update.state-changed',
        payload,
      });
    }
  }
}

// ── Public accessors (for IPC capability) ─────────────────────────────────────

export function getUpdateState(): UpdateState {
  return _state;
}

export function getLinuxInstallInfo(): LinuxInstallInfo | null {
  return _linuxInstallInfo;
}

// ── Trigger helpers ───────────────────────────────────────────────────────────

export async function triggerCheck(): Promise<void> {
  if (_state.status === 'checking' || _state.status === 'downloading') return;
  broadcast(makeChecking());
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    broadcast(makeError(err instanceof Error ? err.message : String(err)));
  }
}

export async function triggerDownload(): Promise<void> {
  if (_state.status !== 'available') return;
  try {
    await autoUpdater.downloadUpdate();
  } catch (err) {
    broadcast(makeError(err instanceof Error ? err.message : String(err)));
  }
}

export async function triggerInstallAndRestart(): Promise<void> {
  if (_state.status !== 'ready') return;

  // Linux: guided install — do not call quitAndInstall.
  if (process.platform === 'linux') return;

  // Windows: quiesce DB then trigger NSIS silent install + relaunch.
  try {
    await quiesceForUpdate();
  } catch (err) {
    console.error('[updater] quiesce failed before install:', err);
  }
  autoUpdater.quitAndInstall(false, true);
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

/**
 * Initialise electron-updater and start the periodic check cycle.
 * Returns a Disposable that cancels the interval and removes all listeners.
 * Must only be called once, after `app.whenReady()`.
 */
export function initUpdater(): Disposable {
  // Guard: no-op in dev builds. Never contact GitHub during development.
  if (!app.isPackaged) {
    return { dispose() {} };
  }

  // ADR-204 §6: roll-forward only, no prerelease channel by default.
  autoUpdater.allowPrerelease = false;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  // ── Event wiring ────────────────────────────────────────────────────────────

  function onError(err: Error): void {
    broadcast(makeError(err.message));
  }

  function onChecking(): void {
    broadcast(makeChecking());
  }

  function onUpdateAvailable(info: { version: string; releaseDate?: string | null }): void {
    broadcast(makeAvailable(info.version, info.releaseDate ?? null));
  }

  function onUpdateNotAvailable(): void {
    broadcast(makeIdle());
  }

  function onDownloadProgress(progress: {
    percent: number;
    bytesPerSecond: number;
    transferred: number;
    total: number;
    delta?: number;
  }): void {
    const version = _state.status === 'downloading' ? _state.version
      : _state.status === 'available' ? _state.version
      : '';
    broadcast(makeDownloading(
      version,
      progress.percent,
      progress.bytesPerSecond,
      progress.transferred,
      progress.total,
    ));
  }

  function onUpdateDownloaded(event: UpdateDownloadedEvent): void {
    const version = event.version;
    if (process.platform === 'linux') {
      // electron-updater sets `downloadedFile` on the event for Linux/AppImage
      // and other non-NSIS targets. For .deb, the downloaded path is in
      // event.downloadedFile (DownloadedUpdateHelper sets this field).
      // See: https://www.electron.build/auto-update#event-update-downloaded
      const debPath = (event as UpdateDownloadedEvent & { downloadedFile?: string }).downloadedFile
        ?? '';
      if (!debPath) {
        console.warn('[updater] update-downloaded event missing downloadedFile; Linux install info unavailable');
      }
      _linuxInstallInfo = debPath ? buildLinuxInstallInfo(debPath) : null;
    }
    broadcast(makeReady(version));
  }

  autoUpdater.on('error', onError);
  autoUpdater.on('checking-for-update', onChecking);
  autoUpdater.on('update-available', onUpdateAvailable);
  autoUpdater.on('update-not-available', onUpdateNotAvailable);
  autoUpdater.on('download-progress', onDownloadProgress);
  autoUpdater.on('update-downloaded', onUpdateDownloaded);

  // ── Initial check (delayed 10 s to let app settle) ──────────────────────────

  const bootTimer = setTimeout(() => {
    void triggerCheck();
  }, 10_000);

  // ── Periodic 6 h check ──────────────────────────────────────────────────────

  const SIX_HOURS_MS = 6 * 60 * 60 * 1_000;
  const intervalHandle = setInterval(() => {
    void triggerCheck();
  }, SIX_HOURS_MS);

  // ── Disposable ──────────────────────────────────────────────────────────────

  return {
    dispose() {
      clearTimeout(bootTimer);
      clearInterval(intervalHandle);
      autoUpdater.removeListener('error', onError);
      autoUpdater.removeListener('checking-for-update', onChecking);
      autoUpdater.removeListener('update-available', onUpdateAvailable);
      autoUpdater.removeListener('update-not-available', onUpdateNotAvailable);
      autoUpdater.removeListener('download-progress', onDownloadProgress);
      autoUpdater.removeListener('update-downloaded', onUpdateDownloaded);
    },
  };
}
