/**
 * Practice intake-completeness + Attention-lens — pure read-derivation (P5).
 *
 * Extracted from index.mjs (O517 B1) so the obligation rules + intake checklist
 * can be unit-tested in isolation. Pure: no `ctx`, no host caps, no module state,
 * no I/O — each function maps a plain store row (+ `now`) to a plain value.
 *
 * The fp-host loads bundle code as raw ESM (`import(index.mjs)`), so this is a
 * plain `.mjs` sibling with no build step — keep it dependency-free.
 */

/** Days an on-hold record may sit before an Attention "review due" obligation fires. */
export const ON_HOLD_REVIEW_DAYS = 30;

/** The intake checklist item set — each maps to a boolean `has_*` column on the row. */
export const INTAKE_ITEMS = [
  { key: 'demographics',     label: 'Demographics',              col: 'has_demographics' },
  { key: 'language',         label: 'Preferred language',        col: 'has_language' },
  { key: 'diagnosis',        label: 'Diagnosis / problem list',  col: 'has_diagnosis' },
  { key: 'circle',           label: 'Circle / NR',               col: 'has_circle' },
  { key: 'informedConsent',  label: 'Informed consent',          col: 'has_informed_consent' },
  { key: 'teleConsent',      label: 'Tele-consent',              col: 'has_tele_consent' },
  { key: 'capacity',         label: 'Capacity assessed',         col: 'has_capacity' },
  { key: 'advanceDirective', label: 'Advance directive',         col: 'has_ad' },
  { key: 'riskScreen',       label: 'Initial risk screen',       col: 'has_risk_screen' },
  { key: 'documents',        label: 'Documents on file',         col: 'has_documents' },
];

/**
 * Format a display name as "Family, Given" — or just "Given" when no family name.
 * @param {string} given
 * @param {string} family
 * @returns {string}
 */
export function deriveDisplayName(given, family) {
  if (family && family.trim().length > 0) {
    return family.trim() + ', ' + given.trim();
  }
  return given.trim();
}

/**
 * Intake checklist for a client — each item's done-state + the aggregate counts.
 * @param {Record<string, unknown>} row  patient.intakeCompleteness row.
 */
export function mapIntakeCompleteness(row) {
  const items = INTAKE_ITEMS.map((i) => ({ key: i.key, label: i.label, done: !!row[i.col] }));
  const doneCount = items.reduce((n, it) => n + (it.done ? 1 : 0), 0);
  return {
    clientId: row.patient_id,
    displayName: deriveDisplayName(row.given_name, row.family_name),
    stage: row.stage,
    items,
    doneCount,
    total: INTAKE_ITEMS.length,
    complete: doneCount === INTAKE_ITEMS.length,
  };
}

/**
 * Owned-derived Attention obligations for a client (P5). Projection-derived
 * obligations are deferred to P6.
 *
 * No obligations for archived / discharged records. Otherwise: intake-incomplete
 * (only while in the intake stage), no-risk-screen, missing-consent-doc (consent
 * recorded but no document on file), and on-hold-stale (past the review window).
 *
 * @param {Record<string, unknown>} row  patient.attentionScan row.
 * @param {number} now  epoch ms — compared against `stage_updated_at`.
 * @returns {Array<{key:string,label:string}>}
 */
export function deriveObligations(row, now) {
  const stage = row.stage || 'active';
  const status = row.status || 'active';
  const obligations = [];
  // No noise on closed/archived records.
  if (status === 'archived' || stage === 'discharged') return obligations;
  const doneCount = INTAKE_ITEMS.reduce((n, i) => n + (row[i.col] ? 1 : 0), 0);
  const complete = doneCount === INTAKE_ITEMS.length;
  if (stage === 'intake' && !complete) {
    obligations.push({ key: 'intake_incomplete', label: 'Intake incomplete' });
  }
  if (!row.has_risk_screen) {
    obligations.push({ key: 'no_risk_screen', label: 'No risk screen' });
  }
  if (row.has_informed_consent && !row.has_documents) {
    obligations.push({ key: 'missing_consent_doc', label: 'Consent doc missing' });
  }
  if (stage === 'on_hold' && row.stage_updated_at != null &&
      (now - row.stage_updated_at) > ON_HOLD_REVIEW_DAYS * 24 * 60 * 60 * 1000) {
    obligations.push({ key: 'on_hold_stale', label: 'On-hold review due' });
  }
  return obligations;
}
