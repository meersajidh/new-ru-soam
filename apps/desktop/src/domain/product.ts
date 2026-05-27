/**
 * Domain-layer product identity and copy (ADR-106).
 *
 * All mental-health-specific copy lives here. Base shell components
 * receive these values through the ProductConfigService injection seam —
 * they never import this module directly.
 */

export const PRODUCT_NAME = 'Ru-Soam';

export const PRODUCT_TAGLINE = 'For mental health practice';

/**
 * Domain addendum appended to the base delete-workspace warning paragraph.
 * Carries the domain-specific "PHI" terminology that must not appear in
 * base shell components (ADR-106).
 */
export const DELETE_WARNING_ADDENDUM = 'PHI stored locally will be destroyed.';
