import type { RuEditDoc } from '@ru-soam/editor';

/**
 * sessionStorage-backed doc cache for `ru-edit-scratch://` tabs (Phase 7.5b).
 * Survives both tab switches and renderer reloads, but not workbench restart
 * (matching the sessionStorage lifetime). Keys are `ru-edit-scratch:<resource>`
 * so they namespace cleanly under sessionStorage.
 *
 * Stored value is the JSON-serialized `RuEditDoc` envelope; corrupt entries
 * are dropped silently and behave as "no prior doc".
 */
const KEY_PREFIX = 'ru-edit-scratch:';

function keyFor(resource: string): string {
  return KEY_PREFIX + resource;
}

export function getScratchDoc(resource: string): RuEditDoc | undefined {
  try {
    const raw = sessionStorage.getItem(keyFor(resource));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { schemaVersion?: unknown; doc?: unknown };
    const v = parsed.schemaVersion;
    if (!parsed || typeof parsed !== 'object' || (v !== 1 && v !== 2)) {
      sessionStorage.removeItem(keyFor(resource));
      return undefined;
    }
    return parsed as RuEditDoc;
  } catch {
    return undefined;
  }
}

export function setScratchDoc(resource: string, doc: RuEditDoc): void {
  try {
    sessionStorage.setItem(keyFor(resource), JSON.stringify(doc));
  } catch {
    // Storage quota / disabled — silently drop. Scratch docs are advisory.
  }
}

export function dropScratchDoc(resource: string): void {
  try {
    sessionStorage.removeItem(keyFor(resource));
  } catch {
    // ignore
  }
}
