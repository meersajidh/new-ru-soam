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
import { registerViewProtocol } from './bundle-host/view-protocol';
import { registerWindowControlsCapability } from './capability/window-controls';
import { registerBundlesOutputCapability } from './capability/bundles-output';
import { registerBundleViewsCapability } from './capability/bundle-views';
import { registerShellCapability } from './capability/shell';
import { setLockServiceGetter } from './capability/registry';
import { registerPhiDemoEchoCapability } from './capability/phi-demo-echo';
import { registerPlatformDevCapability } from './capability/platform-dev';
import { registerPrefsCapability } from './capability/prefs';
import { registerAuditCapability } from './capability/audit-cap';
import { registerPlatformAuthCapability } from './capability/platform-auth';
import { localStoreManager } from './local-store/index';
import { auditService } from './audit/index';
// Phase 9: crypto + credentials + lock + workspace
import { credentialStore } from './credentials/index';
import { ensureLocalStoreDbKey } from './credentials/db-key';
import { LockService } from './lock/service';
import { workspaceRegistry } from './workspace/registry';
import { installLockChannel, createAutoLockHandleRef, rebindAutoLock } from './ipc/lock-channel';
import { installAppChannel } from './ipc/app-channel';
import { registerUpdateCapability } from './ipc/update-channel';
import { initUpdater } from './updater/index';
import { registerQuiesceHook } from './updater/db-quiesce';
import { SOAM_EVENT_CHANNEL } from '../shared/ipc-protocol';

if (process.platform === 'linux') {
  app.commandLine.appendSwitch('class', 'ru-soam');
  const desktopAwareApp = app as typeof app & {
    setDesktopFileName?: (name: string) => void;
  };
  if (typeof desktopAwareApp.setDesktopFileName === 'function') {
    desktopAwareApp.setDesktopFileName('ru-soam.desktop');
  }
}

const DEV = !app.isPackaged;
const DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
const PRELOAD_TRIGGER = path.join(os.tmpdir(), 'ru-soam-preload-reload');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.setName('Ru-Soam');
if (process.platform === 'linux' && process.env['DISABLE_GPU'] === '1') {
  app.disableHardwareAcceleration();
}

let mainWindow: BrowserWindow | null = null;

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
  {
    // ADR-411: bundle view assets. `standard: true` so URLs parse with a
    // hostname (the bundleId). Each bundleId becomes a distinct origin —
    // same-origin policy isolates bundles from each other and from the
    // workbench shell at `app://`. `corsEnabled: true` because Electron
    // treats non-CORS-enabled schemes as opaque resources that can't be
    // loaded into cross-origin iframes.
    scheme: 'view',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);

// ── Bootstrap state ───────────────────────────────────────────────────────────
// Mutable active LockService reference — swapped by set-active / sign-out.
let _activeLockService: LockService | null = null;

function getActiveLockService(): LockService | null {
  return _activeLockService;
}

function setActiveLockService(svc: LockService | null): void {
  _activeLockService = svc;
}

const autoLockHandleRef = createAutoLockHandleRef();

