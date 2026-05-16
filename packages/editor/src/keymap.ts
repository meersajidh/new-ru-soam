import { keymap } from 'prosemirror-keymap';
import { baseKeymap, chainCommands, exitCode, setBlockType, toggleMark } from 'prosemirror-commands';
import { history, redo, undo } from 'prosemirror-history';
import { liftListItem, sinkListItem, splitListItem } from 'prosemirror-schema-list';
import { inputRules, textblockTypeInputRule, wrappingInputRule } from 'prosemirror-inputrules';
import type { MarkType, NodeType, Schema } from 'prosemirror-model';
import type { Command, EditorState, Transaction } from 'prosemirror-state';

function toggleHeading(nodeType: NodeType, paragraph: NodeType, level: number): Command {
  return (state, dispatch) => {
    const { $from } = state.selection;
    const active = state.selection.empty
      ? $from.parent.type === nodeType && $from.parent.attrs.level === level
      : false;
    if (active) {
      return setBlockType(paragraph)(state, dispatch);
    }
    return setBlockType(nodeType, { level })(state, dispatch);
  };
}

function insertHardBreak(schema: Schema): Command {
  const br = schema.nodes.hard_break;
  return chainCommands(exitCode, (state, dispatch) => {
    if (dispatch) {
      dispatch(state.tr.replaceSelectionWith(br.create()).scrollIntoView());
    }
    return true;
  });
}

function buildInputRules(schema: Schema) {
  const rules = [];
  if (schema.nodes.heading) {
    rules.push(
      textblockTypeInputRule(/^(#{1,3})\s$/, schema.nodes.heading, (match) => ({
        level: match[1].length,
      })),
    );
  }
  if (schema.nodes.bullet_list) {
    rules.push(wrappingInputRule(/^\s*([-*])\s$/, schema.nodes.bullet_list));
  }
  if (schema.nodes.ordered_list) {
    rules.push(
      wrappingInputRule(
        /^(\d+)\.\s$/,
        schema.nodes.ordered_list,
        (match) => ({ order: Number(match[1]) }),
        (match, node) => node.childCount + (node.attrs.order as number) === Number(match[1]),
      ),
    );
  }
  return inputRules({ rules });
}

export function buildRuEditKeymaps(schema: Schema) {
  const { strong, em, underline, code } = schema.marks;
  const heading = schema.nodes.heading;
  const paragraph = schema.nodes.paragraph;
  const listItem = schema.nodes.list_item;

  const bindings: Record<string, Command> = {
    'Mod-z': undo,
    'Mod-Shift-z': redo,
    'Mod-y': redo,
    'Mod-b': toggleMarkSafe(strong),
    'Mod-i': toggleMarkSafe(em),
    'Mod-u': toggleMarkSafe(underline),
    'Mod-`': toggleMarkSafe(code),
    'Shift-Enter': insertHardBreak(schema),
  };

  if (heading && paragraph) {
    bindings['Mod-1'] = toggleHeading(heading, paragraph, 1);
    bindings['Mod-2'] = toggleHeading(heading, paragraph, 2);
    bindings['Mod-3'] = toggleHeading(heading, paragraph, 3);
  }
  if (listItem) {
    bindings['Tab'] = sinkListItem(listItem);
    bindings['Shift-Tab'] = liftListItem(listItem);
    bindings['Enter'] = chainCommands(splitListItem(listItem), baseKeymap['Enter'] as Command);
  }

  return [history(), keymap(bindings), keymap(baseKeymap), buildInputRules(schema)];
}

function toggleMarkSafe(mark: MarkType | undefined): Command {
  return (state: EditorState, dispatch?: (tr: Transaction) => void) => {
    if (!mark) return false;
    return toggleMark(mark)(state, dispatch);
  };
}
