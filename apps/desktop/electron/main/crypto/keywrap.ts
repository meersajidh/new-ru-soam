/**
 * AES-GCM-KW: wrap/unwrap via AES-GCM (same primitive as record AEAD).
 *
 * Per ADR-307 §Algorithms: one algorithm to audit. Used for:
 *   - DEK <-> KEK wrapping
 *   - wrap_key_{p,r} -> KEK wrapping
 *
 * Per-op random 96-bit nonce; never derive deterministically.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALG = 'aes-256-gcm' as const;
const NONCE_BYTES = 12; // 96-bit

export interface WrappedKey {
  readonly nonce: Buffer;
  readonly ciphertext: Buffer;
  readonly tag: Buffer;
}

/**
 * Wrap `keyMaterial` under `wrapKey` with `aad`.
 * Returns the triple (nonce, ciphertext, tag).
 */
export function wrapKey(wrapKey: Buffer, keyMaterial: Buffer, aad: Buffer): WrappedKey {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(ALG, wrapKey, nonce);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(keyMaterial), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { nonce, ciphertext, tag };
}

/**
 * Unwrap `wrapped` under `wrapKey`. Throws on authentication failure.
 */
export function unwrapKey(wrapKey: Buffer, wrapped: WrappedKey, aad: Buffer): Buffer {
  const decipher = createDecipheriv(ALG, wrapKey, wrapped.nonce);
  decipher.setAAD(aad);
  decipher.setAuthTag(wrapped.tag);
  return Buffer.concat([decipher.update(wrapped.ciphertext), decipher.final()]);
}

