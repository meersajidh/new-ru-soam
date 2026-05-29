# Practice Activity — Functional Design (Draft v0.1)

**Product:** Local-first desktop workbench (Electron) for individual mental-health practitioners.
**Scope of this document:** the **Practice** Activity only. Intended as functional input for UI/UX design.
**Status:** Draft, produced mid-design. Decisions trace to the ADR log (`practice-adr-log.md`, ADR-0001…0015). Sections marked **[OPEN]** are not yet designed and are bounded by stated constraints; UI/UX should treat them as placeholders, not specifications.
**Not legal advice** — regulatory points (MHA 2017, DPDP 2023, Telemedicine/Telepsychiatry Guidelines 2020) are design grounding to verify with counsel.

---

## 1. Purpose & scope

Practice is the **client-centric lens over the entire caseload**, and the surface from which the practitioner drills into the day-to-day work on each person. The analogy is VS Code's Explorer: as Explorer encapsulates the repository and the workflow beneath it, Practice encapsulates the roster and the clinical workflow beneath it.

Practice is a **reader and launcher**, not an owner of clinical work-products. Notes, appointments, assessments, goals/tasks, and payments are each owned by their own domain/Activity; Practice surfaces them per-client as read-only projections and launches into work on them. Practice *owns* only client-native data (profile, the people around the client, consent/legal facts, documents, risk/safety, and its own annotations). See §9.

**Practice is:** the place you open a person and see/act on everything about them.
**Practice is not:** the place clinical artifacts are authored (that happens in their owning domains), nor a calendar, nor a billing ledger.

---

## 2. Vocabulary (self-contained recap)

