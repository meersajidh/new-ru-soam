/**
 * CredentialStore — ADR-304 safeStorage wrapper.
 *
 * Phase 9 catalogue: 'local-store-db-key' only.
 * Credential keys are workspaceId-namespaced per ADR-304 amendment:
 *   "ru-soam.<workspaceId>.<credentialType>[.<ref>]"
 *
 * High-walk-up-impact credentials (cloud-session-token, kms-credentials) are
 * added in later phases as kek-wrapped entries per O307f.
 *
 * Linux backend unavailable -> throw with clear error (O30, Phase 9 fail-fast).
 */

import fs from 'fs';
import path from 'path';
import { app, safeStorage } from 'electron';

// Credential type catalogue — grow in later phases.
// 'cloud-session-token' = KEK-wrapped refresh token for the identity server (ADR-311 / O307f).
// 'google-calendar-token' = ADR-305 Flow-A provider token for Google Calendar (ADR-310 / O485).
//   raw (not KEK-wrapped in P0 — deferred to O307f extension; walk-up impact is calendar read-only).
//   Stored as JSON: { accessToken, refreshToken, expiresAt }.
export type CredentialType = 'local-store-db-key' | 'cloud-session-token' | 'google-calendar-token';

function storageKey(workspaceId: string, type: CredentialType, ref?: string): string {
  return ref ? `ru-soam.${workspaceId}.${type}.${ref}` : `ru-soam.${workspaceId}.${type}`;
}

function credStorePath(): string {
  const dir = path.join(app.getPath('userData'), 'credentials');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'store.json');
}

type StorageMap = Record<string, string>; // key -> base64-encoded encrypted blob

function readStore(): StorageMap {
  const p = credStorePath();
  try {
    const raw = fs.readFileSync(p, 'utf8');
    return JSON.parse(raw) as StorageMap;
  } catch {
    return {};
  }
}

function writeStore(store: StorageMap): void {
  const p = credStorePath();
  fs.writeFileSync(p, JSON.stringify(store, null, 2), 'utf8');
}

export class CredentialStore {
  /** Must be called after app.whenReady(). Throws on Linux if safeStorage unavailable. */
  init(): void {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error(
        '[CredentialStore] safeStorage encryption is not available on this platform. ' +
          'On Linux, ensure a keychain daemon (gnome-keyring, kwallet) is running. ' +
          'This application requires secure credential storage to protect PHI. ' +
          'Cannot start without it (O30 fail-fast).',
      );
    }
  }

  get(workspaceId: string, type: CredentialType, ref?: string): Buffer | null {
    const k = storageKey(workspaceId, type, ref);
    const store = readStore();
    const encoded = store[k];
    if (!encoded) return null;
    const encrypted = Buffer.from(encoded, 'base64');
    try {
      const decrypted = safeStorage.decryptString(encrypted);
      return Buffer.from(decrypted, 'base64');
    } catch {
      return null;
    }
  }

  set(workspaceId: string, type: CredentialType, value: Buffer, ref?: string): void {
    const k = storageKey(workspaceId, type, ref);
    const encrypted = safeStorage.encryptString(value.toString('base64'));
    const store = readStore();
    store[k] = encrypted.toString('base64');
    writeStore(store);
  }

  delete(workspaceId: string, type: CredentialType, ref?: string): void {
    const k = storageKey(workspaceId, type, ref);
    const store = readStore();
    delete store[k];
    writeStore(store);
  }

  /**
   * Return every ref stored under ru-soam.<workspaceId>.<type>.<ref>.
   *
   * Prefix-slices — does NOT split on "." — so email refs (containing dots) are
   * preserved verbatim. The legacy no-ref key (ru-soam.<ws>.<type>, no trailing
   * dot) is excluded by the prefix check requiring a dot after <type>.
   */
  listRefs(workspaceId: string, type: CredentialType): string[] {
    const prefix = `ru-soam.${workspaceId}.${type}.`;
    const store = readStore();
    const refs: string[] = [];
    for (const key of Object.keys(store)) {
      if (key.startsWith(prefix)) {
        refs.push(key.slice(prefix.length));
      }
    }
    return refs;
  }

  /**
   * Remove every credential whose key begins with `ru-soam.<workspaceId>.`.
   * Future-proofs against new credential types added beyond `local-store-db-key`.
   */
  deleteAllForWorkspace(workspaceId: string): void {
    const prefix = `ru-soam.${workspaceId}.`;
    const store = readStore();
    let changed = false;
    for (const key of Object.keys(store)) {
      if (key.startsWith(prefix)) {
        delete store[key];
        changed = true;
      }
    }
    if (changed) writeStore(store);
  }
}

export const credentialStore = new CredentialStore();
