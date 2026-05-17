import { NodeSelection, type EditorState } from 'prosemirror-state';
import type { MarkType, ResolvedPos } from 'prosemirror-model';
import { redoDepth, undoDepth } from 'prosemirror-history';
import { snippetPluginKey } from './snippets';

export type RuEditBlockKind = 'paragraph' | 'heading' | 'blockquote' | 'other';

export type RuEditPlaceholderType = 'text' | 'picklist' | null;

export interface RuEditMarkActiveMap {
  readonly strong: boolean;
  readonly em: boolean;
  readonly underline: boolean;
  readonly code: boolean;
}

export interface RuEditSnippetState {
  readonly active: boolean;
  readonly placeholderType: RuEditPlaceholderType;
}

export interface RuEditActiveState {
  readonly marks: RuEditMarkActiveMap;
  readonly block: RuEditBlockKind;
  readonly headingLevel: 1 | 2 | 3 | null;
  readonly inBulletList: boolean;
  readonly inOrderedList: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly snippet: RuEditSnippetState;
}

function markActive(state: EditorState, type: MarkType): boolean {
  const { from, $from, to, empty } = state.selection;
  if (empty) {
    return !!type.isInSet(state.storedMarks ?? $from.marks());
  }
  return state.doc.rangeHasMark(from, to, type);
}

function hasAncestor($from: ResolvedPos, typeName: string): boolean {
  for (let d = $from.depth; d > 0; d -= 1) {
    if ($from.node(d).type.name === typeName) return true;
  }
  return false;
}

export function computeActiveState(state: EditorState): RuEditActiveState {
  const { schema, selection } = state;
  const { $from } = selection;
  const parentName = $from.parent.type.name;

  let block: RuEditBlockKind = 'other';
  let headingLevel: 1 | 2 | 3 | null = null;
  if (parentName === 'paragraph') {
    block = 'paragraph';
  } else if (parentName === 'heading') {
    block = 'heading';
    const lvl = $from.parent.attrs.level as number;
    if (lvl === 1 || lvl === 2 || lvl === 3) headingLevel = lvl;
  } else if (parentName === 'blockquote') {
    block = 'blockquote';
  }

  const strong = schema.marks.strong;
  const em = schema.marks.em;
  const underline = schema.marks.underline;
  const code = schema.marks.code;

  const snippetPluginState = snippetPluginKey.getState(state);
  const snippetActive = snippetPluginState?.expansion === true;
  let placeholderType: RuEditPlaceholderType = null;
  if (snippetActive && state.selection instanceof NodeSelection) {
    const node = state.selection.node;
    if (node.type.name === 'placeholder') {
      const t = node.attrs.type;
      if (t === 'text' || t === 'picklist') placeholderType = t;
    }
  }

  return {
    marks: {
      strong: strong ? markActive(state, strong) : false,
      em: em ? markActive(state, em) : false,
      underline: underline ? markActive(state, underline) : false,
      code: code ? markActive(state, code) : false,
    },
    block,
    headingLevel,
    inBulletList: hasAncestor($from, 'bullet_list'),
    inOrderedList: hasAncestor($from, 'ordered_list'),
    canUndo: undoDepth(state) > 0,
    canRedo: redoDepth(state) > 0,
    snippet: { active: snippetActive, placeholderType },
  };
}
