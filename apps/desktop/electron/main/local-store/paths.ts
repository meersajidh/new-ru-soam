/**
 * Local Store filesystem layout (Phase 10a).
 *
 * The Local Store lives inside the per-workspace directory created by
 * `workspaceDir(workspaceId)` (see workspace/paths.ts), which already lives
 * under the user's protected app-data path.
 *
 *   $userData/workspaces/<id>/local-store.db
 *
 * Phase 10a ships this as plaintext SQLite. SQLCipher / at-rest encryption
 * lands in Phase 10b — the path and filename remain stable.
 */

import path from 'path';
import { workspaceDir } from '../workspace/paths.js';

/** Returns the absolute path to the Local Store DB for a workspace. */
export function localStoreDbPath(workspaceId: string): string {
  return path.join(workspaceDir(workspaceId), 'local-store.db');
}

/**
 * Returns the absolute path to the protected store DB for a workspace (O452).
 * This DB holds data with `protected` residency (Clinical PHI).
 * It is opened only while the workspace is unlocked.
 */
export function protectedStoreDbPath(workspaceId: string): string {
  return path.join(workspaceDir(workspaceId), 'protected-store.db');
}

/**
 * Returns the absolute path to the KEK-wrapped cipher key for the protected
 * store DB (O452 / ADR-307 §"Protected-store key in the hierarchy").
 * Present only when at least one bundle declares `protected` residency.
 */
export function protectedStoreKeyPath(workspaceId: string): string {
  return path.join(workspaceDir(workspaceId), 'protected-store.key.json');
}

/**
 * Returns the absolute path to the protected-blobs directory for a workspace
 * (O454 / ADR-302 §"Protected blob store"). Encrypted blob files live here,
 * one file per blob, named by UUID.
 */
export function protectedBlobsDir(workspaceId: string): string {
  return path.join(workspaceDir(workspaceId), 'protected-blobs');
}

/**
 * Returns the absolute path to the KEK-wrapped cipher key for the protected
 * blobs store (O454 / ADR-307 §"Sibling protected-blobs key").
 * Present only after the first blob write on an unlocked workspace.
 */
export function protectedBlobsKeyPath(workspaceId: string): string {
  return path.join(workspaceDir(workspaceId), 'protected-blobs.key.json');
}
