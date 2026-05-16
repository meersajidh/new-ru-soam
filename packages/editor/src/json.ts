import { Node as PMNode, type Schema } from 'prosemirror-model';

// v1 — base schema (Phase 7.5): paragraph, heading, lists, blockquote, hr, hard_break, text; marks strong/em/underline/code.
// v2 — Phase 8: adds `placeholder` atomic inline node for snippet expansion.
export const RU_EDIT_SCHEMA_VERSION = 2 as const;
export type RuEditSchemaVersion = 1 | 2;

export interface RuEditDoc {
  readonly schemaVersion: typeof RU_EDIT_SCHEMA_VERSION;
  readonly doc: unknown;
}

export class RuEditSchemaError extends Error {
  override readonly name = 'RuEditSchemaError';
  readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.cause = cause;
  }
}

export function nodeToJSON(node: PMNode): RuEditDoc {
  return { schemaVersion: RU_EDIT_SCHEMA_VERSION, doc: node.toJSON() };
}

// Migrate an envelope to v2. v1→v2 is a no-op (placeholder node is additive;
// no v1 doc contains one). Unknown versions throw a named error.
function migrateEnvelope(env: { schemaVersion?: unknown; doc?: unknown }): { doc: unknown } {
  const v = env.schemaVersion;
  if (v === 1 || v === 2) return { doc: env.doc };
  throw new RuEditSchemaError(
    `RuEdit schemaVersion unsupported: expected 1 or ${RU_EDIT_SCHEMA_VERSION}, got ${String(v)}`,
  );
}

export function nodeFromJSON(envelope: unknown, schema: Schema): PMNode {
  if (!envelope || typeof envelope !== 'object') {
    throw new RuEditSchemaError('RuEdit JSON envelope must be an object');
  }
  const env = envelope as { schemaVersion?: unknown; doc?: unknown };
  if (!env.doc) {
    throw new RuEditSchemaError('RuEdit envelope missing "doc"');
  }
  const { doc } = migrateEnvelope(env);
  try {
    return PMNode.fromJSON(schema, doc);
  } catch (err) {
    throw new RuEditSchemaError(
      `RuEdit doc failed schema validation: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }
}
