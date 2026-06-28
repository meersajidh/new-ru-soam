# Clinical-Records Core — Logical Data Model & Standardization Specification

### Local-First, Ecosystem-Ready Mental Health Workbench

**Document type:** Logical Data Model (LDM) and standardization spec for the clinical-records subsystem.
**Abstraction level:** Logical only. This document fixes _entities, attributes-as-concepts, relationships, and standardization vectors_. It deliberately does **not** specify physical storage, column types, encryption mechanics, or DDL — those are owned by separate engineering ADRs and are out of scope here.

---

## 0. Scope and boundary

This specification covers the **clinical-records core** of the workbench only:

**In scope:** patient profile, socio-demographic and family ecosystem, the legal/statutory compliance entities, clinical history and intake, psychopharmacology and substance tracking, risk and safety, the encounter spine, psychometric observations, clinical findings and diagnoses, standard progress notes, and protected psychotherapy notes.

**Explicitly out of boundary (owned by sibling specs):** scheduling, billing and payments, the intake _workflow_ (as opposed to the intake _record_), and outcome-tracking dashboards. These reference this spec for the shared profile/encounter anchors but model their own entities.

**Cross-cutting concerns owned by other ADRs (referenced, not specified here):** encryption key management for the local store, audit and access logging, primary-key/identity generation strategy, and encrypted backup/sync. Where this document depends on those decisions, it names the dependency and points to the governing ADR rather than re-deciding it.

---

## 1. Strategy: Ecosystem Preparedness without Ecosystem Dependency

The system runs **fully local-first**: it stores zero personal or health data on any vendor-managed server and is completely functional with no network. To avoid future rework, the data model is nonetheless shaped from day one to map cleanly onto the Ayushman Bharat Digital Mission (ABDM) and onto NIMHANS-style family-centric clinical practice.

The guiding principle is **ready to map, not yet connected.**

**The data-sovereignty reconciliation (stated explicitly because it will be challenged).** The workbench's premise is practitioner-owned, capture-resistant records with no central dossier. ABDM, by design, is a national exchange that makes records _flow_ across a network, anchored to a government-linkable identity (ABHA). These are reconcilable, and the reconciliation must be load-bearing rather than assumed:

- **Schema readiness is cheap and is baked in now** — nullable identity placeholders, FHIR-shaped tables, coded terminology. None of this exposes any data or creates any dependency.
- **ABDM _activation_ is a deferred, practitioner-elected option, never a Layer-0 default.** Becoming a live Health Information Provider entails facility registration (HFR), practitioner registration (HPR), security certification, and consent-manager integration. That is a future, opt-in capability — appropriately a value-added service — not something the local workbench requires to function.
- **ABDM exchange is consent-driven and patient-controlled**, which is _compatible_ with data sovereignty: records move only on the patient's consent, keyed to the patient's own ABHA. Readiness therefore does not compromise the capture-resistant premise.

The remainder of this document realizes "ready to map" at the logical level.

---

## 2. Profile domains (what the system tracks)

A mental-health client profile is a longitudinal, highly sensitive narrative, not a flat record. It is organized into six domains:

