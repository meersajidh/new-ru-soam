/**
 * Filesystem paths for the multi-workspace storage layout.
 *
 * Layout per ADR-307 §"Storage layout (multi-workspace)" and
 * Implementation_Plan.md §Phase 9a pinned decisions:
 *
 *   $userData/
 *   ├── active-workspace.json
 *   ├── workspaces/
 *   │   └── <uuid>/
 *   │       ├── lock.json
 *   │       ├── lock-attempts.json
 *   │       ├── meta.json
 *   │       └── identity.envelope
 *   └── credentials/
 *       └── store.json
 *
 * Path helpers are PURE — they compute paths with no filesystem side effects.
 * The workspace directory is created only via the explicit `ensureWorkspaceDir()`,
 * called at genuine write sites. Computing a path must never create a directory
 * (O481: a mkdir-on-read footgun once let a stale-pointer existence check recreate
 * a deleted workspace dir).
 */

import fs from 'fs';
import path from 'path';
import { app } from 'electron';

/** Returns the userData root directory (no side effects). */
export function userDataRoot(): string {
  return app.getPath('userData');
}

/** Path to the active-workspace pointer file. */
export function activeWorkspacePath(): string {
  return path.join(userDataRoot(), 'active-workspace.json');
}

/** Path to the directory for a specific workspace (pure — no side effects). */
export function workspaceDir(workspaceId: string): string {
  return path.join(userDataRoot(), 'workspaces', workspaceId);
}

/**
 * Ensure the workspace directory exists, returning its path. Idempotent.
 *
 * Call this ONLY at genuine write sites — the directory's creation must be an
 * explicit act, never a side effect of computing a path (O481).
 */
export function ensureWorkspaceDir(workspaceId: string): string {
  const dir = workspaceDir(workspaceId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Path to meta.json for a workspace (pure — ensureWorkspaceDir before writing). */
export function metaPath(workspaceId: string): string {
  return path.join(workspaceDir(workspaceId), 'meta.json');
}

/** Path to identity.envelope for a workspace (pure — ensureWorkspaceDir before writing). */
export function identityPath(workspaceId: string): string {
  return path.join(workspaceDir(workspaceId), 'identity.envelope');
}
