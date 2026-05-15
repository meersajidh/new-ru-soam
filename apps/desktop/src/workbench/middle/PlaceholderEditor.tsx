interface Props { resource: string }

export default function PlaceholderEditor({ resource }: Props) {
  return (
    <div className="editor-placeholder">
      <p className="editor-placeholder-label">{resource}</p>
    </div>
  );
}
