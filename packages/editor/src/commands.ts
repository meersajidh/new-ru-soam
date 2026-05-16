import { setBlockType, toggleMark } from 'prosemirror-commands';
import { redo, undo } from 'prosemirror-history';
import { wrapInList } from 'prosemirror-schema-list';
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

export function wrapInBulletList(handle: RuEditHandle): boolean {
  return runOnView(handle, (schema) => {
    const list = schema.nodes.bullet_list;
    return list ? (wrapInList(list) as Command) : null;
  });
}

export function wrapInOrderedList(handle: RuEditHandle): boolean {
  return runOnView(handle, (schema) => {
    const list = schema.nodes.ordered_list;
    return list ? (wrapInList(list) as Command) : null;
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
