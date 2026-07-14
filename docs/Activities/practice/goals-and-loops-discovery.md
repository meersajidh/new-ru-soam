# Goals & Catch-up Loops — Conceptual Model Discovery

**Status:** LIVING / in-progress. Discussion capture, not settled design. No ADR yet.
Peer of `client-onboarding-discovery.md` and `new-client-intake-discovery.md` (docs are
peers, not parent-child). Born 2026-07-12 out of the onboarding restart: the question
"what is the end state of onboarding?" produced a model that is bigger than onboarding —
it is a candidate conceptual center for the whole practice domain (goals → activities →
360 view → PHI/disclosure). Everything here is revisitable.

**Origin observation (upstream premise, predates this doc — captured 2026-07-13):**
the whole thread stems from the founding claim: *"Current practice management
software focuses primarily on administration. AI tools focus primarily on
documentation. Neither truly understands how therapists think and work."* Ru-Soam is
the attempt at addressing this misalignment: *"local, privacy-first clinical
workbench, designed by therapists, for therapists."* The goals-and-loops model (§0)
is that claim made structural: competitors model the practice as *transactions*
(appointments, invoices, notes-as-records) or as *documents to generate*; modeling it
as a goal-directed *relationship* progressed by loops is what "understands how
therapists think and work" means concretely. Also quoted in
`docs/Product/Product_Vision.md` (Origin observation section).

**Working stance (user, 2026-07-12):** everything is centered around goals. All
activities exist to fulfill some goal of the practice/practitioner. Model the goals
well and the Activities model becomes neat and natural (an Activity answers "which
goals does this serve?"); the 360 view becomes zoomable by goal lens (zoom out = all
goal domains, hone in = one domain's loop state).

---

## 0. Top-level functional architecture — one relationship, one loop, the instrument of representation [FRAMED 2026-07-12 as "two relationships"; REFRAMED 2026-07-14]

> **REFRAME 2026-07-14 — the system demoted from relationship to instrument.**
> Calling practitioner↔system a "relationship" devalued the term reserved for the
> client bond and over-elevated the tool. Two symptoms: (a) the Subordination
> principle (§0c) had to be stated loudly as [CORE], but an instrument is
> *definitionally* subordinate — needing the principle was evidence the framing
> implied peer-ness; (b) §4's own "EHR category error" (documentation elevated to a
> practice domain) was being committed one level up (the record-keeper elevated to a
> relationship). **New frame: one relationship (practitioner↔client), one loop (the
> practice loop: plan → act → measure → adjust); the system is the instrument of
> representation beneath that loop — the memory the practice thinks with, mirroring
> the practitioner's approach, not a phase of the loop.** Measurement stays the
> practitioner's act (assessment tools, clinical judgment); measurement features
> (screeners, gap views, 360) and execution features (scheduling, payments) are
> *surfaces over the representation*. The representation catch-up loop (§2b)
> survives intact but re-housed: a subordinate maintenance loop keeping the
> representation true, not a peer loop — §0b's substrate logic already said this
> ("measurement runs on what the representation loop delivers"). §5's "system goals"
> become **the five guarantees** — all five are representation-qualities (Fidelity =
> true; Ease = cheap to feed; Reliability = available/never lost; Insight = talks
> back; Custody = safe), which is the confirmation the frame is right.
> Custody/Reliability/Fidelity = guarantee-grade (first two interrupt-class);
> Ease/Insight = pursued qualities under the same word. Vocabulary: **instrument** /
> **engagement** (practitioner↔system dynamics over time) / **guarantees**. "Second
> relationship" and "system-relationship goals" in the sections below are the
> historical framing, kept as capture. `Product_Vision.md` carries the product-facing
> distillation (slimmed to a manifesto 2026-07-14); this doc remains the home of the
> frame mechanics, subordination/authority, means-agnosticism, non-goals, and
> guarantee tiers. Product-facing term for the loop's effect: the representation
> moves **in step** with the practice ("catch-up" projects lag; rhythm language also
> matches the EHR rhythm-misalignment finding). "Catch-up loop" stays the mechanism
> name here — engineering-honest: the mechanism exists to close a gap (claims first,
> proofs after, proof-debt).

