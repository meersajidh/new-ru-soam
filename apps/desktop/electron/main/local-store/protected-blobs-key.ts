/**
 * Protected-blobs cipher-key management (O454 / ADR-307 §"Sibling protected-blobs key").
 *
 * The protected-blobs store's cipher key is a random 256-bit value, generated once per
 * workspace, wrapped under the in-memory KEK, and persisted to
 * `protected-blobs.key.json` in the workspace directory. It is NEVER stored in the
 * OS keychain or written plaintext.
 *
 * Lifecycle:
 *   - `ensureProtectedBlobsKey(workspaceId, kek)`:
 *       If key file absent → generate fresh key, wrap under KEK, write file, return raw key.
 *       If key file present → read + unwrap, return raw key.
 *       Throws if the file is present but tampered (GCM tag verification fails).
 *   - The returned raw key buffer is retained by `protectedBlobsManager` for the
 *     duration of the unlock session and zeroed in `protectedBlobsManager.close()`.
 *     Do NOT zero it here — the blob manager owns the key lifetime.
 *   - Do NOT zero the KEK buffer (owned by LockService).
 *
 * ADR-106 boundary: base code. MUST NOT import any domain module.
 * No "PHI" in identifiers — residency is the base-level concept.
 */

import { randomBytes } from 'crypto';
import fs from 'fs';
import {
  buildProtectedBlobsKeyAad,
  wrapKeyToEnvelope,
  unwrapKeyFromEnvelope,
  type Envelope,
} from '../crypto/envelope.js';
import { protectedBlobsKeyPath } from './paths.js';

const PROTECTED_BLOBS_KEY_BYTES = 32; // 256-bit cipher key

// ── File I/O ──────────────────────────────────────────────────────────────────

function readKeyFile(workspaceId: string): Envelope {
  const filePath = protectedBlobsKeyPath(workspaceId);
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  if (parsed['v'] !== 1 || parsed['alg'] !== 'AES-256-GCM') {
    throw new Error('[protected-blobs-key] key file version/alg mismatch');
  }
  return parsed as unknown as Envelope;
}

function writeKeyFile(workspaceId: string, envelope: Envelope): void {
  const filePath = protectedBlobsKeyPath(workspaceId);
  fs.writeFileSync(filePath, JSON.stringify(envelope), { encoding: 'utf8', mode: 0o600 });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns true if the protected-blobs key file exists for this workspace.
 * Presence implies the blob store has been provisioned at least once.
 * Does NOT validate file contents.
 */
export function protectedBlobsKeyExists(workspaceId: string): boolean {
  return fs.existsSync(protectedBlobsKeyPath(workspaceId));
}

/**
 * Ensure the protected-blobs cipher key exists for `workspaceId`.
 *
 * - File absent: generate 32 random bytes, wrap under `kek` (AES-GCM-KW),
 *   write envelope JSON to `protected-blobs.key.json`, return the raw key.
 * - File present: read + unwrap under `kek`, return raw key.
 *
 * Throws if unwrap fails (GCM auth-tag mismatch → file tampered or wrong KEK).
 *
 * **Caller responsibility:** the returned Buffer is retained by `protectedBlobsManager`
 * and zeroed in `protectedBlobsManager.close()`. Do NOT zero it here — the blob
 * manager owns the key lifetime. Do NOT zero `kek` here — LockService owns the KEK.
 *
 * (O454 / ADR-307 §"Sibling protected-blobs key")
 */
export function ensureProtectedBlobsKey(workspaceId: string, kek: Buffer): Buffer {
  const aad = buildProtectedBlobsKeyAad(workspaceId);

  if (!protectedBlobsKeyExists(workspaceId)) {
    // Generate fresh key, wrap, persist.
    const rawKey = randomBytes(PROTECTED_BLOBS_KEY_BYTES);
    const envelope = wrapKeyToEnvelope(kek, rawKey, aad);
    writeKeyFile(workspaceId, envelope);
    // Return the raw key; blob manager zeroes it on close().
    return rawKey;
  }

  // Existing key file — unwrap.
  const envelope = readKeyFile(workspaceId);
  // unwrapKeyFromEnvelope throws if GCM tag invalid (tampered / wrong KEK).
  return unwrapKeyFromEnvelope(kek, envelope);
}
