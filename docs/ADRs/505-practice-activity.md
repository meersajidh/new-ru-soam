# Practice Activity: roster + Client/Patient record management

**ID:** ADR-505
**Status:** Draft
**Date:** 2026-05-28
**Layer:** domain
**Supersedes:** —
**Superseded by:** —
**Related:** ADR-504 (canonical record ownership), ADR-405 (activity-bar surfaces), ADR-404 (editor model), ADR-403 (workspace = Entity), ADR-407 (context keys), ADR-104 (contribution model), ADR-105 (lifecycle), ADR-410 (bundle host), ADR-301 (PHI minimization), ADR-302 (local-first store), ADR-307 (PHI lock-gate), ADR-502 (audit ledger), [Product Scope](../Product/Product_Scope.md)

## Context

The [Product Scope](../Product/Product_Scope.md) names **Practice** the central Activity:
"manage the practice roster and each person's record." ADR-504 made `ru-soam.core-domain`
the Main-resident owner of the canonical Client/Patient record and exposed the `record.*`
capability namespace, but deferred the method catalogue and each surface's feature cut to
the per-Activity pass (O197).

This ADR is the first such pass. It scopes the Practice Activity's MVP and, because
Practice is the record's primary editor, defines the first `record.patient` method
surface that ADR-504 left open. It opens the MVP "core loop" (Practice → Sessions →
Schedule); the later loop surfaces get their own 50x ADRs and consume the same record.

The data model is fixed by ADR-403: the **workspace is the Entity (the practice)**;
**Clients are records inside the workspace's Local Store** (the roster), not workspaces.
The reserved context keys `patient.activeId` / `record.active*` (ADR-403/407) already exist
for "which client is in focus." PHI-bearing UI gates on
`!workspace.kekLocked && workspace.setupComplete`.

Scope is held deliberately **lean** (data minimization, ADR-301): the smallest record that
makes a roster useful, additive growth later.

## Decision

### 1. `ru-soam.practice` — Bundle-Host Activity bundle

Practice ships as a first-party bundle (ADR-104) running in the Bundle Host (ADR-410),
contributing the ADR-405 shape:

```jsonc
// illustrative
"contributes": {
  "activityBar.items": [{
    "id": "ru-soam.practice.activity",
    "icon": "$(people)", "label": "Practice",
    "viewContainer": "ru-soam.practice.roster",
    "group": "top", "when": "workspace.entityId"
  }],
  "viewContainers": [{ "id": "ru-soam.practice.roster", "title": "Practice" }]
}
```

Activation is **lazy** (ADR-105 default): the item is visible from the manifest at boot;
bundle code activates on first click or first `record.patient` touch.

### 2. `record.patient` method surface (owned by `core-domain`, ADR-504)

These are the methods ADR-504 deferred to O197; Practice, as first consumer, drives them.
All are PHI-flagged, Main-resident in `core-domain`, and route through the base Local Store
(ADR-302). Signatures illustrative; final shape is `core-domain`'s:

- `create(input): PatientRecord`
- `get(id): PatientRecord | null`
- `list(): PatientSummary[]` — the roster (lightweight projection: id, displayName, status)
- `update(id, patch): PatientRecord`
- `setStatus(id, status)` — status transition (a thin convenience over `update`)
- `subscribe(): stream` — change events for renderer reactivity (rides `store.changed`)

The capability **encapsulates** the record: validation, invariants, and audit-on-write
live behind it (§5/§6), not in the Practice bundle.

### 3. Lean record schema (Clinical PHI)

`core-domain` owns the canonical type; MVP fields:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid | |
| `createdAt` / `updatedAt` | epoch ms | |
| `givenName` / `familyName` | string | `displayName` derived; `familyName` optional |
| `contactPhone` | string? | optional |
| `contactEmail` | string? | optional |
| `dob` | date? | optional |
| `status` | `'active' \| 'inactive' \| 'archived'` | default `active` |

The record is **Clinical class** (ADR-302): local-only, never plaintext to cloud,
envelope-encryptable for sync (ADR-303). No free-form clinical notes here — those belong to
Sessions. This is the deliberate minimum; new fields are additive (capability versioning,
O3).