// ── Bootstrap ─────────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  // ── Phase 9 bootstrap per Implementation_Plan.md §Phase 9a pinned decisions ──
  //
  // Order:
  //   1. CredentialStore init (fail-fast on Linux if safeStorage unavailable)
  //   2. WorkspaceRegistry (singleton; no init step needed)
  //   3. Resolve initial active LockService
  //   4. Start auto-lock (if active service exists)
  //   5. Install IPC channels
  //   6. Existing setup (window, bundles, etc.)
  //   7. Emit initial context-key events after did-finish-load

  // 1. CredentialStore
  credentialStore.init();

  // 2. WorkspaceRegistry — singleton, available immediately via import

  // Wire the LocalStore manager with a renderer-broadcast emitter so every
  // SQLite write fires a `store.changed` PlatformEvent on the soam:event
  // channel. Mirrors the lock.changed broadcast pattern below.
  localStoreManager.setEmitter((payload) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed()) continue;
      win.webContents.send(SOAM_EVENT_CHANNEL, {
        name: 'store.changed',
        payload,
      });
    }
  });

  // Phase 10b: wire audit service AFTER emitter, BEFORE capability registrations.
  auditService.setStoreGetter(() => localStoreManager.current());

  // ADR-308 §6: register DB quiesce hook so the updater can safely close the
  // store before installer relaunch. Runs PRAGMA wal_checkpoint(TRUNCATE) then
  // db.close() via the store manager's quiesceActive() method.
  registerQuiesceHook(async () => {
    localStoreManager.quiesceActive();
  });

  // 3. Resolve active LockService
  const activeId = workspaceRegistry.getActive();
  if (activeId) {
    const svc = new LockService(activeId);
    setActiveLockService(svc);
    // Always provision db-key regardless of metadataExists (setup-pending
    // workspaces need a key too — the store is opened before setup completes).
    const dbKey = ensureLocalStoreDbKey(activeId);
    // Phase 10b: open the Local Store encrypted. See ADR-302 §"Class 2".
    // openFor() consumes + zeros the key buffer in its finally block.
    localStoreManager.openFor(activeId, dbKey);
  }
  // Else: no active workspace — renderer routes to pre-workspace state

  // 4. Start auto-lock if we have an active service
  rebindAutoLock(autoLockHandleRef, getActiveLockService());

  // 5. Install IPC channels (before window creation so handlers are ready)
  installLockChannel(
    () => mainWindow,
    getActiveLockService,
    setActiveLockService,
    autoLockHandleRef,
  );

  installAppChannel();

  // ── Existing setup ────────────────────────────────────────────────────────
  installCsp(session.defaultSession, DEV);
  installSoamChannel();
  registerViewProtocol();

  // Phase 9b: inject the lock-service getter into the capability registry so
  // PHI-flagged capabilities can check the lock state before dispatching.
  setLockServiceGetter(getActiveLockService);

  registerWindowControlsCapability(() => mainWindow);
  registerBundlesOutputCapability();
  registerBundleViewsCapability();
  registerShellCapability();
  registerPhiDemoEchoCapability();
  registerPlatformDevCapability();
  registerPrefsCapability();
  registerAuditCapability();
  registerPlatformAuthCapability();
  registerUpdateCapability();

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

  // 7. Publish initial context-key events once renderer is ready
  mainWindow.webContents.once('did-finish-load', () => {
    const win = mainWindow;
    if (!win || win.isDestroyed()) return;

    // Emit lock.changed
    const svc = getActiveLockService();
    const lockState = svc ? svc.getState() : { locked: true, setupComplete: false };
    win.webContents.send(SOAM_EVENT_CHANNEL, { name: 'lock.changed', payload: lockState });

    // Emit workspace.changed
    const aid = workspaceRegistry.getActive();
    const meta = aid ? workspaceRegistry.getMeta(aid) : null;
    win.webContents.send(SOAM_EVENT_CHANNEL, {
      name: 'workspace.changed',
      payload: { activeId: aid, nickname: meta?.nickname ?? '' },
    });
  });

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

// Initialise the updater after boot (no-op in dev — gated on app.isPackaged).
const updaterDisposable = initUpdater();

let shutdownStarted = false;
app.on('before-quit', (event) => {
  if (shutdownStarted) return;
  shutdownStarted = true;
  event.preventDefault();
  // Dispose the updater (clears interval + event listeners).
  updaterDisposable.dispose();
  // Phase 10a: close the Local Store cleanly so the next launch doesn't see
  // a busy / stale lock file from an open SQLite handle.
  try {
    localStoreManager.closeActive();
  } catch (err) {
    console.error('[local-store] close error:', err instanceof Error ? err.message : err);
  }
  shutdownHost()
    .catch((err) =>
      console.error('[bundle-host] shutdown error:', err instanceof Error ? err.message : err),
    )
    .finally(() => app.quit());
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
