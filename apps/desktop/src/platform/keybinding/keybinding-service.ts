import type { ICommandService } from '../command/command-service';
import type { IContextKeyService } from '../context-key/context-key-service';

export type KeybindingSource = 'platform' | 'bundle' | 'user';

/** Platform-default keybinding shape (used by seedDefaults). */
export interface DefaultKeybinding {
  readonly key: string;
  readonly command: string;
  readonly when?: string;
  readonly args?: ReadonlyArray<unknown>;
}

export interface IKeybindingService {
  registerKeybinding(chord: string, commandId: string, when?: string): void;
  seedDefaults(list: ReadonlyArray<DefaultKeybinding>): void;
  seedContributedKeybindings(list: ReadonlyArray<{ key: string; command: string; when?: string; args?: ReadonlyArray<unknown> }>): void;
  dispose(): void;
}

interface Binding {
  chord: string;
  commandId: string;
  when?: string;
  args?: ReadonlyArray<unknown>;
  source: KeybindingSource;
}

// Win/Linux-only build targets — mac cmd↔ctrl fold deferred.
const PRIMARY_MOD = 'ctrl';

// Canonical modifier order emitted by chordFromEvent.
const MODIFIER_ORDER: ReadonlyArray<string> = ['ctrl', 'meta', 'alt', 'shift'];

function chordFromEvent(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey)  parts.push('ctrl');
  if (e.metaKey)  parts.push('meta');
  if (e.altKey)   parts.push('alt');
  if (e.shiftKey) parts.push('shift');

  const keyAliases: Record<string, string> = {
    ' ': 'space', ',': ',', '.': '.', '/': '/',
    arrowup: 'up', arrowdown: 'down', arrowleft: 'left', arrowright: 'right',
  };
  const key = e.key.toLowerCase();
  parts.push(keyAliases[key] ?? key);
  return parts.join('+');
}

/**
 * Normalize a chord string so author-written order (e.g. `shift+ctrl+p`)
 * matches chordFromEvent order (`ctrl+shift+p`).
 * Modifiers are sorted to ctrl→meta→alt→shift; `mod` aliases PRIMARY_MOD.
 * Key portion lowercased.
 */
function normalizeChord(chord: string): string {
  const parts = chord.toLowerCase().split('+');
  const mods: string[] = [];
  let key = '';
  for (const part of parts) {
    const p = part === 'mod' ? PRIMARY_MOD : part;
    if (MODIFIER_ORDER.includes(p)) {
      mods.push(p);
    } else {
      key = p;
    }
  }
  mods.sort((a, b) => MODIFIER_ORDER.indexOf(a) - MODIFIER_ORDER.indexOf(b));
  return [...mods, key].join('+');
}

// Source precedence: user > bundle > platform.
const SOURCE_RANK: Record<KeybindingSource, number> = {
  user: 2,
  bundle: 1,
  platform: 0,
};

export class KeybindingService implements IKeybindingService {
  private readonly _bindings: Binding[] = [];
  private readonly _commands: ICommandService;
  private readonly _contextKeys: IContextKeyService;
  private _disposed = false;

  constructor(commands: ICommandService, contextKeys: IContextKeyService) {
    this._commands = commands;
    this._contextKeys = contextKeys;
    window.addEventListener('keydown', this._onKeyDown);
  }

  /** Back-compat thin path — registers as platform-source. */
  registerKeybinding(chord: string, commandId: string, when?: string): void {
    this._addBinding({ chord: normalizeChord(chord), commandId, when, source: 'platform' });
  }

  /** Idempotent: clears prior platform-source bindings then adds new list. */
  seedDefaults(list: ReadonlyArray<DefaultKeybinding>): void {
    this._clearSource('platform');
    for (const kb of list) {
      this._addBinding({
        chord: normalizeChord(kb.key),
        commandId: kb.command,
        when: kb.when,
        args: kb.args,
        source: 'platform',
      });
    }
  }

  /** Idempotent: clears prior bundle-source bindings then adds new list. */
  seedContributedKeybindings(list: ReadonlyArray<{ key: string; command: string; when?: string; args?: ReadonlyArray<unknown> }>): void {
    this._clearSource('bundle');
    for (const kb of list) {
      this._addBinding({
        chord: normalizeChord(kb.key),
        commandId: kb.command,
        when: kb.when,
        args: kb.args,
        source: 'bundle',
      });
    }
  }

  dispose(): void {
    this._disposed = true;
    window.removeEventListener('keydown', this._onKeyDown);
  }

  private _addBinding(binding: Binding): void {
    this._bindings.push(binding);
  }

  private _clearSource(source: KeybindingSource): void {
    let i = this._bindings.length;
    while (i--) {
      if (this._bindings[i].source === source) {
        this._bindings.splice(i, 1);
      }
    }
  }

  private readonly _onKeyDown = (e: KeyboardEvent): void => {
    if (this._disposed) return;
    const chord = chordFromEvent(e);

    // Collect all matching bindings, pick winner by source precedence.
    // Within same source, last-registered wins (iterate forward, overwrite).
    let winner: Binding | undefined;
    for (const b of this._bindings) {
      if (b.chord !== chord) continue;
      if (b.when !== undefined && !this._contextKeys.evaluate(b.when)) continue;
      if (winner === undefined || SOURCE_RANK[b.source] >= SOURCE_RANK[winner.source]) {
        winner = b;
      }
    }

    if (winner !== undefined) {
      e.preventDefault();
      void this._commands.execute(winner.commandId, ...(winner.args ?? [])).catch(() => {});
    }
  };
}
