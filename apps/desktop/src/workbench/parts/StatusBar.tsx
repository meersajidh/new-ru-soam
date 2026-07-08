import './StatusBar.css';
import { Icon, Badge } from '@basebench/ui';
import { useStatusBarEntries, useService } from '../../platform/services/hooks';
import { CommandServiceId } from '../../platform/services/ids';
import type { StatusBarEntry } from '../../platform/statusbar/statusbar-service';
import type { WorkbenchMode } from '../hooks/useWorkbenchMode';
import WorkspaceSwitcher from './WorkspaceSwitcher';

// StatusBar icon key → semantic icon id mapping.
// Keys are the string ids contributed by platform-commands (StatusBarEntry.icon).
// Remap where the StatusBar's contributed key differs from the registry semantic id.
const STATUS_ICON_REMAP: Record<string, string> = {
  'triangle-alert': 'warning',
  'circle-alert': 'error',
  moon: 'theme-dark',
  sun: 'theme-light',
  download: 'cloud-download',
};

function renderIcon(entry: StatusBarEntry): React.ReactNode {
  const { icon: name, iconSize = 13 } = entry;
  if (!name) return null;
  // Remap StatusBar-specific key names to registry semantic ids; fall through 1:1 if not remapped.
  const semanticId = STATUS_ICON_REMAP[name] ?? name;
  return <Icon name={semanticId} size={iconSize} />;
}

function severityClass(severity: StatusBarEntry['severity']): string {
  if (severity === 'ok') return ' statusbar-entry--ok';
  if (severity === 'warning') return ' statusbar-entry--warning';
  if (severity === 'error') return ' statusbar-entry--error';
  return '';
}

interface EntryNodeProps {
  entry: StatusBarEntry;
  onCommand: (cmd: string) => void;
}

function EntryNode({ entry, onCommand }: EntryNodeProps) {
  const className = `statusbar-entry${entry.text ? '' : ' statusbar-entry--icon-only'}${severityClass(entry.severity)}`;
  const iconNode = renderIcon(entry);
  const contents = (
    <>
      {iconNode}
      {entry.text && <span>{entry.text}</span>}
      {entry.badge != null && entry.badge > 0 && (
        <Badge size="xs" className={`min-w-[14px] font-mono font-semibold${entry.text ? '' : ' ml-1'}`}>
          {entry.badge}
        </Badge>
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
          ) : item.id === 'workbench.workspace.nickname' ? (
            <WorkspaceSwitcher key={item.id} entry={item} />
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
