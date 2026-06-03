/**
 * Main-side domain bootstrap (ADR-504 / ADR-106 composition seam).
 *
 * Mirrors the renderer's `src/domain/bootstrap.ts` pattern: this module is the
 * ONLY file in `electron/main/domain/**` that the Main composition root
 * (`electron/main/index.ts`) imports. All other domain modules are internal.
 *
 * Two entry points — called at different boot phases:
 *
 *   registerDomainMigrations() — MUST be called BEFORE the store opens
 *     (before `localStoreManager.openFor()`). Registers per-bundle migration
 *     sets with the base migration registry so `runMigrations` creates all
 *     domain tables on first open of a fresh DB.
 *
 *   registerDomainCapabilities() — called after `setLockServiceGetter` so the
 *     PHI gate is armed. Registers Main-resident domain capabilities.
 *
 * ADR-106 one-way boundary: domain→base is fine (this module imports base
 * capability registration); base MUST NOT import domain. The base library
 * stays domain-free — this file is the app's wiring point, not a base module.
 */

import { registerPracticeMigrations } from './practice-migrations.js';
import { registerRecordPatientCapability } from './record-patient-cap.js';

/**
 * Register all domain migration sets with the base registry.
 * Called BEFORE `localStoreManager.openFor()` in index.ts.
 */
export function registerDomainMigrations(): void {
  registerPracticeMigrations();
}

export function registerDomainCapabilities(): void {
  registerRecordPatientCapability();
}
