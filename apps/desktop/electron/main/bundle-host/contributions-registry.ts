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
}

export interface ContributionsSnapshot {
  readonly activityBarItems: ReadonlyArray<ActivityBarItemSnapshot>;
  readonly viewContainers: ReadonlyArray<ViewContainerSnapshot>;
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
        // Lazy resolution — viewUrlFor may return undefined if view-assets not yet
        // registered, which the renderer handles gracefully.
        viewUrl: viewUrlFor(bundleId, container.view),
        bundleId,
      });
    }
  }

  return { activityBarItems, viewContainers };
}
