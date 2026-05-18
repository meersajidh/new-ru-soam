/**
 * AuditService — thin facade over LocalStore.appendAuditEntry.
 *
 * Decoupled from LocalStore via a getter so the service can be instantiated
 * at boot before any workspace is active. emit() is a silent no-op when no
 * store is open; errors from appendAuditEntry propagate to the caller.
 */

import type { LocalStore } from '../local-store/store.js';
import type { AuditEntry } from './audit-types.js';

export class AuditService {
  private _storeGetter: (() => LocalStore | null) | null = null;

  /**
   * Inject the store getter. Called once at boot, before any capability
   * registrations fire. The getter returns null when no workspace is active.
   */
  setStoreGetter(getter: () => LocalStore | null): void {
    this._storeGetter = getter;
  }

  /**
   * Emit an audit event. Synchronous.
   * Silent no-op if no store is available. Propagates any DB error.
   */
  emit(entry: AuditEntry): void {
    const store = this._storeGetter?.() ?? null;
    if (!store) return;
    store.appendAuditEntry(entry);
  }
}
