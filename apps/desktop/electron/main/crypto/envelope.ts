/**
 * Envelope codec for the frozen Phase-9 wire format.
 *
 * Shape per ADR-307 §"Crypto wire format" (pinned):
 *   { "v": 1, "alg": "AES-256-GCM", "wrapped_dek": "<base64>",
 *     "nonce": "<base64>", "ciphertext": "<base64>", "aad": "<base64>" }
 *
 * Binary fields: standard base64 (not base64url).
 * AAD construction: canonical JSON (sorted keys, no whitespace).
 * `wrapped_dek` is omitted for the verifier canary (single-key encrypt).
 */

import { aeadEncrypt, aeadDecrypt } from './aead.js';
import { wrapKey, unwrapKey } from './keywrap.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Envelope {
  readonly v: 1;
  readonly alg: 'AES-256-GCM';
  /** Omitted for verifier canary (single-key encrypt). */
  readonly wrapped_dek?: string;
  readonly nonce: string;
  readonly ciphertext: string;
  /** Authentication tag appended to ciphertext for AES-GCM. Stored inline. */
  readonly tag: string;
  readonly aad: string;
}

// ── JSON codec ────────────────────────────────────────────────────────────────

export function encodeEnvelope(e: Envelope): string {
  return JSON.stringify(e);
}

export function decodeEnvelope(s: string): Envelope {
  const parsed = JSON.parse(s) as Record<string, unknown>;
  if (parsed['v'] !== 1 || parsed['alg'] !== 'AES-256-GCM') {
    throw new Error('Envelope version/alg mismatch');
  }
  return parsed as unknown as Envelope;
}

// ── AAD builders ─────────────────────────────────────────────────────────────

/** Empty AAD — used for verifier canary. */
export const EMPTY_AAD: Buffer = Buffer.alloc(0);

/**
 * Canonical-JSON AAD for record envelopes.
 * Keys are sorted deterministically; no whitespace.
 */
export function buildRecordAad(
  recordType: string,
  recordId: string,
  schemaVersion: number,
): Buffer {
  // Sorted key order: recordId, recordType, schemaVersion
  const obj = { recordId, recordType, schemaVersion };
  return Buffer.from(canonicalJson(obj), 'utf8');
}

/**
 * Canonical-JSON AAD for KEK wrap envelopes.
 * Keys sorted: purpose, workspaceId.
 */
export function buildKekWrapAad(
  purpose: 'kek-wrap-passphrase' | 'kek-wrap-recovery',
  workspaceId: string,
): Buffer {
  const obj = { purpose, workspaceId };
  return Buffer.from(canonicalJson(obj), 'utf8');
}

/**
 * Canonical-JSON AAD for the protected-store cipher key envelope (ADR-307 / O452).
 * Separate from `buildKekWrapAad` to preserve subsystem boundaries —
 * the protected store is a distinct base subsystem that merely consumes the KEK.
 * Keys sorted: purpose, workspaceId.
 */
export function buildProtectedStoreKeyAad(workspaceId: string): Buffer {
  const obj = { purpose: 'protected-store-key', workspaceId };
  return Buffer.from(canonicalJson(obj), 'utf8');
}

/**
 * Deterministic JSON with sorted keys and no whitespace.
 * Primitive values only (no arrays of objects etc.) — sufficient for our AAD needs.
 * Exported for use by `workspace/identity.ts`.
 */
export function canonicalJson(obj: Record<string, unknown>): string {
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) {
    sorted[k] = obj[k];
  }
  return JSON.stringify(sorted);
}

// ── High-level encrypt / decrypt helpers ──────────────────────────────────────

/**
 * Encrypt `plaintext` under `key` and produce an Envelope (no wrapped_dek).
 * Used for: verifier canary, and any single-key encrypt.
 */
export function encryptToEnvelope(key: Buffer, plaintext: Buffer, aad: Buffer): Envelope {
  const { nonce, ciphertext, tag } = aeadEncrypt(key, plaintext, aad);
  return {
    v: 1,
    alg: 'AES-256-GCM',
    nonce: nonce.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    tag: tag.toString('base64'),
    aad: aad.toString('base64'),
  };
}

/**
 * Decrypt an Envelope (no wrapped_dek) under `key`.
 */
export function decryptFromEnvelope(key: Buffer, envelope: Envelope): Buffer {
  const nonce = Buffer.from(envelope.nonce, 'base64');
  const ciphertext = Buffer.from(envelope.ciphertext, 'base64');
  const tag = Buffer.from(envelope.tag, 'base64');
  const aad = Buffer.from(envelope.aad, 'base64');
  return aeadDecrypt(key, nonce, ciphertext, tag, aad);
}

/**
 * Wrap `keyMaterial` under `wrapKeyBuf` and produce an Envelope (no wrapped_dek).
 * Used for wrapping KEK under passphrase/recovery wrap-keys.
 */
export function wrapKeyToEnvelope(wrapKeyBuf: Buffer, keyMaterial: Buffer, aad: Buffer): Envelope {
  const { nonce, ciphertext, tag } = wrapKey(wrapKeyBuf, keyMaterial, aad);
  return {
    v: 1,
    alg: 'AES-256-GCM',
    nonce: nonce.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    tag: tag.toString('base64'),
    aad: aad.toString('base64'),
  };
}

/**
 * Unwrap an Envelope (no wrapped_dek) under `wrapKeyBuf`.
 */
export function unwrapKeyFromEnvelope(wrapKeyBuf: Buffer, envelope: Envelope): Buffer {
  const nonce = Buffer.from(envelope.nonce, 'base64');
  const ciphertext = Buffer.from(envelope.ciphertext, 'base64');
  const tag = Buffer.from(envelope.tag, 'base64');
  const aad = Buffer.from(envelope.aad, 'base64');
  return unwrapKey(wrapKeyBuf, { nonce, ciphertext, tag }, aad);
}
