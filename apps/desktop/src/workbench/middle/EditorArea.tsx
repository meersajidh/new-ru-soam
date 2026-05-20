import './EditorArea.css';
import type { ReactNode } from 'react';
import { useEditorState } from '../../platform/services/hooks';
import type { EditorLayoutNode } from '../../platform/editor/editor-service';
import EditorGroupView from './EditorGroup';

function renderNode(node: EditorLayoutNode, focusedGroupId: string | null): ReactNode {
  if (node.kind === 'group') {
    return (
      <EditorGroupView
        key={node.groupId}
        groupId={node.groupId}
        isFocused={node.groupId === focusedGroupId}
      />
    );
  }
  return (
    <div key={`${node.direction}-${node.ratio}`} className={`editor-split editor-split--${node.direction}`}>
      <div className="editor-split-child" style={{ flex: node.ratio }}>
        {renderNode(node.first, focusedGroupId)}
      </div>
      <div className="editor-split-divider" />
      <div className="editor-split-child" style={{ flex: 1 - node.ratio }}>
        {renderNode(node.second, focusedGroupId)}
      </div>
    </div>
  );
}

export default function EditorArea() {
  const { layout, focusedGroupId } = useEditorState();
  return (
    <div className="part-editor-area">
      {renderNode(layout, focusedGroupId)}
    </div>
  );
}
