import { useEditorGroup, useService } from '../../platform/services/hooks';
import { EditorServiceId } from '../../platform/services/ids';
import PlaceholderEditor from './PlaceholderEditor';

interface Props {
  groupId: string;
  isFocused: boolean;
}

const DRAG_KEY = 'application/editor-instance';

export default function EditorGroupView({ groupId, isFocused }: Props) {
  const editor = useService(EditorServiceId);
  const group = useEditorGroup(groupId);

  if (!group) return null;

  const activeInstance = group.tabs.find(t => t.id === group.activeTabId);

  return (
    <div
      className={`editor-group${isFocused ? ' editor-group--focused' : ''}`}
      onClick={() => editor.setFocusedGroup(groupId)}
      onDragOver={e => { if (e.dataTransfer.types.includes(DRAG_KEY)) e.preventDefault(); }}
      onDrop={e => {
        const instanceId = e.dataTransfer.getData(DRAG_KEY);
        if (instanceId) { e.preventDefault(); editor.moveTab(instanceId, groupId); }
      }}
    >
      {group.tabs.length > 0 && (
        <div className="editor-tabstrip">
          {group.tabs.map(tab => (
            <div
              key={tab.id}
              className={`editor-tab${tab.id === group.activeTabId ? ' editor-tab--active' : ''}`}
              draggable
              onDragStart={e => {
                e.stopPropagation();
                e.dataTransfer.setData(DRAG_KEY, tab.id);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onClick={e => { e.stopPropagation(); editor.setActiveTab(groupId, tab.id); }}
            >
              <span className="editor-tab-title">{tab.title}</span>
              <button
                className={`editor-tab-close${tab.isDirty ? ' editor-tab-close--dirty' : ''}`}
                onClick={e => { e.stopPropagation(); editor.close(tab.id); }}
                aria-label={tab.isDirty ? 'Unsaved — close tab' : 'Close tab'}
              >
                <span className="editor-tab-close-dot" aria-hidden>●</span>
                <span className="editor-tab-close-x" aria-hidden>×</span>
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="editor-content">
        {activeInstance ? renderEditor(activeInstance.resource) : <EmptyGroup />}
      </div>
    </div>
  );
}

function renderEditor(resource: string) {
  try {
    const url = new URL(resource);
    if (url.protocol === 'placeholder:') return <PlaceholderEditor resource={resource} />;
  } catch { /* fall through */ }
  return <div className="editor-unknown">Unknown editor: {resource}</div>;
}

function EmptyGroup() {
  return (
    <div className="editor-group-empty">
      <p>No editors open</p>
    </div>
  );
}
