/**
 * platform.dev@1.0 — DEV-ONLY capability for workspace reset + relaunch.
 *
 * Registered only when !app.isPackaged (development builds).
 * In production the capability is never registered, so the renderer gets
 * cap.not_found and the developer.setup.reset command shows a user-facing
 * error message.
 *
 * NOT PHI-flagged — operates on the lock-state files themselves, not PHI data.
 * app.relaunch() resolves any in-flight renderer state.
 *
 * Method:
 *   resetActiveWorkspace(): { ok: true }
 *     Wipes lock.json, lock-attempts.json, identity.envelope for the active
 *     workspace. Clears the active pointer. Does NOT delete meta.json or the
 *     workspace directory (preserves user intent). Then relaunches the app.
 */

import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { workspaceRegistry } from '../workspace/registry.js';
import { userDataRoot } from '../workspace/paths.js';
import { registerCapability } from './registry.js';

function workspaceFilePath(workspaceId: string, filename: string): string {
  return path.join(userDataRoot(), 'workspaces', workspaceId, filename);
}

function safeUnlink(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.warn('[platform.dev] could not remove file:', filePath, err);
  }
}

export function registerPlatformDevCapability(): void {
  // Only register in development builds
  if (app.isPackaged) return;

  registerCapability(
    'platform.dev',
    '1.0',
    async (method, args) => {
      void args; // not used by any method currently
      if (method === 'resetActiveWorkspace') {
        const activeId = workspaceRegistry.getActive();
        if (activeId) {
          // Wipe lock-state files — keep meta.json and workspace dir
          safeUnlink(workspaceFilePath(activeId, 'lock.json'));
          safeUnlink(workspaceFilePath(activeId, 'lock-attempts.json'));
          safeUnlink(workspaceFilePath(activeId, 'identity.envelope'));
        }
        // Clear the active pointer so the renderer routes to setup/zero-workspaces
        workspaceRegistry.setActive(null);

        // Relaunch the app so the renderer starts fresh
        app.relaunch();
        app.quit();

        return { ok: true };
      }
      throw Object.assign(new Error(`platform.dev: unknown method: ${method}`), {
        code: 'cap.method_not_found',
      });
    },
  );
}