The context in which everything below happens. Two relationships, same loop shape at
both levels (the model is recursive — one mechanism, two instantiations):

1. **Practitioner ↔ Client.** Guided by a set of goals wrt the client's mental-health
   challenge (the reason they are engaging). Goals have an **expectation vs reality**
   dimension; the **practice loops** iteratively bring reality closer to expectation —
   using methods of practice and tools of assessment. Success = how they progress and
   maintain that closeness over the course of the engagement.
2. **Practitioner ↔ System.** The system (manual, SaaS, or our product) is a tool —
   a collection of tools of **execution and measurement** — helping the practitioner
   achieve success. This relationship is often overlooked but real, and is itself
   guided by a set of goals (**system goals**) with their own expectation vs reality
   and catch-up loops. System goals define what the relationship is going to be.

### 0a. Directionality flip — two gap types, don't conflate

- **Practice loop:** *reality* is the moving side — methods/assessments push the
  client's reality toward the expectation (therapeutic change). The loop *changes the
  world*.
- **Representation loop (§2b below):** *representation* is the moving side — the
  mirror catches up to reality (recording debt). The loop *tracks the world*.

Both are catch-up loops; they close in opposite directions.

### 0b. Nesting — why the proportionality is causal

The system can only measure through the representation. The practice loop's
measurement half ("is the gap closing?") runs entirely on what the representation
loop delivers. Bad mirror → blind measurement → practitioner flying on memory →
friction and risk. The representation loop is the **substrate** of the practice
loop's feedback signal — so the success of the practitioner–client engagement is
directly proportional to the success of the practitioner–system engagement, as a
causal mechanism, not a correlation.

### 0c. Subordination principle [CORE]

**System goals are derived, never autonomous.** The system relationship succeeds only
insofar as it serves the practice relationships — it cannot be termed successful if
the client relationships are failing. This is where the EHR industry failed: system
goals defined by other masters (billing, compliance, vendor engagement metrics) made
documentation burden the #1 practitioner-burnout driver — the practitioner ended up
serving the system. System-goal success is measured in practice-relationship terms
(friction removed, blind spots lit, time returned), never system-centric ones
(features shipped, usage, data volume). Client relationships succeeding *despite* the
system = system failure, even if every feature "works."

### 0d. Trust — a system-goal ingredient the frame surfaces

The practitioner↔system relationship has its own bilateral facts: custody of PHI
(sovereignty, local-first), fidelity of the mirror (can the practitioner trust what
it reports?), respect for authority (the system never overrides practitioner
attestation — the claim/proof design in §2b already encodes this). Trust goals are
relationship goals with the system, not features.

### 0e. Consequence for enumeration

There are **two goal sets to enumerate, separately**: practice-relationship goals
(clinical / financial / legal-compliance / … — §4) and system-relationship goals (the
meta set), with the second explicitly subordinate to the first (§0c). A single flat
list would conflate the levels.

---

## 1. Two completenesses [DECIDED 2026-07-12]

"Completeness" conflates two different things. Keep them apart:

1. **Reality completeness** — do the engagement facts *exist in the world*? Consent
   actually given, fee actually agreed, fit actually assessed, risk actually screened.
2. **Representation completeness** — is what exists *recorded in the system*?

For a **new client** the two advance in lockstep — facts are captured at the moment
they are created, so one checklist serves both (that is why intake can gate on it).
For a **migrated client** they are fully split: reality ≈ complete (relationship live),
representation ≈ empty. The deficit is purely recording debt; gating on it would block
representation of a relationship that already cleared every real gate.

**Intake closes reality gaps (capture rides along); migration closes only
representation gaps.** Exception: migration can *expose* genuine reality gaps (e.g. no
signed consent ever existed) — the one place migration legitimately borrows intake's
machinery.

## 2. Authorities [DECIDED 2026-07-12]

### 2a. Representation completeness = expected vs provided, system-derived

