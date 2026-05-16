import path from 'path';
import { app, type BrowserWindow } from 'electron';
import { discoverBundles, type DiscoveredBundle } from './manifest';
import {
  activateBundle,
  invokeBundleCapability,
  setOnBundlesCrashed,
} from './manager';
import { registerCapability } from '../capability/registry';
import { SOAM_EVENT_CHANNEL } from '../../shared/ipc-protocol';

/**
 * Wires bundle manifests into the platform at boot per ADR-104 amendment:
 * Main reads manifests, populates the registry, and only later does any
 * bundle code run (in the Bundle Host).
 *
 * Phase 6 scope: eager activation only. `onCommand` / `onEvent` triggers
 * land in Phase 6.5 (O68).
 */

function resolveBundlesDir(): string {
  const override = process.env['RU_SOAM_BUNDLES_DIR'];
  if (override) return path.resolve(override);
  if (app.isPackaged) return path.join(process.resourcesPath, 'bundles');
  return path.join(app.getAppPath(), 'bundles');
}

function registerRoutingHandlers(bundle: DiscoveredBundle): void {
  for (const cap of bundle.manifest.capabilities) {
    try {
      registerCapability(cap.name, cap.version, async (method, args) => {
        return invokeBundleCapability(
          bundle.manifest.id,
          cap.name,
          cap.version,
          method,
          args,
        );
      });
    } catch (err) {
      console.error(
        `[bundles] capability registration failed for ${bundle.manifest.id} ${cap.name}@${cap.version}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}

export interface LoaderResult {
  readonly discovered: ReadonlyArray<DiscoveredBundle>;
  readonly activated: ReadonlyArray<string>;
  readonly failed: ReadonlyArray<{ bundleId: string; reason: string }>;
}

export async function loadAndActivateBundles(): Promise<LoaderResult> {
  const dir = resolveBundlesDir();
  const discovered = discoverBundles(dir);
  if (discovered.length === 0) {
    console.log(`[bundles] no bundles discovered in ${dir}`);
    return { discovered, activated: [], failed: [] };
  }

  console.log(`[bundles] discovered ${discovered.length} bundle(s) in ${dir}`);

  const activated: string[] = [];
  const failed: { bundleId: string; reason: string }[] = [];

  for (const bundle of discovered) {
    registerRoutingHandlers(bundle);

    if (!bundle.manifest.activationEvents.includes('eager')) continue;

    try {
      await activateBundle(bundle.manifest.id, bundle.entryPath);
      activated.push(bundle.manifest.id);
      console.log(`[bundles] activated ${bundle.manifest.id}`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      failed.push({ bundleId: bundle.manifest.id, reason });
      console.error(`[bundles] activation failed ${bundle.manifest.id}: ${reason}`);
    }
  }

  return { discovered, activated, failed };
}

export function installBundleCrashEventBridge(getWindow: () => BrowserWindow | null): void {
  setOnBundlesCrashed((bundleIds) => {
    const win = getWindow();
    if (!win || win.isDestroyed()) return;
    win.webContents.send(SOAM_EVENT_CHANNEL, {
      name: 'bundle.crashed',
      payload: { bundleIds },
    });
    console.error(`[bundles] crash isolated; bundles marked inactive: ${bundleIds.join(', ')}`);
  });
}