- **Aspect** — the uniform building block (VS Code's "View," renamed). Plays one of two roles by region:
  - **Navigation Aspect** — sits in the Primary Side Bar; the lists/trees you pick from; a selection opens content in the Work Area.
  - **Contextual Aspect** — sits in the Secondary Side Bar or Panel; bound to whatever is active in the Work Area.
- **Activity** — a top-level domain in the Activity Bar. Selecting it opens its Navigation Aspects in the Primary Side Bar.
- **Projection** — a *read-only* rendering of another Activity's data inside this one. Never writable through the projection.
- **Command** — a minor, owner-exposed write that Practice *invokes* and the owning Activity *executes in place*; "minor" = expressible as one scoped command needing none of the owner's own UI canvas.
- **Overlay** — Practice's *own* annotation layered over a projection (e.g. mark-reviewed, pin, flag) — never a write to the owner's data.

---

## 3. Shell instantiation for Practice

- **Activity Bar:** Practice is the central Activity item.
- **Primary Side Bar:** Practice's four Navigation Aspects — **Roster, Agenda, Attention, Intake** (§5).
- **Work Area (center, tabbed):** the **Client Overview** (default editor tab on opening a client) plus finer **artifact tabs** (a specific note, an assessment instance, a document).
- **Secondary Side Bar / Panel:** the **Contextual Aspects** bound to the active client (§6–7).

---

## 4. Core interaction models (settled)

**4.1 Active-client context + Overview-plus-artifacts (ADR-0001).**
Selecting a client (a) sets an **active-client context** for Practice and (b) opens a **Client Overview** as the default editor tab. Finer artifacts open as their own tabs. Contextual Aspects bind to the **active client** and persist across whichever artifact tab is focused. You edit *an artifact*, never "a person."

**4.2 Global ambient focused-client (ADR-0009).**
The focused client is a **global ambient context shared across all Activities** (Practice, Sessions, Schedule, Assessments, Planner, Billing). Entering another Activity *primes* what it brings into focus for that client (e.g. Sessions opens that client's note for authoring; Schedule highlights their appointments) without forcing Work Area navigation. It persists until replaced by a selection/action; an Activity may decline to honour it where it makes no sense. This is what makes "read in Practice → author in Sessions" one fluid loop.

**4.3 Navigation law (ADR-0009).**
An **Activity switch updates the Primary Side Bar only** — it does not navigate the Work Area. The **Work Area navigates only on an explicit Primary Side Bar selection or action** (faithful to VS Code: switching to Source Control shows the changed-files list; the diff opens only when you select a file). Actions invokable directly from a side bar (without Work Area navigation) preserve Work Area state.

**4.4 Determinism + priming (ADR-0003, ADR-0004).**
The record is a **function of the client, not the navigation path**: the same client always yields the same Overview and the same set/placement of Contextual Aspects, regardless of which lens opened them. A lens may **prime the entry-point** (initial focus / default action — e.g. open-from-Agenda lands on today's session prep; open-from-Attention surfaces the overdue item) but **never mutates** content or aspect set. Analogy: opening a file at a specific line vs. at the top — same file.

**4.5 Cross-activity interaction (ADR-0007, ADR-0010).**
Projection (read) / cross-activity navigation-launch (forbidden) / command (delegated write) / overlay (Practice-owned). Authoring is **never** a cross-activity operation. For notes specifically there is **no owner-write minor edit** from Practice — the read-only projection is the entire note interaction; Practice's only write is its own overlay (review/pin/flag).

---

## 5. Navigation Aspects (Primary Side Bar) — ADR-0006

One **Roster** (canonical set, re-arrangeable) plus three intent lenses with distinct membership. Principle (ADR-0002): *changes membership/purpose → its own Aspect; only re-arranges the same set → a Roster control.* A client may legitimately appear in several lenses at once.

**5.1 Roster** — the base lens; the full canonical client set.
- Controls: **sort / group / filter / search** (arrangement only). Includes group-by-diagnosis and sort-by-tenure as *controls*, not separate lenses.
- Selection → opens the client (Overview) in the Work Area.

**5.2 Agenda** — time-ordered clients; a **read/launch projection of Schedule** (ADR-0005).
- Groups: **Recent / Today / Upcoming**. A client can appear under more than one group (e.g. a past session and a future booking).
- Selection → opens the client; entry-intent primes "today's session prep" when opened from Today.

**5.3 Attention** — **system-derived obligations** (distinct from Planner's authored tasks).
- Candidate membership **[OPEN]**, pending the lifecycle model: overdue note, no next appointment booked, treatment-review due, risk-flagged, (payment pending — projected from Billing). The exact obligation set is to be designed.
- Entry-intent primes the specific overdue item on open.

**5.4 Intake** — the **pre-active pipeline**.
- Internal stages **[OPEN]**, pending the lifecycle/status model (candidate: referral → waitlisted → intake scheduled → intake in progress → active).

---

## 6. The open-client experience (Work Area)

**6.1 Client Overview (default editor tab).** The at-a-glance chart, assembled from projections + Practice-native data + overlays. **Candidate composition [OPEN — to be refined]:** identity/header with risk flag if present; next appointment (Schedule projection); last/most-recent note summary (Sessions projection); active treatment goals (Planner projection); recent assessment scores/trend (Assessments projection); payment status (Billing projection); consent/legal status badges (Consent & Legal — e.g. AD active, capacity concern). Entry-intent (§4.4) sets initial focus.

**6.2 Artifact tabs.** Opening a finer artifact (a specific note, an assessment instance, a document) opens it as its own Work Area tab. Authoring of owned artifacts occurs in the owning Activity (the tab may launch/host that owner's editor per the navigation law and cross-activity rules).

---

## 7. Contextual Aspect inventory (Secondary Side Bar / Panel) — DRAFT

Bound to the active client; identical regardless of lens (ADR-0003). Two categories:

**7.1 Read-only projections (owned elsewhere; ADR-0011):**
- **Notes** — progress-note history + latest (Sessions). Read-only; overlays allowed (reviewed/pin/flag).
- **Scores & Trends** — assessment results and trajectories (Assessments).
- **Appointments** — past/upcoming for this client (Schedule). Minor commands possible where Schedule exposes them (e.g. confirm/no-show).
- **Goals & Tasks** — treatment goals and tasks (Planner).
- **Payment status** — paid/pending, receipts (Billing).

**7.2 Practice-native aspects (owned by Practice):**
- **Profile** — demographics, contact, **preferred language**, medication-awareness (current meds / external prescriber — not a prescribing workflow), diagnosis/problem-list.
- **People / Circle** — **Nominated Representative**, caregiver(s), family, emergency contact. Prominent given Indian family-involved care and MHA roles.
- **Consent & Legal** — *structured facts* (ADR-0014): **Advance Directive** status, **informed-consent** records (incl. tele-consent + modality), **capacity** status, confidentiality-exception events. Cross-references the signed PDFs in Documents.
- **Documents** — per-client PHI files: signed consent forms, releases, AD/NR artifacts, uploads (file store; ADR-0014).
- **Risk / Safety** — **[OPEN — keystone, next to design]**. The moment where capacity, NR, AD, and the MHA §23 confidentiality exception converge. Open question: dedicated aspect vs. always-visible banner vs. both.
- **Overlays** — Practice's review/pin/flag annotations over projections (ADR-0010).

---

## 8. Regulatory / India functional requirements (MVP)

- **Local-first compliance posture (ADR-0012):** PHI never leaves the device in plaintext; this is the privacy stance, not just a feature.
- **Confidentiality (MHA §23):** confidential by default, with a lawful exception to avert danger to self/others (information may be shared with the NR / concerned professionals). The Risk/Safety design must make this exception explicit and logged.
- **Informed consent (MHA):** per-intervention; recorded as structured facts + filed artifact. Telehealth consent varies by modality/initiator.
- **Data-principal rights (DPDP):** the practitioner must be able to **access, correct, and erase** a client's data; events are auditable. Feeds the **Audit Viewer** Activity.
- **Consent machinery is light:** healthcare professionals are exempt from *verifiable-consent* for treatment-purpose processing; the solo practitioner is not a Significant Data Fiduciary. Do not over-build consent UI around core treatment data.
- **Multilingual:** preferred language is a profile attribute; affects consent notices and (in the Assessments Activity) validated instrument translations.

---

## 9. Cross-activity relationships (the spine — ADR-0005/0008/0011)

All roadmap function-domains remain their **own Activities**; Practice **projects them read-only** and launches into them via the global ambient context:

| Domain | Owns | In Practice |
|---|---|---|
| Sessions | Progress notes (authoring) | Notes projection (read-only) + overlays |
| Schedule | Calendar/appointments | Agenda lens + Appointments projection; minor commands (confirm/no-show) |
| Assessments | Measures, scoring | Scores & Trends projection |
| Planner | Treatment goals, tasks | Goals & Tasks projection |
| Billing | Self-pay payments/receipts | Payment-status projection |
| Audit Viewer | Consent/access log | (consumes Practice's consent & data-rights events) |

Authoring happens in the owner; Practice never writes the owner's data (only invokes minor exposed commands, or layers its own overlays).

---

## 10. Explicit exclusions (ADR-0013)

Out of MVP scope: insurance-claim/coding machinery (self-pay only); ABDM/ABHA integration; multi-practitioner / clinic-establishment registration; any client-facing portal or patient-side app.

---

## 11. Open questions / not yet designed

1. **Risk / Safety** design (keystone): dedicated aspect vs. banner vs. both; how capacity + NR + AD + §23 exception converge and are logged.
2. **Lifecycle / status model** (intake → active → on-hold → discharged): drives Intake's stages and Attention's obligation set.
3. **Full Contextual Aspect set + Overview composition**: confirm/refine §6.1 and §7.
4. **Promotion test pass**: does anything in Practice lift to an Activity, and do Billing / Audit Viewer earn Activity-Bar slots or another placement?
5. **Note-privacy split**: progress notes vs. private process/psychotherapy notes (separate confidentiality treatment).
6. **Payments placement detail** (Billing surface) and whether any payment action belongs in Practice as a minor command.
7. **Deferred:** couples/family "case" object; cross-client outcome analytics home; telehealth modality details; ABDM (post-MVP).
