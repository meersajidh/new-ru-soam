/**
 * Read/write lock.json (workspace metadata) per workspace.
 *
 * Pinned JSON shape per Implementation_Plan.md §Phase 9 pinned decisions:
 * {
 *   "version": 1,
 *   "kdf": { "algo": "argon2id", "m": 67108864, "t": 3, "p": 1, "outLen": 32 },
 *   "salt_p": "<base64-16B>",
 *   "salt_r": "<base64-16B>",
 *   "wrapped_KEK_passphrase": <envelope-json>,
 *   "wrapped_KEK_recovery":   <envelope-json>,
 *   "verifier":               <envelope-json>,
 *   "createdAt": "<ISO-8601>"
 * }
 *
 * All functions take a workspaceId to locate the correct workspace dir.
 */

import fs from 'fs';
import type { Envelope } from '../crypto/envelope.js';
import { metadataPath } from './paths.js';

export interface Metadata {
  readonly version: 1;
  readonly kdf: {
    readonly algo: 'argon2id';
    readonly m: number;
    readonly t: number;
    readonly p: number;
    readonly outLen: number;
  };
  readonly salt_p: string; // base64-16B
  readonly salt_r: string; // base64-16B
  readonly wrapped_KEK_passphrase: Envelope;
  readonly wrapped_KEK_recovery: Envelope;
  readonly verifier: Envelope;
  readonly createdAt: string; // ISO-8601
}

export function metadataExists(workspaceId: string): boolean {
  return fs.existsSync(metadataPath(workspaceId));
}

export function readMetadata(workspaceId: string): Metadata | null {
  const p = metadataPath(workspaceId);
  if (!fs.existsSync(p)) return null;
  try {
    const raw = fs.readFileSync(p, 'utf8');
    return JSON.parse(raw) as Metadata;
  } catch {
    return null;
  }
}

export function writeMetadata(workspaceId: string, m: Metadata): void {
  fs.writeFileSync(metadataPath(workspaceId), JSON.stringify(m, null, 2), 'utf8');
}
