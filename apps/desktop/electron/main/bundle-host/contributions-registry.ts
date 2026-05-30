import type { BundleContributions } from './manifest.js';
import { viewUrlFor } from './view-protocol.js';

/**
 * In-memory registry of bundle contributions (activityBar.items + viewContainers)
 * parsed from manifests at boot time.
 *
 * Registration happens immediately when manifests are discovered (same timing as
 * registerBundleViews). Snapshot resolution happens lazily so it is independent
 * of loader ordering — viewUrlFor is called at snapshot time, not registration time.
 */

interface RegistryEntry {
  readonly bundleId: string;
  readonly contributes: BundleContributions;
}

const registry: RegistryEntry[] = [];

export interface ActivityBarItemSnapshot {
  readonly id: string;
  readonly label: string;
  readonly icon?: string;
  readonly viewContainer: string;
  readonly group: 'top' | 'bottom';
  readonly when?: string;
  readonly bundleId: string;
}

export interface ViewContainerSnapshot {
  readonly id: string;
  readonly title: string;
  readonly viewUrl: string | undefined;
  readonly bundleId: string;
  readonly location: 'primary' | 'auxiliary';
  readonly when?: string;
}

export interface PanelViewSnapshot {
  readonly id: string;
  readonly title: string;
  readonly icon?: string;
  readonly viewUrl: string | undefined;
  readonly bundleId: string;
  readonly when?: string;
  readonly priority: number;
}

export interface ContributionsSnapshot {
  readonly activityBarItems: ReadonlyArray<ActivityBarItemSnapshot>;
  readonly viewContainers: ReadonlyArray<ViewContainerSnapshot>;
  readonly panelViews: ReadonlyArray<PanelViewSnapshot>;
}

/**
 * Record a bundle's contributions at manifest-discovery time.
 * Safe to call for bundles with empty contributions (no-op for those).
 */
export function registerBundleContributions(bundleId: string, contributes: BundleContributions): void {
  registry.push({ bundleId, contributes });
}

/**
 * Return an aggregated snapshot of all registered contributions.
 * `viewUrl` is resolved lazily via viewUrlFor(bundleId, view) so ordering
 * relative to registerBundleViews does not matter.
 */
export function getContributionsSnapshot(): ContributionsSnapshot {
  const activityBarItems: ActivityBarItemSnapshot[] = [];
  const viewContainers: ViewContainerSnapshot[] = [];
  const panelViews: PanelViewSnapshot[] = [];

  for (const entry of registry) {
    const { bundleId, contributes } = entry;

    for (const item of contributes['activityBar.items']) {
      activityBarItems.push({
        id: item.id,
        label: item.label,
        icon: item.icon,
        viewContainer: item.viewContainer,
        group: item.group,
        when: item.when,
        bundleId,
      });
    }

    for (const container of contributes.viewContainers) {
      viewContainers.push({
        id: container.id,
        title: container.title,
        viewUrl: viewUrlFor(bundleId, container.view),
        bundleId,
        location: container.location,
        when: container.when,
      });
    }

    for (const pv of contributes['panel.views']) {
      panelViews.push({
        id: pv.id,
        title: pv.title,
        icon: pv.icon,
        viewUrl: viewUrlFor(bundleId, pv.view),
        bundleId,
        when: pv.when,
        priority: pv.priority,
      });
    }
  }

  return { activityBarItems, viewContainers, panelViews };
}
