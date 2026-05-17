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
import { setLockServiceGetter } from './capability/registry';
import { registerPhiDemoEchoCapability } from './capability/phi-demo-echo';
import { registerPlatformDevCapability } from './capability/platform-dev';
// Phase 9: crypto + credentials + lock + workspace
import { credentialStore } from './credentials/index';
import { ensureLocalStoreDbKey } from './credentials/db-key';
import { LockService } from './lock/service';
import { metadataExists } from './lock/storage';
import { workspaceRegistry } from './workspace/registry';
import { maybeProvision, DEV_WORKSPACE_ID } from './workspace/dev-provision';
import { installLockChannel, createAutoLockHandleRef, rebindAutoLock } from './ipc/lock-channel';
import { SOAM_EVENT_CHANNEL } from '../shared/ipc-protocol';

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

app.whenReady().then(async () => {
  // ── Phase 9 bootstrap per Implementation_Plan.md §Phase 9a pinned decisions ──
  //
  // Order:
  //   1. CredentialStore init (fail-fast on Linux if safeStorage unavailable)
  //   2. WorkspaceRegistry (singleton; no init step needed)
  //   3. maybeProvision (DEV+!isPackaged+zero-workspaces only)
  //   4. Resolve initial active LockService
  //   5. Start auto-lock (if active service exists)
  //   6. Install IPC channels
  //   7. Existing setup (window, bundles, etc.)
  //   8. Emit initial context-key events after did-finish-load

  // 1. CredentialStore
  credentialStore.init();

  // 2. WorkspaceRegistry — singleton, available immediately via import

  // 3. DEV auto-provision — returns the auto-unlocked LockService if provisioning ran
  const devProvisionedSvc = await maybeProvision();

  // 4. Resolve active LockService
  if (devProvisionedSvc) {
    // Dev provision just ran and returned an already-unlocked service
    setActiveLockService(devProvisionedSvc);
    ensureLocalStoreDbKey(DEV_WORKSPACE_ID);
  } else {
    const activeId = workspaceRegistry.getActive();
    if (activeId && metadataExists(activeId)) {
      const svc = new LockService(activeId);
      setActiveLockService(svc);
      // Phase 10 prereq: ensure db-key for active workspace
      ensureLocalStoreDbKey(activeId);
    }
    // Else: no active workspace or setup not complete — renderer routes to pre-workspace state
  }

  // 5. Start auto-lock if we have an active service
  rebindAutoLock(autoLockHandleRef, getActiveLockService());

  // 6. Install IPC channels (before window creation so handlers are ready)
  installLockChannel(
    () => mainWindow,
    getActiveLockService,
    setActiveLockService,
    autoLockHandleRef,
  );

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
  registerPhiDemoEchoCapability();
  registerPlatformDevCapability();

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

  // 8. Publish initial context-key events once renderer is ready
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
