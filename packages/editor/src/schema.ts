import { Schema, type NodeSpec, type MarkSpec } from 'prosemirror-model';
import { addListNodes } from 'prosemirror-schema-list';
import OrderedMap from 'orderedmap';

const idAttr = { _id: { default: null as string | null } };

const nodes: Record<string, NodeSpec> = {
  doc: { content: 'block+' },

  paragraph: {
    attrs: idAttr,
    content: 'inline*',
    group: 'block',
    parseDOM: [{ tag: 'p', getAttrs: (dom) => ({ _id: readId(dom) }) }],
    toDOM: (node) => ['p', idDomAttrs(node.attrs._id), 0],
  },

  heading: {
    attrs: { ...idAttr, level: { default: 1 } },
    content: 'inline*',
    group: 'block',
    defining: true,
    parseDOM: [
      { tag: 'h1', getAttrs: (dom) => ({ level: 1, _id: readId(dom) }) },
      { tag: 'h2', getAttrs: (dom) => ({ level: 2, _id: readId(dom) }) },
      { tag: 'h3', getAttrs: (dom) => ({ level: 3, _id: readId(dom) }) },
    ],
    toDOM: (node) => [`h${node.attrs.level}`, idDomAttrs(node.attrs._id), 0],
  },

  blockquote: {
    attrs: idAttr,
    content: 'block+',
    group: 'block',
    defining: true,
    parseDOM: [{ tag: 'blockquote', getAttrs: (dom) => ({ _id: readId(dom) }) }],
    toDOM: (node) => ['blockquote', idDomAttrs(node.attrs._id), 0],
  },

  horizontal_rule: {
    attrs: idAttr,
    group: 'block',
    parseDOM: [{ tag: 'hr', getAttrs: (dom) => ({ _id: readId(dom) }) }],
    toDOM: (node) => ['hr', idDomAttrs(node.attrs._id)],
  },

  text: { group: 'inline' },

  hard_break: {
    inline: true,
    group: 'inline',
    selectable: false,
    parseDOM: [{ tag: 'br' }],
    toDOM: () => ['br'],
  },

  // Schema v2: snippet expansion placeholder (atomic inline node).
  // Rendered as a chip; replaced by text/picklist selection on finalize.
  placeholder: {
    inline: true,
    group: 'inline',
    atom: true,
    attrs: {
      name: {},
      type: { default: 'text' as 'text' | 'picklist' },
      default: { default: null as string | null },
      options: { default: null as string[] | null },
      value: { default: null as string | null },
    },
    parseDOM: [{
      tag: 'span[data-snippet-ph]',
      getAttrs: (dom) => {
        if (typeof dom === 'string') return false;
        return {
          name: dom.getAttribute('data-snippet-ph'),
          type: dom.getAttribute('data-ph-type') ?? 'text',
          default: dom.getAttribute('data-ph-default') ?? null,
          options: null,
          value: null,
        };
      },
    }],
    toDOM: (node) => ['span', {
      'data-snippet-ph': String(node.attrs.name),
      'data-ph-type': String(node.attrs.type),
      ...(node.attrs.default ? { 'data-ph-default': String(node.attrs.default) } : {}),
      class: `ru-snippet-placeholder ru-snippet-placeholder--${String(node.attrs.type)}`,
    }],
  },
};

// addListNodes injects ordered_list, bullet_list, list_item per schema-list defaults.
const baseNodes = OrderedMap.from(nodes);
const withLists = addListNodes(baseNodes, 'paragraph block*', 'block');

// Patch the list nodes to also carry a stable _id attr.
const patchedLists = withLists
  .update('ordered_list', addIdAttr(withLists.get('ordered_list')!))
  .update('bullet_list', addIdAttr(withLists.get('bullet_list')!))
  .update('list_item', addIdAttr(withLists.get('list_item')!));

const marks: Record<string, MarkSpec> = {
  strong: {
    parseDOM: [
      { tag: 'strong' },
      { tag: 'b', getAttrs: (node) => (node.style.fontWeight !== 'normal') && null },
      { style: 'font-weight', getAttrs: (value) => /^(bold(er)?|[5-9]\d{2,})$/.test(value) && null },
    ],
    toDOM: () => ['strong', 0],
  },
  em: {
    parseDOM: [{ tag: 'em' }, { tag: 'i' }, { style: 'font-style=italic' }],
    toDOM: () => ['em', 0],
  },
  underline: {
    parseDOM: [{ tag: 'u' }, { style: 'text-decoration=underline' }],
    toDOM: () => ['u', 0],
  },
  code: {
    parseDOM: [{ tag: 'code' }],
    toDOM: () => ['code', 0],
  },
};

export const ruEditSchema = new Schema({ nodes: patchedLists, marks });

export const ID_BEARING_NODES: ReadonlySet<string> = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'horizontal_rule',
  'ordered_list',
  'bullet_list',
  'list_item',
]);

function readId(dom: HTMLElement | string): string | null {
  if (typeof dom === 'string') return null;
  const id = dom.getAttribute('data-soam-id');
  return id && id.length > 0 ? id : null;
}

function idDomAttrs(id: string | null): Record<string, string> {
  return id ? { 'data-soam-id': id } : {};
}

function addIdAttr(spec: NodeSpec): NodeSpec {
  return {
    ...spec,
    attrs: { ...(spec.attrs ?? {}), ...idAttr },
    parseDOM: (spec.parseDOM ?? []).map((rule) => {
      const original = rule.getAttrs;
      return {
        ...rule,
        getAttrs: (node: HTMLElement | string) => {
          const base = original ? original(node as never) : null;
          if (base === false) return false;
          const id = readId(node);
          return { ...(base ?? {}), _id: id };
        },
      };
    }),
    toDOM: spec.toDOM
      ? (node) => {
          const raw = spec.toDOM!(node) as unknown as readonly unknown[];
          const out = raw.slice() as unknown[];
          const tag = out[0];
          const second = out[1];
          if (second && typeof second === 'object' && !Array.isArray(second)) {
            return [tag, { ...(second as Record<string, string>), ...idDomAttrs(node.attrs._id) }, ...out.slice(2)] as ReturnType<NonNullable<NodeSpec['toDOM']>>;
          }
          return [tag, idDomAttrs(node.attrs._id), ...out.slice(1)] as ReturnType<NonNullable<NodeSpec['toDOM']>>;
        }
      : undefined,
  };
}
