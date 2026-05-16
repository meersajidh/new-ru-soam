import { EditorState, type Plugin } from 'prosemirror-state';
import { EditorView, type DirectEditorProps } from 'prosemirror-view';
import { Node as PMNode } from 'prosemirror-model';
import { ruEditSchema } from './schema';
import { ensureStableIds, stableIdPlugin } from './id-plugin';
import { buildRuEditKeymaps } from './keymap';
import { nodeFromJSON, nodeToJSON, RuEditSchemaError, type RuEditDoc } from './json';

export interface MountRuEditOptions {
  initial?: RuEditDoc;
  readOnly?: boolean;
  onChange?: (doc: RuEditDoc) => void;
}

export interface RuEditHandle {
  getDoc(): RuEditDoc;
  setDoc(doc: RuEditDoc): void;
  focus(): void;
  dispose(): void;
  readonly view: EditorView;
}

function buildPlugins(): Plugin[] {
  return [stableIdPlugin(), ...buildRuEditKeymaps(ruEditSchema)];
}

function emptyDoc(): PMNode {
  return ruEditSchema.nodes.doc.create(null, ruEditSchema.nodes.paragraph.create());
}

export function mountRuEdit(container: HTMLElement, opts: MountRuEditOptions = {}): RuEditHandle {
  let initialNode: PMNode;
  if (opts.initial) {
    try {
      initialNode = nodeFromJSON(opts.initial, ruEditSchema);
    } catch (err) {
      if (err instanceof RuEditSchemaError) throw err;
      throw new RuEditSchemaError(
        `Failed to mount RuEdit with provided initial doc: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
  } else {
    initialNode = emptyDoc();
  }
  initialNode = ensureStableIds(initialNode);

  let disposed = false;
  const editable = !opts.readOnly;

  const state = EditorState.create({
    schema: ruEditSchema,
    doc: initialNode,
    plugins: buildPlugins(),
  });

  const dispatchTransaction: DirectEditorProps['dispatchTransaction'] = (tr) => {
    if (disposed) return;
    const next = view.state.apply(tr);
    view.updateState(next);
    if (tr.docChanged && opts.onChange) {
      opts.onChange(nodeToJSON(next.doc));
    }
  };

  const view = new EditorView(container, {
    state,
    editable: () => editable,
    dispatchTransaction,
  });

  return {
    view,
    getDoc: () => nodeToJSON(view.state.doc),
    setDoc: (envelope) => {
      const next = ensureStableIds(nodeFromJSON(envelope, ruEditSchema));
      const newState = EditorState.create({
        schema: ruEditSchema,
        doc: next,
        plugins: buildPlugins(),
      });
      view.updateState(newState);
    },
    focus: () => view.focus(),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      view.destroy();
    },
  };
}
