/**
 * Main-side domain bootstrap (ADR-504 / ADR-106 / ADR-506 composition seam).
 *
 * Mirrors the renderer's `src/domain/bootstrap.ts` pattern: this module is the
 * ONLY file in `electron/main/domain/**` that the Main composition root
 * (`electron/main/index.ts`) imports. All other domain modules are internal.
 *
 * Three entry points — called at different boot phases:
 *
 *   registerDomainMigrations() — MUST be called BEFORE the store opens
 *     (before `localStoreManager.openFor()`). Registers per-bundle migration
 *     sets with the base migration registry so `runMigrations` creates all
 *     domain tables on first open of a fresh DB.
 *
 *   registerDomainCapabilities() — ADR-506 rung D2: Main is now pure-base.
 *     record.patient (command) and record.patient.query are FP-Host-resident
 *     (ru-soam-practice bundle, routed by the loader from manifest declarations).
 *     No domain logic capabilities register here. Future Main-resident domain
 *     capabilities (if any — e.g. rung G hard-invariant enforcement) would
 *     register here. Currently a no-op stub.
 *
 *   registerDomainQueries() — called alongside registerDomainCapabilities().
 *     Registers pre-declared SELECT templates with the base store.query
 *     executor (ADR-506 §6 rung C / O446). Order relative to
 *     registerDomainCapabilities() does not matter — templates are consumed at
 *     runtime, not at boot. MUST be called after registerStoreQueryCapability()
 *     so the template registry is ready (registration validates at module load,
 *     not at cap invocation time).
 *
 * ADR-106 one-way boundary: domain→base is fine (this module imports base
 * capability registration); base MUST NOT import domain. The base library
 * stays domain-free — this file is the app's wiring point, not a base module.
 */

import { registerPracticeMigrations } from './practice-migrations.js';
import { registerPracticeQueries } from './practice-queries.js';

/**
 * Register all domain migration sets with the base registry.
 * Called BEFORE `localStoreManager.openFor()` in index.ts.
 */
export function registerDomainMigrations(): void {
  registerPracticeMigrations();
}

/**
 * Pure-base Main stub (ADR-506 rung D2).
 *
 * record.patient (command) and record.patient.query are both FP-Host-resident
 * (ru-soam-practice/index.mjs). The loader routes them via manifest
 * declarations — no Main registration required or permitted.
 *
 * Leave this stub so index.ts call-site compiles unchanged. Add future
 * Main-resident domain caps here only when rung G hard-invariant enforcement
 * (O448) or a new base-only domain cap warrants it.
 */
export function registerDomainCapabilities(): void {
  // No-op: Main holds no domain logic capabilities at rung D2.
}

/**
 * Register all domain query templates with the base store.query executor.
 * Called alongside registerDomainCapabilities() in index.ts, after
 * registerStoreQueryCapability() so the template registry module is ready.
 * (ADR-506 §6 rung C / O446)
 */
export function registerDomainQueries(): void {
  registerPracticeQueries();
}
