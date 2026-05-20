import './EmptyEditorPart.css';
// Named placeholder per ADR-401 "shell is never blank".
// Phase 5 replaces with real editor area; Phase 11 with onboarding/unlock surface.
export default function EmptyEditorPart() {
  return (
    <div className="part-empty-editor">
      <div className="editor-empty">
        <div className="editor-empty-mark" aria-hidden="true" />
        <h2 className="editor-empty-title">Open a workspace to begin.</h2>
        <p className="editor-empty-line">
          Press <span className="editor-empty-key">Ctrl+Shift+P</span> for the command palette, or
          pick a workspace from the sidebar.
        </p>
      </div>
    </div>
  );
}
