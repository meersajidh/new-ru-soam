/**
 * @ru-soam/domain — shared Patient record type contracts.
 *
 * ADR-504 / ADR-505. Owned by `ru-soam.core-domain`.
 *
 * TYPES-ONLY. No runtime exports — every export here must be a `type` or
 * `interface`. This is deliberate: Main bundles via Vite; a runtime value
 * imported from a workspace TS package risks being externalized/un-transpiled.
 * `import type` erases fully at compile time, zero runtime footprint.
 *
 * Consumers MUST use `import type { … } from '@ru-soam/domain'`.
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

/**
 * Codex adjunct — patient_profile row (ADR-505).
 * PHI — treat same as PatientRecord.
 */
export interface PatientProfile {
  readonly patientId: string;
  readonly preferredLanguage: string | null;
  readonly medicationAwareness: string | null;
  readonly diagnosis: string | null;
  readonly updatedAt: number;
}

/** Patch for updating a patient profile (all content fields optional). */
export interface PatientProfilePatch {
  readonly preferredLanguage?: string | null;
  readonly medicationAwareness?: string | null;
  readonly diagnosis?: string | null;
}
