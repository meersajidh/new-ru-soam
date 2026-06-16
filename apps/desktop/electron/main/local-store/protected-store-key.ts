/**
 * Protected-store cipher-key management (O452 / ADR-307 §"Protected-store key in the hierarchy").
 *
 * The protected store's DB cipher key is a random 256-bit value, generated once per
 * workspace, wrapped under the in-memory KEK, and persisted to
 * `protected-store.key.json` in the workspace directory. It is NEVER stored in the
 * OS keychain or written plaintext.
 *
 * Lifecycle:
 *   - `ensureProtectedStoreKey(workspaceId, kek)`:
 *       If key file absent → generate fresh key, wrap under KEK, write file, return raw key.
 *       If key file present → read + unwrap, return raw key.
 *       Throws if the file is present but tampered (GCM tag verification fails).
 *   - The returned raw key buffer is consumed (cipher pragma) and zeroed by
 *     `LocalStore.open()`'s `finally` block. Do NOT zero it here — the caller owns it.
 *   - Do NOT zero the KEK buffer (owned by LockService).
 *
 * ADR-106 boundary: base code. MUST NOT import any domain module.
 * No "PHI" in identifiers — residency is the base-level concept.
 */

import { randomBytes } from 'crypto';
import fs from 'fs';
import {
  buildProtectedStoreKeyAad,
  wrapKeyToEnvelope,
  unwrapKeyFromEnvelope,
  type Envelope,
} from '../crypto/envelope.js';
import { protectedStoreKeyPath } from './paths.js';
import { ensureWorkspaceDir } from '../workspace/paths.js';

const PROTECTED_STORE_KEY_BYTES = 32; // 256-bit cipher key

// ── File I/O ──────────────────────────────────────────────────────────────────

function readKeyFile(workspaceId: string): Envelope {
  const filePath = protectedStoreKeyPath(workspaceId);
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  if (parsed['v'] !== 1 || parsed['alg'] !== 'AES-256-GCM') {
    throw new Error('[protected-store-key] key file version/alg mismatch');
  }
  return parsed as unknown as Envelope;
}

function writeKeyFile(workspaceId: string, envelope: Envelope): void {
  ensureWorkspaceDir(workspaceId);
  const filePath = protectedStoreKeyPath(workspaceId);
  fs.writeFileSync(filePath, JSON.stringify(envelope), { encoding: 'utf8', mode: 0o600 });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns true if the protected-store key file exists for this workspace.
 * Presence implies the protected store has been provisioned (or provisioning was
 * attempted and the file was written). Does NOT validate file contents.
 */
export function protectedStoreKeyExists(workspaceId: string): boolean {
  return fs.existsSync(protectedStoreKeyPath(workspaceId));
}

/**
 * Ensure the protected-store cipher key exists for `workspaceId`.
 *
 * - File absent: generate 32 random bytes, wrap under `kek` (AES-GCM-KW),
 *   write envelope JSON to `protected-store.key.json`, return the raw key.
 * - File present: read + unwrap under `kek`, return raw key.
 *
 * Throws if unwrap fails (GCM auth-tag mismatch → file tampered or wrong KEK).
 *
 * **Caller responsibility:** the returned Buffer is consumed + zeroed by
 * `LocalStore.open()`'s `finally` block. Never log or re-use it after passing
 * to `open()`. Do NOT zero `kek` here — LockService owns the KEK.
 *
 * (O452 / ADR-307 §"Protected-store key in the hierarchy")
 */
export function ensureProtectedStoreKey(workspaceId: string, kek: Buffer): Buffer {
  const aad = buildProtectedStoreKeyAad(workspaceId);

  if (!protectedStoreKeyExists(workspaceId)) {
    // Generate fresh key, wrap, persist.
    const rawKey = randomBytes(PROTECTED_STORE_KEY_BYTES);
    const envelope = wrapKeyToEnvelope(kek, rawKey, aad);
    writeKeyFile(workspaceId, envelope);
    // Return the raw key; caller zeros it after cipher-pragma is applied.
    return rawKey;
  }

  // Existing key file — unwrap.
  const envelope = readKeyFile(workspaceId);
  // unwrapKeyFromEnvelope throws if GCM tag invalid (tampered / wrong KEK).
  const rawKey = unwrapKeyFromEnvelope(kek, envelope);
  return rawKey;
}
