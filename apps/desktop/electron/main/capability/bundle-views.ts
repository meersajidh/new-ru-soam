import { registerCapability } from './registry';
import { resolveViewPath, viewUrlFor } from '../bundle-host/view-protocol';

/**
 * `platform.views@1.0` — view URL resolution for the Renderer.
 *
 * The Renderer asks for the `view://` URL of a (bundleId, viewId) pair so
 * `EditorService.open(url)` can route to the iframe host. Kept in Main
 * because the view registry is populated alongside the bundle loader; the
 * Renderer has no other window into manifest data.
 *
 * Phase 7 scope: `resolve` only. Bulk listing or per-slot filtering land
 * with the side-bar / panel iframe wiring (O138).
 */
export function registerBundleViewsCapability(): void {
  registerCapability('platform.views', '1.0', async (method, args) => {
    switch (method) {
      case 'resolve': {
        const bundleId = args[0];
        const viewId = args[1];
        if (typeof bundleId !== 'string' || bundleId.length === 0) {
          throw new Error('resolve: bundleId must be a non-empty string');
        }
        if (typeof viewId !== 'string' || viewId.length === 0) {
          throw new Error('resolve: viewId must be a non-empty string');
        }
        const path = resolveViewPath(bundleId, viewId);
        if (!path) {
          return { found: false as const };
        }
        return { found: true as const, url: viewUrlFor(bundleId, viewId), path };
      }
      default:
        throw new Error(`Method not found: ${method}`);
    }
  });
}
