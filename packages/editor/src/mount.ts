import { EditorState, type Plugin } from 'prosemirror-state';
import { EditorView, type DirectEditorProps } from 'prosemirror-view';
import { Node as PMNode } from 'prosemirror-model';
import { ruEditSchema } from './schema';
import { ensureStableIds, stableIdPlugin } from './id-plugin';
import { buildRuEditKeymaps } from './keymap';
import { nodeFromJSON, nodeToJSON, RuEditSchemaError, type RuEditDoc } from './json';
import { computeActiveState, type RuEditActiveState } from './active-state';
import { createSnippetPlugin, placeholderNodeViews, type SnippetRegistry } from './snippets';

export interface MountRuEditOptions {
  initial?: RuEditDoc;
  readOnly?: boolean;
  onChange?: (doc: RuEditDoc) => void;
  /** Snippet registry for the '/' trigger and placeholder walk (Phase 8). Absent = trigger inert. */
  snippets?: SnippetRegistry;
}

export type RuEditUnsubscribe = () => void;

export interface RuEditHandle {
  getDoc(): RuEditDoc;
  setDoc(doc: RuEditDoc): void;
  focus(): void;
  dispose(): void;
  getActiveState(): RuEditActiveState;
  subscribe(listener: (state: RuEditActiveState) => void): RuEditUnsubscribe;
  readonly view: EditorView;
}

function buildPlugins(snippets?: SnippetRegistry): Plugin[] {
  const keymaps = buildRuEditKeymaps(ruEditSchema);
  if (snippets) {
    // Snippet plugin first so its handleKeyDown runs before list/base keymaps.
    return [createSnippetPlugin(snippets), stableIdPlugin(), ...keymaps];
  }
  return [stableIdPlugin(), ...keymaps];
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
    plugins: buildPlugins(opts.snippets),
  });

  const listeners = new Set<(s: RuEditActiveState) => void>();
  const notify = () => {
    if (listeners.size === 0) return;
    const snapshot = computeActiveState(view.state);
    for (const l of listeners) l(snapshot);
  };

  const dispatchTransaction: DirectEditorProps['dispatchTransaction'] = (tr) => {
    if (disposed) return;
    const next = view.state.apply(tr);
    view.updateState(next);
    if (tr.docChanged && opts.onChange) {
      opts.onChange(nodeToJSON(next.doc));
    }
    notify();
  };

  const view = new EditorView(container, {
    state,
    editable: () => editable,
    dispatchTransaction,
    nodeViews: opts.snippets ? placeholderNodeViews : {},
  });

  return {
    view,
    getDoc: () => nodeToJSON(view.state.doc),
    setDoc: (envelope) => {
      const next = ensureStableIds(nodeFromJSON(envelope, ruEditSchema));
      const newState = EditorState.create({
        schema: ruEditSchema,
        doc: next,
        plugins: buildPlugins(opts.snippets),
      });
      view.updateState(newState);
      notify();
    },
    focus: () => view.focus(),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      listeners.clear();
      view.destroy();
    },
    getActiveState: () => computeActiveState(view.state),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