| **Profile domain**                                   | **Clinical Intent**                      | **Core Data Captured**                                                                                                             |
| ---------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **1. Administrative & Demographic Foundations**      | Core Demographics                        | Full legal name, preferred name, pronouns, date of birth, gender identity, sexual orientation.                                     |
|                                                      | Secure Contact Matrix                    | Phone, encrypted email, address, communication preferences (e.g., voicemail restrictions, discreet messaging).                     |
|                                                      | Emergency Contact & ROI                  | Emergency contacts and Release of Information (ROI) permissions for family members and healthcare providers.                       |
|                                                      | Insurance & Billing Hub                  | Insurance provider, policy details, authorizations, superbill preferences, billing information.                                    |
| **2. Clinical History & Intake Lifeline**            | Chief Complaint & HPI                    | Presenting concerns, onset, severity, symptom progression, triggers, client's narrative.                                           |
|                                                      | Psychiatric History                      | Previous diagnoses, hospitalizations, therapy history, prior treatment outcomes.                                                   |
|                                                      | Developmental & Social History           | Childhood, family dynamics, trauma (ACEs), education, employment, relationships, legal history, cultural and spiritual factors.    |
|                                                      | Medical History & Somatic Co-morbidities | Medical conditions, neurological history, sleep, exercise, diet, head injuries, chronic illnesses.                                 |
|                                                      | Family Psychiatric History               | Family history of mental illness, substance use disorders, neurological conditions.                                                |
| **3. Psychopharmacology & Substance Tracking**       | Current Medications                      | Psychiatric and non-psychiatric medications, dosage, frequency, prescriber, adherence, side effects.                               |
|                                                      | Historical Medication Log                | Previously prescribed medications, dosage history, reasons for discontinuation, treatment response.                                |
|                                                      | Substance Use Profile                    | Alcohol, nicotine, caffeine, recreational drugs, screening scores (CAGE, AUDIT), withdrawal risks.                                 |
|                                                      | Allergies & Adverse Reactions            | Drug, food, environmental allergies, adverse reactions, anaphylaxis alerts.                                                        |
| **4. Clinical Assessments & Diagnostic Formulation** | Mental Status Examination (MSE)          | Appearance, behavior, speech, mood, affect, thought process, thought content, cognition.                                           |
|                                                      | Standardized Assessments                 | Longitudinal assessment scores (e.g., PHQ-9, GAD-7, PCL-5, neurodivergence assessments).                                           |
|                                                      | Diagnostic Formulation                   | DSM-5-TR / ICD-11 diagnoses with clinical formulation narrative.                                                                   |
| **5. Risk Assessment & Safety Architecture**         | Risk Status Stratification               | Suicidal ideation (SI), homicidal ideation (HI), non-suicidal self-injury (NSSI), current risk level.                              |
|                                                      | Vulnerability Markers                    | Self-neglect, exploitation risk, cognitive impairment, psychosis, grave disability indicators.                                     |
|                                                      | Safety Plans                             | Collaborative crisis plans, triggers, coping strategies, emergency contacts, crisis resources.                                     |
|                                                      | Clinical Directives                      | Psychiatric advance directives, legal holds, other legal safety documentation.                                                     |
| **6. Active Treatment & Progress Engine**            | Collaborative Treatment Plan             | Goals, objectives, interventions, therapeutic modalities (e.g., CBT, EMDR), linkage to diagnoses.                                  |
|                                                      | Progress Notes                           | Session documentation using SOAP, DAP, BIRP, or similar clinical note formats.                                                     |
|                                                      | Psychotherapy Notes (Separated)          | Private therapist process notes stored separately from the medical record and subject to enhanced privacy protections under HIPAA. |

---

## 3. Logical data model: core entities and relationships

The model is normalized and relational. Two structural commitments anchor it:

1. **The patient profile is the root**, and longitudinal "state" entities (family ecosystem, legal/statutory, history, medication record, risk record) hang off it.
2. **The encounter is the operational spine.** Every clinical event — a note, a diagnosis, an observation, a medication change, a risk re-assessment — carries a relational mapping back to a discrete, time-bound encounter. This holds even for entities whose _current-state_ view is presented at the profile level: the change that produced that state is recorded _through_ an encounter.

Socio-demographic and family entities are **structured child tables, not free-text fields**, so that family histories of illness, systemic dynamics, and a caregiver-burden measure are queryable. This reflects the family-involved care models emphasized by institutes such as NIMHANS.

### Entity relationship overview