### 4. UI: roster in the side bar, record in the editor area

- **Roster** — the `ru-soam.practice.roster` view container (Primary Side Bar): the client
  list (`record.patient.list()`) + a "New client" action. Status filter is deferred (§Defers).
- **Client record** — opens as an **editor input in the Editor Area** (ADR-404): a
  **form-based** editor (demographics/contact/status), not a prose `BaseEdit` editor. This
  is the platform's first non-prose editor input kind; it composes the ADR-404 generic
  container, not RuEdit/BaseEdit. Opening a client supports tabs (multiple clients open),
  matching the list→editor idiom.

### 5. Context keys + active scope

Opening a client sets, per ADR-403/407: `patient.activeId`, `record.activeKind = 'patient'`,
`record.activeId`. These are the inputs other surfaces' `when` clauses and projection
Aspects (O197) consume. Practice writes the domain `patient.*` / `record.*` namespaces it is
entitled to (ADR-106/407).

### 6. Validation + audit

- **Validation** is a contribution (ADR-104 "validation as a contribution"): the rule
  (e.g. `givenName` required, contact-format) is declared once, consumed at the Renderer for
  live feedback and **enforced in `core-domain` on write**.
- **Audit-on-write** (ADR-502): `create` / `update` / `setStatus`, and record **view**, emit
  audit entries at the `record.patient` capability boundary in `core-domain` — one site, not
  per-consumer. (This is the first real PHI surface to exercise the ledger beyond the stub.)

## Defers (named targets)

- **Documents Aspect** (client PHI files) → a later O197 pass; consumes `record.patient`.
- **Session / Assessment / Schedule / Planner linkage** → those Activities' own ADRs (506+).
- **Projection Aspects** ("this client's sessions" on Practice) → O197, once Sessions exists
  (this is the O70 residual per ADR-504).
- **Roster search / filter / sort / bulk ops / merge-dedupe / import-export** → Practice v2 (O197).
- **Custom / configurable demographic fields, address, emergency contact, pronouns,
  referral source** → post-MVP additive.
- **Client/Patient label** — already handled: configurable via `ProductConfigService`
  (ADR-106 / Product Scope); the type and namespace stay `patient`/`record`.

## Consequences

### Positive

- The first usable clinical surface; begins closing ADR-405 §Negative's "empty workbench at
  launch" risk.
- Exercises the ADR-504 ownership model end-to-end (Bundle-Host consumer → Main-resident
  PHI-flagged capability → base Local Store), validating it before Sessions/Schedule pile on.
- Establishes the **per-Activity ADR template** for 506+ (catalogue → bundle ADR → build).
- Audit + lock-gate get their first real (non-stub) PHI workout.

### Negative

- A lean schema will grow; each additive change touches the `record.patient` contract
  (versioning, O3). Accepted — additive growth beats speculative fields.
- Introduces the **first form-based editor input** in the Editor Area (ADR-404); the editor
  model has only hosted prose so far. Bounded new work, but new.
- Real PHI now flows where only a stub did — the lock-gate, audit, and at-rest paths must be
  correct, not merely wired.

### Neutral

- Practice is the record's **editor**, `core-domain` is its **owner** (ADR-504) — distinct
  roles, same capability. Disabling/replacing the Practice bundle does not remove the record.

## Considered Options

- **Roster in side bar + record as an Editor-Area editor** _(chosen)_ — matches the
  list→editor idiom; the record is a first-class openable artefact; supports multiple clients
  open as tabs; aligns with Sessions/notes, which will need the editor area.
- **Master–detail entirely in the Primary Side Bar** — _Rejected_: bypasses the editor area,
  can't open two clients, and reads worse once Sessions attaches notes to the open client.
- **Fuller intake schema now** — _Rejected_: more PHI and form surface than MVP needs; against
  ADR-301 minimization. Deferred to additive growth.
- **Practice owns the record (no `core-domain`)** — _Rejected_ in ADR-504 (couples every
  Activity to the Practice UI; record dies if Practice is disabled).

