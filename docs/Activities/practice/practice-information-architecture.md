# Practice — Information Architecture Map (Draft v0.1)

**Status:** Draft for reading + debate. Synthesises four existing slices into one
picture, working **backwards from the static prototype** (`practice-proto-handoff/`):

- `practice-functional-design-draft.md` → surfaces + ownership rules
- `practice-data-model-codex.md` → tables
- ADR-505 Amendment 3 → lifecycle/status model
- ADR-506 → CQRS authoring rule (how owned data is written)
- the prototype (`Overview.jsx`, `_stateB.png`, `_check5.png`) → the visual truth

**Why this doc exists.** Each source held one dimension; nobody held the **matrix**
that binds them: *lifecycle stage × entity × surface × capture-command × ownership.*
That matrix is the "big picture" — once it exists, Risk/Safety is just one column,
intake is just a path through it, and the build sequence falls out.

**Not legal advice.** MHA 2017 / DPDP 2023 / Telemedicine 2020 points are design
grounding to verify with counsel.

---

## 1. Mental model (the four invariants everything hangs on)

1. **Client-centric hub.** Practice is the chart: open a person, see and act on
   everything about them. Analogy = VS Code Explorer over the caseload. (§1 draft)
2. **Two buckets — owned vs projected.** Practice *owns* only client-native data
   (profile, circle, consent/legal, documents, risk/safety, its own overlays).
   Everything clinical (notes, appointments, scores, goals, payments) is *owned by
   another Activity* and shown here **read-only** as a projection. Only owned data has
   **commands** (CQRS writes); projections are **queries**; overlays are Practice
   writes *over* a projection (review/pin/flag), never a write to the owner.
3. **Determinism + priming.** The record is a function of the *client*, not the path:
   same client → same Overview + same aspect set, regardless of which lens opened it.
   A lens may **prime the entry point** (initial focus / a context banner) but never
   mutates content. (ADR-0003/0004)
4. **Navigation law.** An Activity switch updates the **Primary Side Bar only**; the
   **Work Area navigates only on an explicit side-bar selection/action**. Authoring is
   never a cross-Activity operation — you launch into the owner via ambient context.
   (ADR-0009)

---

## 2. The Activity constellation

Practice does not stand alone. The MVP catalogue (`docs/Product/Product_Scope.md`):

| Activity | Bundle | Owns | Practice surfaces it as |
|---|---|---|---|
| **Practice** | `ru-soam-practice` | the **Client record** (profile, circle, consent, documents, risk, overlays, lifecycle) | — (it *is* the hub) |
| **Sessions** | `ru-soam.sessions` | progress notes (authoring) | Notes projection + overlays |
| **Schedule** | `ru-soam.schedule` | appointments/calendar | Agenda lens + Appointments projection; minor cmds (confirm/no-show) |
| **Assessments** | `ru-soam.assessments` | measures + scoring | Scores & Trends projection |
| **Planner** | `ru-soam.planner` | goals + tasks | Goals & Tasks projection |
| **Billing** *(candidate, O421)* | `ru-soam.billing` | self-pay payments/receipts | Payment-status projection |
| **Audit Viewer** | `ru-soam.audit-viewer` | the audit/consent ledger | consumes Practice's audit events |

Not Activities: **Documents** (a Practice-owned *Aspect* — per-client PHI files),
**Catalog** (reusable non-client assets, ADR-405).

**Suggested catalogue amendments** (debate, then promote into Product_Scope):

- **A1 — Confirm Billing as an MVP Activity (resolve O421).** The Overview projects a
  Payment card in all three view modes; a projection needs an owner. Smallest viable
  Billing = a payments ledger keyed by client, no insurance. Otherwise the Payment card
  stays permanently mock.
- **A2 — Lifecycle stage is a cross-Activity ambient facet, not a Practice-private
  field.** Sessions/Schedule benefit from knowing "this client is `intake_in_progress`
  vs `active`." Stage stays *owned* by `record.patient` (ADR-505 Am3) but is exposed on
  the ambient focused-client context (ADR-0009) so other Activities can read it.
