# New-Client Intake — Stage Definition Discovery

**Status:** LIVING / in-progress. Discussion capture, not settled design. No ADR yet.
Sibling of `client-onboarding-discovery.md` (queue/doors/form-ingestion); this doc zooms
into the **pre-client stage itself**: what the introduction/screening process *is* in the
problem domain, independent of our system. Research + decisions 2026-07-12.

**Shape of the doc:** §1 the unit (case) → §2 the stage (naming + commitment pivot) →
§3 the process (input/processing/shape/terminals) → §4 variation (templates + practice
profile). All four are DECIDED; §5 lists what this exported to other threads.

---

## 1. The CASE — unit of engagement [DECIDED 2026-07-12]

**Queue item + Intake run = case** (unit of engagement). Persons = separate identities
linked to the case. Solo-adult case = 1:1, the degenerate (and most common) form.
**Dedup/merge machinery operates on persons** (`resolveParticipant` +
`patient_identity_alias` from ADR-509), not cases — the inquirer's spouse may already be
an existing individual client (person merge) while the couple case is new.

### 1a. Attachment scoping

| Artifact | Scope |
|---|---|
| Consent (informed/tele; guardian consent + minor assent) | per **person** |
| Risk screen · risk events · safety plan | per **person** |
| Biopsychosocial capture | per **person** |
| Engagement contract (fee, cadence, session plan) | per **case** |
| Commitment event | per **case** (evidence may come from any responsible party) |
| Intake run status + terminal outcome | per **case** |
| Case history (session notes, assessments, treatment plan within the engagement) | per **case** |
| Client journey (narrative across engagements) | per **person**, aggregates across cases |

### 1b. Implications of the case as the unit

1. **Inquirer ≠ subject of care.** An inquiry has a *contact person* (who reached out)
   and one or more *subjects of care* — parent inquiring for a teen, NR for a relative.
   The contact may never become a client. Queue item must carry both roles.
2. **Screening screens the case.** Fit includes case-type ("do I treat couples?");
   urgency/risk still screens each person.
3. **Enrollment fans out.** Task threads get a scope axis: `task.scope ∈ {case, person}`.
   Per-person: consent, biopsychosocial, screeners. Per-case: engagement contract,
   session plan. A couple intake = one case run, two person task-sets, one contract.
4. **Enrollment output = N person records + 1 case linking them.** Today's built
   `patients` table = persons; the case concept is new (partially adjacent to
   `patient_circle_member` relationships).
5. **Case composition is mutable during intake.** One partner drops → case enrolls with
   changed composition (couple → individual). Terminal outcome stays case-level;
   membership changes are recorded, not a new run.
6. **Case history is case-scoped.** Sessions, session notes, in-engagement assessments,
   and the treatment plan belong to the case — the clinical record of *this engagement*.
   A person in two concurrent cases (individual + couples) has two distinct case
   histories.
7. **Client journey is person-scoped and spans cases.** The person-level narrative
   ("where in care, over time") aggregates across that person's cases — past individual
   therapy, current couples work, a later return. The status family from
   `client-onboarding-discovery.md` §2 splits accordingly: *clinical journey* = person
   axis; *case/run status + case history* = case axis.
8. **Within-case confidentiality boundary exists** (individual disclosures in couples
   work; per-person vs per-case notes) — journey/notes territory (O501), flagged not
   solved here.
9. **360 profile is person-level but spans cases** — it reads the client journey (person
   axis) and drills into case histories (case axis). → topic 2.

---

## 2. The Intake stage — naming + commitment pivot [DECIDED 2026-07-12]

### 2a. Industry vocabulary (research) — distinct terms, keep them apart

| Term | Clinical meaning | Fit for us |
|---|---|---|
| **Inquiry / first contact** | someone reached out; no commitment yet | the queue-item phase ("lead" = marketing smell; avoid in clinical UI) |
| **Screening** | brief mutual fit-check (15–30 min call): presenting concern, fit, fee, urgency. NOT an assessment — decision is "proceed or refer out" | the pre-commitment gate |
| **Intake** | post-commitment: paperwork (demographics/consent/history) + intake session (biopsychosocial assessment, risk, rapport) + early treatment planning | the data-gathering + first-assessment phase |
| **Assessment** | deeper, licensed-only, multi-session, informs diagnosis | belongs to the clinical journey, not onboarding |

