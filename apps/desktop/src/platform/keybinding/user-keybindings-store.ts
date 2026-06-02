/**
 * User keybinding overrides (O426) — global localStorage store.
 *
 * One flat list of entries. Matches the appearance-axis persistence pattern
 * (Font / Theme / Activity-Bar density): a plain `localStorage` key, NOT the
 * prefs capability (which is layout/workspace-scoped). Keybindings are global
 * and non-PHI, so a single app-wide store mirrors VSCode's keybindings.json.
 *
 * Removal encoding (VSCode-style): an entry whose `command` starts with `-`
 * means "remove the binding `key`→`command`" (command id = command.slice(1)).
 * Rebinding a command writes a positive entry for the new key plus removals
 * for every other chord that command was bound to.
 */

const STORAGE_KEY = 'soam.userKeybindings';

export interface UserKeybinding {
  readonly key: string;
  readonly command: string;
  readonly when?: string;
  readonly args?: ReadonlyArray<unknown>;
}

function isValidEntry(v: unknown): v is UserKeybinding {
  if (!v || typeof v !== 'object') return false;
  const e = v as Record<string, unknown>;
  if (typeof e.key !== 'string' || e.key.length === 0) return false;
  if (typeof e.command !== 'string' || e.command.length === 0) return false;
  if (e.when !== undefined && typeof e.when !== 'string') return false;
  if (e.args !== undefined && !Array.isArray(e.args)) return false;
  return true;
}

/** Read persisted user keybindings; drops malformed entries, never throws. */
export function readUserKeybindings(): UserKeybinding[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidEntry);
  } catch {
    return [];
  }
}

/** Persist the full user-keybinding list. Silent when storage is unavailable. */
export function writeUserKeybindings(list: ReadonlyArray<UserKeybinding>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable */
  }
}
