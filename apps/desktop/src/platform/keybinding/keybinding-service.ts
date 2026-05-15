import type { ICommandService } from '../command/command-service';
import type { IContextKeyService } from '../context-key/context-key-service';

export interface IKeybindingService {
  registerKeybinding(chord: string, commandId: string, when?: string): void;
  dispose(): void;
}

interface Binding {
  chord: string;
  commandId: string;
  when?: string;
}

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

  registerKeybinding(chord: string, commandId: string, when?: string): void {
    this._bindings.push({ chord: chord.toLowerCase(), commandId, when });
  }

  dispose(): void {
    this._disposed = true;
    window.removeEventListener('keydown', this._onKeyDown);
  }

  private readonly _onKeyDown = (e: KeyboardEvent): void => {
    if (this._disposed) return;
    const chord = chordFromEvent(e);
    for (const b of this._bindings) {
      if (b.chord !== chord) continue;
      if (b.when !== undefined && !this._contextKeys.evaluate(b.when)) continue;
      e.preventDefault();
      void this._commands.execute(b.commandId).catch(() => {});
      return;
    }
  };
}
