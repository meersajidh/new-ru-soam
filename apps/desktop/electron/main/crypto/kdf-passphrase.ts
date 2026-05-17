/**
 * Argon2id KDF for passphrase-based wrap-key derivation.
 *
 * Params per ADR-307 §Algorithms (frozen):
 *   m = 64 MiB (65536 KiB)
 *   t = 3 iterations
 *   p = 1 parallelism
 *   outLen = 32 (256-bit AES key)
 *
 * Library: @node-rs/argon2
 */

import { hashRaw } from '@node-rs/argon2';

/**
 * Derive a 256-bit wrap-key from `passphrase` and `salt` using Argon2id.
 *
 * `salt` must be 16 bytes (128-bit) per the pinned storage layout.
 * The derived key is suitable for AES-256 wrap operations.
 */
export async function deriveWrapKey(passphrase: string, salt: Uint8Array): Promise<Buffer> {
  return hashRaw(passphrase, {
    salt: Buffer.from(salt),
    memoryCost: 65536, // 64 MiB in KiB
    timeCost: 3,
    parallelism: 1,
    outputLen: 32,
  });
}