## Open Items

- **O197** — residual Practice v2 (search/filter/sort/bulk/import-export), the Documents
  Aspect pass, and the projection Aspects (O70 residual).
- **O3** — capability versioning applies to `record.patient` as the schema grows.
- The form-based editor input kind consumes ADR-404; no new contribution point is needed
  (the editor model is already a generic container). Flagged for the build brief, not an
  open item.

> Implementation is a later phase with its own brief: the `core-domain` `record.patient`
> capability + schema + audit/validation wiring, and the `ru-soam.practice` bundle (roster
> view + form editor). This ADR commits the scope only.

---

## Amendment 1 (2026-05-29) — functional design target + phasing

A functional design conversation for Practice (its own design journal, `ADR-0001…0015`, under
[`docs/Activities/practice/`](../Activities/practice/), reconciled by
[`adr-crosswalk.md`](../Activities/practice/adr-crosswalk.md)) has produced the **target shape**
of the Activity. This amendment promotes the **settled** decisions as the destination the
original (lean) decision is heading toward. **The committed build scope is unchanged** — slice 1
remains the lean roster + record-form editor in §4. OPEN design threads are *not* promoted here;
they are tracked as **O419 / O420 / O421** and stay in the journal until settled.

### A1. Navigation Aspect model (target — journal 0001/0002/0006)

The Practice Primary Side Bar carries **four Navigation Aspects** (ADR-405 view containers within
the Practice activity), distinguished by *membership/purpose*, not arrangement:

- **Roster** — the canonical client set; sort / group / filter / search are *arrangement*
  controls on one set (group-by-diagnosis, sort-by-tenure are controls, **not** separate lenses).
  This is **slice 1**.
- **Agenda** — time-ordered clients (Recent / Today / Upcoming); a **read/launch projection of
  Schedule**. Deferred until Schedule exists.
- **Attention** — system-derived obligations (overdue note, no next appointment, review-due,
  risk-flagged, payment-pending). Obligation set is OPEN → **O419**.
- **Intake** — the pre-active pipeline. Stages depend on the lifecycle model → OPEN, **O419**.

Test (journal 0002): *changes the set/intent → its own Aspect; only re-arranges the same set → a
Roster control.* A client may appear in several Aspects at once.

### A2. Open-client experience (target — journal 0001/0003/0004)

- Selecting a client sets the **active-client context** (the ADR-403/407 `patient.activeId` /
  `record.active*` keys already exist) **and** opens a **Client Overview** as the default editor
  tab (ADR-404). Finer artifacts (a note, an assessment instance, a document) open as their **own**
  tabs. Contextual Aspects bind to the **active client**, persisting across artifact tabs.
- **Determinism:** the same client always yields the same Overview and the same set/placement of
  Contextual Aspects, regardless of which Navigation Aspect opened it.
