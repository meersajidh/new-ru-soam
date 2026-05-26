/**
 * IPC handlers for the lock/setup/workspace surface.
 *
 * Channels:
 *   soam:lock:state, soam:lock:unlock, soam:lock:unlock-recovery,
 *   soam:lock:set-passphrase-after-recovery, soam:lock:change-passphrase,
 *   soam:lock:relock, soam:lock:heartbeat,
 *   soam:setup:generate, soam:setup:acknowledge,
 *   soam:workspace:list, soam:workspace:get-active, soam:workspace:set-active,
 *   soam:workspace:create, soam:workspace:sign-out, soam:workspace:get-identity.
 *
 * Lock-state-change emits via soam:event with name 'lock.changed'.
 * Workspace-change emits via soam:event with name 'workspace.changed'.
 * Every handler validates sender via isPlatformSender.
 *
 * The "active LockService" is an indirection — the bootstrap provides a
 * getter (`getActiveLockService`) and a rebind callback (`rebindAutoLock`)
 * so that sign-out / set-active can swap the active service at runtime.
 */

import { ipcMain } from 'electron';
import { isPlatformSender } from './sender-validate.js';
import { LockService } from '../lock/service.js';
import { startAutoLock } from '../lock/auto-lock.js';
import type { AutoLockHandle } from '../lock/auto-lock.js';
import { workspaceRegistry } from '../workspace/registry.js';
import { ensureLocalStoreDbKey } from '../credentials/db-key.js';
import { localStoreManager } from '../local-store/index.js';
import { auditService } from '../audit/index.js';
import { SOAM_EVENT_CHANNEL } from '../../shared/ipc-protocol.js';
import type {
  WorkspaceCreateResult,
  WorkspaceSetActiveResult,
} from '../../shared/lock-protocol.js';
import type { BrowserWindow } from 'electron';

type GetWindow = () => BrowserWindow | null;
type GetActiveLockService = () => LockService | null;
type SetActiveLockService = (svc: LockService | null) => void;

/**
 * Mutable reference for the active auto-lock handle.
 * Replaced when setActive / signOut swaps the LockService.
 */
interface AutoLockHandleRef {
  current: AutoLockHandle | null;
}

function emitLockChanged(getWindow: GetWindow, getActiveLockService: GetActiveLockService): void {
  const win = getWindow();
  if (!win || win.isDestroyed()) return;
  const svc = getActiveLockService();
  const state = svc ? svc.getState() : { locked: true, setupComplete: false, mustResetPassphrase: false };
  win.webContents.send(SOAM_EVENT_CHANNEL, {
    name: 'lock.changed',
    payload: state,
  });
}

function emitWorkspaceChanged(getWindow: GetWindow): void {
  const win = getWindow();
  if (!win || win.isDestroyed()) return;
  const activeId = workspaceRegistry.getActive();
  const meta = activeId ? workspaceRegistry.getMeta(activeId) : null;
  win.webContents.send(SOAM_EVENT_CHANNEL, {
    name: 'workspace.changed',
    payload: { activeId, nickname: meta?.nickname ?? '' },
  });
}