```
        [Patient_Profile]  (root anchor)
                 │
                 ├──(1:N)──> [SocioDemographic_Family_Ecosystem]
                 │              └── genogram entries, family illness history,
                 │                  systemic dynamics, caregiver-burden measure
                 │
                 ├──(1:1)──> [Legal_MHCA2017_Compliance]
                 │              └── nominated representative, advance directive,
                 │                  consent records
                 │
                 ├──(1:1)──> [Clinical_History_Intake]
                 │              └── chief complaint, HPI, past treatments,
                 │                  trauma history (ACEs)
                 │
                 ├──(1:N)──> [Medication_Substance_Record]
                 │              └── active meds, historical failures + reasons,
                 │                  adherence, substance screening, adverse alerts
                 │
                 ├──(1:N)──> [Risk_Safety_Record]
                 │              └── ideation/intent/means, NSSI history,
                 │                  crisis safety plans
                 │
                 └──(1:N)──> [Clinical_Encounter]   (operational spine; time-bound)
                                  │
                                  ├──(1:N)──> [Psychometric_Observation]
                                  │              └── instrument, item-level
                                  │                  responses (first-class), score
                                  │
                                  ├──(1:N)──> [Clinical_Finding]   (SNOMED-CT coded)
                                  ├──(1:N)──> [Clinical_Condition]  (ICD-10/11 coded)
                                  │
                                  ├──(1:1)──> [Standard_Progress_Note]
                                  │              └── SOAP / DAP / BIRP — shareable
                                  │                  medical metadata
                                  │
                                  └──(1:1)──> [Protected_Psychotherapy_Note]
                                                 └── ISOLATED / quarantined (see §5)
```

| Entity                                | Relationship | Parent Entity      | Purpose / Contents                                                                                                                             |
| ------------------------------------- | ------------ | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Patient_Profile**                   | Root         | —                  | Master patient record; anchor for all clinical, legal, demographic, and encounter data.                                                        |
| **SocioDemographic_Family_Ecosystem** | 1:N          | Patient_Profile    | Family structure, genogram entries, family psychiatric/medical history, systemic relationships, caregiver burden assessments.                  |
| **Legal_MHCA2017_Compliance**         | 1:1          | Patient_Profile    | Mental Healthcare Act 2017 compliance records including nominated representative, advance directives, consent documentation.                   |
| **Clinical_History_Intake**           | 1:1          | Patient_Profile    | Initial intake and longitudinal history including chief complaint, HPI, previous treatments, trauma history, ACEs.                             |
| **Medication_Substance_Record**       | 1:N          | Patient_Profile    | Current medications, discontinued medications, treatment failures and reasons, adherence tracking, substance use screening, adverse reactions. |
| **Risk_Safety_Record**                | 1:N          | Patient_Profile    | Suicide risk assessments, ideation/intent/means evaluations, NSSI history, crisis interventions, safety plans.                                 |
| **Clinical_Encounter**                | 1:N          | Patient_Profile    | Time-bound encounter/visit record serving as the operational clinical spine.                                                                   |
| **Psychometric_Observation**          | 1:N          | Clinical_Encounter | Assessment instruments, item-level responses, scores, interpretations, psychometric results.                                                   |
| **Clinical_Finding**                  | 1:N          | Clinical_Encounter | SNOMED-CT coded symptoms, observations, signs, behaviors, and clinical findings.                                                               |
| **Clinical_Condition**                | 1:N          | Clinical_Encounter | ICD-10/ICD-11 coded diagnoses and conditions.                                                                                                  |
| **Standard_Progress_Note**            | 1:1          | Clinical_Encounter | SOAP, DAP, BIRP, or similar progress notes intended for the formal medical record and potential sharing.                                       |
| **Protected_Psychotherapy_Note**      | 1:1          | Clinical_Encounter | Segregated psychotherapy process notes with enhanced privacy protections and restricted access.                                                |

### Entity notes

**Patient_Profile** and **Clinical_Encounter** are the two aggregate roots. Stable patient facts remain under Patient_Profile, while evolving clinical observations and documentation are attached to Clinical_Encounter.

