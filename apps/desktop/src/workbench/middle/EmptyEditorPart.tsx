// Named placeholder per ADR-401 "shell is never blank".
// Phase 5 replaces with real editor area; Phase 11 with onboarding/unlock surface.
export default function EmptyEditorPart() {
  return (
    <div className="part-empty-editor">
      <p className="empty-editor-hint">Open a workspace to get started</p>
    </div>
  );
}
