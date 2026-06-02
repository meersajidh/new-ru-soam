import type { ICommandService } from '../command/command-service';
import type { IContextKeyService } from '../context-key/context-key-service';
import { readUserKeybindings, writeUserKeybindings, type UserKeybinding } from './user-keybindings-store';

export type KeybindingSource = 'platform' | 'bundle' | 'user';

/** Platform-default keybinding shape (used by seedDefaults). */
export interface DefaultKeybinding {
  readonly key: string;
  readonly command: string;
  readonly when?: string;
  readonly args?: ReadonlyArray<unknown>;
}

/** One effective binding row for the Keyboard Shortcuts editor (O426). */
export interface EffectiveBinding {
  readonly command: string;
  readonly title: string;
  readonly category?: string;
  /** Winning chord (when-clauses ignored for display); null when unbound. */
  readonly key: string | null;
  readonly source: KeybindingSource | null;
  readonly isUserDefined: boolean;
}

export interface IKeybindingService {
  registerKeybinding(chord: string, commandId: string, when?: string): void;
  seedDefaults(list: ReadonlyArray<DefaultKeybinding>): void;
  seedContributedKeybindings(list: ReadonlyArray<{ key: string; command: string; when?: string; args?: ReadonlyArray<unknown> }>): void;
  /** Seed the user-source overrides (O426). `-command` entries are removals. */
  seedUserKeybindings(list: ReadonlyArray<UserKeybinding>): void;
  /** Rebind a command so `newKey` becomes its sole trigger; persists + reseeds. */
  setUserBinding(command: string, newKey: string, when?: string): void;
  /** Drop all user entries for a command, restoring defaults; persists + reseeds. */
  resetCommand(command: string): void;
  /** One row per registered command for the Keyboard Shortcuts editor. */
  getEffectiveBindings(): EffectiveBinding[];
  /** While true the global handler bails — the chord recorder owns keystrokes. */
  setCapturing(on: boolean): void;
  onDidChangePendingChord(listener: (firstStroke: string | null) => void): () => void;
  onDidChangeBindings(listener: () => void): () => void;
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

// Pure-modifier keys: their lone keydown is not a stroke (Ctrl-then-K fires a
// Ctrl-alone keydown first — it must not be treated as a stroke or clear pending).
const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'AltGraph']);

/** Time window (ms) to complete a multi-stroke chord before it resets. */
const CHORD_TIMEOUT = 1200;

/**
 * Build the normalized single-stroke representation of a keydown event.
 * Exported so the chord recorder (Keyboard Shortcuts editor) builds strokes
 * identically to the live engine.
 */