- **Patient_Profile** — administrative and demographic foundations; legal and preferred identity; contact-consent instructions; the decoupled ABHA placeholders (§4.A). The root every other clinical entity ultimately references.
- **SocioDemographic_Family_Ecosystem** — one-to-many so that multiple family members, relationships, and genogram nodes are individually represented. Carries the caregiver-burden measure (a Zarit-style burden index or equivalent — instrument choice and any licensing handled at content-selection time, not here).
- **Legal_MHCA2017_Compliance** — the statutory entities (§4.B). One-to-one at the profile level; advance-directive presence is a structured state with a reference to the stored directive, not a free-text flag.
- **Clinical_History_Intake** — the intake _record_ (distinct from the intake _workflow_, which is out of boundary). Structured sub-elements for HPI, past treatment, and trauma/ACEs rather than a single narrative blob.
- **Medication_Substance_Record** — active and historical; historical entries retain the explicit reason for discontinuation (a clinically important signal that flat current-med lists discard).
- **Risk_Safety_Record** — both historical and active assessments; crisis safety plans modeled as structured, co-created artifacts.
- **Clinical_Encounter** — discrete and time-bound; the mandatory anchor for all clinical events.
- **Psychometric_Observation** — captures **item-level responses as first-class structured elements**, not aggregate-score-only. (The _abstraction_ is fixed here; physical representation is an out-of-scope storage decision — see §4.C and §6.)
- **Clinical_Finding / Clinical_Condition** — findings and symptoms are SNOMED-CT-coded; formal diagnoses are ICD-10/11-coded (§4.A).
- **Standard_Progress_Note / Protected_Psychotherapy_Note** — separated at the model level; the isolation contract is specified in §5.

---

## 4. Standardization directives

The three standardization concerns in the source draft were conflated. They are separated here because they answer different questions and become independent decisions: **(A) what the system connects to**, **(B) what the system captures**, and **(C) what the system may later contribute to research**. Only (A) is an external ecosystem; (B) and (C) are self-owned.

### A. Integration substrate — ABDM

This is the only true external "ecosystem" axis. The model is shaped to ABDM's notified standards so that future activation is a translation layer, not a reconstruction.

**Identity layer — decoupled ABHA placeholders.** The profile separates internal system keys from external national identifiers. It carries structured, **nullable** fields for the 14-digit **ABHA Number** and the alphanumeric **ABHA Address**. The ABHA Address is stored as an **opaque string with no hardcoded domain suffix** — note that the production suffix is `@abdm`; `@sbx` exists only in the ABDM sandbox and must never be baked in as canonical. Isolating these fields keeps the engine fully functional offline while leaving it ready to anchor to the ABDM Health Information Provider (HIP) network later.

**Structure — FHIR R4 alignment.** Rather than flattening a session into one entry, a clinical session is modeled as an **Encounter** container linking to **Condition** resources (diagnoses), **Observation** resources (findings and psychometric scores), and the progress note. ABDM mandates HL7 FHIR R4 as its structural standard; mirroring it now means future export becomes a row-to-FHIR-bundle translation rather than a historical-data migration.

**Terminology — Code + System + Display triplets.** Clinical concepts are modeled as coded triplets, aligned to ABDM's notified terminology stack:

- **Findings and symptoms →** SNOMED-CT concept identifiers.
- **Formal diagnoses →** ICD-10 / ICD-11 classifications.

During early validation the UI may accept free text, but the underlying model stores each entry as a dictionary reference (code + system + display), so a typeahead terminology service can be layered in later without reshaping the data. _(The free-text-to-coded transition is a UI/validation-phase concern; the model commitment is that the storage shape is always the triplet.)_

### B. Clinical content and statutory model — NIMHANS-style practice and MHCA 2017

This axis governs _what is captured_, independent of any network. It is a clinical-content and legal-modeling decision, not an integration target.

**Family-centric capture (NIMHANS-style).** The structured family-ecosystem entities (§3) operationalize the family-involved care model: family histories of illness, systemic dynamics, and caregiver burden are first-class structured data, not narrative asides.

**Legal compliance — the MHCA 2017 model.** The model integrates the statutory entities of the Indian Mental Healthcare Act, 2017:

- **Nominated Representative (NR):** a clear relational record mapping the legal proxy appointed by the client for crisis-level decision-making.
- **Advance Directives:** a structured state recording whether a directive exists and referencing the stored document detailing the client's legally binding preferences during severe episodes.

These also align with the confidentiality expectations the MHCA places on mental-health records, which — alongside DPDP — inform the isolation contract in §5.

### C. Research aspiration — item-level granularity (self-owned)

This axis is a _future self-owned capability_, not an external dependency, and is named as such to avoid overclaiming a pipeline that does not exist.

