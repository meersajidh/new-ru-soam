import { SnippetRegistry } from '@ru-soam/editor';

export type { SnippetRegistry };

export interface ISnippetService {
  registry(): SnippetRegistry;
}

export class SnippetService implements ISnippetService {
  private readonly _registry = new SnippetRegistry();

  registry(): SnippetRegistry {
    return this._registry;
  }
}