- **A3 — Overview "view mode" (dense / focused / timeline) is a first-class preference
  axis**, like the Activity-Bar density pref — renderer-only, persisted, not an ADR
  surface change. (See §5.)

---

## 3. Surface map — the five slots, instantiated for Practice

(Workbench middle = Activity Bar · Primary Side Bar · Editor/Work Area · Panel ·
Secondary Side Bar — ADR-402.)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ TitleBar:  client://p-priya — Priya Deshpande     [view mode] [layout]     │
├────┬───────────────────┬───────────────────────────┬──────────────────────┤
│ A  │ PRIMARY SIDE BAR  │  WORK AREA (tabbed)        │ SECONDARY SIDE BAR    │
│ c  │ Navigation Aspects│  ┌ Overview ┐┌ Note ┐      │ Contextual Aspects    │
│ t  │  • Roster         │  │ (default)││(art.)│      │ (bound to active      │
│ i  │  • Agenda         │  │          ││      │      │  client; identical    │
│ v  │  • Attention ◀dflt│  │ risk     │└──────┘      │  regardless of lens)  │
│ i  │  • Intake         │  │ banner   │              │  • Risk / Safety      │
│ t  │                   │  │ header   │              │  • Profile            │
│ y  │ [client list for  │  │ badges   │              │  • People / Circle    │
│ B  │  the active lens] │  │ cards/   │              │  • Consent & Legal    │
│ a  │                   │  │ timeline │              │  • Documents          │
│ r  │                   │  │          │              │  • Notes (projection) │
│    │                   │  │          │              │  • Scores & Trends    │
│    │                   │  │          │              │  • Appointments       │
│    │                   │  │          │              │  • Goals & Tasks      │
│    │                   │  │          │              │  • Payment            │
│    │                   │  │          │              │  • Overlays           │
├────┴───────────────────┴───────────────────────────┴──────────────────────┤
│ PANEL (optional): wide contextual aspect (e.g. full timeline / audit)      │
└────────────────────────────────────────────────────────────────────────────┘
```

- **Activity Bar** — Practice is the central item; siblings = Sessions/Schedule/etc.
- **Primary Side Bar** — Practice's four **Navigation Aspects** (lenses): Roster,
  Agenda, Attention, Intake. Selecting a client opens it in the Work Area.
- **Work Area** — **Client Overview** (default tab) + **artifact tabs** (a note, an
  assessment instance, a document). Overview is read/triage; artifacts are
  instance-level.
- **Secondary Side Bar** — **Contextual Aspects** bound to the active client. Owned
  aspects (Risk, Profile, Circle, Consent, Documents, Overlays) + projection aspects
  (Notes, Scores, Appointments, Goals, Payment).
- **Panel** — overflow home for a *wide* contextual aspect (full timeline, audit
  trail) when the secondary side bar is too narrow.

---

## 4. The IA matrix (the centrepiece)

Every Practice data element, placed on all five dimensions. **Owned** rows have
commands and are buildable now; **Projection** rows are queries into Activities that
may not exist yet (render with a source-pill placeholder until they do).

| Element | Bucket / owner | Entity (table) | Captured when | Captured where (surface) | Command (CQRS) | Overview detail | Drill-down |
|---|---|---|---|---|---|---|---|
| Identity / header | Owned · Practice | `patients`,`patient_profile` | referral + intake | quick-add → Profile aspect | `setProfile` | name·age·sex·loc·lang | → Profile aspect |
| Diagnosis / problem list | Owned · Practice | `patient_profile` | intake_in_progress | Profile aspect | `setProblemList` | chips | → Profile aspect |
| Lifecycle stage | Owned · Practice | `patient_lifecycle` | every transition | lens action / Intake | `setStage` | stage chip | → Intake lens |
| Roster status (active/archived) | Owned · Practice | `patients.status` | any time | roster context-menu | `setStatus` (built, O433) | — | roster |
| People / Circle (NR, caregivers) | Owned · Practice | `patient_circle_member` | intake_in_progress | Circle aspect | `addCircleMember`,`setNR` | NR mini | → Circle aspect |
| Consent / legal (AD, capacity, tele) | Owned · Practice | `patient_consent_state` | intake + as changes | Consent aspect | `setConsentState` | badges | → Consent aspect |
| Documents (consent PDF, AD, releases) | Owned · Practice | `patient_document` | intake + ongoing | Documents aspect (inline upload) | `attachDocument`,`removeDocument` | — | → Documents aspect |
| **Risk / Safety** | Owned · Practice | `patient_risk_event` (+ safety state) | any clinical contact | Risk aspect + banner | `addRiskEvent`,`setCapacity`,`toggleException` | **banner (conditional)** | → Risk aspect → safety-plan tab |
| Overlays (review/pin/flag) | Owned · Practice | `patient_overlay` | reviewing a projection | overlay bar on artifact | `setOverlay` | chip | inline |
| Notes | Projection · Sessions | (Sessions) | authored in Sessions | — | overlay only | last-note card | → Notes aspect → note tab → author in Sessions |
| Appointments | Projection · Schedule | (Schedule) | booked in Schedule | — | confirm/no-show minor cmd | next-session card | → Appointments aspect → launch Schedule |
| Scores & trends | Projection · Assessments | (Assessments) | administered in Assessments | — | — | trend card / ministat | → Scores aspect → launch Assessments |
| Goals & tasks | Projection · Planner | (Planner) | planned in Planner | — | — | goals card / ministat | → Goals aspect → launch Planner |
| Payment status | Projection · Billing | (Billing) | recorded in Billing | — | (maybe mark-paid minor) | payment card / ministat | → Payment aspect → launch Billing |

All owned tables carry `residency:'protected'` (O452) — PHI lives in the KEK-wrapped
store, opened on unlock. Every owned command emits an audit event (ADR-502) to the
operational `audit_log` (PHI-free; risk events back-link via `audit_event_id`). All
owned writes are authored under the ADR-506 rule: CQRS-explicit (`bindCommand` /
`bindQuery`), FP-Host-resident, manifest-declared.

---

## 5. The Overview and its three view modes

The Overview is a **dashboard of pointers** — scannable in ~5 seconds, nothing
authored there. The prototype ships **three view modes of the same content** (same
client → same data; only arrangement differs — determinism holds). Treat as a user
preference (amendment A3):

- **Dense** — the full 6-card grid (Next session · Last note · Scores · Goals ·
  Payment · People/Circle). *"Show me everything."* Default for wide screens / chart
  review.
- **Focused** — two prominent cards (Next session, Last note) + an "At a glance"
  ministat strip (PHQ-9, GAD-7, Goals, Payment). *"What matters for today's contact."*
  Default for a session-prep entry.
- **Timeline** — a chronological event stream (upcoming session, risk note, progress
  note, score, AD filed) + a "Standing facts" rail (Circle, meds, language).
  *"Tell me the story."* Best for a returning client / supervision.

These map onto entry-intent: open-from-Agenda-Today → Focused primed on session;
open-from-Attention(risk) → any mode with the risk banner expanded; manual Roster open
→ user's saved default.

---

## 6. Lifecycle & intake — how a client enters the system

The spine. Stages (ADR-505 Am3): `referral · intake · active · on_hold · discharged`
(`patient_lifecycle.stage`, `TEXT` + app-level registry, any→any audited). Principle =
**progressive capture**: grab a lead in seconds, complete the chart over the first
contacts. Never a wall of mandatory fields at first touch.

| Stage | What is captured | Surface | Owner |
|---|---|---|---|
| **referral** | name · one contact · source · presenting concern | **Quick-add** (Intake lens "+", <30s) | Practice |
| **intake_scheduled** | first appointment | Schedule (ambient launch) | Schedule |
| **intake_in_progress** | full demographics · language · NR/Circle · informed + tele consent · capacity · AD status · **initial risk screen** · diagnosis · first documents | **Intake checklist** (Work Area centre) feeding each owned aspect | Practice |
| **active** | ongoing notes · assessments · goals · payments | owning Activities | each |
| **on_hold / discharged** | reason · discharge summary ref | lifecycle command | Practice |

**Design move — Intake is a checklist/wizard in the Work Area, not one giant form.**
Each completed item writes through the relevant owned command into its aspect; a
visible completeness state ("Intake 6/9") (a) drives membership in the **Intake lens**
and (b) seeds **Attention** obligations ("consent form missing", "no initial risk
screen"). This is how Intake's `[OPEN]` stages and Attention's `[OPEN]` obligation set
both resolve — they are two readings of the same completeness/lifecycle data.

---

## 7. Documents — when and where

- **Owner:** Practice (`patient_document`: kind, title, storage_ref, mime, sha256,
  linked_kind/id). PHI → protected file store (O452).
- **When:** prompted **contextually**, never as a separate chore. Signed
  informed-consent / tele-consent / Advance Directive / NR authorization / referral
  letter / ID are surfaced as intake-checklist items **and** as inline upload affordances
  in the **Consent & Legal** aspect (which cross-references the filed PDF). Any missing
  required document appears as an **Attention** obligation.
- **Where viewed:** the **Documents** contextual aspect (a per-client file list);
  opening one = an artifact tab.

---

## 8. Drill-down navigation — the zoom ladder

Three depths, consistent across every element. This is the in/out the prototype implies:

```
   Overview card            Contextual aspect              Artifact tab  /  Launch owner
   (glance / triage)   →    (aux sidebar: this client,  →  (one instance)  (author, ambient)
                            one facet in full)
   "last note: 28 May"  →   Notes aspect: all notes     →  note tab (read-only)  → Sessions
   "next: Thu 11:00"    →   Appointments aspect: all    →  —                     → Schedule
   "SI noted"           →   Risk/Safety aspect: history →  safety-plan editor tab (owned)
   header               →   Profile aspect              →  —  (edit in place)
