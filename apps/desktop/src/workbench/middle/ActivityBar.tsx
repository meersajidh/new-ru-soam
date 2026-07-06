import './ActivityBar.css';
import { useState, useEffect } from 'react';
import { Icon } from '@basebench/ui';
import SettingsMenu from './SettingsMenu';
import UserAvatar from './UserAvatar';
import {
  useActivityBarItems,
  useActiveViewContainerId,
  useService,
} from '../../platform/services/hooks';
import {
  ActivityBarDensityServiceId,
  ContributionServiceId,
  ContextKeyServiceId,
  LayoutServiceId,
} from '../../platform/services/ids';
import { SlotId } from '../../platform/layout/slots';
import type { ActivityBarItem } from '../../platform/contributions/contribution-service';
import type { Density } from '../../platform/activity-bar/density-service';

const DENSITY_ICON_SIZE: Record<Density, number> = {
  compact: 18,
  default: 22,
  large: 26,
};

/** Bumps a counter on every ContextKeyService change — triggers re-evaluation of when-clauses. */
function useContextKeyVersion(): number {
  const ctxSvc = useService(ContextKeyServiceId);
  const [version, setVersion] = useState(0);
  useEffect(() => ctxSvc.onDidChange(() => setVersion((v) => v + 1)), [ctxSvc]);
  return version;
}

interface ActivityItemButtonProps {
  item: ActivityBarItem;
  isActive: boolean;
  iconSize: number;
  onClick: () => void;
}

function ActivityItemButton({ item, isActive, iconSize, onClick }: ActivityItemButtonProps) {
  return (
    <button
      className={`activitybar-item${isActive ? ' activitybar-item--active' : ''}`}
      title={item.label}
      aria-label={item.label}
      aria-pressed={isActive}
      onClick={onClick}
    >
      {/* Active/inactive distinction via CSS (.activitybar-item--active color + pip); no strokeWidth needed. */}
      <Icon name={item.icon ?? 'folder'} size={iconSize} />
    </button>
  );
}

export default function ActivityBar() {
  const items = useActivityBarItems();
  const ctxSvc = useService(ContextKeyServiceId);
  const contributions = useService(ContributionServiceId);
  const layout = useService(LayoutServiceId);
  const densitySvc = useService(ActivityBarDensityServiceId);

  const [density, setDensity] = useState<Density>(() => densitySvc.getDensity());
  useEffect(() => densitySvc.onDidChangeDensity(setDensity), [densitySvc]);

  const iconSize = DENSITY_ICON_SIZE[density];

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
            iconSize={iconSize}
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
