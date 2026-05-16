import { Plugin } from 'prosemirror-state';
import { Fragment, Node as PMNode } from 'prosemirror-model';
import { ID_BEARING_NODES } from './schema';

export function uuidV4(): string {
  // Prefer crypto.randomUUID when present (Electron renderer + modern browsers).
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  // Fallback: RFC4122 v4 from getRandomValues.
  const buf = new Uint8Array(16);
  (globalThis.crypto as Crypto).getRandomValues(buf);
  buf[6] = (buf[6] & 0x0f) | 0x40;
  buf[8] = (buf[8] & 0x3f) | 0x80;
  const hex: string[] = [];
  for (let i = 0; i < 16; i++) hex.push(buf[i].toString(16).padStart(2, '0'));
  return (
    hex.slice(0, 4).join('') + '-' +
    hex.slice(4, 6).join('') + '-' +
    hex.slice(6, 8).join('') + '-' +
    hex.slice(8, 10).join('') + '-' +
    hex.slice(10, 16).join('')
  );
}

/**
 * Walks a doc tree and assigns a fresh UUID v4 to any id-bearing block that
 * lacks an `_id` or shares one with an earlier sibling. Pure: returns a new
 * node, never mutates. Used to normalize an initial doc at mount time so
 * `getDoc()` is stable before the first transaction.
 */
export function ensureStableIds(doc: PMNode): PMNode {
  const seen = new Set<string>();
  const visit = (node: PMNode): PMNode => {
    const children: PMNode[] = [];
    let childChanged = false;
    node.forEach((child) => {
      const next = visit(child);
      if (next !== child) childChanged = true;
      children.push(next);
    });
    const content = childChanged ? Fragment.fromArray(children) : node.content;

    let attrs = node.attrs;
    if (ID_BEARING_NODES.has(node.type.name)) {
      const current = node.attrs._id as string | null;
      if (!current || seen.has(current)) {
        const fresh = uuidV4();
        seen.add(fresh);
        attrs = { ...node.attrs, _id: fresh };
      } else {
        seen.add(current);
      }
    }
    if (attrs === node.attrs && !childChanged) return node;
    return node.type.create(attrs, content, node.marks);
  };
  return visit(doc);
}

/**
 * Stamps a stable `_id` (UUID v4) onto every id-bearing block created without
 * one, and onto any block that ends up sharing an `_id` with another (split
 * operations duplicate attrs, so the second sibling needs a fresh id).
 */
export function stableIdPlugin(): Plugin {
  return new Plugin({
    appendTransaction(_transactions, _oldState, newState) {
      const tr = newState.tr;
      const seen = new Set<string>();
      let mutated = false;

      newState.doc.descendants((node, pos) => {
        if (!ID_BEARING_NODES.has(node.type.name)) return true;
        const current = node.attrs._id as string | null;
        if (!current || seen.has(current)) {
          const fresh = uuidV4();
          tr.setNodeMarkup(pos, undefined, { ...node.attrs, _id: fresh });
          seen.add(fresh);
          mutated = true;
        } else {
          seen.add(current);
        }
        return true;
      });

      return mutated ? tr : null;
    },
  });
}
