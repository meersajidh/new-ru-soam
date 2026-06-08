/**
 * blob.write@1.0 — Protected blob write capability (O454 / ADR-302 §"Protected blob store").
 *
 * Provides put + delete operations for encrypted blob files.
 * PHI-flagged: only callable while the workspace is unlocked and by first-party callers.
 * CQRS kind: command (write surface; read cap blob.read is deferred — O462).
 *
 * Methods:
 *   put(bytes: Uint8Array | ArrayBuffer | Buffer) → { id: string; sha256: string; size: number }
 *   delete(id: string) → { ok: true }
 *
 * Enforcement order per call:
 *   1. Registry PHI-trustClass gate (first-party only when caller is present) — registry layer
 *   2. Registry lock-gate (rejects cap.locked when workspace locked) — registry layer
 *   3. Handler: argument validation + protectedBlobsManager operation
 *   4. Handler: audit emit (id + principal; no plaintext bytes or PHI in ledger)
 *
 * ADR-106 boundary: base code. MUST NOT import any domain module.
 * No "PHI" in identifiers — residency is the base-level concept.
 */

import { registerCapability } from '../capability/registry.js';
import type { CallerIdentity } from '../capability/registry.js';
import { CapErr } from '../../shared/ipc-protocol.js';
import { protectedBlobsManager } from './protected-blobs.js';
import { auditService } from '../audit/index.js';
import type { AuditEventKind } from '../audit/audit-types.js';

// ── Error factories ───────────────────────────────────────────────────────────

function handlerErr(msg: string): Error {
  return Object.assign(new Error(msg), { code: CapErr.HandlerThrew });
}

// ── Argument helpers ──────────────────────────────────────────────────────────

/**
 * Normalise the first argument to a Buffer.
 * Accepts Uint8Array (includes Buffer subclass), ArrayBuffer.
 * Throws cap.handler_threw for any other type.
 */
function normaliseBytesArg(arg: unknown): Buffer {
  if (arg instanceof Buffer) return arg;
  if (arg instanceof Uint8Array) return Buffer.from(arg.buffer, arg.byteOffset, arg.byteLength);
  if (arg instanceof ArrayBuffer) return Buffer.from(arg);
  throw handlerErr(
    'blob.write.put: arg[0] must be Uint8Array, Buffer, or ArrayBuffer',
  );
}

// ── Capability registration ───────────────────────────────────────────────────

/**
 * Register the `blob.write@1.0` capability with the Main capability registry.
 * Call once at boot, after `registerStoreQueryCapability()`.
 * (O454 / ADR-302 §"Protected blob store")
 */
export function registerBlobCapabilities(): void {
  registerCapability(
    'blob.write',
    '1.0',
    async (method: string, args: ReadonlyArray<unknown>, caller: CallerIdentity | undefined) => {
      switch (method) {
        case 'put': {
          const bytes = normaliseBytesArg(args[0]);
          const { id, sha256, size } = protectedBlobsManager.put(bytes);

          const ctx = protectedBlobsManager.current();
          auditService.emit({
            event: 'blob.put' as AuditEventKind,
            entityId: ctx?.workspaceId ?? '',
            recordId: id,
            principal: caller?.bundleId ?? 'system',
            detail: { size },
          });

          return { id, sha256, size };
        }

        case 'delete': {
          const id = args[0];
          if (typeof id !== 'string') {
            throw handlerErr('blob.write.delete: arg[0] must be a string id');
          }
          protectedBlobsManager.delete(id);

          const ctx = protectedBlobsManager.current();
          auditService.emit({
            event: 'blob.delete' as AuditEventKind,
            entityId: ctx?.workspaceId ?? '',
            recordId: id,
            principal: caller?.bundleId ?? 'system',
          });

          return { ok: true };
        }

        default:
          throw Object.assign(new Error(`blob.write: unknown method: ${method}`), {
            code: CapErr.MethodNotFound,
          });
      }
    },
    { phi: true, kind: 'command' },
  );
}
