/**
 * Domain bootstrap (ADR-106 — composition seam).
 *
 * Called ONLY from the single composition-root file (src/App.tsx).
 * Registers domain product values into the base injection point so that
 * base shell components receive correct product copy without importing
 * domain modules directly.
 *
 * This module is the ONLY file in src/domain/** that the composition root
 * imports. All other domain modules are internal.
 */

import type { ServiceRegistry } from '../platform/services/registry';
import { ProductConfigServiceId } from '../platform/services/ids';
import { PRODUCT_TAGLINE, DELETE_WARNING_ADDENDUM } from './product';

export function domainBootstrap(registry: ServiceRegistry): void {
  const productConfig = registry.get(ProductConfigServiceId);
  productConfig.configure({
    tagline: PRODUCT_TAGLINE,
    deleteWarningAddendum: DELETE_WARNING_ADDENDUM,
  });
}
