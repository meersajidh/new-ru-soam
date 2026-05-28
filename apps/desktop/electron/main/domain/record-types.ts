/**
 * Canonical Patient record types — ADR-504 / ADR-505.
 *
 * Owned by `ru-soam.core-domain`. Imported by Main (capability impl) and
 * by the Renderer / consumer bundles as a **contract only** — importing
 * these types grants no data access.
 *
 * Schema is deliberately lean (ADR-301 data minimisation). No free-form
 * clinical notes — those belong to Sessions (a later ADR).
 */

export type PatientStatus = 'active' | 'inactive' | 'archived';

/**
 * Full canonical Patient record as stored in the `patients` table.
 * PHI — never log field values, never send plaintext to cloud.
 */
export interface PatientRecord {
  readonly id: string;           // uuid
  readonly createdAt: number;    // epoch ms
  readonly updatedAt: number;    // epoch ms
  readonly givenName: string;    // required
  readonly familyName: string | null;
  readonly contactPhone: string | null;
  readonly contactEmail: string | null;
  readonly dob: string | null;   // ISO date string e.g. "1990-01-15", optional
  readonly status: PatientStatus;
  /** Derived: "familyName, givenName" or just "givenName" when no familyName. */
  readonly displayName: string;
}

/**
 * Lightweight roster projection — id + displayName + status only.
 * Returned by `record.patient.list()` to minimise PHI surface in the roster.
 */
export interface PatientSummary {
  readonly id: string;
  readonly displayName: string;
  readonly status: PatientStatus;
}

/** Input for creating a new patient record. */
export interface PatientCreateInput {
  readonly givenName: string;
  readonly familyName?: string | null;
  readonly contactPhone?: string | null;
  readonly contactEmail?: string | null;
  readonly dob?: string | null;
  readonly status?: PatientStatus;
}

/** Patch input for updating a patient record (all fields optional). */
export interface PatientUpdatePatch {
  readonly givenName?: string;
  readonly familyName?: string | null;
  readonly contactPhone?: string | null;
  readonly contactEmail?: string | null;
  readonly dob?: string | null;
}

/** Derive `displayName` from given/family names. Pure function — no PHI logged. */
export function deriveDisplayName(givenName: string, familyName: string | null): string {
  if (familyName && familyName.trim().length > 0) {
    return `${familyName.trim()}, ${givenName.trim()}`;
  }
  return givenName.trim();
}
