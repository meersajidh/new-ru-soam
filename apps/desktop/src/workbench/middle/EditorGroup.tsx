import './EditorGroup.css';
import { useEditorGroup, useService } from '../../platform/services/hooks';
import { EditorServiceId, MenuServiceId } from '../../platform/services/ids';
import PlaceholderEditor from './PlaceholderEditor';
import BundleViewIframe from './BundleViewIframe';
import ScratchRuEdit from './ScratchRuEdit';

interface Props {
  groupId: string;
  isFocused: boolean;
}

const DRAG_KEY = 'application/editor-instance';

export default function EditorGroupView({ groupId, isFocused }: Props) {
  const editor = useService(EditorServiceId);
  const menu = useService(MenuServiceId);
  const group = useEditorGroup(groupId);

  if (!group) return null;

  return (
    <div
      className={`editor-group${isFocused ? ' editor-group--focused' : ''}`}
      onClick={() => editor.setFocusedGroup(groupId)}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(DRAG_KEY)) e.preventDefault();
      }}
      onDrop={(e) => {
        const instanceId = e.dataTransfer.getData(DRAG_KEY);
        if (instanceId) {
          e.preventDefault();
          editor.moveTab(instanceId, groupId);
        }
      }}
    >
      {group.tabs.length > 0 && (
        <div className="editor-tabstrip">
          {group.tabs.map((tab) => (
            <div
              key={tab.id}
              className={`editor-tab${tab.id === group.activeTabId ? ' editor-tab--active' : ''}${tab.isPreview ? ' editor-tab--preview' : ''}`}
              draggable
              onDragStart={(e) => {
                e.stopPropagation();
                e.dataTransfer.setData(DRAG_KEY, tab.id);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onClick={(e) => {
                e.stopPropagation();
                editor.setActiveTab(groupId, tab.id);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                // args: [instanceId, groupId] — close reads [0], closeOthers/closeAll read [0,1]
                menu.showContextMenu({
                  menuId: 'editor/title/context',
                  anchor: { x: e.clientX, y: e.clientY },
                  ctx: {
                    args: [tab.id, groupId],
                    contextOverrides: { 'editor.tabId': tab.id },
                  },
                });
              }}
            >
              <span className="editor-tab-title">{tab.title}</span>
              {tab.description && (
                <span className="editor-tab-description">{tab.description}</span>
              )}
              <button
                className={`editor-tab-close${tab.isDirty ? ' editor-tab-close--dirty' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  editor.close(tab.id);
                }}
                aria-label={tab.isDirty ? 'Unsaved — close tab' : 'Close tab'}
              >
                <span className="editor-tab-close-dot" aria-hidden>
                  ●
                </span>
                <span className="editor-tab-close-x" aria-hidden>
                  ×
                </span>
              </button>
            </div>
          ))}
        </div>
      )}
      {/* Keep-alive: all tabs mounted simultaneously so per-editor state
          (scroll position, overview density) survives tab switches.
          Only the active tab's container is visible; others hidden via display:none. */}
      <div className="editor-content">
        {group.tabs.length === 0 ? (
          <EmptyGroup />
        ) : (
          group.tabs.map((tab) => (
            <div
              key={tab.id}
              className={`editor-tab-pane${tab.id === group.activeTabId ? '' : ' editor-tab-pane--hidden'}`}
            >
              {renderEditor(tab.resource, tab.id, tab.entityId)}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function renderEditor(resource: string, instanceId: string, entityId?: string | null) {
  try {
    const url = new URL(resource);
    if (url.protocol === 'placeholder:') return <PlaceholderEditor resource={resource} />;
    if (url.protocol === 'view:') {
      return (
        <BundleViewIframe
          key={instanceId}
          resource={resource}
          instanceId={instanceId}
          entityId={entityId}
        />
      );
    }
    if (url.protocol === 'ru-edit-scratch:') {
      return <ScratchRuEdit key={instanceId} resource={resource} instanceId={instanceId} />;
    }
  } catch {
    /* fall through */
  }
  return <div className="editor-unknown">Unknown editor: {resource}</div>;
}

function EmptyGroup() {
  return (
    <div className="editor-group-empty">
      {/* <div className="editor-empty">
        <div className="editor-empty-mark" aria-hidden="true" />
        <h2 className="editor-empty-title">No editor open.</h2>
        <p className="editor-empty-line">
          Open a file from the sidebar, or press{' '}
          <span className="editor-empty-key">Ctrl+P</span> for quick open.
        </p>
      </div> */}
    </div>
  );
}
