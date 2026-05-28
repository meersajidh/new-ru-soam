import { registerCapability } from './registry.js';
import { getContributionsSnapshot } from '../bundle-host/contributions-registry.js';

/**
 * `platform.contributions@1.0` — manifest contribution metadata for the Renderer.
 *
 * The Renderer calls `list` at boot to obtain the full set of activity-bar items
 * and view containers contributed by discovered bundles. Main is the authority
 * because it reads and validates all bundle manifests; the Renderer has no direct
 * access to the filesystem or manifest data.
 *
 * Not PHI-flagged: contribution data is bundle manifest metadata only (ids,
 * labels, icons, view URLs). No patient data is present.
 */
export function registerContributionsCapability(): void {
  registerCapability('platform.contributions', '1.0', async (method) => {
    switch (method) {
      case 'list': {
        return getContributionsSnapshot();
      }
      default:
        throw new Error(`Method not found: ${method}`);
    }
  });
}
