import { useStatusBarEntries } from '../../platform/services/hooks';

export default function StatusBar() {
  const left = useStatusBarEntries('left');
  const right = useStatusBarEntries('right');

  return (
    <div className="part-statusbar" role="status" aria-label="Status Bar">
      <div className="statusbar-region statusbar-left">
        {left.map(entry => (
          <span key={entry.id} className="statusbar-entry" title={entry.tooltip}>
            {entry.text}
          </span>
        ))}
      </div>
      <div className="statusbar-region statusbar-right">
        {right.map(entry => (
          <span key={entry.id} className="statusbar-entry" title={entry.tooltip}>
            {entry.text}
          </span>
        ))}
      </div>
    </div>
  );
}
