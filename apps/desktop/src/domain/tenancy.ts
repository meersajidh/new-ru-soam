/**
 * Domain-layer tenancy model (ADR-106, ADR-501, ADR-503).
 *
 * Owns the concrete workspace entity-type union. The base layer's
 * WorkspaceEntityType is an opaque string; this module gives it meaning.
 */

/** Concrete tenancy values persisted in meta.json and used by the domain layer. */
export type WorkspaceEntityType = 'individual' | 'clinic';

/** Human-readable labels for each entity type. */
export const ENTITY_TYPE_LABELS: Record<WorkspaceEntityType, string> = {
  individual: 'Individual Practice',
  clinic: 'Clinic',
};
