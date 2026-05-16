export interface SnippetPlaceholder {
  readonly name: string;
  readonly type: 'text' | 'picklist';
  readonly default?: string;
  readonly options?: readonly string[]; // required when type === 'picklist'
}

// Phase 8: 'text' body kind only. 'doc' (arbitrary PM fragment JSON) is future.
export type SnippetBody =
  | { readonly kind: 'text'; readonly template: string } // "Patient reports {{name}}" markers
  | { readonly kind: 'doc'; readonly fragment: unknown }; // PM node JSON — future

export interface SnippetDef {
  readonly id: string;
  readonly abbrev: string; // trigger text after '/' (e.g. "hpi")
  readonly label: string;  // display in completion popup
  readonly body: SnippetBody;
  readonly placeholders: readonly SnippetPlaceholder[];
}

export class SnippetRegistry {
  private readonly _defs = new Map<string, SnippetDef>();

  add(def: SnippetDef): void {
    this._defs.set(def.abbrev, def);
  }

  remove(abbrev: string): void {
    this._defs.delete(abbrev);
  }

  get(abbrev: string): SnippetDef | undefined {
    return this._defs.get(abbrev);
  }

  list(): SnippetDef[] {
    return Array.from(this._defs.values());
  }

  // Returns all defs whose abbrev starts with query (empty query = all).
  matches(query: string): SnippetDef[] {
    if (!query) return this.list();
    return this.list().filter(d => d.abbrev.startsWith(query));
  }

  get size(): number {
    return this._defs.size;
  }
}