- The system is the **source of truth of the representation** — for all practical
  purposes what the system says IS the record — but it only ever holds what it was
  given. It cannot know what it doesn't hold.
- Representation completeness = **expected − provided**, computable inside the system
  once both sides exist. Both sides are practitioner inputs:
  - **provided** = data entered (direct);
  - **expected** = also practitioner-originated, directly ("this client needs X") or
    indirectly (chose a service / case type / template that implies an expected shape).
- The practitioner does not declare *completeness*; they declare *expectations*. The
  system derives the gap list, live — change the expectation, the gaps recompute. The
  practitioner's authority sits one level up: defining the question, not certifying
  the answer.
- **Optionality is part of the expectation, set up upfront.** An item's acceptable
  resolutions (value | N/A | mutually-exclusive alternatives) belong to the expectation
  itself, so the system can derive completeness mechanically. N/A is an answer, not an
  absence. No ad-hoc shrinking at fill time.
- **OI (deferred, solution-space):** forced overrides / exceptions — "forced complete"
  indication if we choose to accommodate them.

### 2b. Reality completeness = practitioner-attested; representation lags reality

- As far as the system is concerned, **the practitioner is the sole authority on
  reality**. External yardsticks (law, ethics codes, clinical standards) exist, but
  they reach the system only through the practitioner. The system is a mirror, never
  a source — it holds claims about reality that someone entered.
- **Representation lags reality by nature** — reality moves in sessions, calls,
  signatures; the representation catches up only when fed. Catch-up is a permanent
  condition, not a migration-only phase.
- Consequence: a system-flagged gap (expected − provided) may already be closed in
  reality — only the practitioner knows. The gap list is a statement about the
  representation, never about the world.
- Therefore **provided splits into two tiers: claim vs proof.**
  - **Claim** — practitioner attests without artifact ("consent was given"). Brings
    representation up to reality immediately; authority respected.
  - **Proof** — the artifact (signed PDF, form response) lands later. A
    claim-without-proof is tracked **proof-debt**: the system flags, reminds, follows
    up.
- The practitioner controls the follow-up loop: **snooze** ("ask/remind me later") or
  **acknowledged exception** ("just trust me" — *forced reality*: a permanent
  claim-without-proof, deliberately recorded as such).
- The system's job is not to gatekeep reality — it is to **mirror it fast (claims)
  and then chase fidelity (proofs)** at the practitioner's pace. The two escape
  hatches mirror each other: forced-complete (expectation side, §2a OI) and
  forced-reality (proof side).

## 3. The catch-up loop — one general mechanism [DECIDED 2026-07-12]

```
reality moves → claims recorded → proofs land → gaps recompute (expected − provided)
      ↑                                                        ↓
      └────────────── practitioner: fill / snooze / except ←───┘
```

- **Every onboarded case/client lives in this loop permanently.** The end state of
  onboarding — for a new intake AND a migrated client — is not a static "complete
  record"; it is **admission into the loop**.
- Intake vs migration collapses to **initial loop conditions**: intake enters with
  representation ≈ reality (small debt); migration enters with reality far ahead
  (large debt). Same loop, different starting deficit. There is no special "migration
  mode" — the enrichment engine IS the loop machinery, shared.
- "Enrolled-but-thin" is not a special status — it is a loop position (high debt).
- The *entry events* still differ and are worth recording distinctly: intake's
  terminal marks **a relationship came into existence**; migration's end marks **an
  existing relationship became represented**. A practitioner never *feels* a migrated
  client as "enrolled" — they were "my client" all along; the system caught up.
  (Whether the terminals share a name is open → `client-onboarding-discovery.md`.)

## 4. Practice-relationship goal domains [DECIDED 2026-07-12]

> **Vocab (2026-07-14):** the Vision calls these **facets of the relationship**; the
> facets form the practice **sub-domains** — "domain" stays the working term below.
> The Safety facet includes *privacy* by design (user): "privacy is about the person,
> confidentiality is about the data" — privacy = safety-of-the-person concern
> (→ Safety), confidentiality = data handling (→ Legal/Compliance; at-rest protection
> = the Custody guarantee).

