The clean model is a split between canonical record data, Practice-owned adjuncts, and derived projections.

**What the docs imply**
- Practice owns the client-facing shell, but not notes, appointments, assessments, goals/tasks, or payments; those are read-only projections from other Activities ([functional design](<file:///home/meer/Repos/msh/new-ru-soam/docs/Activities/practice/practice-functional-design-draft.md#L12>), [Practice ADR](<file:///home/meer/Repos/msh/new-ru-soam/docs/ADRs/505-practice-activity.md#L56>)).
- The canonical client/patient record is owned by `core-domain`, not Practice ([ADR-504](<file:///home/meer/Repos/msh/new-ru-soam/docs/ADRs/504-canonical-domain-record-ownership.md#L43>)).
- The current local store already has a minimal `patients` table, plus `audit_log` and shared workspace settings ([migrations](<file:///home/meer/Repos/msh/new-ru-soam/apps/desktop/electron/main/local-store/migrations.ts#L37>), [migrations](<file:///home/meer/Repos/msh/new-ru-soam/apps/desktop/electron/main/local-store/migrations.ts#L73>)).

**Recommended model**
1. **Canonical record**
- `patients`
- Owner: `core-domain`
- Purpose: roster identity + minimal PHI
- Current fields: `id`, `created_at`, `updated_at`, `given_name`, `family_name`, `contact_phone`, `contact_email`, `dob`, `status` ([ADR-505](<file:///home/meer/Repos/msh/new-ru-soam/docs/ADRs/505-practice-activity.md#L72>)).

2. **Practice-owned adjuncts**
- `patient_profile`
- `patient_circle_member`
- `patient_lifecycle`
- `patient_consent_state`
- `patient_document`
- `patient_risk_state` / `patient_risk_event`
- `patient_overlay`

3. **Derived read models**
- `overview_snapshot`
- `agenda_membership`
- `attention_membership`
- `intake_membership`

4. **Other-domain projections**
- Notes, appointments, assessments, goals/tasks, payments should not become Practice-owned tables. Store only references/summaries as projections.

**Concrete schema shape**
```sql
patients(
  id TEXT PK,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  given_name TEXT NOT NULL,
  family_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  dob TEXT,
  status TEXT NOT NULL DEFAULT 'active'
)

patient_profile(
  patient_id TEXT PK/FK,
  preferred_language TEXT,
  medication_awareness TEXT,
  diagnosis TEXT
)

patient_circle_member(
  id TEXT PK,
  patient_id TEXT FK,
  kind TEXT NOT NULL,              -- nominated_rep, caregiver, family, emergency_contact
  display_name TEXT NOT NULL,
  relationship TEXT,
  phone TEXT,
  email TEXT,
  is_primary_nr INTEGER NOT NULL DEFAULT 0
)

patient_lifecycle(
  patient_id TEXT PK/FK,
  stage TEXT NOT NULL,             -- referral, waitlisted, intake_scheduled, intake_in_progress, active, on_hold, discharged
  stage_updated_at INTEGER NOT NULL,
  stage_reason TEXT
)

patient_consent_state(
  patient_id TEXT PK/FK,
  advance_directive_status TEXT,
  advance_directive_document_id TEXT,
  informed_consent_status TEXT,
  tele_consent_mode TEXT,
  capacity_status TEXT,
  confidentiality_exception_active INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
)

patient_document(
  id TEXT PK,
  patient_id TEXT FK,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  storage_ref TEXT NOT NULL,
  mime_type TEXT,
  sha256 TEXT,
  linked_kind TEXT,
  linked_id TEXT,
  created_at INTEGER NOT NULL
)

patient_risk_event(
  id TEXT PK,
  patient_id TEXT FK,
  kind TEXT NOT NULL,
  severity TEXT,
  occurred_at INTEGER NOT NULL,
  summary TEXT,
  audit_event_id INTEGER
)

patient_overlay(
  id TEXT PK,
  patient_id TEXT FK,
  target_kind TEXT NOT NULL,
  target_id TEXT NOT NULL,
  kind TEXT NOT NULL,              -- reviewed, pinned, follow_up
  created_at INTEGER NOT NULL,
  cleared_at INTEGER
)
```

**Important split**
- Keep `patients.status` narrow: roster visibility / archival state.
- Do **not** overload it with Intake. Intake needs its own `patient_lifecycle.stage`.
- Keep notes/appointments/assessments/goals/payments out of Practice-owned storage; Practice only projects them.
- Treat `audit_log` as provenance, not business state; it already exists as an append-only ledger ([migrations](<file:///home/meer/Repos/msh/new-ru-soam/apps/desktop/electron/main/local-store/migrations.ts#L37>), [ADR-502](<file:///home/meer/Repos/msh/new-ru-soam/docs/ADRs/502-audit-and-consent-ledger.md#L32>)).

**My recommendation**
- Use `patients` as the canonical table.
- Add `patient_profile`, `patient_circle_member`, `patient_lifecycle`, `patient_consent_state`, `patient_document`, `patient_risk_event`, `patient_overlay`.
- Build `overview_snapshot` and the lens memberships as derived views/materialized read models, not as source-of-truth tables.
