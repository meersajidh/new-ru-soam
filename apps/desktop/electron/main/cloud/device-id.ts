/**
 * Per-install device identifier (ADR-311 §7).
 *
 * Generates a UUID v4 once per install, persisted plaintext to
 * `<userData>/install.json` as `{ device_id }`.  NOT secret, NOT
 * KEK-wrapped — user-resettable, not a hardware fingerprint, DPDP-clean.
 * Sent with each session event for usage analytics.
 */

import fs from 'fs';
import path from 'path';
import { app } from 'electron';

interface InstallJson {
  device_id: string;
}

function installJsonPath(): string {
  return path.join(app.getPath('userData'), 'install.json');
}

/**
 * Return the stable per-install device_id, generating and persisting one on
 * first call.  Idempotent: subsequent calls read the stored value.
 */
export function getDeviceId(): string {
  const p = installJsonPath();
  try {
    const raw = fs.readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw) as InstallJson;
    if (typeof parsed.device_id === 'string' && parsed.device_id.length > 0) {
      return parsed.device_id;
    }
  } catch {
    // File missing or malformed — fall through to generate.
  }

  const device_id = crypto.randomUUID();
  const data: InstallJson = { device_id };
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
  return device_id;
}
