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
 * Each exported function creates required parent directories on first call.
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

/** Path to the directory for a specific workspace. Creates it if absent. */
export function workspaceDir(workspaceId: string): string {
  const dir = path.join(userDataRoot(), 'workspaces', workspaceId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Path to meta.json for a workspace. Ensures parent dir exists. */
export function metaPath(workspaceId: string): string {
  return path.join(workspaceDir(workspaceId), 'meta.json');
}

/** Path to identity.envelope for a workspace. Ensures parent dir exists. */
export function identityPath(workspaceId: string): string {
  return path.join(workspaceDir(workspaceId), 'identity.envelope');
}
