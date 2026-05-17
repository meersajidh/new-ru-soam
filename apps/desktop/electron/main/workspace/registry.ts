/**
 * WorkspaceRegistry — owns the multi-workspace storage catalogue.
 *
 * Concurrency note: create + setupGenerate + setupAcknowledge form a
 * multi-step ceremony. This module relies on the renderer-driven serial flow
 * (one step at a time, no concurrent requests) and does not introduce
 * additional locking primitives. If a concurrent create is attempted the
 * caller will simply get a second workspace written — which is fine for the
 * current single-window model.
 *
 * Per Implementation_Plan.md §Phase 9a pinned decisions.
 */

import fs from 'fs';
import path from 'path';
import { userDataRoot, activeWorkspacePath, workspaceDir, metaPath } from './paths.js';

export interface WorkspaceMeta {
  readonly workspaceId: string;
  readonly nickname: string;
  readonly createdAt: string;       // ISO-8601
  readonly lastSignedIn: string | null; // ISO-8601 or null
}

/** Shape written to meta.json (does not include workspaceId — that's the dir name). */
interface MetaFile {
  nickname: string;
  createdAt: string;
  lastSignedIn: string | null;
}

/** Shape of active-workspace.json */
interface ActiveWorkspaceFile {
  workspaceId: string | null;
}

/** Validate nickname: 4-64 chars (length only per O307h). */
function isValidNickname(nickname: string): boolean {
  return nickname.length >= 4 && nickname.length <= 64;
}

/** Validate email: simple regex per Phase 9 spec. */
function isValidEmail(email: string): boolean {
  return /.+@.+\..+/.test(email);
}

export class WorkspaceRegistry {
  /**
   * List all workspaces by scanning the workspaces/ directory.
   * Skips any entry whose meta.json is missing or corrupt.
   */
  list(): WorkspaceMeta[] {
    const workspacesRoot = path.join(userDataRoot(), 'workspaces');
    if (!fs.existsSync(workspacesRoot)) return [];

    let entries: string[];
    try {
      entries = fs.readdirSync(workspacesRoot);
    } catch {
      return [];
    }

    const results: WorkspaceMeta[] = [];
    for (const entry of entries) {
      const meta = this.getMeta(entry);
      if (meta !== null) {
        results.push(meta);
      }
    }
    return results;
  }

  /** Read the active-workspace pointer. Returns null if absent or corrupt. */
  getActive(): string | null {
    const p = activeWorkspacePath();
    if (!fs.existsSync(p)) return null;
    try {
      const raw = fs.readFileSync(p, 'utf8');
      const parsed = JSON.parse(raw) as ActiveWorkspaceFile;
      return parsed.workspaceId ?? null;
    } catch {
      return null;
    }
  }

  /** Write the active-workspace pointer. Pass null to clear it. */
  setActive(workspaceId: string | null): void {
    const payload: ActiveWorkspaceFile = { workspaceId };
    fs.writeFileSync(activeWorkspacePath(), JSON.stringify(payload, null, 2), 'utf8');
  }

  /**
   * Create a new workspace.
   *
   * Validates nickname (4-64 chars) and email (simple regex).
   * Generates a UUID v4 via crypto.randomUUID(), mkdir, writes empty meta.json.
   * Does NOT call setActive — caller does that explicitly.
   *
   * @throws Error if nickname or email is invalid.
   */
  create(args: { nickname: string; email: string }): { workspaceId: string } {
    if (!isValidNickname(args.nickname)) {
      throw Object.assign(new Error('Workspace nickname must be 4-64 characters'), {
        code: 'invalid-nickname',
      });
    }
    if (!isValidEmail(args.email)) {
      throw Object.assign(new Error('Invalid email address'), { code: 'invalid-email' });
    }

    const workspaceId = crypto.randomUUID();
    // Ensure dir exists (workspaceDir does mkdir)
    workspaceDir(workspaceId);

    const metaFile: MetaFile = {
      nickname: args.nickname,
      createdAt: new Date().toISOString(),
      lastSignedIn: null,
    };
    fs.writeFileSync(metaPath(workspaceId), JSON.stringify(metaFile, null, 2), 'utf8');

    return { workspaceId };
  }

  /**
   * Read meta.json for a given workspace.
   * Returns null if the file is absent or corrupt.
   */
  getMeta(workspaceId: string): WorkspaceMeta | null {
    const p = metaPath(workspaceId);
    if (!fs.existsSync(p)) return null;
    try {
      const raw = fs.readFileSync(p, 'utf8');
      const file = JSON.parse(raw) as MetaFile;
      return {
        workspaceId,
        nickname: file.nickname,
        createdAt: file.createdAt,
        lastSignedIn: file.lastSignedIn ?? null,
      };
    } catch {
      return null;
    }
  }

  /**
   * Bump lastSignedIn to now for a workspace.
   * Called on successful unlock.
   */
  bumpLastSignedIn(workspaceId: string): void {
    const p = metaPath(workspaceId);
    if (!fs.existsSync(p)) return;
    try {
      const raw = fs.readFileSync(p, 'utf8');
      const file = JSON.parse(raw) as MetaFile;
      file.lastSignedIn = new Date().toISOString();
      fs.writeFileSync(p, JSON.stringify(file, null, 2), 'utf8');
    } catch {
      // Non-fatal — metadata bump is best-effort
    }
  }
}

/** Singleton export — import from this module. */
export const workspaceRegistry = new WorkspaceRegistry();
