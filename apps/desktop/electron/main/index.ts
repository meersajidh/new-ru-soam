import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { app, BrowserWindow, dialog, net, protocol, session } from 'electron';
import { installCsp } from './security';
import { createWorkbenchWindow } from './window-factory';
import { installSoamChannel } from './ipc/soam-channel';
import { registerPlatformWindow } from './ipc/sender-validate';
import { shutdownHost } from './fp-host/manager';
import {
  installBundleCrashEventBridge,
  loadAndActivateBundles,
  registerDiscoveredBundles,
  resolveBundlesDirectory,
} from './fp-host/loader';
import { discoverBundles } from './fp-host/manifest';
import { registerBundleMigrations, registerBundleQueryTemplates } from './fp-host/bundle-schema';
import { registerViewProtocol } from './fp-host/view-protocol';
import { registerWindowControlsCapability } from './capability/window-controls';
import { registerBundlesOutputCapability } from './capability/bundles-output';
import { registerBundleViewsCapability } from './capability/bundle-views';
import { registerContributionsCapability } from './capability/contributions';
import { registerShellCapability } from './capability/shell';
import { setLockServiceGetter, invokeCapability } from './capability/registry';
import { registerPhiDemoEchoCapability } from './capability/phi-demo-echo';
import { registerPlatformDevCapability } from './capability/platform-dev';
import { registerPrefsCapability } from './capability/prefs';
import { registerAuditCapability } from './capability/audit-cap';
import { registerStoreWriteCapability, registerStoreEraseSubjectCapability } from './local-store/store-write-cap';
import { registerStoreQueryCapability } from './local-store/store-query-cap';
import { registerBlobCapabilities } from './local-store/blob-cap';
import { registerPlatformAuthCapability } from './capability/platform-auth';
import { isOAuthConfigured } from './auth/oauth.js';
import { cloudSessionService } from './cloud/session-service.js';
import { telemetryService } from './cloud/telemetry.js';
import { localStoreManager } from './local-store/index';
import { auditService } from './audit/index';
// Phase 9: crypto + credentials + lock + workspace
import { credentialStore } from './credentials/index';
import { metadataExists } from './lock/storage';
import { ensureLocalStoreDbKey } from './credentials/db-key';
import { LockService } from './lock/service';
import { workspaceRegistry } from './workspace/registry';
import { installLockChannel, createAutoLockHandleRef, rebindAutoLock } from './ipc/lock-channel';
import { parseIdleLockPref } from './lock/auto-lock';
import { installAppChannel } from './ipc/app-channel';
import { registerUpdateCapability } from './ipc/update-channel';
import { registerCommandsCapability } from './capability/commands';
import { registerCredentialBrokerCapability } from './capability/credential-broker';
import { registerBrokeredFetchCapability, registerApiHostsFromBundles } from './capability/brokered-fetch';
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
  // ── OAuth configuration gate ──────────────────────────────────────────────
  if (!isOAuthConfigured()) {
    dialog.showErrorBox(
      'OAuth not configured',
      'The app cannot sign in and will now exit. Contact your app administrator.',
    );
    app.exit(1);
    return;
  }

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

  // Discover bundles ONCE early — the same list is shared across migration registration,
  // query-template registration, and activation (rung F / O445 — no double-discovery).
  const discovered = discoverBundles(resolveBundlesDirectory());

  // Wire apiHosts allowlist from discovered manifests — must run before capability
  // registrations so that net.brokeredFetch can resolve caller allowlists at boot.
  registerApiHostsFromBundles(discovered);

  // Bundle migration sets MUST be registered before any store.open / runMigrations.
  // Migration sets have no capability/lock dependency — they are pure DDL descriptors
  // consumed only when the store opens.
  registerBundleMigrations(discovered);

  // 3. Resolve active LockService
  const activeId = workspaceRegistry.getActive();
  if (activeId) {
    // Guard: only trust the active pointer when the workspace has a valid meta.json.
    // A stale pointer (manually deleted / corrupt workspace dir) must not create a
    // ghost LockService or recreate the store directory — clear it and fall through.
    if (workspaceRegistry.getMeta(activeId) === null) {
      console.warn('[boot] active workspace pointer stale (no meta.json) — clearing:', activeId);
      workspaceRegistry.setActive(null);
    } else {
      const svc = new LockService(activeId);
      setActiveLockService(svc);
      // Always provision db-key regardless of metadataExists (setup-pending
      // workspaces need a key too — the store is opened before setup completes).
      const dbKey = ensureLocalStoreDbKey(activeId);
      // Phase 10b: open the Local Store encrypted. See ADR-302 §"Class 2".
      // openFor() consumes + zeros the key buffer in its finally block.
      localStoreManager.openFor(activeId, dbKey);
    }
  }
  // Else: no active workspace — renderer routes to pre-workspace state

  // Sweep abandoned setup-pending workspaces: have meta.json (create ran) but no
  // lock.json (setupAcknowledge never completed = abandoned signup). Skip the active
  // workspace — an active setup-pending workspace is a legit interrupted setup the
  // renderer resumes via /setup/keys. (No real user data exists without lock.json.)
  {
    const activeIdForSweep = workspaceRegistry.getActive();
    for (const meta of workspaceRegistry.list()) {
      if (meta.workspaceId === activeIdForSweep) continue;
      if (!metadataExists(meta.workspaceId)) {
        console.warn('[boot] sweeping abandoned setup-pending workspace:', meta.workspaceId);
        try {
          credentialStore.deleteAllForWorkspace(meta.workspaceId);
          workspaceRegistry.delete(meta.workspaceId);
        } catch (err) {
          console.error('[boot] failed to sweep workspace', meta.workspaceId, err);
        }
      }
    }
  }

  // 4. Start auto-lock if we have an active service — seed idle timeout from pref (O502).
  {
    const rawIdleMin = localStoreManager.current()?.getPref('security.idleLockMin');
    rebindAutoLock(autoLockHandleRef, getActiveLockService(), parseIdleLockPref(rawIdleMin));
  }

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
  registerContributionsCapability();
  registerShellCapability();
  registerPhiDemoEchoCapability();

  // O449 rung-0 PHI-gate self-check (dev-only, ADR-418 Am1).
  // Verifies that a synthetic third-party caller is denied access to a PHI cap.
  // PASS = result is ok:false with code cap.denied.
  if (DEV) {
    void invokeCapability('phi.demo.echo', '1.0', 'echo', ['x'], {
      caller: { bundleId: '__synthetic_third_party__', trustClass: 'third-party' },
    }).then((result) => {
      if (!result.ok && result.value.code === 'cap.denied') {
        console.log('[O449] PHI-gate self-check PASS — cap.denied returned for third-party caller');
      } else {
        console.error('[O449] PHI-gate self-check FAIL — expected cap.denied, got:', result);
      }
    });
  }

  registerPlatformDevCapability();
  registerPrefsCapability();
  registerAuditCapability();
  registerStoreWriteCapability();
  registerStoreEraseSubjectCapability();
  registerStoreQueryCapability();
  registerBlobCapabilities();

  // O446 rung-C store.write self-check (dev-only, ADR-506 §6).
  // Runs AFTER registerStoreWriteCapability() so the cap is registered when invoked.
  // Exercise ownership-mismatch denial — must NOT write to the DB.
  // store.write is PHI-flagged: if workspace is locked at boot the registry
  // returns cap.locked before the handler runs — treat as SKIP (lock-tolerant).
  if (DEV) {
    void invokeCapability(
      'store.write',
      '1.0',
      'insert',
      ['patients', { given_name: 'x' }, { event: 'selfcheck' }],
      { caller: { bundleId: '__not_the_owner__', trustClass: 'first-party' } },
    ).then((result) => {
      if (!result.ok && result.value.code === 'cap.denied') {
        console.log(
          '[O446] store.write self-check PASS — cap.denied returned for non-owner caller',
        );
      } else if (!result.ok && result.value.code === 'cap.locked') {
        console.log('[O446] store.write self-check SKIP — workspace locked');
      } else {
        console.error('[O446] store.write self-check FAIL — expected cap.denied, got:', result);
      }
    });
  }

  // O446 rung-C store.query self-check (dev-only, ADR-506 §6).
  // Runs AFTER registerStoreQueryCapability() so the cap is registered when invoked.
  // Exercise unknown-template path — no PHI read, no template-ordering dependency.
  // store.query is PHI-flagged: if workspace is locked at boot the registry
  // returns cap.locked before the handler runs — treat as SKIP (lock-tolerant).
  if (DEV) {
    void invokeCapability(
      'store.query',
      '1.0',
      'run',
      ['__selfcheck.unknown__'],
      { caller: { bundleId: '__selfcheck__', trustClass: 'first-party' } },
    ).then((result) => {
      if (!result.ok && result.value.code === 'cap.not_found') {
        console.log('[O446] store.query self-check PASS — cap.not_found for unknown template');
      } else if (!result.ok && result.value.code === 'cap.locked') {
        console.log('[O446] store.query self-check SKIP — workspace locked');
      } else {
        console.error('[O446] store.query self-check FAIL — expected cap.not_found, got:', result);
      }
    });
  }

  registerPlatformAuthCapability();

  // Phase β / O468: wire telemetry token provider. The arrow function closes over
  // cloudSessionService without creating an import cycle (telemetry.ts does NOT
  // import session-service.ts; only main/index.ts knows both).
  telemetryService.init(() => cloudSessionService.accessToken());

  // Proactive rotation + renderer session-state bridge.
  // kekProvider: returns live KEK when workspace is unlocked, null when locked.
  // emitSessionChange: pushes cloud.session.changed to the renderer so the
  //   status-bar indicator and SettingsMenu reflect live session state.
  cloudSessionService.init(
    () => getActiveLockService()?.kekHandle() ?? null,
    (signedIn) => {
      const win = mainWindow;
      if (win && !win.isDestroyed()) {
        win.webContents.send(SOAM_EVENT_CHANNEL, {
          name: 'cloud.session.changed',
          payload: { signedIn },
        });
      }
    },
  );

  registerUpdateCapability();
  registerCommandsCapability();
  registerCredentialBrokerCapability(() => getActiveLockService()?.kekHandle() ?? null);
  registerBrokeredFetchCapability();

  // Bundle query templates — rung F / O445.
  // Must come after registerStoreQueryCapability() (already called above)
  // so the template registry module is initialised.
  registerBundleQueryTemplates(discovered);

  // Register routing handlers, views, and manifest contributions for ALL discovered
  // bundles synchronously, BEFORE window creation — so the renderer's one-shot
  // `platform.contributions.list` seed always observes the complete snapshot. Must
  // come after the base capability registrations above (bundle routing handlers may
  // forward to base caps) and before the window exists (the renderer's IPC seed
  // races the loader otherwise — empty Activity Bar on slower hosts). Eager
  // activation itself stays deferred — see loadAndActivateBundles below.
  registerDiscoveredBundles(discovered);

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
  void loadAndActivateBundles(discovered).catch((err) =>
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
      console.error('[fp-host] shutdown error:', err instanceof Error ? err.message : err),
    )
    .finally(() => app.quit());
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
