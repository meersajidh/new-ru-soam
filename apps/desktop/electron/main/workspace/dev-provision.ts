/**
 * DEV-ONLY constants and utilities for the dev workspace.
 *
 * The hardcoded constants here must ONLY be imported from this module.
 * lint/grep gate: any import of DEV_PASSPHRASE from outside this file is a bug.
 *
 * Per ADR-307 and Implementation_Plan.md §Phase 9a pinned decisions.
 */

import { hkdfSync } from 'crypto';

// ── Dev-only constants ────────────────────────────────────────────────────────

/** Fixed UUID for the dev workspace (deliberately non-conformant v4 — never collides). */
export const DEV_WORKSPACE_ID = '00000000-0000-4dev-8000-000000000000';
export const DEV_NICKNAME = 'Dev Workspace';
export const DEV_EMAIL = 'dev@ru-soam.local';
/** Hardcoded passphrase — only reachable when DEV && !isPackaged. */
export const DEV_PASSPHRASE = 'dev-passphrase-12+';

/** Fixed salt for deterministic recovery derivation (dev-only). */
const DEV_RECOVERY_SALT = Buffer.from('ru-soam-dev-recovery-saltv1', 'utf8').subarray(0, 16);

/**
 * Derive deterministic 16-byte recovery entropy from the dev passphrase.
 * HKDF-SHA256; same derivation each run so devs can re-derive without recording.
 *
 * DEV-ONLY: never call from production paths.
 */
export function recoveryFromDevPassphrase(): Uint8Array {
  const result = hkdfSync(
    'sha256',
    Buffer.from(DEV_PASSPHRASE, 'utf8'),
    DEV_RECOVERY_SALT,
    Buffer.from('ru-soam-dev-recovery-v1', 'utf8'),
    16,
  );
  return new Uint8Array(result);
}

