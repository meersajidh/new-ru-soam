import { setBlockType, toggleMark } from 'prosemirror-commands';
import { redo, undo } from 'prosemirror-history';
import { wrapInList } from 'prosemirror-schema-list';
import { findWrapping } from 'prosemirror-transform';
import type { Command, EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { MarkType, NodeType } from 'prosemirror-model';
import { ruEditSchema } from './schema';
import type { RuEditHandle } from './mount';

type CommandRunner = (view: EditorView) => boolean;

function runOnView(handle: RuEditHandle, build: (schema: typeof ruEditSchema) => Command | null): boolean {
  const cmd = build(ruEditSchema);
  if (!cmd) return false;
  const { view } = handle;
  const ok = cmd(view.state, view.dispatch.bind(view), view);
  if (ok) view.focus();
  return ok;
}

function markCommand(name: 'strong' | 'em' | 'underline' | 'code'): (handle: RuEditHandle) => boolean {
  return (handle) => runOnView(handle, (schema) => {
    const mark: MarkType | undefined = schema.marks[name];
    return mark ? toggleMark(mark) : null;
  });
}

export const toggleStrong = markCommand('strong');
export const toggleEm = markCommand('em');
export const toggleUnderline = markCommand('underline');
export const toggleCode = markCommand('code');

export function setHeading(handle: RuEditHandle, level: 1 | 2 | 3): boolean {
  return runOnView(handle, (schema) => {
    const heading: NodeType | undefined = schema.nodes.heading;
    const paragraph: NodeType | undefined = schema.nodes.paragraph;
    if (!heading || !paragraph) return null;
    return (state: EditorState, dispatch) => {
      const $from = state.selection.$from;
      const isHeading = $from.parent.type === heading && $from.parent.attrs.level === level;
      if (isHeading) return setBlockType(paragraph)(state, dispatch);
      return setBlockType(heading, { level })(state, dispatch);
    };
  });
}

/**
 * Wrap-in-list with heading auto-coerce: if the active block is a heading,
 * convert it to a paragraph in the same transaction before wrapping.
 * Reason: `list_item` content matches `paragraph block*`, so a raw
 * `wrapInList` no-ops on a heading block (O151).
 */
function wrapInListCoerced(listType: NodeType, paragraph: NodeType): Command {
  return (state, dispatch) => {
    const { $from, $to } = state.selection;
    const range = $from.blockRange($to);
    if (!range) return false;

    const isHeading = $from.parent.type.name === 'heading';
    if (!isHeading) {
      return wrapInList(listType)(state, dispatch);
    }

    // Build a single tr: set paragraph, recompute range, then wrap.
    // `setBlockType` preserves positions, so blockRange offsets stay valid.
    const tr = state.tr.setBlockType($from.before(), $from.after(), paragraph);
    const interim = state.apply(tr);
    const newRange = interim.selection.$from.blockRange(interim.selection.$to);
    if (!newRange) return false;
    const wrapping = findWrapping(newRange, listType);
    if (!wrapping) return false;
    if (dispatch) {
      tr.wrap(newRange, wrapping);
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

export function wrapInBulletList(handle: RuEditHandle): boolean {
  return runOnView(handle, (schema) => {
    const list = schema.nodes.bullet_list;
    const paragraph = schema.nodes.paragraph;
    if (!list || !paragraph) return null;
    return wrapInListCoerced(list, paragraph);
  });
}

export function wrapInOrderedList(handle: RuEditHandle): boolean {
  return runOnView(handle, (schema) => {
    const list = schema.nodes.ordered_list;
    const paragraph = schema.nodes.paragraph;
    if (!list || !paragraph) return null;
    return wrapInListCoerced(list, paragraph);
  });
}

export function runUndo(handle: RuEditHandle): boolean {
  return runOnView(handle, () => undo as Command);
}

export function runRedo(handle: RuEditHandle): boolean {
  return runOnView(handle, () => redo as Command);
}

/** Direct view runner for arbitrary PM commands, exposed for advanced consumers. */
export function runCommand(handle: RuEditHandle, cmd: Command): boolean {
  const runner: CommandRunner = (v) => cmd(v.state, v.dispatch.bind(v), v);
  return runner(handle.view);
}
