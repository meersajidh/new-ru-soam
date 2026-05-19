import { Plugin, PluginKey, TextSelection } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { undo } from 'prosemirror-history';
import type { SnippetRegistry, SnippetDef } from './registry';
import { expandSnippet, walkPlaceholder, countPlaceholders } from './expand';

interface TriggerState {
  from: number;   // doc position of the '/' character
  query: string;  // text typed after '/'
  selectedIdx: number;
}

export interface SnippetPluginState {
  trigger: TriggerState | null;
  // expansion: true while placeholder nodes remain from the last expansion.
  // Enables Esc→undo. Cleared when placeholder count drops to zero.
  expansion: boolean;
}

interface PluginMeta {
  clearTrigger?: boolean;
  setExpansion?: { totalCount: number } | null;
  setTrigger?: TriggerState;
}

export const snippetPluginKey = new PluginKey<SnippetPluginState>('snippet');

export function createSnippetPlugin(registry: SnippetRegistry): Plugin<SnippetPluginState> {
  return new Plugin<SnippetPluginState>({
    key: snippetPluginKey,

    state: {
      init: () => ({ trigger: null, expansion: false }),

      apply(tr, prev, _old, newState) {
        const meta = tr.getMeta(snippetPluginKey) as PluginMeta | undefined;

        // Handle explicit meta signals from expandSnippet / keydown handlers.
        if (meta) {
          let next = { ...prev };
          if (meta.clearTrigger) next = { ...next, trigger: null };
          if ('setExpansion' in meta) next = { ...next, expansion: meta.setExpansion !== null };
          if (meta.setTrigger !== undefined) next = { ...next, trigger: meta.setTrigger };

          // If expansion just cleared, also check live placeholder count.
          if (next.expansion) {
            const remaining = countPlaceholders(newState.doc);
            if (remaining === 0) next = { ...next, expansion: false };
          }
          return next;
        }

        // If in expansion mode, check if placeholders have all been finalized.
        if (prev.expansion) {
          const remaining = countPlaceholders(newState.doc);
          const expansion = remaining > 0;
          if (expansion !== prev.expansion) return { ...prev, expansion };
        }

        // Re-derive trigger state from document + selection.
        if (!tr.docChanged && !tr.selectionSet) return prev;

        const { selection } = newState;
        if (!(selection instanceof TextSelection) || !selection.$cursor) {
          return { ...prev, trigger: null };
        }

        const $cursor = selection.$cursor;
        const cursorPos = $cursor.pos;
        const parentStart = $cursor.start();

        // Scan backwards in the current text block for a '/' trigger.
        const textBefore = newState.doc.textBetween(parentStart, cursorPos);
        const slashIdx = textBefore.lastIndexOf('/');
        if (slashIdx === -1) return { ...prev, trigger: null };

        const query = textBefore.slice(slashIdx + 1);
        // Abort if query contains whitespace (user has moved past the trigger context).
        if (/\s/.test(query)) return { ...prev, trigger: null };

        const from = parentStart + slashIdx;
        const candidates = registry.matches(query);

        // Keep popup open while there are matches; close if query has no matches
        // and is non-trivially long (avoid closing on empty '/' before any typing).
        if (candidates.length === 0 && query.length > 2) return { ...prev, trigger: null };

        const prevSelectedIdx = prev.trigger?.query === query ? prev.trigger.selectedIdx : 0;
        const selectedIdx = Math.max(0, Math.min(prevSelectedIdx, candidates.length - 1));

        return { ...prev, trigger: { from, query, selectedIdx } };
      },
    },

    props: {
      handleKeyDown(view, event) {
        const pluginState = snippetPluginKey.getState(view.state);
        if (!pluginState) return false;

        // ── Trigger mode ──────────────────────────────────────────────────────
        if (pluginState.trigger !== null) {
          const candidates = registry.matches(pluginState.trigger.query);

          if (event.key === 'Tab' || event.key === 'Enter') {
            if (candidates.length > 0) {
              event.preventDefault();
              const def: SnippetDef = candidates[pluginState.trigger.selectedIdx] ?? candidates[0];
              expandSnippet(view, def, pluginState.trigger.from, snippetPluginKey);
              return true;
            }
            // No matches → fall through to normal Tab/Enter behaviour.
            return false;
          }

          if (event.key === 'Escape') {
            event.preventDefault();
            view.dispatch(view.state.tr.setMeta(snippetPluginKey, { clearTrigger: true } as PluginMeta));
            return true;
          }

          if (event.key === 'ArrowDown' && candidates.length > 0) {
            event.preventDefault();
            const nextIdx = Math.min(pluginState.trigger.selectedIdx + 1, candidates.length - 1);
            view.dispatch(view.state.tr.setMeta(snippetPluginKey, {
              setTrigger: { ...pluginState.trigger, selectedIdx: nextIdx },
            } as PluginMeta));
            return true;
          }

          if (event.key === 'ArrowUp' && candidates.length > 0) {
            event.preventDefault();
            const prevIdx = Math.max(pluginState.trigger.selectedIdx - 1, 0);
            view.dispatch(view.state.tr.setMeta(snippetPluginKey, {
              setTrigger: { ...pluginState.trigger, selectedIdx: prevIdx },
            } as PluginMeta));
            return true;
          }
        }

        // ── Expansion (placeholder walk) mode ─────────────────────────────────
        if (pluginState.expansion) {
          if (event.key === 'Tab') {
            event.preventDefault();
            const walked = walkPlaceholder(view, event.shiftKey ? -1 : 1);
            // If no placeholder found in the direction, fall through (deactivate via count).
            return walked;
          }

          if (event.key === 'Escape') {
            event.preventDefault();
            undo(view.state, view.dispatch);
            return true;
          }
        }

        return false;
      },

      decorations(state) {
        const pluginState = snippetPluginKey.getState(state);
        if (!pluginState?.trigger) return DecorationSet.empty;

        const { trigger } = pluginState;
        const candidates = registry.matches(trigger.query);
        if (candidates.length === 0) return DecorationSet.empty;

        const cursorPos = state.selection.from;
        const decos: Decoration[] = [
          // Highlight the trigger text.
          Decoration.inline(trigger.from, cursorPos, { class: 'ru-snippet-trigger' }),
        ];
        return DecorationSet.create(state.doc, decos);
      },
    },

    // Floating popup: mounted once into document.body and positioned on each update.
    view(editorView) {
      const popup = document.createElement('div');
      popup.className = 'ru-snippet-popup';
      popup.style.display = 'none';
      document.body.appendChild(popup);

      function render() {
        const pluginState = snippetPluginKey.getState(editorView.state);
        if (!pluginState?.trigger) {
          popup.style.display = 'none';
          return;
        }

        const candidates = registry.matches(pluginState.trigger.query);
        if (candidates.length === 0) {
          popup.style.display = 'none';
          return;
        }

        // Position the popup below the cursor.
        const cursorPos = editorView.state.selection.from;
        let coords: { top: number; bottom: number; left: number };
        try {
          coords = editorView.coordsAtPos(cursorPos);
        } catch {
          popup.style.display = 'none';
          return;
        }

        popup.style.display = 'block';
        popup.style.top = `${coords.bottom + 4}px`;
        popup.style.left = `${coords.left}px`;

        // Re-render items.
        popup.textContent = '';
        const selectedIdx = pluginState.trigger.selectedIdx;

        for (let i = 0; i < candidates.length; i++) {
          const m = candidates[i];
          const item = document.createElement('div');
          item.className = 'ru-snippet-popup-item' + (i === selectedIdx ? ' ru-snippet-popup-item--selected' : '');

          const abbrevEl = document.createElement('span');
          abbrevEl.className = 'ru-snippet-popup-abbrev';
          abbrevEl.textContent = `/${m.abbrev}`;

          const labelEl = document.createElement('span');
          labelEl.className = 'ru-snippet-popup-label';
          labelEl.textContent = m.label;

          item.appendChild(abbrevEl);
          item.appendChild(labelEl);

          // mousedown (not click) so blur doesn't fire before we capture the intent.
          item.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const state = snippetPluginKey.getState(editorView.state);
            if (state?.trigger) {
              expandSnippet(editorView, m, state.trigger.from, snippetPluginKey);
            }
          });

          popup.appendChild(item);
        }
      }

      return {
        update: render,
        destroy() {
          popup.remove();
        },
      };
    },
  });
}
