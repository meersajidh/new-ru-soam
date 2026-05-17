/**
 * Identity envelope: KEK-encrypted { email } stored at workspaces/<uuid>/identity.envelope.
 *
 * AAD = canonical JSON { "purpose": "identity", "workspaceId": "<uuid>" }
 * (sorted keys, no whitespace — produced by the canonicalJson helper in envelope.ts).
 *
 * Written by setupAcknowledge, read post-unlock via LockService.getIdentity().
 */

import fs from 'fs';
import { encryptToEnvelope, decryptFromEnvelope } from '../crypto/envelope.js';
import { identityPath } from './paths.js';

export interface Identity {
  readonly email: string;
}

/** Canonical-JSON AAD for identity envelope. Keys sorted: purpose, workspaceId. */
function buildIdentityAad(workspaceId: string): Buffer {
  // Keys sorted alphabetically: purpose < workspaceId
  const obj = { purpose: 'identity', workspaceId };
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) {
    sorted[k] = (obj as Record<string, unknown>)[k];
  }
  return Buffer.from(JSON.stringify(sorted), 'utf8');
}

/**
 * Encrypt and persist identity to identity.envelope.
 *
 * @param workspaceId  UUID of the workspace (used in AAD and file path).
 * @param kek          In-memory KEK buffer.
 * @param identity     Plain-data identity object.
 */
export function writeIdentity(workspaceId: string, kek: Buffer, identity: Identity): void {
  const aad = buildIdentityAad(workspaceId);
  const plaintext = Buffer.from(JSON.stringify(identity), 'utf8');
  const envelope = encryptToEnvelope(kek, plaintext, aad);
  fs.writeFileSync(identityPath(workspaceId), JSON.stringify(envelope, null, 2), 'utf8');
}

/**
 * Decrypt and return identity from identity.envelope.
 *
 * Returns null if the file is absent or decryption fails (e.g. wrong KEK, tampered).
 *
 * @param workspaceId  UUID of the workspace.
 * @param kek          In-memory KEK buffer (must be the correct key for this workspace).
 */
export function readIdentity(workspaceId: string, kek: Buffer): Identity | null {
  const p = identityPath(workspaceId);
  if (!fs.existsSync(p)) return null;
  try {
    const raw = fs.readFileSync(p, 'utf8');
    const envelope = JSON.parse(raw);
    const plaintext = decryptFromEnvelope(kek, envelope);
    return JSON.parse(plaintext.toString('utf8')) as Identity;
  } catch {
    return null;
  }
}