Standard industry workflow: **inquiry → screening → intake paperwork → intake session →
treatment planning** (solidifies over first 1–3 sessions).

### 2b. The naming model

**Umbrella stage = "Intake"** (practitioners recognize it; every EHR uses it). Sub-stages
are grouped by an explicit **commitment pivot**:

```
Inquiry → Screening → [COMMITMENT] → Enrollment (paperwork + engagement contract
                                                 + intake session) → confirm client
                                                        ↓
                              journey owns afterwards: treatment plan, session-plan lifecycle
```

- **Pre-commitment:** *Inquiry* (queue-item phase; never "lead" in clinical UI) →
  *Screening* (mutual fit-check + urgency/risk gate).
- **Commitment = a recorded event with pluggable evidence** — payment received / first
  session booked / explicit mutual agreement. Which evidence counts = practitioner
  preference (template config, §4). Not two cases ("payment OR decision") — one event,
  multiple accepted evidence types. Splits drop-off analytics cleanly: pre-commitment
  drop = lead loss; post-commitment drop = engagement failure.
- **Post-commitment: Enrollment** (named to avoid colliding with "onboarding" =
  the whole entry story in `client-onboarding-discovery.md`): intake paperwork +
  **engagement contract** + intake session.
- **Intake concludes with an explicit user confirmation of client status** — no
  auto-conversion.