export function installLockChannel(
  getWindow: GetWindow,
  getActiveLockService: GetActiveLockService,
  setActiveLockService: SetActiveLockService,
  autoLockHandleRef: AutoLockHandleRef,
): void {
  // Emit lock state changes to renderer whenever active service fires
  // We subscribe lazily in setActive; initial subscription done here
  // for the service that already exists at install time.
  const initialSvc = getActiveLockService();
  if (initialSvc) {
    initialSvc.onDidChange(() => emitLockChanged(getWindow, getActiveLockService));
  }

  // ── soam:lock:state ────────────────────────────────────────────────────────
  ipcMain.handle('soam:lock:state', (event) => {
    if (!isPlatformSender(event)) return null;
    const svc = getActiveLockService();
    if (!svc) return { locked: true, setupComplete: false, mustResetPassphrase: false };
    return svc.getState();
  });

  // ── soam:lock:unlock ───────────────────────────────────────────────────────
  ipcMain.handle('soam:lock:unlock', async (event, passphrase: unknown) => {
    if (!isPlatformSender(event)) return null;
    const svc = getActiveLockService();
    if (!svc) return { ok: false, code: 'not-set-up' };
    if (typeof passphrase !== 'string') return { ok: false, code: 'not-set-up' };
    const result = await svc.unlock(passphrase);
    if (result.ok) {
      const workspaceId = workspaceRegistry.getActive();
      if (workspaceId) {
        const nickname = workspaceRegistry.getMeta(workspaceId)?.nickname;
        auditService.emit({
          event: 'workspace.unlock',
          entityId: workspaceId,
          principal: nickname ?? 'system',
        });
      }
    }
    return result;
  });

  // ── soam:lock:unlock-recovery ──────────────────────────────────────────────
  ipcMain.handle('soam:lock:unlock-recovery', async (event, words: unknown) => {
    if (!isPlatformSender(event)) return null;
    const svc = getActiveLockService();
    if (!svc) return { ok: false, code: 'not-set-up' };
    if (!Array.isArray(words) || !words.every((w) => typeof w === 'string')) {
      return { ok: false, code: 'bad-recovery-code' };
    }
    const result = await svc.unlockWithRecoveryCode(words as string[]);
    if (result.ok) {
      const workspaceId = workspaceRegistry.getActive();
      if (workspaceId) {
        const nickname = workspaceRegistry.getMeta(workspaceId)?.nickname;
        auditService.emit({
          event: 'workspace.recovery.used',
          entityId: workspaceId,
          principal: nickname ?? 'system',
        });
      }
    }
    return result;
  });

  // ── soam:lock:set-passphrase-after-recovery ────────────────────────────────
  ipcMain.handle('soam:lock:set-passphrase-after-recovery', async (event, passphrase: unknown) => {
    if (!isPlatformSender(event)) return null;
    const svc = getActiveLockService();
    if (!svc) return { ok: false, code: 'not-set-up' };
    if (typeof passphrase !== 'string') return { ok: false, code: 'not-set-up' };
    return svc.setPassphraseAfterRecovery(passphrase);
  });

  // ── soam:lock:change-passphrase ────────────────────────────────────────────
  ipcMain.handle('soam:lock:change-passphrase', async (event, current: unknown, next: unknown) => {
    if (!isPlatformSender(event)) return null;
    const svc = getActiveLockService();
    if (!svc) return { ok: false, code: 'not-set-up' };
    if (typeof current !== 'string' || typeof next !== 'string') {
      return { ok: false, code: 'not-set-up' };
    }
    const result = await svc.changePassphrase(current, next);
    if (result.ok) {
      const workspaceId = workspaceRegistry.getActive();
      if (workspaceId) {
        const nickname = workspaceRegistry.getMeta(workspaceId)?.nickname;
        auditService.emit({
          event: 'workspace.passphrase.changed',
          entityId: workspaceId,
          principal: nickname ?? 'system',
        });
      }
    }
    return result;
  });

  // ── soam:lock:relock ───────────────────────────────────────────────────────
  ipcMain.handle('soam:lock:relock', (event) => {
    if (!isPlatformSender(event)) return null;
    const svc = getActiveLockService();
    if (svc) {
      svc.relock();
      const workspaceId = workspaceRegistry.getActive();
      if (workspaceId) {
        const nickname = workspaceRegistry.getMeta(workspaceId)?.nickname;
        auditService.emit({
          event: 'workspace.relock',
          entityId: workspaceId,
          principal: nickname ?? 'system',
        });
      }
    }
    return null;
  });

  // ── soam:lock:heartbeat ────────────────────────────────────────────────────
  ipcMain.handle('soam:lock:heartbeat', (event) => {
    if (!isPlatformSender(event)) return null;
    autoLockHandleRef.current?.recordHeartbeat();
    return null;
  });

  // ── soam:setup:generate ────────────────────────────────────────────────────
  ipcMain.handle('soam:setup:generate', async (event, args: unknown) => {
    if (!isPlatformSender(event)) return null;
    const svc = getActiveLockService();
    if (!svc) return { ok: false, code: 'no-active-workspace' };
    if (!args || typeof args !== 'object' || typeof (args as Record<string, unknown>).passphrase !== 'string') {
      return { ok: false, code: 'already-set-up' };
    }
    const passphrase = (args as { passphrase: string }).passphrase;
    return svc.setupGenerate(passphrase);
  });

  // ── soam:setup:acknowledge ─────────────────────────────────────────────────
  ipcMain.handle('soam:setup:acknowledge', (event, args: unknown) => {
    if (!isPlatformSender(event)) return null;
    const svc = getActiveLockService();
    if (!svc) return { ok: false, code: 'no-active-workspace' };
    if (
      !args ||
      typeof args !== 'object' ||
      !(args as Record<string, unknown>)['identity'] ||
      typeof (args as Record<string, unknown>)['identity'] !== 'object' ||
      typeof ((args as Record<string, unknown>)['identity'] as Record<string, unknown>)['email'] !== 'string'
    ) {
      return { ok: false, code: 'not-generated' };
    }
    const rawIdentity = (args as { identity: { email: string; googleId?: unknown } }).identity;
    // Accept optional googleId if it is a string; ignore if present but wrong type.
    const identity: { email: string; googleId?: string } = {
      email: rawIdentity.email,
      ...(typeof rawIdentity.googleId === 'string' ? { googleId: rawIdentity.googleId } : {}),
    };
    const result = svc.setupAcknowledge({ identity });
    if (result.ok) {
      const workspaceId = workspaceRegistry.getActive();
      if (workspaceId) {
        const nickname = workspaceRegistry.getMeta(workspaceId)?.nickname;
        auditService.emit({
          event: 'workspace.setup.complete',
          entityId: workspaceId,
          principal: nickname ?? 'system',
        });
      }
    }
    return result;
  });

  // ── soam:workspace:list ────────────────────────────────────────────────────
  ipcMain.handle('soam:workspace:list', (event) => {
    if (!isPlatformSender(event)) return null;
    return workspaceRegistry.list();
  });

  // ── soam:workspace:get-active ──────────────────────────────────────────────
  ipcMain.handle('soam:workspace:get-active', (event) => {
    if (!isPlatformSender(event)) return null;
    return workspaceRegistry.getActive();
  });

  // ── soam:workspace:set-active ──────────────────────────────────────────────
  ipcMain.handle('soam:workspace:set-active', (event, workspaceId: unknown) => {
    if (!isPlatformSender(event)) return null;
    if (typeof workspaceId !== 'string') {
      return { ok: false, code: 'unknown-workspace' } satisfies WorkspaceSetActiveResult;
    }
    const meta = workspaceRegistry.getMeta(workspaceId);
    if (!meta) {
      return { ok: false, code: 'unknown-workspace' } satisfies WorkspaceSetActiveResult;
    }

    // Dispose current LockService + auto-lock handle
    const currentSvc = getActiveLockService();
    if (currentSvc) currentSvc.relock();
    rebindAutoLock(autoLockHandleRef, null);

    // Instantiate a new LockService for the selected workspace
    const newSvc = new LockService(workspaceId);
    setActiveLockService(newSvc);

    // Subscribe new service to lock-changed events
    newSvc.onDidChange(() => emitLockChanged(getWindow, getActiveLockService));

    // Phase 10b: always provision db-key regardless of lock.json state.
    // Setup-pending workspaces need a key too — the store is opened before
    // setup completes (the key is idempotent; ensureLocalStoreDbKey is safe
    // to call unconditionally).
    const dbKey = ensureLocalStoreDbKey(workspaceId);

    // Open the Local Store encrypted for the newly active workspace.
    // openFor() closes any previously open store on a different workspace.
    // openFor() consumes + zeros the key buffer in its finally block.
    localStoreManager.openFor(workspaceId, dbKey);

    // Restart auto-lock
    rebindAutoLock(autoLockHandleRef, newSvc);

    workspaceRegistry.setActive(workspaceId);
    emitWorkspaceChanged(getWindow);
    emitLockChanged(getWindow, getActiveLockService);

    return { ok: true } satisfies WorkspaceSetActiveResult;
  });

  // ── soam:workspace:create ──────────────────────────────────────────────────
  ipcMain.handle('soam:workspace:create', (event, args: unknown) => {
    if (!isPlatformSender(event)) return null;
    if (
      !args ||
      typeof args !== 'object' ||
      typeof (args as Record<string, unknown>)['nickname'] !== 'string' ||
      typeof (args as Record<string, unknown>)['email'] !== 'string'
    ) {
      return { ok: false, code: 'invalid-nickname' } satisfies WorkspaceCreateResult;
    }
    const { nickname, email } = args as { nickname: string; email: string };
    try {
      const { workspaceId } = workspaceRegistry.create({ nickname, email });
      return { ok: true, workspaceId } satisfies WorkspaceCreateResult;
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'invalid-email') {
        return { ok: false, code: 'invalid-email' } satisfies WorkspaceCreateResult;
      }
      return { ok: false, code: 'invalid-nickname' } satisfies WorkspaceCreateResult;
    }
  });

  // ── soam:workspace:sign-out ────────────────────────────────────────────────
  ipcMain.handle('soam:workspace:sign-out', (event) => {
    if (!isPlatformSender(event)) return null;

    // Relock current service and clear it
    getActiveLockService()?.relock();
    setActiveLockService(null);

    // Dispose auto-lock handle
    rebindAutoLock(autoLockHandleRef, null);

    // Phase 10a: close the Local Store so the SQLite handle is released
    // before the next sign-in (otherwise the next openFor() could race
    // a half-released handle and surface SQLITE_BUSY).
    localStoreManager.closeActive();

    // Clear active pointer
    workspaceRegistry.setActive(null);

    emitWorkspaceChanged(getWindow);
    emitLockChanged(getWindow, getActiveLockService);

    return null;
  });

  // ── soam:workspace:get-identity ────────────────────────────────────────────
  ipcMain.handle('soam:workspace:get-identity', (event) => {
    if (!isPlatformSender(event)) return null;
    return getActiveLockService()?.getIdentity() ?? null;
  });
}

/**
 * Create an AutoLockHandleRef (mutable container for the active auto-lock handle).
 * Pass this to installLockChannel AND use it in main/index.ts to start/restart auto-lock.
 */
export function createAutoLockHandleRef(): AutoLockHandleRef {
  return { current: null };
}

/**
 * Start or restart auto-lock for a given LockService.
 * Disposes the previous handle if any, starts a new one, stores it in ref.
 */
export function rebindAutoLock(
  ref: AutoLockHandleRef,
  svc: LockService | null,
): void {
  if (ref.current) {
    ref.current.dispose();
    ref.current = null;
  }
  if (svc) {
    ref.current = startAutoLock({ service: svc });
  }
}