**The mechanism is general; the goals/content/stakes/sensitivities differ.** The loop
instantiates per goal domain. Making domains explicit enables in-context
tracking/reporting and the 360 goal-lens zoom. Enumeration test: a domain must have
its own expectation source, authority, tempo, stakes, and disclosure audience.

**The five domains** (= the overall functional framework for practice management):

| # | Domain | Expectation comes from | Reality moves via | Tempo | Stakes | Disclosure audience |
|---|---|---|---|---|---|---|
| 1 | **Clinical** — formulation, treatment goals, interventions, outcome measurement | treatment plan (practitioner+client agreed) + clinical standards (MBC) | sessions, methods, assessments | progressive, per-session | client wellbeing | supervisor, referral letter |
| 2 | **Safety** — risk screening, monitoring, crisis/safety planning | duty of care: law + ethics (screen before treat, act on risk) | screening, safety plan, crisis action | continuous + interrupt-driven | life; asymmetric failure | crisis services, NR |
| 3 | **Legal/Compliance** — consent artifacts, MHA-2017 NR/AD, confidentiality limits, retention | statute + ethics codes (external, imposed) | signatures, disclosures, filings | event-driven (before treatment, on tele, on disclosure) | license exposure, client rights | regulator, auditor |
| 4 | **Financial** — fee terms, sliding scale, payments, receipts | engagement contract + tax law | payment events (UPI), invoicing | per-session / monthly | money disputes, tax, practice sustainability | accountant |
| 5 | **Operational** — session-plan execution, scheduling, availability, communication logistics | session plan + practice policy | bookings, confirmations, reschedules | weekly rhythm | smooth running, time | nobody external |

Design notes:

- **Safety split out of Clinical** — clinical-governance frameworks (NHS 7 pillars)
  treat safety ≠ effectiveness as separate quality dimensions ("no avoidable harm" vs
  "making progress"). Loop semantics differ: a safety gap can't be snoozed like an
  overdue PHQ-9 — interrupt-driven, asymmetric failure. The built Practice spine
  already treats Risk/Safety as its own aspect.
- **"Operational" means only logistics** — money and law extracted into their own
  domains (generic "logistical" hid three stake-profiles).

Explicitly **NOT domains**:

- **Engagement** — derived signal (plan adherence, drop-off risk), computed from
  Operational + Clinical data. No expected/provided of its own.
- **Therapeutic alliance** (bond + agreement on goals/tasks — strongest outcome
  predictor in the literature) — a clinical *instrument/measurement target*; lives
  inside Clinical, not its own loop.
- **Documentation/records** — industry lists it as a practice-management domain, but
  in this model documentation IS the representation loop = the *system* relationship
  (§0), not a practitioner↔client goal. The EHR industry's category error was treating
  documentation as a practice goal.

### 4a. Invariance across case types + practitioner types [DECIDED 2026-07-12]

**The domain set is invariant; variation lives in each domain's expectation content**
— same principle as the intake doc's "spine = product, template = content":

- Psychiatrist: med-reconciliation, prescription → Clinical + Legal *content*, no new
  domain.
- Assessment-only practice: Clinical content = battery + report; Operational thin.
- Minor: guardian consent + assent → Legal items, per-person.
- Couples/family: contract per case, safety per person — the `{case, person}` scope
  axis (intake doc §1b.3) applies per expectation item, within every domain.
- Practice profile + service catalogue **filter/default** each domain's expectations
  (intake doc §4c); credentials gate the few hard items.

Sources: NHS 7-pillars clinical governance (cognitoconsultants.com,
good-governance.org.uk) · APA measurement-based-care guidelines · MBC expert synthesis
(PMC12079462) · Greenspace therapeutic-alliance · Blueprint private-practice
requirements · Medesk practice-management guide. (Session log 2026-07-12.)

## 5. System-relationship goals — now THE FIVE GUARANTEES (§0 reframe 2026-07-14) [DECIDED 2026-07-12]

