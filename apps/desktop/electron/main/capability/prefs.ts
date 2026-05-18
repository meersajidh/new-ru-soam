/**
 * prefs@1.0 — workspace-scoped key/value preferences (Phase 10a).
 *
 * Backed by the LocalStore `prefs` table. Operational class per ADR-302
 * §"Class 2" — NOT PHI-flagged on registration (so the lock-gate decorator
 * does NOT short-circuit when the workspace is locked). The store itself
 * stays open across lock per the Phase 10a posture.
 *
 * Methods:
 *   get(key: string)      → { value: string | null }
 *   set(key, value)       → { ok: true }
 *   list()                → Array<{ key, value, updatedAt }>
 *
 * If no workspace is active the handler throws an Error tagged with the
 * `cap.not_found` code (closest existing CapErrCode — there is no
 * `cap.no_workspace` code in this phase).
 */

import { registerCapability } from './registry.js';
import { localStoreManager } from '../local-store/index.js';
import { auditService } from '../audit/index.js';
import { CapErr } from '../../shared/ipc-protocol.js';

function notFound(message: string): Error {
  return Object.assign(new Error(message), { code: CapErr.NotFound });
}

function methodNotFound(method: string): Error {
  return Object.assign(new Error(`prefs: unknown method: ${method}`), {
    code: CapErr.MethodNotFound,
  });
}

export function registerPrefsCapability(): void {
  registerCapability('prefs', '1.0', async (method, args) => {
    if (method === 'get') {
      const key = args[0];
      if (typeof key !== 'string') {
        throw new Error('prefs.get: key must be a string');
      }
      const store = localStoreManager.current();
      if (!store) throw notFound('prefs: no active workspace');
      return { value: store.getPref(key) };
    }
    if (method === 'set') {
      const key = args[0];
      const value = args[1];
      if (typeof key !== 'string') {
        throw new Error('prefs.set: key must be a string');
      }
      if (typeof value !== 'string') {
        throw new Error('prefs.set: value must be a string');
      }
      const store = localStoreManager.current();
      if (!store) throw notFound('prefs: no active workspace');
      store.setPref(key, value);
      const workspaceId = store.workspaceId();
      if (workspaceId) {
        auditService.emit({
          event: 'prefs.set',
          entityId: workspaceId,
          principal: 'system',
          detail: { key },
        });
      }
      return { ok: true };
    }
    if (method === 'list') {
      const store = localStoreManager.current();
      if (!store) throw notFound('prefs: no active workspace');
      return store.listPrefs();
    }
    throw methodNotFound(method);
  });
}
