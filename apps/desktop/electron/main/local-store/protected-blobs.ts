/**
 * Protected blob store — encrypted-file PHI-at-rest (O454 / ADR-302 §"Protected blob store").
 *
 * Binary files that require the same close-on-lock seam as the protected SQLite store
 * are persisted as individual AES-256-GCM encrypted files under:
 *   $workspace/protected-blobs/<uuid>
 *
 * Wire format per file (raw binary concatenation, fixed offsets):
 *   nonce (12 bytes) ‖ ciphertext (variable) ‖ GCM tag (16 bytes)
 *
 * NOT the JSON Envelope — that format is for KEK-wrapped key files only.
 * The blob id is bound to the ciphertext via AAD `blob:<id>` so id substitution
 * attacks are detected by GCM authentication.
 *
 * Singleton lifecycle (mirrors LocalStoreManager discipline):
 *   open(workspaceId, key)  — store key in memory, mkdir-p the blobs dir
 *   close()                 — zero the key buffer, drop workspaceId (called on relock)
 *   current()               — { workspaceId } | null  (key never exposed)
 *   put(bytes)              — encrypt + write; return { id, sha256, size }
 *   get(id)                 — read + decrypt; return plaintext (blob.read cap deferred → O462)
 *   delete(id)              — unlink if present; missing = no-op
 *
 * ADR-106 boundary: base code. MUST NOT import any domain module.
 * No "PHI" in identifiers — residency is the base-level concept.
 */

