/**
 * Main-side domain bootstrap (ADR-504 / ADR-106 composition seam).
 *
 * Mirrors the renderer's `src/domain/bootstrap.ts` pattern: this module is the
 * ONLY file in `electron/main/domain/**` that the Main composition root
 * (`electron/main/index.ts`) imports. All other domain modules are internal.
 *
 * Registers the first domain capability in Main — `record.patient@1.0`.
 * Additional Main-resident domain capabilities register here as they arrive.
 *
 * ADR-106 one-way boundary: domain→base is fine (this module imports base
 * capability registration); base MUST NOT import domain. The base library
 * stays domain-free — this file is the app's wiring point, not a base module.
 */

import { registerRecordPatientCapability } from './record-patient-cap.js';

export function registerDomainCapabilities(): void {
  registerRecordPatientCapability();
}