The goals of the practitioner↔system relationship (§0). Same enumeration test as §4;
each goal maps to the practice domains it serves — subordination (§0c) made concrete.
No system-centric metric (features, usage, data volume) appears anywhere.

| # | System goal | The relationship promise | Expectation vs reality | Serves (practice side) | Failure mode |
|---|---|---|---|---|---|
| 1 | **Fidelity** — truthful mirror | "What it shows me is true, complete, current" | expected shapes vs provided; proof-debt age, staleness | measurement half of ALL 5 domains | blind/wrong decisions off a stale mirror |
| 2 | **Ease** — cheap to feed | "Feeding it costs minutes, not my evenings" | capture-effort budget vs actual time/friction | returns time to Clinical; protects practitioner wellbeing | documentation burden → burnout → abandonment (EHR failure #1) |
| 3 | **Reliability** — there when needed | "Never fails me in-session; never loses what I gave it" | always-works-offline expectation vs incidents | Clinical + Safety in the moment (crisis needs the safety plan NOW) | trust collapse — one in-session failure outweighs months of uptime |
| 4 | **Insight** — mirror that talks back | "Shows me what needs attention before I ask" | signals needed vs signals delivered (gap lists, attention, trends, 360 zoom) | Clinical progress, Safety attention, Financial outstanding, engagement signals | write-only EHR: data goes in, nothing comes out |
| 5 | **Custody** — safe hands | "Client's PHI is safer with it than without it" | sovereignty invariants + disclosure scopes vs actual handling (audit) | Legal/Compliance; underwrites Safety disclosures | breach — catastrophic, asymmetric (the Custody↔Safety analogue) |

**Cross-cutting principle, not a goal: Authority respect** — the system never
overrides the practitioner. Claims accepted without proof, snooze/except always
available, spine fixed but content configurable, no forced workflows. No loop of its
own — a constraint every goal operates under (already encoded in the claim/proof
design, §2b). KLAS finding backs it: clinician voice in system configuration = the
trust maker/breaker.

Design notes:

- **Failure asymmetry splits the set like the practice side:** Custody + Reliability
  are interrupt-class (one failure can end the relationship — mirrors Safety);
  Fidelity / Ease / Insight are progressive (mirror Clinical).
- **§0d's "trust" decomposes:** fidelity of mirror → goal 1, custody → goal 5,
  authority → the principle. Trust is not a 6th goal; it is the emergent property when
  these hold.
- **Each goal is loop-able** — declarable expectation (budgets / invariants / signal
  sets) + measurable reality (staleness, time-to-document, incidents, signal coverage,
  audit).
- Local-first already commits us structurally on Reliability + Custody; the model says
  *why* — they are the interrupt-class trust goals.

### 5a. Means-agnosticism [DECIDED 2026-07-12]

**Goals name no technology or mechanism — ever.** No goal or expectation may be stated
in terms of a means (a form, a sync engine, an AI agent). An **AI agent harness**
(under contemplation) is a candidate *means*, never a goal: it would be judged per
goal, in both directions — could serve Ease (drafting, capture assist) and Insight
(signal surfacing); threatens Fidelity (hallucinated mirror = worst-case fidelity
failure), Custody (PHI to a cloud model), and Authority (acting beyond practitioner
attestation). Any tool earns its place goal-by-goal or not at all — the goal set IS
the evaluation rubric for adopting it.

Sources: KLAS Arch Collaborative Clinician EHR Experience 2026 + physician pain-points
guidebook · clinician-EHR-experience factors (PMC9013220) · trust framework for
autonomous healthcare systems (PMC11631875) · healthtech.ca EHR-data trust. (Session
log 2026-07-12.)

## 6. PHI under the goal-domain model [DISCUSSED 2026-07-12]

- **Goal domains ≠ PHI boundary.** The person-link makes everything sensitive — being
  a client of a mental-health practice *at all* is the disclosure that matters. No
  goal slicing turns provided data non-PHI; `protected` residency stays universal for
  person-linked data.
- **The clean PHI line is expectation vs provided:** templates, checklists, goal
  definitions (expectation side) = PHI-free — safe to ship, host, cloud-update.
  Anything provided (claims, proofs, filled forms) = PHI. Holds in every domain.
- What granular domains DO buy (feeds O499 egress design; = the Custody goal §5
  operationalized):
  1. **Sensitivity grading within PHI** — clinical notes ≠ payment record ≠ signed
     consent; each domain gets a declared sensitivity profile instead of one blob.
  2. **Disclosure scopes** — domains ≈ natural minimum-necessary boundaries:
     accountant → financial only; referral letter → clinical subset; audit →
     compliance artifacts. DPDP data-minimization falls out of the model.
  3. **De-identified aggregates per domain** — practice-level reporting (revenue,
     drop-off, compliance posture) becomes answerable per domain.
- Net: granular goals move PHI handling from a binary wall to graded scopes.

## 7. Activities under the goal model [CAPTURED 2026-07-12 — reconciliation PENDING]

### 7a. Current catalogue mapped to practice domains

The instinctual catalogue (`docs/Product/Product_Scope.md`: 7 Activities + Documents
aspect + Billing candidate O421) against the §4 domains:

| | Clinical | Safety | Legal/Compl. | Financial | Operational |
|---|---|---|---|---|---|
| **Practice** | record home | risk banner, safety-plan aspects | consent aspects | payment card (mock) | lifecycle/intake workflow |
| **Sessions** | ● primary — encounter spine, notes | in-session risk capture | — | — | attendance reality |
| **Schedule** | — | — | — | — | ● primary — bookings, cadence |
| **Assessments** | ● primary — MBC measurement | screeners flag risk | — | — | — |
| **Planner** | goals half (treatment goals) | — | — | — | tasks half (follow-ups) |
| **Catalog** | *(expectation-side content for ALL domains — PHI-free templates/worksheets)* |||||
| **Audit Viewer** | — | — | ● primary | — | — |
| **Documents** (aspect) | *(proof shelf for ALL domains — consents→Legal, reports→Clinical, receipts→Financial)* |||||
| **Billing** (candidate) | — | — | — | ● would-be primary | — |

Three surface **roles** emerge:

1. **Domain executors** — where a domain's reality moves: Sessions + Assessments
   (Clinical), Schedule (Operational), Billing (Financial).
2. **Loop infrastructure** — serve every domain's loop, own none: Practice (per-client
   loop console), Catalog (expectation library), Documents (proof shelf), Audit Viewer
   (proof surface).