import { randomUUID, createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { aeadEncrypt, aeadDecrypt } from '../crypto/aead.js';
import { CapErr } from '../../shared/ipc-protocol.js';
import { protectedBlobsDir } from './paths.js';

// ── Wire-format constants ─────────────────────────────────────────────────────

const NONCE_BYTES = 12; // AES-GCM 96-bit nonce
const TAG_BYTES = 16;   // AES-GCM 128-bit tag
const MAX_BLOB_BYTES = 25 * 1024 * 1024; // 25 MiB — lean single-shot full-load

// ── Path-traversal guard ──────────────────────────────────────────────────────

/**
 * Reject ids that contain path separators or traversal components.
 * Blob ids are UUIDs generated internally, but we validate anyway so the
 * get/delete methods are safe even if a caller passes a crafted id.
 */
function assertSafeId(id: string): void {
  if (
    typeof id !== 'string' ||
    id.length === 0 ||
    id.includes('/') ||
    id.includes('\\') ||
    id.includes('..') ||
    path.basename(id) !== id
  ) {
    throw Object.assign(new Error(`blob: unsafe or invalid id: ${JSON.stringify(id)}`), {
      code: CapErr.HandlerThrew,
    });
  }
}

// ── Error factories ───────────────────────────────────────────────────────────

function notOpen(): Error {
  return Object.assign(new Error('blob: protected blob store is not open (workspace locked?)'), {
    code: CapErr.NotFound,
  });
}

function notFound(id: string): Error {
  return Object.assign(new Error(`blob: file not found: ${id}`), {
    code: CapErr.NotFound,
  });
}

function validationErr(msg: string): Error {
  return Object.assign(new Error(msg), { code: CapErr.HandlerThrew });
}

// ── Manager ───────────────────────────────────────────────────────────────────

class ProtectedBlobsManager {
  private _workspaceId: string | null = null;
  private _key: Buffer | null = null;

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  /**
   * Open the protected blob store for `workspaceId`.
   * Stores the raw key in memory; creates the blobs directory if absent.
   * Idempotent if already open for the same workspace.
   * (O454 / ADR-302 §"Protected blob store")
   */
  open(workspaceId: string, key: Buffer): void {
    if (this._workspaceId === workspaceId) {
      // Already open for this workspace.
      return;
    }
    // Close any previously open context (different workspace).
    this.close();
    // Ensure the blobs directory exists.
    fs.mkdirSync(protectedBlobsDir(workspaceId), { recursive: true, mode: 0o700 });
    this._workspaceId = workspaceId;
    this._key = key;
  }

  /**
   * Close the blob store: zero the in-memory key buffer and drop workspace id.
   * Idempotent. Called on relock / sign-out / delete-workspace.
   * (O454 / ADR-307 §"Sibling protected-blobs key" lifecycle)
   */
  close(): void {
    if (this._key !== null) {
      this._key.fill(0);
      this._key = null;
    }
    this._workspaceId = null;
  }

  /**
   * Returns `{ workspaceId }` if open, or `null` if closed.
   * The raw key is never exposed through this surface.
   */
  current(): { workspaceId: string } | null {
    if (this._workspaceId === null) return null;
    return { workspaceId: this._workspaceId };
  }

  // ── Operations ───────────────────────────────────────────────────────────────

  /**
   * Encrypt `bytes` and write to a new blob file.
   * Returns `{ id, sha256, size }` where `sha256` is the hex SHA-256 of the
   * plaintext bytes (computed before encryption) and `size` is `bytes.length`.
   *
   * Wire format: nonce(12) ‖ ciphertext ‖ tag(16) — raw binary concatenation.
   * AAD binds the ciphertext to its id so moving a file to a different id is detected.
   *
   * Throws `cap.not_found` if the store is not open.
   * Throws `cap.handler_threw` for empty input or input exceeding 25 MiB.
   */
  put(bytes: Buffer): { id: string; sha256: string; size: number } {
    if (this._workspaceId === null || this._key === null) throw notOpen();
    if (bytes.length === 0) throw validationErr('blob.put: bytes must not be empty');
    if (bytes.length > MAX_BLOB_BYTES) {
      throw validationErr(
        `blob.put: payload too large (${bytes.length} bytes; max ${MAX_BLOB_BYTES})`,
      );
    }

    const id = randomUUID();
    assertSafeId(id); // sanity check — randomUUID is safe but defensive guard

    // Compute sha256 over plaintext before encryption (non-PHI integrity tag).
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const size = bytes.length;

    const aad = Buffer.from(`blob:${id}`, 'utf8');
    const { nonce, ciphertext, tag } = aeadEncrypt(this._key, bytes, aad);

    // Wire format: nonce(12) ‖ ciphertext ‖ tag(16)
    const fileBytes = Buffer.concat([nonce, ciphertext, tag]);
    const filePath = path.join(protectedBlobsDir(this._workspaceId), id);
    fs.writeFileSync(filePath, fileBytes, { mode: 0o600 });

    return { id, sha256, size };
  }

  /**
   * Read and decrypt the blob identified by `id`.
   * Returns the original plaintext bytes.
   *
   * Throws `cap.not_found` if the store is not open or the file is absent.
   * Throws on GCM authentication failure (file tampered / wrong key).
   *
   * Note: blob.read capability is deferred to O462. This method exists for that future cap.
   */
  get(id: string): Buffer {
    if (this._workspaceId === null || this._key === null) throw notOpen();
    assertSafeId(id);

    const filePath = path.join(protectedBlobsDir(this._workspaceId), id);
    if (!fs.existsSync(filePath)) throw notFound(id);

    const fileBytes = fs.readFileSync(filePath);
    if (fileBytes.length < NONCE_BYTES + TAG_BYTES) {
      throw validationErr(`blob.get: file '${id}' is too short to be a valid blob`);
    }

    // Split nonce(12) ‖ ciphertext(middle) ‖ tag(last 16)
    const nonce = fileBytes.subarray(0, NONCE_BYTES);
    const tag = fileBytes.subarray(fileBytes.length - TAG_BYTES);
    const ciphertext = fileBytes.subarray(NONCE_BYTES, fileBytes.length - TAG_BYTES);

    const aad = Buffer.from(`blob:${id}`, 'utf8');
    // aeadDecrypt throws on GCM auth-tag mismatch — do not catch here.
    return aeadDecrypt(this._key, nonce, ciphertext, tag, aad);
  }

  /**
   * Delete the blob file for `id` if it exists.
   * Missing file is a no-op (idempotent). Safe to call on sign-out / erasure.
   *
   * Throws `cap.handler_threw` if `id` fails the path-traversal guard.
   */
  delete(id: string): void {
    if (this._workspaceId === null) return; // Store closed — nothing to do.
    assertSafeId(id);

    const filePath = path.join(protectedBlobsDir(this._workspaceId), id);
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      // ENOENT = file already gone — idempotent, ignore.
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }
}

/** Process-wide singleton. */
export const protectedBlobsManager = new ProtectedBlobsManager();
