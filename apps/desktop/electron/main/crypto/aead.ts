/**
 * AES-256-GCM encrypt/decrypt for record-level AEAD.
 *
 * Per ADR-307 §Algorithms: per-op random 96-bit nonce (12 bytes).
 * The envelope shape is pinned in Phase 9 and consumed unchanged by
 * Phase 10 + Phase 11.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALG = 'aes-256-gcm' as const;
const NONCE_BYTES = 12; // 96-bit

export interface AeadResult {
  readonly nonce: Buffer;
  readonly ciphertext: Buffer;
  readonly tag: Buffer;
}

/**
 * Encrypt `plaintext` under `key` with `aad` as additional authenticated data.
 * Uses a fresh random 96-bit nonce per call.
 */
export function aeadEncrypt(key: Buffer, plaintext: Buffer, aad: Buffer): AeadResult {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(ALG, key, nonce);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { nonce, ciphertext, tag };
}

/**
 * Decrypt `ciphertext` under `key`. Throws on authentication failure.
 */
export function aeadDecrypt(
  key: Buffer,
  nonce: Buffer,
  ciphertext: Buffer,
  tag: Buffer,
  aad: Buffer,
): Buffer {
  const decipher = createDecipheriv(ALG, key, nonce);
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