3. **Straddler** — Planner: treatment-goals half = *Clinical expectation authoring*;
   tasks half = Operational execution. Two loop roles in one Activity.

Findings:

- **Financial domain has no committed owner** — the framework supplies the
  justification O421/A1 was waiting for.
- **Safety has no executor Activity — correctly.** Interrupt-class + per-person
  contextual → projects into wherever the practitioner is (banner/aspect), never a
  place you navigate to. Roster-wide safety attention must ride the Insight machinery.
- **Audit Viewer uniquely serves a SYSTEM goal** (Custody verification; Legal
  secondary) — the only Activity allegiant to the practitioner↔system relationship.
- **Catalog + Documents = the two halves of the PHI line** (§6): expectation-side
  library vs provided-side proofs. Instinct had the split; the model explains it.
- System goals map mostly to **platform, not Activities**: Reliability/Custody =
  local-first architecture; Fidelity = claim/proof machinery; Ease = capture flows;
  Insight = attention lens + 360.

### 7b. From-scratch Activity set derived from the model [PROPOSED 2026-07-12]

Thought experiment: ignore the catalogue; derive Activities from the goals-and-loops
frame alone. If all work = tending loops, navigation should follow the practitioner's
**recurring questions**, not entity types (EHR-usability literature: clinician
navigation deviates from record-oriented design; rhythm-misalignment, not missing
nouns, drives burden; industry converged on the "Today" surface — Jane Day Sheet,
SimplePractice home).