- **Priming, not mutation:** a Navigation Aspect may set the Overview's *initial focus / default
  action* (open-from-Agenda → today's session prep; open-from-Attention → the overdue item) but
  never changes content or the aspect set. This generalizes the shell navigation law (ADR-407):
  an Activity switch updates the Primary Side Bar only; the Work Area navigates only on explicit
  selection/action.

### A3. Contextual Aspect inventory (target — journal 0007/0010/0011/0014)

Bound to the active client; identical regardless of Navigation Aspect. Two categories:

- **Read-only projections** (owned elsewhere, surfaced read-only; ADR-504 §5 consumption rule):
  Notes (Sessions), Scores & Trends (Assessments), Appointments (Schedule; minor owner-exposed
  commands like confirm/no-show where Schedule offers them), Goals & Tasks (Planner), Payment
  status (Billing). All deferred until the owning Activity exists (506+); cross-Activity
  projection degraded-state is the O70 residual under O197.
- **Practice-native** (domain data-authority, Main-resident per ADR-504; *not* Bundle-Host
  storage): Profile (preferred language, medication-awareness, diagnosis), People/Circle
  (Nominated Representative, caregiver, family, emergency contact), Consent & Legal (structured
  facts — AD / informed-consent / capacity / confidentiality-exception, cross-referencing
  Documents), Documents (per-client PHI files), Risk/Safety (**keystone, OPEN → O419**), Overlays
  (Practice's own review/pin/flag annotations on projections — journal 0010, ownership granularity
  → O420).

**Cross-activity rule (journal 0007/0010):** projection = read; cross-activity navigation-launch =
forbidden; command = a delegated *minor* owner-exposed write; overlay = Practice's own annotation,
never an owner write. Authoring is never a cross-activity operation. This is consistent with
ADR-504 §5 (consumers bind capabilities; one writer per record type).

### A4. Adjunct data ownership + residency (clarifies, defers granularity → O420)

The functional design implies Practice-native adjunct record types (profile, circle, lifecycle,
consent, document, risk, overlay). Per ADR-504, all PHI data-authority is **Main-resident**:
these become **`record.*` capability members owned by `core-domain`** (or, for genuinely
Practice-native annotation like overlays, a sibling Main-resident Practice-domain capability) —
**never Bundle-Host storage**. The Practice bundle consumes them. The exact member split (what
sits under `record.patient` vs sibling capabilities) and the per-table schema are deferred to
**O420**, built additively per slice. Derived read models (Overview snapshot, Aspect memberships)
are computed views, not source-of-truth tables.

### A5. India regulatory grounding (journal 0012/0013)

The MVP launches in India; the governing instruments for a solo practitioner are MHA 2017, DPDP
2023, and the Telemedicine/Telepsychiatry Guidelines 2020 (*design grounding, not legal advice*).
Consequences already aligned with committed ADRs: local-first PHI-on-device **is** the compliance
posture (ADR-301/302); the audit/consent ledger carries statutory weight (ADR-502); DPDP
data-principal rights (access/correct/erase) must be supportable. MVP **excludes**:
insurance-claim machinery, ABDM/ABHA, multi-practitioner/clinic registration, client-facing
portal — consistent with ADR-501 (Individual tenancy). India-specific record objects (NR, AD,
capacity, informed consent, confidentiality-with-exceptions) converge at the Risk/Safety keystone
(O419).

### A6. Phasing

Slice 1 = the lean §4 scope (Roster Aspect + Client record form editor + Overview frame with
projections stubbed). The rich Overview + projection Aspects fill in as each owning Activity ships
(506+); the Practice-native clinical aspects (Risk, Consent & Legal detail, lifecycle/Intake)
land as O419 design closes and O420 data model is cut, additively.

## Amendment 2 (2026-05-29) — slice-1 roster UI shipped

The roster view (Bundle-Host iframe, `bundles/ru-soam-practice/view-assets/roster.html`) was
built and CDP-verified. Decisions made during the build, recorded here:

- **Navigation Aspect rendering = segmented tabs** (Roster/Agenda/Attention/Intake), per the
  prototype. (An earlier iteration used collapsible tree sections; superseded by the tab layout
  on the user's call — a UI-rendering choice, mechanism unchanged.) Only **Roster** is live;
  the other three are "coming soon" placeholders (no mock data) until their owning
  Activities/models exist.
- **Roster search + grouping pulled forward from O197 (partial):** a live "Filter clients" search
  (matches `displayName`) and a **Group: None / Status** control shipped in slice 1. Grouping by
  **Diagnosis / Language is deferred** — those fields are not in the lean schema (they belong to
  the `patient_profile` adjunct, **O420**); they were **not** stubbed with fake data. Sort / bulk /
  merge / import-export remain O197.
- **Brand UI font (Inter Tight)** is vendored into the bundle's `view-assets/fonts/` and
  `@font-face`'d over `view://` (CSP `font-src view:`) — the sandboxed iframe must not reach the
  renderer's CDN webfonts (ADR-203). Per-bundle vendoring is a known duplication debt; the shared
  `view://_platform_/fonts/` refactor + the renderer's offline-CDN debt are tracked as **O422**.
- Row content stays lean: status **dot** (active/inactive/archived) + `displayName` + optional age
  derived from `dob`. No diagnosis/sex (not in schema).
- **View owns its header.** To match the prototype's single-row "Practice  +" header, the shell's
  `PrimarySideBar` no longer draws the view-container title (`.sidebar-header` removed for iframe
  containers); the iframe renders its own header (title + a "+" icon action wired to new-client).
  Rationale: one iframe = the container's entire UI, so the view owning its title bar (font,
  actions) is the honest fit for this model. Trade-off: future bundle views draw their own header.
  A generic shell-drawn, manifest-declared **view-title-action** contribution (VS Code-style) is the
  longer-term alternative if shell-owned titles are wanted later — not built now.

## Amendment 3 (2026-06-02) — lifecycle/status model resolved (O419 thread 1)

Promotes the first settled **O419** design thread: the client **lifecycle/status model**. This
unblocks the **Intake** Navigation Aspect (Am1 §A1) and seeds the **Attention** obligation set.
The Risk/Safety keystone, full Attention obligation set, and note-privacy split remain OPEN under
O419. Data-model granularity tracked under O420; this amendment cuts the `patient_lifecycle`
increment.

### A3.1 Two orthogonal axes (status ⟂ stage)

`patients.status` (shipped: `active | inactive | archived`) and the new clinical **lifecycle
stage** are **orthogonal** — they answer different questions and are maintained independently
(the data-model codex's "do not overload `status` with intake"):

- **`patients.status`** — *roster shelf / visibility*. Practitioner-controlled archival state.
  Drives the roster dot + visibility (ADR-505 §4, O433 `setStatus`). **Unchanged by this
  amendment** (no derivation from stage).
- **`patient_lifecycle.stage`** — *where the client sits in the care pathway*. Does **not** govern
  roster visibility. A `discharged`-stage client may stay `status:active` (visible) until the
  practitioner archives them; an `on_hold` client is still `status:active` (you are tracking them).

Nominal overlap (both enums contain `active`) is accepted — they are distinct verbs on distinct
surfaces.

**Future (status axis): optional inactivity auto-tag.** The system *may* auto-set `status:inactive`
when a client "drops off" — no upcoming scheduled appointment for a configurable idle period.
This is an **opt-in** practitioner setting, **distinct from lifecycle stage**, and depends on the
**Schedule** Activity (appointment data) which does not yet exist → **recorded as a future hook,
not built this slice**. MVP `status` remains practitioner-controlled (O433). When built it lands as
a scheduled core-domain sweep that emits the same `setStatus` audit; the practitioner can always
override back to `active`.

### A3.2 Stage set — lean, extensible, cyclic

Stages (lean MVP set): **`referral` · `intake` · `active` · `discharged`**, plus **`on_hold`**
(an active client temporarily suspended). `referral` subsumes waitlist for MVP (the two
intake sub-stages of the codex's full pipeline are collapsed; revisit if the Intake board needs
finer granularity).

- **Cyclic, not a linear DAG.** The care pathway loops: relapse/return (`discharged → active` or
  `discharged → intake`), suspend/resume (`active ↔ on_hold`). **MVP enforces no transition
  graph — any stage → any stage is permitted.** Every transition is **audited** (ADR-502,
  `record.patient.lifecycle.changed`) with an **optional reason**. A directed-graph constraint is a
  later option, deliberately deferred — over-constraining a genuinely cyclic clinical reality is
  premature.
- **Extensible without migration.** `stage` is stored as **`TEXT` with no DB `CHECK` constraint**;
  validity is enforced at the capability layer against an app-level **`LIFECYCLE_STAGES` registry**
  (ordered list, in `core-domain`). Adding/renaming a stage = a registry edit, **zero schema
  migration**. (User-customizable stages — a config table — are out of MVP scope; this is
  *developer*-extensibility.)

### A3.3 Ownership, residency, capability surface

Lifecycle is canonical per-client clinical state (not an annotation/overlay), so it lands under
the existing **`record.patient`** capability (`core-domain`, **Main-resident**, PHI-flagged —
ADR-504), *not* a sibling capability and *never* Bundle-Host storage (ADR-410). New methods:

- `getLifecycle(id): { stage, stageUpdatedAt, stageReason } | null`
- `setStage(id, stage, reason?)` — validates `stage` against `LIFECYCLE_STAGES`; rejects unknown
  ids (NotFound) and locked workspace (ADR-307); audits `record.patient.lifecycle.changed`
  (ADR-502); `emitTableChange('patient_lifecycle')` so consumers reload.

Schema (O420 increment) — `patient_lifecycle(patient_id PK/FK, stage TEXT NOT NULL, stage_updated_at
INTEGER NOT NULL, stage_reason TEXT)`. **Every patient has exactly one row.** Migration backfills
existing patients to **`stage:'active'`** (non-disruptive — matches today's behavior); new patients
created via the record form default to `active`.

### A3.4 Intake aspect (build target)

The stubbed **Intake** tab (Am2) becomes live: it lists clients in **pre-active stages**
(`referral`, `intake`), grouped by stage, and offers **stage-advance actions**. Per the O433
pattern, stage transitions are **renderer-domain commands** (`src/domain/bootstrap.ts`, binding
`record.patient@1.0` → `setStage`) so PHI never enters the Bundle Host. Stage can also be set from
the Roster row context menu (reuses the same commands). `on_hold`/`discharged` clients are **not**
shown in Intake (Intake = pre-active pipeline); they remain on the Roster per their `status`.

### A3.5 Attention seed (not yet built)

Lifecycle unblocks two Attention obligations conceptually — *intake-in-progress with no next step*
and *on-hold past a review threshold* — but the **Attention aspect stays stubbed** until the full
obligation set (which mostly needs Schedule/Sessions projections) is designed. Recorded here only
as the dependency direction; no build this slice.

## Amendment 4 (2026-06-05) — Information Architecture map + build plan; Risk/Safety resolved

Promotes the Practice **Information Architecture** synthesis. Two new design artifacts in the
journal are the working source of truth; this amendment records the decisions they settle:

- **`docs/Activities/practice/practice-information-architecture.md`** — the IA matrix
  (*lifecycle stage × entity/table × surface × capture-command × ownership*), the surface map, the
  three Overview view modes, the lifecycle/intake capture path, and the drill-down zoom ladder.
- **`docs/Activities/practice/practice-build-plan.md`** — release-phased build order (P0 legibility →
  P1/P2 owned spine → P3 documents → P4 Risk → P5 modes/Intake/Attention → P6 projections).

These were produced by **working backwards from the static prototype** (`practice-proto-handoff/`),
which encodes more decisions than the functional draft's `[OPEN]`s admitted.

### A4.1 Risk/Safety keystone resolved — **both** banner + aspect (closes O419 thread 1 of the keystone)

The prototype (`Overview.jsx` `RiskBanner`, `_check5.png`) settles the long-open
*dedicated-aspect vs banner vs both* question: **both.**

- **Conditional Overview banner** — shows only on an active risk/safety concern; headline + meta
  (`Noted … · Capacity intact · MHA §23 not invoked`) + actions (Safety plan, Details); the
  "Details" affordance expands the banner into the aspect body.
- **Always-present Risk/Safety contextual aspect** — capacity · §23 exception state · NR engagement ·
  SI status · means restriction · safety-plan status; actions **Open safety** / **Log §23**.
- **Convergence + logging** — `addRiskEvent` (→ `patient_risk_event`), `setCapacity` and
  `toggleException` (→ `patient_consent_state.confidentiality_exception_active`) are **owned
  commands that MUST emit an audit event** (ADR-502). Renderer-domain commands (ADR-417) — PHI
  never enters a host. The safety-plan editor is an **owned writable artifact tab** (not a
  projection).

**Residual (still O419):** the safety-plan editor field set + the §23 confirmation UX — bounded;
designed at the start of build Phase 4.

**RESOLVED 2026-06-06 (P4 built — O460).** Residual closed: (a) **safety-plan** = India-adapted
Stanley-Brown 7-field `patient_safety_plan` (warning_signs · coping · social_settings · help_contacts
[NR-as-primary, MHA §14] · professional_agencies [**Tele-MANAS 14416** seeded] · means_restriction
[pesticide/ligature/family-held custody — verified India's leading means] · reasons_for_living) +
status + shared_with_nr, as an owned writable editor tab (`safety-plan.html`). (b) **§23 flow** =
reasoned in-aspect confirm: `toggleException(active, {ground, disclosedTo, reason})` where `ground` ∈
the bounded MHA-2017-§23 exception enum (`harm_to_others`·`threat_to_life`·`nr_duty`·`professional_care`·
`authority_order`), honoring "only such information as is necessary"; flips the consent flag **and**
writes a `s23_disclosure` `patient_risk_event`. **PHI invariant verified:** reason/disclosedTo + risk
summaries + plan text live only in row columns; audit detail is enum-only (full-ledger scan = zero PHI).

### A4.2 Overview is a dashboard of pointers, with three view modes

Nothing is authored in the Overview; every tile is a triage pointer (glanceable in ~5 s). The
prototype ships **three view modes of the same client function** (determinism holds — same content,
different arrangement):

- **Dense** — full 6-card grid. *"Show me everything."*
- **Focused** — two prominent cards + an "At a glance" ministat strip. *"What matters today."*
- **Timeline** — chronological event stream + a "Standing facts" rail. *"Tell me the story."*

View mode is a **persisted user preference axis** (renderer-only, like the Activity-Bar density
pref) — **not** an architectural surface change, **no further ADR** (tracked O-VIEWMODES). Entry
intent may select a mode (e.g. open-from-Agenda-Today → Focused).

### A4.3 Lifecycle/intake = progressive capture; Intake is a checklist surface

Resolves the Intake `[OPEN]` stages (Am3 §A3.4) into a capture model: **grab a referral in
seconds, complete the chart over the first contacts.** Intake renders as a **checklist/wizard in
the Work Area** (not one giant form); each completed item writes through the relevant owned command
into its aspect. The visible **completeness state** (e.g. "6/9") is the single data source that (a)
drives Intake-lens membership and (b) seeds the Attention obligation set — resolving Am3 §A3.5's
two threads as two readings of the same data. **Documents** are prompted *contextually* during
intake (and as inline upload in Consent & Legal), never as a separate chore; a missing required
document is an Attention obligation.

### A4.4 Residency reconciliation — ADR-506 supersedes Am3's "Main-resident"

Am3 §A3.3 placed `record.patient` (incl. `setStage`) as **Main-resident** per ADR-504. **ADR-506
has since superseded ADR-504**: Main is pure-`basebench`, `record.patient` command/query logic is
**FP-Host-resident**, persisted via generic base store caps (`store.write`/`store.query`) with
declared table ownership. All Practice-owned commands in the IA matrix and build plan are authored
under the **ADR-506** rule (CQRS-explicit, FP-Host-resident, manifest-declared,
`residency:'protected'` per O452, audited). Wherever Am1–Am3 say "Main-resident" / "Bundle Host",
read the ADR-506 model.

### A4.5 UI maturity-marking (cross-cutting)

Every Practice card/aspect declares its build state on the UI — **Concrete / WIP / Mock** — via a
maturity registry + `data-maturity` attribute + palette-token CSS (extends the prototype
source-pill; always-on subtle, with an optional "highlight build status" toggle). Renderer/bundle
CSS only; convention note in `docs/Guides/styling-system.md`; **no ADR** (tracked O-MATURITY).

### A4.6 Catalogue amendments raised (to Product_Scope)

Three amendments proposed to `docs/Product/Product_Scope.md` (debate there): **A1** confirm Billing
as an MVP Activity (else the Payment projection has no owner — ties to O421); **A2** expose
lifecycle stage on the **ambient focused-client** context so sibling Activities can read it (stays
owned by `record.patient`); **A3** record the Overview view-mode preference axis.

**Open after this amendment:** O419 (safety-plan fields + §23 UX), O420 (data-model increments per
phase), O421 (Billing promotion), O197 (per-Activity projection scoping), plus new tracked items
O-MATURITY / O-BLOBSTORE / O-VIEWMODES / O-ATTENTION (see build plan + Open_Items).
