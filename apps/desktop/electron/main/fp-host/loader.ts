import path from 'path';
import { app, type BrowserWindow } from 'electron';
import { type DiscoveredBundle } from './manifest.js';
import {
  activateBundle,
  invokeBundleCapability,
  isBundleActivated,
  setOnBundlesCrashed,
} from './manager.js';
import { registerCapability } from '../capability/registry.js';
import { registerBundleViews } from './view-protocol.js';
import { registerBundleContributions } from './contributions-registry.js';
import { validateCapabilityDependencies } from './bundle-schema.js';
import { SOAM_EVENT_CHANNEL } from '../../shared/ipc-protocol.js';

/**
 * Wires bundle manifests into the platform at boot per ADR-104 amendment:
 * Main reads manifests, populates the registry, and only later does any
 * bundle code run (in the Bundle Host).
 *
 * Phase 6.5 scope: eager and `lazy` activation events. `lazy` bundles have
 * their routing handlers registered at boot but the bundle itself is not
 * activated until the first capability invocation. `onCommand` / `onEvent`
 * triggers remain deferred — see O134 / O135.
 */

const activationLocks = new Map<string, Promise<void>>();

async function ensureActivated(bundle: DiscoveredBundle): Promise<void> {
  const { manifest, entryPath } = bundle;
  const bundleId = manifest.id;
  if (isBundleActivated(bundleId)) return;
  let inflight = activationLocks.get(bundleId);
  if (!inflight) {
    // Validate capability dependencies before activation — refuse with clear error
    // if any declared dep is not registered (rung F / O445).
    validateCapabilityDependencies(manifest);
    // All discovered bundles are in-package → first-party (O449 rung-0, ADR-418 Am1).
    inflight = activateBundle(bundleId, entryPath, 'first-party')
      .then(() => undefined)
      .finally(() => {
        activationLocks.delete(bundleId);
      });
    activationLocks.set(bundleId, inflight);
    console.log(`[bundles] lazy-activating ${bundleId}`);
  }
  return inflight;
}

function resolveBundlesDir(): string {
  const override = process.env['RU_SOAM_BUNDLES_DIR'];
  if (override) return path.resolve(override);
  if (app.isPackaged) return path.join(process.resourcesPath, 'bundles');
  return path.join(app.getAppPath(), 'bundles');
}

function registerRoutingHandlers(bundle: DiscoveredBundle): void {
  const isLazy = bundle.manifest.activationEvents.includes('lazy');
  for (const cap of bundle.manifest.capabilities) {
    try {
      registerCapability(
        cap.name,
        cap.version,
        async (method, args) => {
          if (isLazy) {
            await ensureActivated(bundle);
          }
          return invokeBundleCapability(
            bundle.manifest.id,
            cap.name,
            cap.version,
            method,
            args,
          );
        },
        { phi: cap.phi ?? false, kind: cap.kind },
      );
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

/**
 * Load, wire, and eagerly-activate bundles from the pre-discovered list.
 *
 * Accepts the already-discovered bundle list from the caller (index.ts) so that
 * the same list is shared between the migration step (`registerBundleMigrations`),
 * query-template step (`registerBundleQueryTemplates`), and activation — no
 * double-discovery with divergent results (rung F / O445).
 */
export async function loadAndActivateBundles(
  discovered: ReadonlyArray<DiscoveredBundle>,
): Promise<LoaderResult> {
  if (discovered.length === 0) {
    console.log('[bundles] no bundles to load');
    return { discovered, activated: [], failed: [] };
  }

  console.log(`[bundles] loading ${discovered.length} bundle(s)`);

  const activated: string[] = [];
  const failed: { bundleId: string; reason: string }[] = [];

  for (const bundle of discovered) {
    registerRoutingHandlers(bundle);
    registerBundleViews(bundle);
    registerBundleContributions(bundle.manifest.id, bundle.manifest.contributes);

    if (!bundle.manifest.activationEvents.includes('eager')) continue;

    try {
      // Validate capability dependencies before eager activation (rung F / O445).
      validateCapabilityDependencies(bundle.manifest);
      // All in-package discovered bundles are first-party (O449 rung-0, ADR-418 Am1).
      await activateBundle(bundle.manifest.id, bundle.entryPath, 'first-party');
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

/**
 * Resolve the bundles root directory (same logic used to discover bundles
 * at boot — exported for use by index.ts composition root).
 */
export function resolveBundlesDirectory(): string {
  return resolveBundlesDir();
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