| # | Activity | Question it answers | Model source | Goal allegiance |
|---|---|---|---|---|
| 1 | **Today** | "What needs me now?" | Insight made primary navigation: agenda + interrupts (Safety flags) + due loop-work (proof-debt, unconfirmed sessions) across all clients | Insight; Safety surface |
| 2 | **Intake** | "Who's at my door?" | entry = first-class (admission into loops): queue, two doors, runs, terminals, migration bulk mode | Operational + seeds all |
| 3 | **Caseload** | "Where does this case stand?" | per-case loop console: 5 domain lenses, gap lists, claim/proof state, journey across cases (the 360 lives here) | ALL practice domains (console, owns none) |
| 4 | **Encounters** | "Run the session, capture as I go" | where clinical reality moves; capture-at-creation = the Ease goal's structural answer | Clinical executor; Ease |
| 5 | **Plans** | "What did we agree?" | expectations = first-class objects → authoring home: treatment plan (Clinical), session plan (Operational), fee terms (Financial), per-case expectation tuning | expectation side of ALL domains |
| 6 | **Payments** | "Am I getting paid?" | Financial loop executor — model demands an owner, no candidate hedging | Financial |
| 7 | **Library** | "My reusable content" | expectation-content library: PHI-free templates for every domain (shippable, cloud-updatable) | expectation side, cross-domain |
| 8 | **Trust** | "Is the system holding its end?" | the practitioner↔system relationship surfaced: audit/custody ledger, proof-debt overview, system-goal health | Custody, Fidelity (system set) |

### 7c. Target mapping — current ↔ derived (reconciliation PENDING)

| Current | Derived target | Change |
|---|---|---|
| *(none — attention lens inside Practice)* | **Today** | **NEW — the biggest miss.** "What needs me now" as a place; likely the most-visited surface |
| *(inside Practice: intake workflow)* | **Intake** | **promoted** to top level — own unit (case-run), terminals, bulk migration mode |
| Practice | **Caseload** | reframed: explicitly the loop console — owner of nothing, window on everything |
| Sessions | **Encounters** | ≈ unchanged; Ease-allegiance made explicit (capture rides the encounter) |
| Schedule | *(absorbed)* | **demoted** — calendar = a *tool* of Operational: agenda half → Today, session-plan half → Plans, booking = an action not a place; provider plumbing stays |
| Assessments | *(absorbed)* | **demoted** — Clinical measurement instrument: administered in Encounters, trended in Caseload |
| Planner | **Plans** | reframed: expectation authoring for ALL domains; execution-tasks move to Today |
| Billing (candidate) | **Payments** | **confirmed unconditional** (resolves O421 direction) |
| Catalog | **Library** | ≈ unchanged — instinct was right where the model is structural |
| Audit Viewer | **Trust** | widened: from audit log to the whole system-relationship surface |
| Documents (aspect) | *(aspect, unchanged)* | proof shelf, projects into Caseload/Encounters |

Reading: instinct nailed the **nouns** (record, sessions, calendar, measures); the
model adds the **rhythms** (Today, Intake, Plans). **Reconciliation with
`Product_Scope.md` = deliberate later pass** — nothing above changes the catalogue
yet.

Sources: Jane features (Day Sheet) · SimplePractice · EHR-usability scoping review
(PMC12206486) · EHR workflow/workarounds (PMC8061456). (Session log 2026-07-12.)

## 8. Open threads

- Both goal sets DECIDED (§4 practice + §5 system). AI-agent-harness contemplation =
  evaluate against §5 per §5a.
- **Promoted 2026-07-12: `docs/Product/Product_Vision.md`** distills this doc (vision
  statement, who-for, principles, differentiation, non-goals). This doc remains the
  journal; the vision doc is the product-facing authority.
- **Reconcile §7b/§7c derived Activity set with `Product_Scope.md`** — deliberate
  later pass under the vision doc; catalogue unchanged until then.
- Terminal naming/separation for the two entry events (intake "enrolled" vs migration
  equivalent) — with `client-onboarding-discovery.md`.
- Forced-complete (expectation override) + forced-reality (proof exception) — OI pair,
  solution-space, deferred.
- Goal-centered Activities mapping + 360 goal-lens zoom — with topic 2 (360 profile).