```

- **Depth 1 → 2:** clicking a card opens its contextual aspect (no Work Area nav for
  owned facets that fit the side bar; the aspect just reveals/scrolls).
- **Depth 2 → 3:** selecting an instance opens an artifact tab (projections are
  read-only; owned editors like the safety plan are writable in place).
- **Authoring** always exits to the owning Activity via ambient focused-client — read
  in Practice, author in Sessions, one fluid loop (ADR-0009).

---

## 9. Workflow / UX principles (EHR-grounded)

Patterns from best-of-breed mental-health EHRs (SimplePractice, Jane, TherapyNotes,
Osmind, TheraNest), filtered for a solo India practitioner:

- **Lead with "what needs me today."** Make **Attention** the default landing lens
  (overdue notes, unsigned, unbooked, intake-incomplete, risk-flagged). Highest-value
  surface in every mature EHR.
- **Low-friction add, complete later.** Quick-add referral; progressive intake.
- **Two clicks to chart, one to author.** Roster → client → Overview; Overview →
  launch owner without losing place.
- **Status at a glance.** Badges (AD/capacity/tele), risk banner, lifecycle chip.
- **India / MHA specifics.** NR & Circle prominent (family-involved care, MHA §14
  roles); multilingual (preferred language drives consent notices). Don't over-build
  consent UI — DPDP exempts treatment-purpose processing (draft §8).
- **Degrade gracefully.** Projections from unbuilt Activities show a source-pill
  placeholder, not an error or a blank.

---

## 10. Risk / Safety — the keystone, resolved as a column

The prototype answers the O419 keystone question (`_check5.png`, `Overview.jsx`
`RiskBanner`): **both** — an Overview-top **banner** *and* a dedicated **Risk/Safety
contextual aspect**, the banner expandable to the aspect body ("Details").

- **Banner (conditional):** shows only when an active risk/safety concern exists.
  Headline + meta (`Noted 28 May · Capacity intact · MHA §23 not invoked`) + actions
  (Safety plan, Details).
- **Aspect (always present):** Capacity status · MHA §23 exception state · NR
  engagement · SI status · means restriction · safety-plan status; actions
  **Open safety** / **Log §23**.
- **The convergence:** this is the one place capacity + NR + AD + the §23 lawful
  disclosure meet. Toggling the §23 exception (`toggleException`) and logging a risk
  event (`addRiskEvent`) are **owned commands** that **must** write an audit event
  (ADR-502); the §23 flag lives in `patient_consent_state.confidentiality_exception_active`,
  the events in `patient_risk_event`.
- **PHI rule:** these are renderer-domain commands (ADR-417 pattern) — PHI never enters
  the host; the safety-plan editor is an owned writable artifact (not a projection).

So O419 is no longer "design from scratch" — it is "build this column." The remaining
genuine design work is the **safety-plan editor** content + the §23 logging confirmation
flow, both bounded.

---

## 11. CQRS command inventory (Practice-owned writes)

Authored per ADR-506 (`record.patient` module, FP-Host-resident, manifest-declared,
`residency:'protected'`, audited):

```
setProfile(clientId, patch)                  → patient_profile
setProblemList(clientId, problems)           → patient_profile
setStage(clientId, stage, reason?)           → patient_lifecycle      (built path: Am3)
setStatus(clientId, status)                  → patients.status        (BUILT — O433)
addCircleMember / updateCircleMember / setNR → patient_circle_member
setConsentState(clientId, patch)             → patient_consent_state
toggleException(clientId, on, reason)        → patient_consent_state   + audit (§23)
attachDocument / removeDocument              → patient_document
addRiskEvent(clientId, event)                → patient_risk_event      + audit
setCapacity(clientId, status)                → patient_consent_state   + audit
setOverlay(clientId, target, kind, on)       → patient_overlay
```

Queries (read side): `getOverview(clientId)`, `getProfile`, `getCircle`,
`getConsentState`, `getDocuments`, `getRiskHistory`, `listRoster(lens, filters)`.

---

## 12. Build sequencing (proposal)

Work backwards from the prototype, owned spine first:

1. **Owned record spine (real).** Tables + commands + queries for Profile, Circle,
   Consent, Documents, Lifecycle, Overlays — all under ADR-506. (Risk folds in here as
   §10's column.) This is the bulk of "make the prototype real."
2. **Overview shell + three view modes** (dense/focused/timeline as a preference), with
   owned cards real and projection cards as source-pill placeholders.
3. **Intake checklist + Attention obligations** (both read the same lifecycle/
   completeness data).
4. **Projections become real incrementally** — stand up the *minimal* owning Activity
   behind a card only when its value demands it (e.g. a tiny Sessions note-store to make
   the Notes projection + last-note card real), per the user's "add basic functionality
   under those Activities as it becomes apparent." Mock until then.

This proves module #2 under ADR-506 end-to-end (unblocks O445 full dep-graph) while
delivering the visible product.

---

## 13. Open questions remaining (post-synthesis)

Most of the draft's `[OPEN]`s are now resolved by the prototype + this matrix. What
genuinely remains:

1. **Safety-plan editor content** — the actual fields/structure of the safety plan
   artifact (the only un-prototyped owned editor).
2. **§23 logging flow** — confirmation UX + exactly what is written to audit when the
   exception is toggled.
3. **Note-privacy split** (draft Q5) — progress vs private process notes; a Sessions
   concern, but Practice's Notes projection must respect it.
4. **Billing promotion** (A1 / O421) — confirm as an Activity or leave Payment mock.
5. **Attention obligation set** — final list, now that intake-completeness seeds it.
6. **Promotion test** (draft Q4) — does anything in Practice lift to an Activity.

Settled threads here should promote into **ADR-505 amendments** (matrix + lifecycle/
intake + Risk column) and **Product_Scope amendments A1–A3**.
