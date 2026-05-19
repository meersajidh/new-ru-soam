import { createElement } from 'react';
import {
  Lock,
  Unlock,
  CircleUser,
  Hash,
  Check,
  Bell,
  TriangleAlert,
  Dot,
  CircleAlert,
  Info,
  Cloud,
  CircleDot,
  Moon,
  Sun,
  type LucideProps,
} from 'lucide-react';
import { useStatusBarEntries, useService } from '../../platform/services/hooks';
import { CommandServiceId } from '../../platform/services/ids';
import type { StatusBarEntry } from '../../platform/statusbar/statusbar-service';
import type { WorkbenchMode } from '../hooks/useWorkbenchMode';

type LucideComponent = React.ComponentType<LucideProps>;

const ICON_MAP: Record<string, LucideComponent> = {
  lock: Lock,
  unlock: Unlock,
  'circle-user': CircleUser,
  hash: Hash,
  check: Check,
  bell: Bell,
  'triangle-alert': TriangleAlert,
  dot: Dot,
  'circle-alert': CircleAlert,
  info: Info,
  cloud: Cloud,
  'circle-dot': CircleDot,
  moon: Moon,
  sun: Sun,
};

function renderIcon(name: string | undefined): React.ReactNode {
  if (!name) return null;
  const Comp = ICON_MAP[name];
  if (!Comp) return null;
  return createElement(Comp, { size: 12 });
}

function severityClass(severity: StatusBarEntry['severity']): string {
  if (severity === 'ok') return ' is-ok';
  if (severity === 'warning') return ' is-warning';
  if (severity === 'error') return ' is-error';
  return '';
}

interface EntryNodeProps {
  entry: StatusBarEntry;
  onCommand: (cmd: string) => void;
}

function EntryNode({ entry, onCommand }: EntryNodeProps) {
  const className = `statusbar-entry${severityClass(entry.severity)}`;
  const iconNode = renderIcon(entry.icon);
  const contents = (
    <>
      {iconNode}
      {entry.text && <span>{entry.text}</span>}
      {entry.badge != null && entry.badge > 0 && (
        <span className="sb-badge">{entry.badge}</span>
      )}
    </>
  );

  if (entry.command) {
    return (
      <button
        className={className}
        title={entry.tooltip}
        onClick={() => onCommand(entry.command!)}
      >
        {contents}
      </button>
    );
  }
  return (
    <span className={className} title={entry.tooltip}>
      {contents}
    </span>
  );
}

/**
 * Insert a divider after the last entry in the high-priority bucket.
 * Left:  between priority >= 700 and next entry.
 * Right: between priority >= 800 and next entry.
 */
function withDividers(entries: StatusBarEntry[], threshold: number): Array<StatusBarEntry | 'divider'> {
  if (entries.length === 0) return [];
  const result: Array<StatusBarEntry | 'divider'> = [];
  let dividerInserted = false;
  for (let i = 0; i < entries.length; i++) {
    result.push(entries[i]);
    if (
      !dividerInserted &&
      entries[i].priority >= threshold &&
      i + 1 < entries.length &&
      entries[i + 1].priority < threshold
    ) {
      result.push('divider');
      dividerInserted = true;
    }
  }
  return result;
}

interface StatusBarProps {
  variant?: WorkbenchMode;
}

const filterByMode = (entries: StatusBarEntry[], variant: WorkbenchMode): StatusBarEntry[] =>
  variant === 'workspace' ? entries : entries.filter((e) => e.scope === 'always');

export default function StatusBar({ variant = 'workspace' }: StatusBarProps = {}) {
  const allLeft = useStatusBarEntries('left');
  const allRight = useStatusBarEntries('right');
  const commands = useService(CommandServiceId);

  const left = filterByMode(allLeft, variant);
  const right = filterByMode(allRight, variant);

  const leftItems = withDividers(left, 700);
  const rightItems = withDividers(right, 800);

  const handleCommand = (cmd: string) => void commands.execute(cmd);

  return (
    <div className="part-statusbar" role="status" aria-label="Status Bar">
      <div className="statusbar-region left">
        {leftItems.map((item, idx) =>
          item === 'divider' ? (
            <span key={`div-${idx}`} className="sb-divider" aria-hidden="true" />
          ) : (
            <EntryNode key={item.id} entry={item} onCommand={handleCommand} />
          ),
        )}
      </div>
      <div className="statusbar-region right">
        {rightItems.map((item, idx) =>
          item === 'divider' ? (
            <span key={`div-${idx}`} className="sb-divider" aria-hidden="true" />
          ) : (
            <EntryNode key={item.id} entry={item} onCommand={handleCommand} />
          ),
        )}
      </div>
    </div>
  );
}
