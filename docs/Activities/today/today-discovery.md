# Today Activity — Design Discovery

**Status:** Discovery (draft 2026-07-14) — research + hypotheses + personas, ahead of prototyping
**Owner:** Product
**Derives from:** `docs/Product/Product_Vision.md` (Insight + Safety guarantees),
`docs/Product/Product_Scope_v2.md` (Activity #1 Today),
`docs/Activities/practice/goals-and-loops-discovery.md` §3–§5, §4a, §7b.
**Feeds:** the Today prototype variations (`docs/Plans/today-activity-prototype.md`)
and, later, the Today bundle ADR.

---

## 0. Frame — what Today is

- **Question it answers:** "What needs me now?"
- **Role:** loop *infrastructure* — serves every domain's loop, owns no domain
  (Scope v2 #1). Today does not create clinical/financial/legal reality; it
  *surfaces* where that reality has moved and where the representation owes work.
- **Goal allegiance:** **Insight** ("shows me what needs attention before I ask")
  made primary navigation, plus **Safety**'s only roster-wide surface (Safety is
  otherwise per-person contextual, never a place — Scope v2 "deliberate absences").
- **Why it is the biggest V1 miss:** V1 catalogued by nouns; nothing answered the
  practitioner's first daily question. The industry converged on a "Today" home
  (Jane Day Sheet, SimplePractice home) precisely because rhythm-misalignment, not
  missing nouns, is what burns clinicians (goals doc §7b).

**Non-goals (bound the surface):**
- Not a task manager — execution-tasks surface here, but goal/expectation *authoring*
  lives in Plans (Scope v2 "no generic Tasks/Planner").
- Not a place to *do* deep work — Today routes you *into* Encounters / Caseload /
  the record; it is a launcher + attention lens, not an editor.
- Not a nag wall — Insight must not tip into alarm fatigue (see §2). Quiet-when-clear
  is a design requirement, not an empty state.

## 0.1 Iteration 1 scope [DECIDED 2026-07-14]

Deliberately narrowed so the first prototype tests something, not everything.

- **Persona: therapist only** — psychologist/counselor (persona A). Psychiatrist (B)
  and assessment-only (C) deferred → so **H0 (cross-type invariance) is NOT tested this
  round**, and `measure_due`/H6 (MBC-driven) rides with them.
- **Two hypotheses under test:**
  - **H5 — structure:** two separate regions (agenda + attention list) vs one
    integrated timeline (proof-debt/session-debt overlaid on appointment rows). The
    skeleton decision; prior-art poles = Jane (separate) vs SimplePractice (overlay).
  - **H3 — dose:** calm-when-clear (ranked, groups collapse when empty, quiet) vs
    always-loud (counts/badges everywhere). Directly probes the #1 documented failure
    mode (alert fatigue) against the Insight guarantee.
- **3-Artifact matrix — one variable per pair, shared baseline (all persona-A, same
  mock day, same obligation kinds):**

  | Artifact | Structure | Dose | Isolates |
  |---|---|---|---|
  | **V1 baseline** | two-region | calm | reference |
  | **V2** | integrated-overlay | calm | **H5** (vs V1) |
  | **V3** | two-region | loud | **H3** (vs V1) |

- **Deferred to later rounds (not this iteration):** H0/H6 (need personas B/C),
  H1 (region order — subsumed by H5's outcome), H2 (typed-vs-flat grouping — research
  already leans validated), H4 (safety banner-vs-top-group — component decision, fix
  the skeleton first). Kept in §5 for the record.

**Findings from the canvas iteration [DECIDED 2026-07-15]:**
- **H5 / H1 → attention-led (persona A).** Today = **worklist-center** (the "Needs you
  now" list owns the main editor area, roomy, with visible Fill / Snooze / Except) +
  **stakes-ladder-as-left-index** (a compact counts/jump nav in the primary sidebar) +
  **agenda-as-right-rail** (the calendar demoted to a glanceable day rail with a NOW·
  up-next highlight). This beat the **agenda-led** alternative (calendar owns the center,
  attention cramped into the sidebar with hidden actions). Decided from Claude Design
  canvas V1 (agenda-led) vs V2 (attention-led); head-to-head in
  `prototypes/canvas-v2-attention-led/OBSERVATIONS.md`. Structure is the real 3-zone
  workbench, not the originally-sketched flat two-region.
  - Port forward: canvas V1's richer **"NOW / up-next" focus card** (V2 folded it into
    the rail — keep a dedicated affordance).
  - Caveat: the thin agenda-rail is unretested for **dense days** (persona B, 10–14
    sessions) — re-check when B/C are built.
- **H3 (dose) → calm base [DECIDED 2026-07-15].** The winning **V2 (attention-led)**
  design stays calm, and folds in **two elements from the loud fork (V3)**: **per-item
  urgency tags** (OVERDUE 1D / DUE TODAY / MISSING / UNSIGNED — real triage info) and
  **subtle colored left-borders** (stakes-scan aid). **Rejected: the redundant top
  counter bar** — counts live in a single source, the left ladder index (V3 duplicated
  counts 3×; that's the alert-fatigue signature). Decided from V2 (calm) vs V3 (loud);
  head-to-head in `prototypes/canvas-v3-loud/OBSERVATIONS.md`. Principle: loudness ≠
  information — adopt what adds signal, drop what only repeats.

**Structure + dose are now settled for persona A → consolidated into the reference spec:
`docs/Activities/today/today-persona-a-spec.md`.**

**Persona B (psychiatrist) — H0 CONFIRMED [DECIDED 2026-07-15].** Held the persona-A
structure frozen, swapped to a dense 12-session psychiatrist day + clinical/legal debt mix
(med-recon, PHQ-9/GAD-7 screener-due, controlled-med consent, drug-interaction Safety). The
**same 3-zone attention-led frame carried it with zero structural change** → **H0 holds;
Today is one content-driven surface, not per-type (O-today-1 resolved for A+B).** Two
specific results: (1) the **thin agenda rail HELD 12 rows** readable/glanceable (wide +
narrow) — the persona-A spec §8 dense-day caveat did **not** materialize, drop it; (2) the
proposed **`measure_due` + `med_recon_due`** kinds (dashed PROPOSED chip) read clean and sit
naturally in "To complete" → **act on O-today-6** (extend `deriveObligations`). Head-to-head
+ method gotcha (canvas `x-import` components don't paint in headless; judge fidelity from
canvas preview + source) in `prototypes/canvas-persona-b/OBSERVATIONS.md`. Open nit:
canvas's 760px narrow squeezed 3 cols instead of stacking the rail — a bundle-build
breakpoint concern, not a design decision. **Persona C (assessment/sparse) optional before
the bundle spike — low risk of falsifying H0 (opposite stress of B).**

The rest of this doc (research, model, personas B/C, full hypothesis set) stands as
the broader discovery; §0.1 is what iteration 1 actually builds.

**Built prototypes (local, not uploaded):** `prototypes/v1-two-region-calm.html`,
`prototypes/v2-integrated-overlay-calm.html`, `prototypes/v3-two-region-loud.html` —
self-contained, base-luma-faithful, theme-aware (toggle at the rail foot). Open with
any browser (`file://`) or `google-chrome <file>`.

## 1. Prior art — the "Today / day-sheet" pattern

Survey of the surfaces the segment converged on, and what each is worth to us:

| Product | Today surface | Steal | Avoid |
|---|---|---|---|
| **Jane** (Day Sheet) | time-ordered day: appts + status (arrived/billed) + quick actions | at-a-glance day spine; status baked into each row | admin-heavy (billing status dominates — that's Payments here) |
| **SimplePractice** (home) | appts + "to-do" (notes due, unsigned docs) + reminders | pairing agenda with *documentation debt* — our proof-debt | to-do list is flat, undifferentiated by stakes |
| **Osmind / Blueprint** (psychiatry/MBC) | agenda + measurement-due + assessment scores surfaced | measurement-due as first-class attention; trend surfacing | measure-centric; assumes MBC-heavy practice |
| **Generic EHR inbox** (Epic InBasket etc.) | message/result queues | — | the write-only-EHR failure mode: firehose, no prioritization by stakes → the thing we must not build |

**Takeaway:** the winning pattern = **agenda + differentiated attention**. The
losers flatten attention into one undifferentiated queue. Our differentiator is the
goal-loop model: attention is *typed* (safety vs proof-debt vs sessions) with
different stakes and different affordances (§4).

## 1b. Live external research (web pass 2026-07-14)

Direct product/feedback research beyond the repo citations. Findings and how they
change the Today design:

**Home-surface prior art (confirms the two-region frame):**
- **Jane "Day View"** — schedule on the **left**, a **Dashboard in the center** that
  "gives a quick overview of appointments to help spot patterns and plan the day."
  This is almost exactly our Agenda + attention split, from the segment leader for
  solo practice. Validates the frame; also a layout data-point for H1 (Jane puts
  agenda left, insight center — not a stacked order).
- **SimplePractice calendar filters** — filter appointments by *status, new client,
  **incomplete documents**, **unpaid balances**, insurance*. Notable: proof-debt and
  payment-debt are surfaced as **overlays on the agenda itself**, not only a separate
  list. → new design option (H5 below): attention-as-agenda-overlay vs
  attention-as-separate-region.
- **Blueprint (MBC)** — weaves standardized measures (PHQ-9, GAD-7) into the workflow
  and surfaces **measurement-due** and scores as first-class. → exposes a **gap in our
  obligation set** (see §4b note): we have `no_risk_screen` but no general
  *measurement/screener-due* obligation. Matters most for personas B/C.
- **Upheal / Mentalyc** — AI-native: note in <60s, transcript→note, talk-ratio /
  session-trend analytics; workflow Record → Review → Light Edit → Finalize. Relevant
  only as a future *means* under the AI-agent gate (goals §5a), not Today v1.

**Validated anti-patterns (what Today must not do) — from icanotes "what vendors
won't tell you" + burnout literature:**
- **Sessions fall through the cracks** (unbilled/unconfirmed, no visibility into why)
  → this is *precisely* what Today's unconfirmed-session + (future) payment-due
  attention answers. Strong validation.
- **Documentation lags care; defensive over-documentation** → proof-debt surfacing +
  cheap-fill routing is the answer; but reinforces the Ease constraint (every Today
  item must route to a fast fill, never re-keying).
- **Fragmented subsystems** ("scheduling and billing are separate systems in the same
  platform"; "telehealth bolted on") → Today's value is the *cross-domain* read that
  no single subsystem gives. This is the cross-bundle projection thesis (O-today-4).
- **Customization theater** (cosmetic field-rename, preset-only templates) → Authority
  respect: snooze/except must be real, not decorative.
- **Alert/undifferentiated-queue fatigue** → confirms §2; stakes-ranking + quiet-when-
  clear is the differentiator vs the generic-EHR inbox.
- **Adoption reality:** ~10–15 admin hrs/month/therapist; burnout >45% of clinicians
  (paperwork/billing top stressors); **1 in 3 switch platforms within 2 years, mostly
  over poor support, not price** → weights Reliability + Ease over feature breadth.

**Net effect on this discovery:** the two-region frame and typed-attention thesis are
externally corroborated by the market leader (Jane) and the pain-point literature.
Two concrete changes fall out: a new obligation kind (measurement-due, §4b) and a new
layout hypothesis (H5 agenda-overlay, §5).

## 2. Clinician-usability evidence — what Today must not become

From KLAS Arch Collaborative + EHR-burden literature (goals doc §5/§5a sources):

- **Documentation burden is EHR failure #1** → Ease. Today surfaces debt but every
  item must route to a *cheap* fill, never re-keying.
- **Write-only EHRs kill trust** ("data goes in, nothing comes out") → Insight is the
  antidote, but…
- **Alarm/alert fatigue** is the opposite failure. Too many flags → all ignored.
  Constraint: attention must be *ranked by stakes* and *quiet when clear*. A green/
  calm Today is a feature.
- **Clinician voice in configuration = trust maker/breaker** → snooze/except must
  always be available (Authority respect, goals doc §5) — except for interrupt-class
  Safety, which is definitionally non-snoozeable.

## 3. Invariance thesis — the testable claim [CENTRAL]

From goals doc §4a: **the goal-domain set is invariant across practitioner types;
variation lives in each domain's expectation content.** Applied to Today:

> **Hypothesis-0 (structure invariance):** Today's *structure* — an Agenda region +
> a stakes-ranked "Needs you now" attention engine grouped by obligation class — is
> invariant across practitioner types. Only the *content mix* (which obligations
> dominate, agenda density) varies.

The three-persona variation set (§6) exists to falsify or confirm H-0. If the same
frame reads well for a talk-therapist, a psychiatrist, and an assessment-only
practice with only content swapped, the structure holds and the Today bundle can be
one surface with content driven by practice profile + domain expectations. If a
persona needs a *structurally* different Today, H-0 is wrong and Today needs
per-type layout — a much heavier build.

## 4. The Today content model (grounded in existing code)

Two regions. Both are *derivations* — Today owns no tables (it would be the first
true cross-bundle projection surface; impact doc §2.2).

### 4a. Agenda region
- Source: Schedule `schedule.calendar.query.listWindowEvents` + per-event client
  classification via `record.patient.query.resolveParticipant`
  (`bundles/ru-soam-schedule/view-src/schedule.tsx:180-215` already does exactly
  this bucketing: client_session / not_client_session / unclassified).
- Row content: time, client (or "Personal" / "Unclassified"), modality,
  **confirmation state**. An unconfirmed upcoming session is itself loop-work — it
  can bridge into the attention region.

### 4b. "Needs you now" — the attention engine
- Source: `record.patient.query.listAttention` →
  `deriveObligations(row, now)` (`bundles/ru-soam-practice/attention-intake.mjs:72-94`)
  + Sessions `sessions.meeting.query.listUpcoming`.
- **Real obligation kinds today:** `intake_incomplete`, `no_risk_screen`,
  `missing_consent_doc`, `on_hold_stale` (`ON_HOLD_REVIEW_DAYS = 30`). The prototype
  uses exactly these — no invented types — so the mock maps 1:1 to live derivation.
- **Gap flagged by research (§1b):** no general **measurement/screener-due**
  obligation exists (only `no_risk_screen`). Blueprint/MBC surfaces PHQ-9/GAD-7 cadence
  as first-class attention; personas B/C need it. The prototype MAY show a
  `measure_due` item as a *proposed* kind (clearly marked proposed, not yet in
  `deriveObligations`) to test whether it belongs — see O-today-6.
- Grouped by the catch-up-loop **failure-asymmetry** (goals doc §3, §4 design note):

| Group | Class | Kinds | Affordances |
|---|---|---|---|
| **Safety flags** | interrupt-class | risk / safety-domain | click-through only — **no Snooze, no Except** (a safety gap can't be snoozed) |
| **Proof-debt** | progressive | `intake_incomplete`, `no_risk_screen`, `missing_consent_doc`, `on_hold_stale` | Fill · Snooze · Except |
| **Unconfirmed / due sessions** | progressive | Sessions upcoming/unconfirmed | Fill · Snooze |
| **Follow-up nudges** | progressive | due loop-work | Fill · Snooze |

- Per-item verbs from loop model §3: **Fill** = route into client/case; **Snooze** =
  defer; **Except** = mark N/A (never destructive, always reversible).

## 5. Hypotheses to test through variation

| # | Hypothesis | Variation that tests it | What we learn |
|---|---|---|---|
| **H0** | Structure invariant across practitioner types (§3) | personas A/B/C, same frame | whether Today is one surface or per-type |
| **H1** | Practitioners scan attention before agenda | attention-first vs agenda-first layout | default region order |
| **H2** | Grouping by obligation-class beats by-client or by-time | class-grouped vs client-grouped attention | the attention taxonomy |
| **H3** | Insight should stay quiet when clear (anti-alarm) | loud (badges/counts everywhere) vs calm (ranked, collapses when empty) | Insight dose |
| **H4** | Interrupt-class Safety belongs pinned, not in-list | safety-as-banner vs safety-as-top-group | Safety placement (validates the built Practice risk-banner pattern) |
| **H5** | Attention reads better as an **overlay on the agenda** than as a separate region | agenda-overlay (SimplePractice-style: debt badges on appt rows) vs separate attention list | whether Today is one integrated timeline or two regions |
| **H6** | A **measurement/screener-due** obligation earns its place as first-class attention | include proposed `measure_due` (personas B/C) vs omit | whether to extend `deriveObligations` (feeds O-today-6) |
| **H7** | **Quiet-when-clear** (calm, collapsing groups) beats always-on counts/badges without losing trust | calm variant vs loud-badges variant | the Insight dose (extends H3 into a concrete A/B) |

## 6. Personas — content mix per region (invariant frame, §3)

All three share the §4 structure. What differs is the content weighting.

| | **A · Psychologist/Counselor** (baseline) | **B · Psychiatrist** | **C · Assessment-only** |
|---|---|---|---|
| Cadence | weekly, 45–50 min | shorter, higher volume | episodic (battery → report) |
| Agenda density | moderate (5–7/day) | dense (10–14/day) | sparse (1–2/day) |
| Dominant proof-debt | `no_risk_screen`, MBC screener-due, progress-note debt | med-reconciliation, prescription/consent (Legal), shorter notes | report-due, battery-scoring, consent |
| Safety profile | active (risk screening core) | active + med-risk | lower, but screening still gates |
| Financial signal (peek) | per-session UPI | per-session | per-package/report |
| What Today must foreground | proof-debt + unconfirmed sessions | agenda throughput + Legal/med debt | report-due + few-but-heavy items |

Sources for the type distinctions: goals doc §4a (psychiatrist med-recon → Clinical+
Legal *content*, no new domain; assessment-only → battery+report, thin Operational).

## 7. Variation plan (feeds the Artifact pass)

Prototype as claude.ai Artifacts, published to web. Two axes: **persona** (tests H0
content-invariance) × **layout fork** (tests H1/H4/H5/H7). Kept small — proposed set:

| # | Variation | Persona | Layout | Hypotheses it makes visible |
|---|---|---|---|---|
| 1 | **A-baseline** | psychologist/counselor | attention-first · class-grouped · safety-as-banner · calm-when-clear | the reference frame; H2, H3/H7, H4 defaults |
| 2 | **B-psychiatrist** | psychiatrist | same frame | **H0** under dense agenda; H6 `measure_due` in play |
| 3 | **C-assessment** | assessment-only | same frame | **H0** under sparse agenda; report-due + `measure_due` |
| 4 | **A-alt-overlay** | psychologist | agenda-overlay (debt badges on appt rows) | **H5** (integrated timeline vs two regions); H1 (agenda-first) |
| 5 | *(optional)* **A-alt-loud** | psychologist | loud badges/counts everywhere | **H7** calm-vs-loud A/B for the Insight dose |

Rule: personas 1–3 hold layout fixed and swap content (isolates H0); forks 4–5 hold
persona fixed and swap layout (isolates H1/H4/H5/H7). One variable at a time.

Each Artifact: app-faithful visual language (Inter Tight, basebench token palette,
inline Phosphor SVG), theme-aware, Indian solo-practitioner mock data (names, UPI,
MHA terms). No live cap wiring; obligation kinds match §4b (with `measure_due` clearly
marked *proposed*).

## 8. Open questions discovery must resolve

- **O-today-1:** Does H0 hold, or does any persona need a structurally different
  Today? (Decides one-surface vs per-type.)
- **O-today-2:** Region order default (H1) — attention-first vs agenda-first.
- **O-today-3:** Safety placement (H4) — banner vs top-group; reconcile with the
  built Practice risk-banner (does Today reuse it or restate it?).
- **O-today-4:** How much cross-bundle read does Today's attention need beyond
  `listAttention` (Sessions unconfirmed, later Payments outstanding)? This is the
  cross-bundle read-model question the Today bundle ADR must answer (impact doc §2.2).
- **O-today-5:** Snooze/except persistence — where does a snoozed obligation live?
  (New persisted shape → belongs to the loop-mechanics platform ADR, not Today's.)
- **O-today-6:** Add a `measure_due` obligation kind (MBC/screener cadence) to
  `deriveObligations`? (Research §1b; personas B/C. Prototype tests demand via H6.)
- **O-today-7:** Integrated timeline vs two regions (H5) — does attention-as-agenda-
  overlay beat a separate attention region, or do both ship (toggle)?

## Sources

**Repo-internal:** `goals-and-loops-discovery.md` §5a/§7b (KLAS Arch Collaborative
Clinician EHR Experience 2026 + EHR-burden literature catalogue). Code anchors:
`bundles/ru-soam-practice/attention-intake.mjs`,
`bundles/ru-soam-schedule/view-src/schedule.tsx:180-215`, `bundles/ru-soam-sessions`.

**Live web pass (2026-07-14) — §1b:**
- Jane Day View / Day Sheet (schedule-left + center dashboard):
  jane.app/video/practitioner-s-home-base-day-sheets-charts, jane.app/guide/print-daysheet
- SimplePractice vs TherapyNotes feature/filter comparison (agenda filters: incomplete
  docs, unpaid balances, new client): ehrsource.com/compare/therapynotes-vs-simplepractice,
  choosingtherapy.com/therapynotes-vs-simplepractice
- AI-native workflow + MBC (Blueprint PHQ-9/GAD-7 first-class; Upheal/Mentalyc
  transcript→note, analytics): mentalyc.com/blog/blueprint-reviews,
  upheal.io, yung-sidekick.com/blog/the-2025-guide-which-ai-therapy-notes-tools-are-worth-your-time
- Pain-point / anti-pattern synthesis (sessions falling through cracks, customization
  theater, fragmented subsystems, 10–15 admin hrs/mo, 1-in-3 switch <2yrs):
  icanotes.com/2026/01/02/mental-health-practice-management-software-vendors-wont-tell-you
- India context (DoctorsApp, Practo Ray, Eka Care, Therasoft-India, HealthPlix):
  doctorsapp.in/blog/best-mental-health-practice-management-software,
  therasoft-india.com
