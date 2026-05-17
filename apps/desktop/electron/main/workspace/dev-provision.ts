/**
 * DEV-ONLY: Auto-provision a fixed dev workspace on first boot.
 *
 * Guard: import.meta.env.DEV && !app.isPackaged && workspaceRegistry.list().length === 0
 * Once provisioned, the list is non-empty and this branch skips on subsequent boots.
 *
 * The hardcoded constants here must ONLY be imported from this module.
 * lint/grep gate: any import of DEV_PASSPHRASE from outside this file is a bug.
 *
 * Per ADR-307 §"Dev-workspace auto-provision" and
 * Implementation_Plan.md §Phase 9a pinned decisions.
 */

import fs from 'fs';
import { hkdfSync } from 'crypto';
import { app } from 'electron';
import { workspaceRegistry } from './registry.js';
import { workspaceDir, metaPath } from './paths.js';
import { LockService } from '../lock/service.js';

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

/**
 * Auto-provision the dev workspace if the three conditions all hold:
 *   1. import.meta.env.DEV
 *   2. !app.isPackaged
 *   3. workspaceRegistry.list().length === 0
 *
 * Returns the auto-unlocked LockService instance if provisioning occurred,
 * or null if the guard conditions were not met.
 *
 * Idempotent: once the workspace exists (list non-empty) this is a no-op.
 */
export async function maybeProvision(): Promise<LockService | null> {
  // Gate 1: DEV build only
  if (!import.meta.env.DEV) return null;
  // Gate 2: not a packaged production binary
  if (app.isPackaged) return null;
  // Gate 3: no workspaces yet
  if (workspaceRegistry.list().length > 0) return null;

  console.log('[dev-provision] no workspaces found in DEV mode — auto-provisioning dev-workspace');

  // Create workspace dir + meta.json using the fixed DEV_WORKSPACE_ID
  // (bypasses workspaceRegistry.create() which generates a random UUID)
  workspaceDir(DEV_WORKSPACE_ID); // ensures dir exists
  const metaFile = {
    nickname: DEV_NICKNAME,
    createdAt: new Date().toISOString(),
    lastSignedIn: null,
  };
  fs.writeFileSync(metaPath(DEV_WORKSPACE_ID), JSON.stringify(metaFile, null, 2), 'utf8');

  // Instantiate LockService for the dev workspace
  const svc = new LockService(DEV_WORKSPACE_ID);

  // Generate setup with deterministic recovery bytes (dev-only hook)
  const devRecoveryBytes = recoveryFromDevPassphrase();
  const genResult = await svc.setupGenerate(DEV_PASSPHRASE, devRecoveryBytes);
  if (!genResult.ok) {
    console.error('[dev-provision] setupGenerate failed:', genResult);
    return null;
  }

  // Acknowledge with dev identity
  const ackResult = svc.setupAcknowledge({ identity: { email: DEV_EMAIL } });
  if (!ackResult.ok) {
    console.error('[dev-provision] setupAcknowledge failed:', ackResult);
    return null;
  }

  // setupAcknowledge promotes the KEK to live — the service is now in unlocked state.
  // No explicit unlock() call needed; setupAcknowledge sets _kek directly.

  // Set active pointer
  workspaceRegistry.setActive(DEV_WORKSPACE_ID);

  console.log('[dev-provision] auto-provisioned dev-workspace; auto-unlocked');

  // Return the service (already unlocked) so the bootstrap can use it directly
  return svc;
}
