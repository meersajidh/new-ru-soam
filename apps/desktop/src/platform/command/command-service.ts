import type { IContextKeyService } from '../context-key/context-key-service';

export interface CommandContribution {
  readonly id: string;
  readonly title: string;
  readonly category?: string;
  readonly when?: string;
  readonly icon?: string;
}

export class CommandError extends Error {
  readonly commandId: string;
  constructor(commandId: string, message: string) {
    super(`[${commandId}] ${message}`);
    this.name = 'CommandError';
    this.commandId = commandId;
  }
}

type CommandHandler = (...args: unknown[]) => unknown;

interface RegisteredCommand extends CommandContribution {
  readonly handler: CommandHandler;
}

const PLATFORM_PREFIXES = ['workbench.', 'editors.', 'commands.'] as const;

function isValidId(id: string): boolean {
  if (!id.includes('.')) return false;
  if (PLATFORM_PREFIXES.some(p => id.startsWith(p))) return true;
  const dot = id.indexOf('.');
  return dot > 0 && dot < id.length - 1;
}

export interface ICommandService {
  register(
    id: string,
    title: string,
    handler: CommandHandler,
    opts?: Omit<CommandContribution, 'id' | 'title'>
  ): () => void;
  execute(id: string, ...args: unknown[]): Promise<unknown>;
  getAll(): CommandContribution[];
  getVisible(contextKeys: IContextKeyService): CommandContribution[];
}

export class CommandService implements ICommandService {
  private readonly _cmds = new Map<string, RegisteredCommand>();

  register(
    id: string,
    title: string,
    handler: CommandHandler,
    opts?: Omit<CommandContribution, 'id' | 'title'>
  ): () => void {
    if (!isValidId(id)) throw new CommandError(id, 'Invalid id: must be namespaced <namespace>.<verb>');
    if (this._cmds.has(id)) throw new CommandError(id, 'Already registered');
    this._cmds.set(id, { id, title, handler, ...opts });
    return () => this._cmds.delete(id);
  }

  async execute(id: string, ...args: unknown[]): Promise<unknown> {
    const cmd = this._cmds.get(id);
    if (!cmd) throw new CommandError(id, 'Not found');
    try { return await Promise.resolve(cmd.handler(...args)); }
    catch (err) { throw new CommandError(id, err instanceof Error ? err.message : String(err)); }
  }

  getAll(): CommandContribution[] {
    return [...this._cmds.values()].map(({ id, title, category, when, icon }) =>
      ({ id, title, ...(category !== undefined && { category }), ...(when !== undefined && { when }), ...(icon !== undefined && { icon }) })
    );
  }

  getVisible(contextKeys: IContextKeyService): CommandContribution[] {
    return this.getAll().filter(cmd => !cmd.when || contextKeys.evaluate(cmd.when));
  }
}