- **Early treatment plan is NOT inside Intake** — treatment planning solidifies over
  sessions 1–3, i.e. the person is already a client; the plan is the first step of the
  clinical journey (topic 2's territory). Keeps Intake bounded.

### 2c. Engagement contract + session plan (seeded at Enrollment)

From practitioner interview notes (session-plan doc, 2026-07): the practice needs a
**session plan** — a flexible ongoing cadence agreed tentatively, confirmed one session
at a time (confirm-by-deadline or the slot releases), with reschedule/cancel rules,
ad-hoc/emergency windows, and a priority backfill queue.

- **Session plan ≠ treatment plan — different artifacts, keep both.** Treatment plan =
  clinical (goals, modality, diagnosis) → journey. Session plan = *engagement contract*:
  cadence + booking discipline + fee terms. Logistics, not clinical.
- **Enrollment seeds the engagement contract:** fee structure + sliding-scale default,
  cancellation-policy acknowledgment, initial session plan (cadence, preferred slots,
  modality). Interview notes verbatim: "clients need to be onboarded individually and the
  applicable fee should be defined, along with sliding scale and other details."
- **Seeded ≠ owned.** Session plan is a living object — confirmed/revised per session
  forever. Enrollment instantiates v1; ongoing engagement (Schedule/Sessions domain) owns
  its lifecycle. Same pattern as treatment plan: intake seeds, journey owns.
- **Payoff: the plan makes booking-pattern signals computable.** Deviation becomes
  well-defined (unconfirmed planned sessions, reschedule rate vs plan, gap vs agreed
  cadence) instead of fuzzy heuristics over raw bookings. Feeds the "engagement level"
  status family (= derived from plan adherence) and gives the 360 journey timeline its
  forward-looking half.
- **Commitment tie-in:** engagement-contract agreement (first payment / first planned
  booking) is natural commitment-event evidence.
- **Scope discipline:** confirm-deadline mechanics, slot release, priority queue,
  backfill, slot-value economics = Schedule/Sessions design thread, separate discussion.
  Here we only decide: *Enrollment includes agreeing the engagement contract, session
  plan v1 included.*

---

## 3. The process — input, processing, shape, terminals

### 3a. Input

Referral source + channel; minimal identity/contact; presenting concern (one line);
logistics constraints (availability, fee tolerance, modality online/in-person);
optionally prior records / referral letter.

### 3b. Processing

1. **Fit determination** — competence match ("do I treat this?"), schedule, fee.
2. **Urgency / risk screen** — active crisis → immediate refer-out to crisis service.
   Earliest branch; must exist before any paperwork.
3. **Expectation-setting + consent** — informed consent, tele-consent, confidentiality
   limits, fees/cancellation (APA/ACA requirement; MHA-2017 NR/AD in India).
4. **Data gathering** — biopsychosocial capture (= the thread/task status family in
   `client-onboarding-discovery.md` §2, with the `{case, person}` scope axis, §1b.3).
5. **First assessment** — intake session: risk assessment, provisional formulation, goals.
6. **Disposition decision** — accept / refer-out / decline.

### 3c. Shape — directed graph, but constrained

Multi-step yes, branches yes — but **not a DAG, and not an arbitrary graph either**:

- **Linear spine with early-exit edges** — a funnel. Every non-enrolled outcome is an
  exit edge off the spine (crisis exit at screening, refer-out at fit-check, decline at
  intake).
- **Loops exist** → cyclic: reschedule / no-show; no-response → follow-up nudge (industry
  norm: gentle follow-up over ~2 weeks, then drop); waitlist → re-activate.
- **Parallel task threads** hang off spine nodes — consent items, forms, screeners run
  concurrently and don't order among themselves. These are thread/task statuses, not
  graph nodes.

Stepped-care / triage literature uses the same structure: assessment → screening → triage
→ route-to-level-of-care, a standardized pathway with branch points.

**Modeling stance:** directed graph, yes — but resist a generic workflow engine. Better
mental model: **milestone states on a spine (few, fixed shape) + branch/exit edges +
attached task checklist (varies by template, §4)**. A solo practitioner won't author
BPMN; they want "where is this person + what's pending".

### 3d. Terminals [DECIDED 2026-07-12]

Two dimensions, not one: **terminal + exit node** (inquiry / screening / commitment /
enrollment). Every terminal records where on the spine it happened — pre- vs
post-commitment drop analytics fall out free. Enum stays small:

| Initiator | Terminal | Notes |
|---|---|---|
| mutual | **enrolled** | Enrollment completed + explicit client-status confirmation (§2b). Output = N person records + 1 case with populated baseline: demographics, consent state, presenting concern, risk baseline, engagement contract. = seed of the 360 profile. Records case composition at enrollment (§1b.5). |
| practitioner | **referred-out** | redirect with destination + reason recorded (fit, crisis, capacity). Crisis = referred-out + urgency flag, not its own terminal. |
| practitioner | **declined** | ends without referral. Rare — APA/MHA ethics push toward always referring. (Renamed from "rejected": harsh in clinical UI, and reads backwards.) |
| client | **dropped** | ghost *or* explicit "no thanks" — sub-reason recorded (no-response, cost, timing, chose-other). Industry treats drop-off as a designed-for metric. |
| administrative | **merged** | duplicate resolution (person-level merge, §1). NOT a funnel outcome — exclude from conversion/drop-off metrics; terminal only for run bookkeeping. |

**Pause states are not terminals:** waitlisted + deferred ("come back in 3 months") live
on the spine — they loop back (re-activate) or age out into *dropped*. Recorded as state,
not outcome.

Post-commitment money questions (refund on post-payment drop) = payments thread, out of
scope here.

Plus process artifacts regardless of outcome: audit trail, drop-off analytics. Refines the
run-status enum in `client-onboarding-discovery.md` §2 (converted→enrolled,
rejected→declined, +referred-out).

---

## 4. Variation — templates + practice profile

### 4a. Research: variation by practitioner / case type

Content differs; topology mostly doesn't:

- **Psychiatrist:** adds medical history, medication reconciliation, mental-status exam,
  sometimes labs; often requires a referral letter; output may include a prescription.
- **Psychologist / therapist:** biopsychosocial + formulation + therapy goals; no medical
  workup.
- **Child / adolescent:** guardian consent, parent interview, school inputs — multiple
  respondents per case.
- **Couples / family:** multiple persons per case — unit-of-care differs (→ §1).
- **Assessment-only practice:** fixed psychometric battery; report is the output; no
  ongoing care.
- **India:** MHA-2017 NR/AD consent artifacts, WhatsApp-first contact, fee+UPI instead of
  an insurance-verification step, heavy family involvement, walk-in / word-of-mouth
  referral culture.

**Invariant spine everywhere:** contact → fit/urgency check → mutual agreement →
data-gather → first assessment → disposition. Variation = *which capture items exist and
which nodes are skipped*, not a different graph shape.

### 4b. Template model [DECIDED 2026-07-12] — spine = product, template = content

**Fixed spine — not configurable:** `Inquiry → Screening → [Commitment] → Enrollment →
Confirm` + the 5 terminals + follow-up/nudge loops. Fixed because queue UI, drop-off
analytics, and the status machine all hang off it. Nobody edits topology.

**Skips = fast-forward, not node removal.** Trusted-colleague referral / already-known
walk-in → screening recorded as "skipped/implicit", not absent. Analytics stay uniform
(skip-rate itself becomes a signal).

**Migration door falls out free:** migrated clients = queue items entering *deep in the
funnel* — commitment evidence = "existing relationship", fast-forwarded to Enrollment
(= the enrichment path in `client-onboarding-discovery.md`). Same spine, same statuses;
migration just pre-positions items. Confirms the common-queue model.

**Template varies (per case-type profile):**

- Case-type roster: individual / couple / family / minor / assessment-only.
- Checklist content per sub-stage — which task threads: capture items (biopsychosocial
  variant, med-history for psychiatrist), consent artifacts (tele, NR/AD,
  guardian+assent), screeners (PHQ-9/GAD-7 vs full battery).
- Per-case-type fan-out rules (which tasks per person vs per case, §1b.3).
- Engagement-contract fields (sliding scale on/off, bulk payment).
- Accepted commitment evidence (payment vs booking vs verbal).
- Task-thread references → form templates from the template library in
  `client-onboarding-discovery.md` §5b (intake template points at form templates — the
  two libraries link).

**Shipped defaults:** psychologist-India, psychiatrist, child/adolescent, couples,
assessment-only. Practitioner copies + tweaks the checklist, never edits the graph. Same
split as blank-template vs filled-submission in `client-onboarding-discovery.md` §5b:
**spine = product, template = content.**

### 4c. Practice profile — the practitioner-type axis [CONFIRMED 2026-07-12]

Templates imply a second axis beyond case type:

- **Case type** = per queue item, chosen per case.
- **Practitioner type** = property of the *practice*, set once — psychiatrist / clinical
  psychologist / counselor (India: RCI categories + MD psychiatrist). Shapes which
  capture items exist (med reconciliation, prescription, labs), compliance obligations
  (MHA prescribing/admission duties), possibly vocabulary (patient vs client).

Refinements:

1. **Practitioner type = filter, not wall.** Hybrids are common (therapist who also runs
   psychometric batteries). Practice profile *defaults* the template set; everything
   stays reachable.
2. **Sharper model = service catalogue:**

   ```
   practice profile = credentials (practitioner type) + service catalogue (therapy,
                      couples therapy, child, psychometric assessment, psychiatric consult)
   case             = instance of a service × member composition
   template         = keyed by service; filtered/defaulted by practice profile
   ```

   Case type = service type + composition, not a separate enum. Credentials gate the few
   hard items (prescription rights).
3. **Practice-profile setup = first-run experience** → belongs to topic 3 (starting
   point). Flagged, not designed here.

---

## 5. Exported open threads

All discussion points in this doc are CLOSED (§1 case · §2 stage model · §3 process +
terminals · §4 templates + practice profile). What it exported elsewhere:

- Session-plan mechanics (confirm deadlines, slot release, priority queue, backfill,
  slot-value economics) — Schedule/Sessions design thread.
- Within-case confidentiality boundary (per-person vs per-case notes) — O501 Notes.
- Refund/payment consequences of post-commitment drop — payments thread.
- Practice-profile / first-run setup — topic 3 (starting point).
- Client journey + treatment plan + 360 profile — topic 2.

## Sources

SimplePractice intake-process guide · Talkspresso intake/screening/consent · Private
Practice Skills phone-screen · APA services screening-vs-assessment · National Children's
Alliance screening-vs-assessment · Chelsea Psychology psychological-vs-psychiatric
assessment · Raah India private-practice guide · PractiPal India guide · Practice Axis
lead/prospect/client · Singapore stepped-care (PMC12369100) · India task-sharing stepped
referral (PMC9426017). Practitioner interview notes — session-plan proposal (Google Doc,
user-provided 2026-07-12). (Session log 2026-07-12.)
