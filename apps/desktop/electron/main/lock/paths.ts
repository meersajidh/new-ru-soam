/**
 * Filesystem paths for per-workspace lock state and rate-limit state.
 *
 * Both paths live under userData/workspaces/<workspaceId>/ (created by
 * workspace/paths.ts#workspaceDir on first access).
 *
 * All functions take a workspaceId parameter per the multi-workspace
 * storage layout (ADR-307, Implementation_Plan.md §Phase 9a pinned decisions).
 */

import path from 'path';
import { workspaceDir } from '../workspace/paths.js';

/** Path to lock.json for a workspace (KEK wraps, KDF params, verifier). */
export function metadataPath(workspaceId: string): string {
  return path.join(workspaceDir(workspaceId), 'lock.json');
}

/** Path to lock-attempts.json for a workspace (rate-limit state). */
export function rateLimitPath(workspaceId: string): string {
  return path.join(workspaceDir(workspaceId), 'lock-attempts.json');
}
