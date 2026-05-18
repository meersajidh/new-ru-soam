/**
 * Local Store module — Phase 10a.
 *
 * Exports:
 *   - LocalStore         — per-workspace SQLite wrapper (store.ts)
 *   - localStoreDbPath   — filesystem path helper (paths.ts)
 *   - LocalStoreManager  — singleton lifecycle holder that owns the active
 *                          LocalStore for the active workspace; consumed by
 *                          the prefs capability and by main/index.ts to
 *                          open/close across workspace lifecycle events.
 *
 * The manager is intentionally small — it just gives the capability handlers
 * a stable accessor (`current()`) that always returns the LocalStore for
 * whichever workspace is currently active, or null if none.
 */

import { LocalStore } from './store.js';
import type { StoreChangedPayload } from '../../shared/ipc-protocol.js';

export { LocalStore } from './store.js';
export type { LocalStoreOptions, PrefRow } from './store.js';
export { localStoreDbPath } from './paths.js';

type Emitter = (payload: StoreChangedPayload) => void;

class LocalStoreManager {
  private _store: LocalStore | null = null;
  private _emitter: Emitter | null = null;

  /**
   * Inject the change-event emitter. Called once at app boot, before any
   * workspace becomes active.
   */
  setEmitter(emitter: Emitter): void {
    this._emitter = emitter;
  }

  /**
   * Open the Local Store for `workspaceId` with the given encryption key.
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
    if (!this._emitter) {
      throw new Error('LocalStoreManager: emitter not set; call setEmitter() before openFor()');
    }
    const store = new LocalStore({ emitChange: this._emitter });
    store.open(workspaceId, key);
    this._store = store;
  }

  /** Close the active store if any. Idempotent. */
  closeActive(): void {
    if (!this._store) return;
    this._store.close();
    this._store = null;
  }

  /** The active LocalStore, or null if none is open. */
  current(): LocalStore | null {
    return this._store;
  }
}

/** Process-wide singleton. */
export const localStoreManager = new LocalStoreManager();