export function chordFromEvent(e: KeyboardEvent): string {
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

/** True when this keydown is a lone modifier press (no real key yet). */
export function isModifierEvent(e: KeyboardEvent): boolean {
  return MODIFIER_KEYS.has(e.key);
}

/** Normalize one stroke: sort modifiers ctrl→meta→alt→shift, `mod`→PRIMARY_MOD. */
function normalizeStroke(stroke: string): string {
  const parts = stroke.toLowerCase().split('+');
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

/**
 * Normalize a (possibly multi-stroke) chord. Strokes are whitespace-separated
 * (`ctrl+k ctrl+s`); each is normalized and rejoined with a single space, so
 * author order (`shift+ctrl+p`) matches chordFromEvent order (`ctrl+shift+p`).
 */
function normalizeChord(chord: string): string {
  return chord
    .trim()
    .split(/\s+/)
    .map(normalizeStroke)
    .join(' ');
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

  /** `${chord}::${commandId}` entries suppressed by user removals (O426). */
  private readonly _userRemovals = new Set<string>();

  /** First strokes of all multi-stroke bindings; rebuilt lazily when dirty. */
  private readonly _prefixes = new Set<string>();
  private _prefixDirty = true;

  /** Pending first stroke of an in-flight chord, with its reset timer. */
  private _pending: { firstStroke: string; timer: ReturnType<typeof setTimeout> } | null = null;

  /** When true, the recorder owns keystrokes — the global handler bails. */
  private _capturing = false;

  private readonly _pendingListeners = new Set<(first: string | null) => void>();
  private readonly _bindingListeners = new Set<() => void>();

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

  seedUserKeybindings(list: ReadonlyArray<UserKeybinding>): void {
    this._clearSource('user');
    this._userRemovals.clear();
    for (const kb of list) {
      if (kb.command.startsWith('-')) {
        // Removal: suppress this exact chord→command (disables a default/bundle bind).
        this._userRemovals.add(`${normalizeChord(kb.key)}::${kb.command.slice(1)}`);
        continue;
      }
      this._addBinding({
        chord: normalizeChord(kb.key),
        commandId: kb.command,
        when: kb.when,
        args: kb.args,
        source: 'user',
      });
    }
    this._prefixDirty = true;
    this._emitBindings();
  }

  setUserBinding(command: string, newKey: string, when?: string): void {
    const normNew = normalizeChord(newKey);
    // Every other chord currently bound to this command gets a removal so the
    // new key becomes the sole trigger.
    const others = new Set<string>();
    for (const b of this._bindings) {
      if (b.commandId === command && b.chord !== normNew) others.add(b.chord);
    }
    const stripped = readUserKeybindings().filter((e) => this._entryCommand(e) !== command);
    const next: UserKeybinding[] = [
      ...stripped,
      { key: normNew, command, ...(when !== undefined ? { when } : {}) },
      ...[...others].map((chord) => ({ key: chord, command: '-' + command })),
    ];
    writeUserKeybindings(next);
    this.seedUserKeybindings(next);
  }

  resetCommand(command: string): void {
    const next = readUserKeybindings().filter((e) => this._entryCommand(e) !== command);
    writeUserKeybindings(next);
    this.seedUserKeybindings(next);
  }

  getEffectiveBindings(): EffectiveBinding[] {
    const rows: EffectiveBinding[] = [];
    for (const c of this._commands.getAll()) {
      let best: Binding | undefined;
      for (const b of this._bindings) {
        if (b.commandId !== c.id) continue;
        if (this._userRemovals.has(`${b.chord}::${b.commandId}`)) continue;
        // when ignored for display; last-wins within equal source rank.
        if (best === undefined || SOURCE_RANK[b.source] >= SOURCE_RANK[best.source]) best = b;
      }
      rows.push({
        command: c.id,
        title: c.title,
        ...(c.category !== undefined ? { category: c.category } : {}),
        key: best ? best.chord : null,
        source: best ? best.source : null,
        isUserDefined: best?.source === 'user',
      });
    }
    rows.sort(
      (a, b) =>
        (a.category ?? '').localeCompare(b.category ?? '') || a.title.localeCompare(b.title),
    );
    return rows;
  }

  setCapturing(on: boolean): void {
    this._capturing = on;
    // Drop any half-entered chord when capture takes over.
    if (on) this._clearPending();
  }

  onDidChangePendingChord(listener: (first: string | null) => void): () => void {
    this._pendingListeners.add(listener);
    return () => this._pendingListeners.delete(listener);
  }

  onDidChangeBindings(listener: () => void): () => void {
    this._bindingListeners.add(listener);
    return () => this._bindingListeners.delete(listener);
  }

  dispose(): void {
    this._disposed = true;
    this._clearPending();
    window.removeEventListener('keydown', this._onKeyDown);
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private _entryCommand(e: UserKeybinding): string {
    return e.command.startsWith('-') ? e.command.slice(1) : e.command;
  }

  private _addBinding(binding: Binding): void {
    this._bindings.push(binding);
    this._prefixDirty = true;
  }

  private _clearSource(source: KeybindingSource): void {
    let i = this._bindings.length;
    while (i--) {
      if (this._bindings[i].source === source) {
        this._bindings.splice(i, 1);
      }
    }
    this._prefixDirty = true;
  }

  private _ensurePrefixes(): void {
    if (!this._prefixDirty) return;
    this._prefixes.clear();
    for (const b of this._bindings) {
      const sp = b.chord.indexOf(' ');
      if (sp !== -1) this._prefixes.add(b.chord.slice(0, sp));
    }
    this._prefixDirty = false;
  }

  private _resolveWinner(chord: string): Binding | undefined {
    let winner: Binding | undefined;
    for (const b of this._bindings) {
      if (b.chord !== chord) continue;
      if (this._userRemovals.has(`${b.chord}::${b.commandId}`)) continue;
      if (b.when !== undefined && !this._contextKeys.evaluate(b.when)) continue;
      if (winner === undefined || SOURCE_RANK[b.source] >= SOURCE_RANK[winner.source]) {
        winner = b;
      }
    }
    return winner;
  }

  private _clearPending(): void {
    if (this._pending) {
      clearTimeout(this._pending.timer);
      this._pending = null;
      this._emitPending(null);
    }
  }

  private _emitPending(first: string | null): void {
    for (const l of this._pendingListeners) l(first);
  }

  private _emitBindings(): void {
    for (const l of this._bindingListeners) l();
  }

  private readonly _onKeyDown = (e: KeyboardEvent): void => {
    if (this._disposed || this._capturing) return;
    if (isModifierEvent(e)) return; // lone modifier press — not a stroke

    this._ensurePrefixes();
    const stroke = chordFromEvent(e);

    // Completing an in-flight multi-stroke chord.
    if (this._pending) {
      const full = `${this._pending.firstStroke} ${stroke}`;
      this._clearPending();
      e.preventDefault();
      const winner = this._resolveWinner(full);
      if (winner) {
        void this._commands.execute(winner.commandId, ...(winner.args ?? [])).catch(() => {});
      }
      return;
    }

    // Stroke that starts a multi-stroke chord → wait for the second stroke.
    if (this._prefixes.has(stroke)) {
      e.preventDefault();
      this._pending = {
        firstStroke: stroke,
        timer: setTimeout(() => this._clearPending(), CHORD_TIMEOUT),
      };
      this._emitPending(stroke);
      return;
    }

    // Single-stroke binding.
    const winner = this._resolveWinner(stroke);
    if (winner !== undefined) {
      e.preventDefault();
      void this._commands.execute(winner.commandId, ...(winner.args ?? [])).catch(() => {});
    }
  };
}
