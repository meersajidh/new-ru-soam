import './ActivityBar.css';
import { createElement, useState, useEffect } from 'react';
import {
  Users,
  Calendar,
  ClipboardList,
  BookOpen,
  CheckSquare,
  LayoutGrid,
  FileText,
  Activity,
  Stethoscope,
  BarChart2,
  Folder,
  Home,
  type LucideProps,
} from 'lucide-react';
import SettingsMenu from './SettingsMenu';
import UserAvatar from './UserAvatar';
import { useActivityBarItems, useActiveViewContainerId, useService } from '../../platform/services/hooks';
import { ContributionServiceId, ContextKeyServiceId, LayoutServiceId } from '../../platform/services/ids';
import { SlotId } from '../../platform/layout/slots';
import type { ActivityBarItem } from '../../platform/contributions/contribution-service';

type LucideComponent = React.ComponentType<LucideProps>;

const ICON_MAP: Record<string, LucideComponent> = {
  users: Users,
  calendar: Calendar,
  'clipboard-list': ClipboardList,
  'book-open': BookOpen,
  'check-square': CheckSquare,
  'layout-grid': LayoutGrid,
  'file-text': FileText,
  activity: Activity,
  stethoscope: Stethoscope,
  'bar-chart-2': BarChart2,
  folder: Folder,
  home: Home,
};

const FALLBACK_ICON: LucideComponent = Folder;

function resolveIcon(name: string | undefined): LucideComponent {
  if (!name) return FALLBACK_ICON;
  return ICON_MAP[name] ?? FALLBACK_ICON;
}

/** Bumps a counter on every ContextKeyService change — triggers re-evaluation of when-clauses. */
function useContextKeyVersion(): number {
  const ctxSvc = useService(ContextKeyServiceId);
  const [version, setVersion] = useState(0);
  useEffect(
    () => ctxSvc.onDidChange(() => setVersion((v) => v + 1)),
    [ctxSvc],
  );
  return version;
}

interface ActivityItemButtonProps {
  item: ActivityBarItem;
  isActive: boolean;
  onClick: () => void;
}

function ActivityItemButton({ item, isActive, onClick }: ActivityItemButtonProps) {
  const Icon = resolveIcon(item.icon);
  return (
    <button
      className={`activitybar-item${isActive ? ' activitybar-item--active' : ''}`}
      title={item.label}
      aria-label={item.label}
      aria-pressed={isActive}
      onClick={onClick}
    >
      {createElement(Icon, { size: 20, strokeWidth: isActive ? 2 : 1.5 })}
    </button>
  );
}

export default function ActivityBar() {
  const items = useActivityBarItems();
  const ctxSvc = useService(ContextKeyServiceId);
  const contributions = useService(ContributionServiceId);
  const layout = useService(LayoutServiceId);

  // Re-evaluate when-clauses on every context key change.
  const _ctxVersion = useContextKeyVersion();
  void _ctxVersion;

  // Reactive: re-renders when active container changes (fixes highlight bug).
  const activeContainerId = useActiveViewContainerId();

  const topItems = items.filter((item) => {
    if (item.group !== 'top') return false;
    if (item.when) return ctxSvc.evaluate(item.when);
    return true;
  });

  function handleItemClick(item: ActivityBarItem): void {
    const containerId = item.viewContainer;
    if (activeContainerId === containerId) {
      // Toggle side bar on second click.
      layout.toggleVisibility(SlotId.PrimarySideBar);
    } else {
      contributions.setActiveContainerId(containerId);
      layout.setVisibility(SlotId.PrimarySideBar, true);
    }
  }

  return (
    <div className="part-activitybar" role="navigation" aria-label="Activity Bar">
      <div className="activitybar-top">
        {topItems.map((item) => (
          <ActivityItemButton
            key={item.id}
            item={item}
            isActive={activeContainerId === item.viewContainer}
            onClick={() => handleItemClick(item)}
          />
        ))}
      </div>
      <div className="activitybar-bottom">
        <SettingsMenu />
        <UserAvatar />
      </div>
    </div>
  );
}
