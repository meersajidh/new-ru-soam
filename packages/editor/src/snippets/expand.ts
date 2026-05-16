import { Fragment, Node as PMNode, type Schema } from 'prosemirror-model';
import { NodeSelection, TextSelection, type PluginKey } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { SnippetDef } from './registry';
import type { SnippetPluginState } from './trigger-plugin';

export function findNextPlaceholder(doc: PMNode, from: number): number | null {
  let result: number | null = null;
  doc.descendants((node, pos) => {
    if (result !== null) return false;
    if (node.type.name === 'placeholder' && pos > from) {
      result = pos;
      return false;
    }
    return undefined;
  });
  return result;
}

export function findPrevPlaceholder(doc: PMNode, from: number): number | null {
  let result: number | null = null;
  doc.descendants((node, pos) => {
    if (node.type.name === 'placeholder' && pos < from) {
      result = pos;
    }
  });
  return result;
}

export function countPlaceholders(doc: PMNode): number {
  let count = 0;
  doc.descendants((node) => { if (node.type.name === 'placeholder') count++; });
  return count;
}

// Advance (direction=1) or retreat (direction=-1) through placeholder nodes.
// Finalizes the currently selected placeholder with its default before moving.
export function walkPlaceholder(view: EditorView, direction: 1 | -1): boolean {
  const { state } = view;
  const { schema, selection } = state;
  const phType = schema.nodes.placeholder;
  if (!phType) return false;

  let tr = state.tr;
  let fromPos = selection.from;

  // If current selection is on a placeholder node, finalize it (replace with default or delete).
  if (selection instanceof NodeSelection && selection.node.type === phType) {
    const pos = selection.from;
    const node = selection.node;
    const val = typeof node.attrs.default === 'string' && node.attrs.default ? node.attrs.default : null;
    tr = val
      ? tr.replaceWith(pos, pos + node.nodeSize, schema.text(val))
      : tr.delete(pos, pos + node.nodeSize);
    fromPos = tr.mapping.map(pos);
  }

  const target =
    direction > 0
      ? findNextPlaceholder(tr.doc, fromPos)
      : findPrevPlaceholder(tr.doc, fromPos);

  if (target === null) {
    // No next placeholder — finalize current (already in tr) and leave cursor there.
    const endPos = Math.min(fromPos, tr.doc.content.size);
    tr = tr.setSelection(TextSelection.near(tr.doc.resolve(endPos)));
    view.dispatch(tr);
    return false; // expansion deactivates via placeholder count dropping to 0
  }

  tr = tr.setSelection(NodeSelection.create(tr.doc, target));
  view.dispatch(tr);
  return true;
}

function buildFragment(def: SnippetDef, schema: Schema): Fragment {
  const { body } = def;
  if (body.kind !== 'text') return Fragment.empty;

  const phMap = new Map(def.placeholders.map(p => [p.name, p]));
  const parts = body.template.split(/\{\{(\w+)\}\}/);
  const nodes: PMNode[] = [];

  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      if (parts[i]) nodes.push(schema.text(parts[i]));
    } else {
      const ph = phMap.get(parts[i]);
      if (ph) {
        nodes.push(schema.nodes.placeholder.create({
          name: ph.name,
          type: ph.type,
          default: ph.default ?? null,
          options: ph.type === 'picklist' ? (ph.options ?? []) : null,
          value: null,
        }));
      } else {
        nodes.push(schema.text(`{{${parts[i]}}}`));
      }
    }
  }

  return Fragment.fromArray(nodes);
}

export function expandSnippet(
  view: EditorView,
  def: SnippetDef,
  triggerFrom: number,
  pluginKey: PluginKey<SnippetPluginState>,
): void {
  const { state } = view;
  const { schema } = state;
  const triggerTo = state.selection.from;
  const content = buildFragment(def, schema);

  let tr = state.tr;
  tr = tr.replaceWith(triggerFrom, triggerTo, content);

  const phCount = countPlaceholders(tr.doc);
  const insertedFrom = tr.mapping.map(triggerFrom);
  const firstPh = findNextPlaceholder(tr.doc, insertedFrom - 1);

  if (firstPh !== null) {
    tr = tr.setSelection(NodeSelection.create(tr.doc, firstPh));
  } else {
    const endPos = Math.min(insertedFrom + content.size, tr.doc.content.size);
    tr = tr.setSelection(TextSelection.near(tr.doc.resolve(endPos)));
  }

  tr = tr.setMeta(pluginKey, {
    clearTrigger: true,
    setExpansion: phCount > 0 ? { totalCount: phCount } : null,
  });

  view.dispatch(tr);
}