Psychometric evaluations are modeled at **item level** (question-by-question), not aggregate-score-only, so that granular trend analysis and clean anonymized export remain possible later. This generically aligns with open-science and longitudinal-research norms; it is **not** tied to any specific named external repository. (The source draft named the NIMHANS CALM-Brain project as an integration target — that is a category error: CALM-Brain is a deep-phenotyping research cohort built on neuroimaging, genetic, and stem-cell data for five specific disorders, not an interoperability standard a community workbench connects to. It is removed as a target; if research framing is wanted at all, it appears only as generic open-science context.)

---

## 5. Privacy and isolation architecture

### A. Semantic isolation of psychotherapy notes

The model enforces a **hard separation** between standard progress notes and raw psychotherapy notes:

- **Standard_Progress_Note** (SOAP / DAP / BIRP) is treated as shareable medical metadata — eligible, with consent, for the encounter bundle and future ABDM export.
- **Protected_Psychotherapy_Note** (raw session analysis, the therapist's working reflections) is **quarantined**: it is structurally excluded from any shareable surface and can never be crawled, synced, or routed into an export pipeline.

**Why the isolation (re-grounded for the actual jurisdiction).** The source draft justified this via a "psychotherapy notes" legal carve-out — that is a US HIPAA concept (45 CFR), and **India's DPDP Act 2023 has no equivalent**: it does not even define a separate "sensitive personal data" category, treating all personal data uniformly. The isolation is therefore grounded instead on:

1. **Clinical and ethical practice** — process notes are the clinician's private working analysis, qualitatively distinct from the shareable medical record; keeping them separate is long-standing professional norm.
2. **DPDP data-minimization and purpose-limitation** — these notes are not required for continuity of care or for exchange, so isolating them from any shareable/exportable surface is the minimization principle made structural.
3. **MHCA 2017 confidentiality protections** for mental-health information.
4. **FHIR cleanliness** — they do not belong in any exchange-bound Encounter/Composition bundle.

**HIPAA as a credibility signal (not a compliance claim).** The isolation boundary deliberately _mirrors_ HIPAA's separate-authorization treatment of psychotherapy notes. Because that carve-out is stricter than anything Indian law currently requires, a design satisfying it meets the stricter international bar and eases future alignment should the system ever operate in a HIPAA-governed context. This is a best-practice signal only; full HIPAA compliance is a system-level concern (administrative, physical, and technical safeguards beyond the schema) and is explicitly _not_ asserted by this data model.

### B. The shareable-vs-quarantined boundary as a model contract

The shareable/quarantined distinction is a **first-class property of the model**, not an application afterthought. Every clinical entity is classifiable as shareable medical metadata or quarantined. The application enforces the boundary, but the model declares it — which is what makes the future "transform shareable rows into a FHIR bundle, leave quarantined rows untouched" step safe and mechanical.

### C. Dependencies on external ADRs

The isolation guarantees above presuppose decisions owned elsewhere. This spec depends on, and should be read alongside, the project ADRs governing:

- **Encryption key management** for the local store (the strength of any "quarantine" rests on this).
- **Audit and access logging** (clinical records need tamper-evident access trails; both DPDP's reasonable-safeguards expectation and MHCA confidentiality point here).
- **Primary-key / identity generation** (client-generated globally-unique identifiers, to support offline-first operation and any future multi-node merge without collision).
- **Encrypted backup/sync** (reconciling "zero data on vendor servers" with a backup service implies client-side encryption, where the vendor holds only ciphertext).

These are named as dependencies, not decided here.

---

## 6. Boundary restated, and deferred items

**In scope and fixed by this document:** the six profile domains, the patient-rooted entity model, the encounter spine, item-level psychometric capture _as an abstraction_, the SNOMED/ICD coded-triplet commitment, the FHIR-shaped structure, the ABHA placeholders, the MHCA 2017 statutory entities, and the psychotherapy-note isolation contract.

**Out of boundary (sibling specs):** scheduling, billing/payments, intake workflow, outcome-tracking.

**Out of scope by abstraction level (later, post-ADR):** all physical-storage choices — column types, the physical representation of item-level responses, indexing, and DDL. The model commits to _what_ item-level data is; _how_ it is stored is deferred.

**Deferred (parked, not worked):** schema migration/versioning strategy; retention and soft-delete policy (reconciling DPDP storage-limitation with clinical retention norms); consented multi-practitioner / guild sharing (supervision and referral access).

---
