/**
 * Ensures `local-store-db-key` exists in the credential store for a workspace.
 *
 * Phase 9: provisions the key; Phase 10 SQLCipher consumes it.
 * The key is raw (not KEK-wrapped) per O307f — it must be readable
 * at Main startup before the workspace metadata can be opened
 * (bootstrap chicken-and-egg).
 *
 * The credential key is workspaceId-namespaced:
 *   "ru-soam.<workspaceId>.local-store-db-key"
 */

import { randomBytes } from 'crypto';
import { credentialStore } from './index.js';

const DB_KEY_BYTES = 32;

/**
 * Return the existing local-store-db-key for the given workspace,
 * or generate + store a new one.
 */
export function ensureLocalStoreDbKey(workspaceId: string): Buffer {
  const existing = credentialStore.get(workspaceId, 'local-store-db-key');
  if (existing !== null) return existing;

  const key = randomBytes(DB_KEY_BYTES);
  credentialStore.set(workspaceId, 'local-store-db-key', key);
  return key;
}
