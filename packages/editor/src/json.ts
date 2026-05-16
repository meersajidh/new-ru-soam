import { Node as PMNode, type Schema } from 'prosemirror-model';

export const RU_EDIT_SCHEMA_VERSION = 1 as const;

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

export function nodeFromJSON(envelope: unknown, schema: Schema): PMNode {
  if (!envelope || typeof envelope !== 'object') {
    throw new RuEditSchemaError('RuEdit JSON envelope must be an object');
  }
  const env = envelope as { schemaVersion?: unknown; doc?: unknown };
  if (env.schemaVersion !== RU_EDIT_SCHEMA_VERSION) {
    throw new RuEditSchemaError(
      `RuEdit schemaVersion mismatch: expected ${RU_EDIT_SCHEMA_VERSION}, got ${String(env.schemaVersion)}`,
    );
  }
  if (!env.doc) {
    throw new RuEditSchemaError('RuEdit envelope missing "doc"');
  }
  try {
    return PMNode.fromJSON(schema, env.doc);
  } catch (err) {
    throw new RuEditSchemaError(
      `RuEdit doc failed schema validation: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }
}
