/**
 * Local Store module — Phase 10a / O452 two-store update.
 *
 * Exports:
 *   - LocalStore         — per-workspace SQLite wrapper (store.ts)
 *   - localStoreDbPath   — filesystem path helper (paths.ts)
 *   - LocalStoreManager  — singleton lifecycle holder that owns the active
 *                          LocalStore instances for the active workspace.
 *
 * As of O452 (ADR-302 §"Residency split"), LocalStoreManager owns TWO stores:
 *   - operational store (open while locked, raw key, prefs/settings/audit)
 *   - protected store  (open only while unlocked, KEK-wrapped key, Clinical PHI)
 *
 * The operational store keeps its existing API unchanged:
 *   openFor() / current() / closeActive() / quiesceActive()
 *
 * The protected store adds:
 *   openProtectedFor(workspaceId, key) / closeProtected() / protectedCurrent()
 *
 * quiesceActive() and closeActive() also close the protected store.
 */

import { LocalStore } from './store.js';
import type { StoreChangedPayload } from '../../shared/ipc-protocol.js';

export { LocalStore } from './store.js';
export type { LocalStoreOptions, PrefRow } from './store.js';
export { localStoreDbPath, protectedStoreDbPath, protectedStoreKeyPath } from './paths.js';
export { ensureProtectedStoreKey, protectedStoreKeyExists } from './protected-store-key.js';
export { hasProtectedSets, tableResidency } from './migrations.js';

type Emitter = (payload: StoreChangedPayload) => void;

class LocalStoreManager {
  private _store: LocalStore | null = null;
  private _protectedStore: LocalStore | null = null;
  private _emitter: Emitter | null = null;

  /**
   * Inject the change-event emitter. Called once at app boot, before any
   * workspace becomes active.
   */
  setEmitter(emitter: Emitter): void {
    this._emitter = emitter;
  }

  private _requireEmitter(): Emitter {
    if (!this._emitter) {
      throw new Error('LocalStoreManager: emitter not set; call setEmitter() before openFor()');
    }
    return this._emitter;
  }

  // ── Operational store ──────────────────────────────────────────────────────

  /**
   * Open the operational Local Store for `workspaceId` with the given encryption key.
   * If a previous store is open for a different workspace, it is closed first.
   */
  openFor(workspaceId: string, key: Buffer): void {
    if (this._store && this._store.workspaceId() === workspaceId) {
      return;
    }
    if (this._store) {
      this._store.close();
      this._store = null;
    }
    const emitter = this._requireEmitter();
    const store = new LocalStore({ emitChange: emitter });
    store.open(workspaceId, key, 'operational');
    this._store = store;
  }

  /** Close the active operational store if any. Idempotent. */
  closeActive(): void {
    if (this._store) {
      this._store.close();
      this._store = null;
    }
    // Also close protected store on sign-out/quit (ADR-307 §lifecycle).
    this.closeProtected();
  }

  /**
   * Quiesce the active operational store for update-time safety (ADR-308 §6).
   * Runs WAL checkpoint then closes. Idempotent. Also closes the protected store.
   */
  quiesceActive(): void {
    if (this._store) {
      this._store.quiesce();
      this._store = null;
    }
    this.closeProtected();
  }

  /** The active operational LocalStore, or null if none is open. */
  current(): LocalStore | null {
    return this._store;
  }

  // ── Protected store ────────────────────────────────────────────────────────

  /**
   * Open the protected store for `workspaceId` with the given cipher key.
   * Runs `protected` residency migrations on first open.
   * If a previous protected store is open for a different workspace, it is closed first.
   * Idempotent for same workspace.
   * (O452 / ADR-302 §"Residency split")
   */
  openProtectedFor(workspaceId: string, key: Buffer): void {
    if (this._protectedStore && this._protectedStore.workspaceId() === workspaceId) {
      // Already open for this workspace — zero the unused key so the caller's
      // contract ("key zeroed by open()") holds on the idempotent path too.
      key.fill(0);
      return;
    }
    if (this._protectedStore) {
      this._protectedStore.close();
      this._protectedStore = null;
    }
    const emitter = this._requireEmitter();
    const store = new LocalStore({ emitChange: emitter });
    store.open(workspaceId, key, 'protected');
    this._protectedStore = store;
  }

  /**
   * Close the protected store if open. Idempotent.
   * Called on relock / auto-lock / sign-out / set-active (which relocks old workspace).
   * (O452 / ADR-307 §"Protected-store key in the hierarchy" lifecycle)
   */
  closeProtected(): void {
    if (this._protectedStore) {
      this._protectedStore.close();
      this._protectedStore = null;
    }
  }

  /**
   * The active protected LocalStore, or null if not open (workspace locked or
   * no protected-residency bundle registered).
   */
  protectedCurrent(): LocalStore | null {
    return this._protectedStore;
  }
}

/** Process-wide singleton. */
export const localStoreManager = new LocalStoreManager();
