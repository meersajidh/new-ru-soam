/**
 * HKDF-SHA256 KDF for recovery-code-based wrap-key derivation.
 *
 * Per ADR-307 §Algorithms (frozen):
 *   - Recovery code is 128-bit entropy (cryptographic-strength); no memory-hard KDF required.
 *   - HKDF expands to a full 256-bit AES wrap-key.
 *   - Info string: "ru-soam-recovery-wrap-v1"
 *   - Library: Node crypto.hkdfSync
 */

import { hkdfSync } from 'crypto';

const INFO = Buffer.from('ru-soam-recovery-wrap-v1', 'utf8');
const OUT_LEN = 32; // 256-bit AES key

/**
 * Derive a 256-bit wrap-key from recovery code `bytes` and `salt` using HKDF-SHA256.
 *
 * `salt` must be 16 bytes (128-bit) per the pinned storage layout.
 * The derived key is suitable for AES-256 wrap operations.
 */
export function deriveWrapKey(recoveryBytes: Uint8Array, salt: Uint8Array): Buffer {
  const result = hkdfSync('sha256', Buffer.from(recoveryBytes), Buffer.from(salt), INFO, OUT_LEN);
  return Buffer.from(result);
}
