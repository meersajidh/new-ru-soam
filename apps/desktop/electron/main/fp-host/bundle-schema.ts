/**
 * Base infrastructure: register bundle-declared migrations + query templates
 * from manifest data into the base registries (ADR-506 §4/§6/§8 rung F / O445).
 *
 * ADR-106 boundary: BASE layer. Must NOT import any domain module.
 * Imports: manifest.ts, local-store/migrations.ts, local-store/store-query-cap.ts,
 *          capability/registry.ts
 *
 * Called from index.ts (the composition root) with a single discovered bundle list
 * shared across the migration step and the activation step — never discovers twice.
 */

import type { DiscoveredBundle, BundleManifest } from './manifest.js';
import { registerMigrationSet } from '../local-store/migrations.js';
import { registerQueryTemplate } from '../local-store/store-query-cap.js';
import { isCapabilityRegistered } from '../capability/registry.js';

/**
 * Register migration sets declared in bundle manifests with the base migration registry.
 *
 * For each bundle whose manifest carries `migrations`, constructs a base `MigrationSet`
 * with owner = manifest.id, ownedTables from manifest.ownedTables (or []), and
 * migration entries that wrap the raw SQL strings in `db.exec` calls.
 *
 * ORDERING: Must be called BEFORE `localStoreManager.openFor()` — store-open
 * triggers `runMigrations`, so all sets must be registered first.
 */
export function registerBundleMigrations(discovered: ReadonlyArray<DiscoveredBundle>): void {
  for (const bundle of discovered) {
    const { manifest } = bundle;
    if (!manifest.migrations || manifest.migrations.length === 0) continue;

    registerMigrationSet({
      owner: manifest.id,
      ownedTables: manifest.ownedTables ?? [],
      residency: manifest.residency ?? 'operational',
      migrations: manifest.migrations.map((entry) => ({
        version: entry.version,
        description: entry.description,
        up(db) {
          db.exec(entry.sql);
        },
      })),
    });
  }
}

/**
 * Register query templates declared in bundle manifests with the base store.query executor.
 *
 * For each bundle whose manifest carries `queryTemplates`, calls `registerQueryTemplate`
 * for each entry. The SELECT-only / single-statement guard runs inside
 * `registerQueryTemplate` (same as hand-authored templates).
 *
 * ORDERING: Must be called AFTER `registerStoreQueryCapability()` so the template
 * registry module is initialised.
 */
export function registerBundleQueryTemplates(discovered: ReadonlyArray<DiscoveredBundle>): void {
  for (const bundle of discovered) {
    const { manifest } = bundle;
    if (!manifest.queryTemplates || manifest.queryTemplates.length === 0) continue;

    const residency = manifest.residency ?? 'operational';
    for (const qt of manifest.queryTemplates) {
      registerQueryTemplate({ id: qt.id, sql: qt.sql, residency });
    }
  }
}

/**
 * Validate that all declared capability dependencies for a bundle are already
 * registered in the Main capability registry.
 *
 * Each entry in `dependencies.capabilities` must be a "name@version" string.
 * Throws with a clear error naming the missing dep + the bundle id if any dep
 * is absent from the registry.
 *
 * Call BEFORE activating a bundle (both eager and lazy paths) so a missing dep
 * refuses activation with a clear error without crashing the loader for other bundles.
 *
 * TODO O445: FK / cross-module-query / bundle-dep + activation-ordering validation
 * deferred — extend this function when a 2nd domain module lands.
 */
export function validateCapabilityDependencies(manifest: BundleManifest): void {
  const caps = manifest.dependencies?.capabilities;
  if (!caps || caps.length === 0) return;

  for (const depStr of caps) {
    const atIdx = depStr.lastIndexOf('@');
    if (atIdx <= 0) {
      throw new Error(
        `[bundle-schema] Bundle '${manifest.id}' declared dependency '${depStr}' is not in "name@version" format`,
      );
    }
    const name = depStr.slice(0, atIdx);
    const version = depStr.slice(atIdx + 1);
    if (!name || !version) {
      throw new Error(
        `[bundle-schema] Bundle '${manifest.id}' declared dependency '${depStr}' is not in "name@version" format`,
      );
    }
    if (!isCapabilityRegistered(name, version)) {
      throw new Error(
        `[bundle-schema] Bundle '${manifest.id}' requires capability '${depStr}' which is not registered`,
      );
    }
  }
}
