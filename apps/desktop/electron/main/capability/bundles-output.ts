import { registerCapability } from './registry';
import { getBundleOutput, listActivatedBundleIds } from '../bundle-host/manager';

/**
 * `platform.bundles@1.0` — Phase 6.5 stub surface.
 *
 * Lets the Renderer inspect per-bundle error-attribution lines captured by
 * the Main-side ring buffer (host.cap.error + host.activate.failed). Phase
 * 7's Panel content model will render this through a proper UI; for now the
 * capability exists so dev commands can dump it to devtools.
 */
export function registerBundlesOutputCapability(): void {
  registerCapability('platform.bundles', '1.0', async (method, args) => {
    switch (method) {
      case 'getOutput': {
        const bundleId = args[0];
        if (typeof bundleId !== 'string' || bundleId.length === 0) {
          throw new Error('getOutput: bundleId must be a non-empty string');
        }
        return { lines: getBundleOutput(bundleId) };
      }
      case 'listActivated':
        return { bundleIds: listActivatedBundleIds() };
      default:
        throw new Error(`Method not found: ${method}`);
    }
  });
}
