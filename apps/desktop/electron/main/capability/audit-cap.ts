/**
 * audit@1.0 — read access to the audit ledger (Phase 10b).
 *
 * Not PHI-flagged: audit metadata is Operational class (ADR-302 §"Class 2").
 * Accessible while the workspace is locked.
 *
 * Methods:
 *   list({ limit?: number, offset?: number }) → AuditRow[]
 */

import { registerCapability } from './registry.js';
import { localStoreManager } from '../local-store/index.js';
import { CapErr } from '../../shared/ipc-protocol.js';

function notFound(message: string): Error {
  return Object.assign(new Error(message), { code: CapErr.NotFound });
}

function methodNotFound(method: string): Error {
  return Object.assign(new Error(`audit: unknown method: ${method}`), {
    code: CapErr.MethodNotFound,
  });
}

export function registerAuditCapability(): void {
  registerCapability('audit', '1.0', async (method, args) => {
    if (method === 'list') {
      const opts = (args[0] ?? {}) as Record<string, unknown>;
      const limit = typeof opts['limit'] === 'number' ? opts['limit'] : 100;
      const offset = typeof opts['offset'] === 'number' ? opts['offset'] : 0;
      const store = localStoreManager.current();
      if (!store) throw notFound('audit: no active workspace');
      return store.listAuditEntries({ limit, offset });
    }
    throw methodNotFound(method);
  });
}
