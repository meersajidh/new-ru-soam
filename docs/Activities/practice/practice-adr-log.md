# Practice Activity — Architecture Decision Records (ADR Log)

> Living record of *settled* decisions for the **Practice** Activity of the local-first mental-health workbench.
> Each ADR is referenced by ID from the interview tracker. "Accepted" = both parties agreed it is settled.

---

## ADR-0001 — Active-client context: Overview-plus-artifacts (Model B)
**Status:** Accepted

**Context.** Selecting a client must open *something* in the Work Area. A client record is compound (profile, notes, plan, assessments, documents), so a single monolithic chart tab would fight the editor metaphor and leave Contextual Aspects with little to do.

**Decision.** Selecting a client sets an **active-client context** for the Practice Activity and opens a **Client Overview** as the default editor tab. Finer artifacts (a specific progress note, an assessment instance, a document) open as their *own* editor tabs. **Contextual Aspects bind to the active client** and persist across whichever artifact tab is focused.

**Consequences.** Editor metaphor preserved — you edit *an artifact*, never "a person." Contextual Aspects get a real, persistent job. Cost: the distinction between "active-client context" and "focused tab" must be made legible in the UI.

---

## ADR-0002 — Separate roster *arrangement* from roster *membership*
**Status:** Accepted

**Context.** Several desired ways to view clients risk conflating *re-sorting the same set* with *showing a different population*.

**Decision.** One **Roster** presents the canonical client set with sort / group / filter / search controls (*arrangement*). Anything that changes **membership or purpose** becomes its own Navigation Aspect — not a Roster sort. Test: *changes the set/intent → own Aspect; only re-arranges the same set → a Roster control.*

**Consequences.** Keeps the Primary Side Bar to a small set of meaningful lenses. By this test, "by diagnosis" is a Roster grouping/filter (not a lens) and "by tenure" is a Roster sort (with its real need — review-due milestones — routed to the Attention lens instead).

---

## ADR-0003 — The record is a function of the client, not the navigation path
**Status:** Accepted

**Context.** We considered letting the chosen lens change how the Overview / Contextual Aspects are populated.

**Decision.** The same client **always** yields the same Overview and the same set/placement of Contextual Aspects, regardless of which lens or path opened them. The clinical record is deterministic and path-independent.

**Consequences.** Trust & safety: never "two different charts for one person." Reinforces ADR-0001 (Contextual Aspects bind to the client, full stop).

---

## ADR-0004 — A lens primes the entry-point; it never mutates the record
**Status:** Accepted

**Context.** Navigation intent is real and should carry through to *what you see first* — without violating ADR-0003.

**Decision.** A navigation lens may set the **initial focus / default action** of the Overview (e.g. open-from-Agenda lands on today's session prep; open-from-Attention surfaces the overdue item first). It must **not** change the chart's content or the set/placement of Contextual Aspects. Analogy: opening a file *at a specific line* vs. at the top — same file.

**Consequences.** Intent honored without breaking determinism. Requires a mechanism to pass "entry-intent" from the lens to the Overview's focus.

---

## ADR-0005 — "Agenda" (Recent/Today/Upcoming) is a projection of Schedule
**Status:** Accepted

**Context.** The time-based roster lens is keyed off appointments — a per-encounter attribute owned by the Schedule domain, not a per-client attribute.

**Decision.** The time-ordered client lens in Practice (working name **Agenda**; groups Recent / Today / Upcoming) is a **projection** of Schedule's appointment data, surfaced as a Navigation Aspect inside Practice. **Schedule remains the canonical owner** of calendar/appointment data.

**Consequences.** Establishes the first cross-domain *projection* and previews the broader "spine" decision (whether Sessions / Assessments / Planner also project into Practice). Note: this is a **read/launch** projection (it lists and opens clients). **Editable** contextual projections raise a sharper canonical-ownership question ("where does the edit live?") — deferred to the spine question.

---

## ADR-0006 — Names of the four Practice Navigation lenses
**Status:** Accepted

**Context.** Q2 taxonomy settled (ADR-0002); the lenses needed final labels faithful to VS Code's plain-noun naming.

**Decision.** The Practice Primary Side Bar carries four Navigation lenses:
- **Roster** — the canonical client set, with sort / group / filter / search (the base lens).
- **Agenda** — time-ordered clients, grouped **Recent / Today / Upcoming**; a read/launch projection of Schedule (ADR-0005).
- **Attention** — *system-derived* obligations (overdue notes, no next appointment booked, review-due, risk-flagged). Distinct from Planner, which holds *practitioner-authored* tasks/goals.
- **Intake** — the pre-active pipeline (referral → waitlist → intake-in-progress). Internal stage labels deferred to the lifecycle decision.

**Consequences.** A client may appear in several lenses at once (e.g. a recent session in Agenda *and* an overdue note in Attention). This is expected — lenses are membership-by-purpose, and ADR-0003 guarantees the underlying record is identical regardless of lens.

---

## ADR-0008 — Sessions is a separate Activity; Practice reads notes as a read-only projection
**Status:** Accepted

**Context.** The spine asks, per domain: separate Activity (read-only in Practice) vs. Practice-owned Contextual Aspect (authorable with the client open)? Tested against the daily loop "open client → write today's note."

**Decision.** **Sessions is a separate Activity** and the canonical owner / sole writer of progress notes. **Note authoring happens in Sessions.** Practice surfaces a client's notes only as a **read-only projection** (history + latest note), per ADR-0007. Rationale (the git analogy): like VS Code's Source Control, `git diff` is a read-only projection *owned by* the SCM Activity that is sufficient for reading — you author the file in the editor and commit in SCM, never from the diff.

**Consequences.**
- Sets the spine's direction: the roadmap's function-Activities stay Activities; Practice is the client-centric reader/launcher that projects them.
- Notes have **no owner-write "minor edit"** from Practice (any content change is the Sessions act). Practice's only write is its **own overlay** on the projection — e.g. mark-reviewed, pin-to-Overview, flag-for-follow-up — which is Practice-owned data, not a Sessions write (see candidate ADR-0009b).
- Workability depends on a **shared ambient focused-client context** across Activities (see candidate ADR-0009a); otherwise the read-in-Practice → author-in-Sessions loop becomes a re-navigation tax.
- **Assessments** and **Planner** inherit this pattern by default, pending an optional per-domain sanity check (esp. Planner / treatment goals).

---

## ADR-0009 — Shell navigation model + global ambient focused-client context
**Status:** Accepted

**Context.** ADR-0001 introduced a client-context layer above artifact tabs. The daily loop (read in Practice → author in Sessions) needs that context to survive Activity switches, with precise navigation semantics so it *primes* without forcibly moving the Work Area (consistent with ADR-0004).

**Decision.**
- An **Activity switch updates the Primary Side Bar only** — it does not navigate the Work Area.
- The **Work Area navigates only on an explicit Primary Side Bar selection or action** (faithful to VS Code: switching to Source Control shows the changed-files list; the diff opens only when you select a file).
- **Focused-client is a global ambient context** shared across all Activities (Practice, Sessions, Assessments, Planner, Schedule). On entering an Activity it *primes* what that Activity brings into focus (highlights/scrolls the client in the side bar, surfaces the relevant default) without forcing Work Area navigation. It persists until replaced by a selection/action, and an Activity may decline to honor it where it doesn't make sense.
- Actions invokable directly from a Primary Side Bar (without Work Area navigation) preserve Work Area state, so context *feels* persistent.

**Consequences.** Generalizes ADR-0004 ("lens primes, never mutates") from Practice's lenses to all Activities. Makes the read-in-Practice → author-in-Sessions loop one fluid motion. Shell-level rule that Practice inherits.

---

## ADR-0010 — Writes onto a read-only projection are Practice-owned overlays, never owner-writes
**Status:** Accepted

**Context.** ADR-0007 forbids writing *through* a projection; ADR-0008 makes notes read-only in Practice. "Minor edits" needed a precise meaning.

**Decision.** Practice may attach its **own** annotations/overlays on top of a read-only projection — e.g. *mark-reviewed, pin-to-Overview, flag-for-follow-up*. These write **Practice's** data layered over the projection, never the owner's. For **notes specifically there is no owner-write minor edit** (any content change is the owning Activity's act — you don't edit from the diff). Owner-exposed commands (ADR-0007, e.g. Schedule's confirm/no-show) remain available where the owner offers them, and are distinct from overlays.

**Consequences.** Practice gets useful interaction on projected data without breaching read-only or sole-writer. **Overlays become a Practice-native data category** to account for in the Contextual Aspect set.

---

## ADR-0011 — Spine resolved: the roadmap's function-Activities stay Activities; Practice projects them
**Status:** Accepted

**Context.** Sessions (ADR-0008) and Schedule (ADR-0005) resolved as separate Activities, read-only in Practice. Assessments and Planner were pending the "do I author this while the client's open?" test.

**Decision.** **Assessments** and **Planner** accept the inherited pattern — each is a **separate Activity**, surfaced in Practice as a **read-only projection** (plus Practice overlays per ADR-0010). The spine is resolved in this direction for the whole roadmap: **Practice is the client-centric reader/launcher; it does not absorb the function-Activities as owned Contextual Aspects.** Accepted by inheritance and **revisitable** once Assessments and Planner are understood in detail.

**Consequences.** The open-client Contextual Aspect set is now largely determined: **read-only projections** (notes, scores/trends, appointments, goals/tasks) **+ Practice-native aspects** (profile, documents, risk?, overlays). Unlocks the Contextual Aspect enumeration as the next branch.

---

## ADR-0012 — MVP launches in India: regulatory frame and compliance posture
**Status:** Accepted (context & posture; specific feature implications tracked as proposals)

**Context.** The MVP launches in India. The governing instruments for a solo mental-health practitioner are the **Mental Healthcare Act 2017 (MHA)**, the **Digital Personal Data Protection Act 2023 + DPDP Rules 2025**, and the **Telemedicine Practice Guidelines 2020 / Telepsychiatry Operational Guidelines 2020**. *(Not legal advice — verify with Indian counsel.)*

**Decision (posture).**
- **Local-first / PHI-never-leaves-device is the compliance posture**, not merely a feature: it aligns with DPDP data-minimisation and security, avoids cross-border-transfer obligations, and supports MHA §23 confidentiality.
- The solo practitioner is a **Data Fiduciary** but almost certainly **not a Significant Data Fiduciary** — no DPO/DPIA/independent-audit machinery assumed. Healthcare professionals are **exempt from verifiable-consent** for processing necessary to provide health services, so the MVP does **not** build heavy DPDP consent machinery around core treatment data.
- **MHA informed-consent and confidentiality duties bind**, and **DPDP data-principal rights** (access, correction, erasure, grievance) must be supportable. These give the **consent** and **audit/access-log** surfaces statutory weight.

**Consequences.** Validates the product's first principles. Surfaces India-specific clinical-record objects — **Nominated Representative, Advance Directive, capacity, informed consent, confidentiality-with-exceptions** — as candidate Practice-native facets that converge at the risk moment. Reframes the deferred "billing" item toward lightweight **self-pay payments/receipts** (not insurance claims). Strengthens the **Audit Viewer** Activity. Adds profile attributes (preferred language, medication-awareness, diagnosis). **ABDM/ABHA** integration is explicitly out of MVP scope (and a philosophical tension to investigate later).

---

## ADR-0013 — MVP scope exclusions
**Status:** Accepted

**Context.** India launch scope confirmed; an explicit boundary keeps the design from drifting into out-of-scope surfaces.

**Decision.** Target user is a **solo RCI-licensed clinical psychologist / psychiatrist / counsellor** in private practice, **self-pay**, possibly hybrid in-person + tele. The MVP explicitly **excludes**: insurance-claim/coding machinery; **ABDM/ABHA** integration; multi-practitioner / clinic-establishment registration workflows; and any **client-facing portal or patient-side app** (consistent with local-first, PHI-on-device).

**Consequences.** Keeps the surface focused on the single-practitioner clinical workflow. Revisit post-MVP (especially the ABDM tension).

---

## ADR-0014 — Consent objects: structured facts vs. filed documents
**Status:** Accepted

**Context.** MHA objects (Nominated Representative, Advance Directive, informed consent, capacity) are *both* structured facts referenced in clinical/risk decisions *and*, often, signed PDF artifacts.

**Decision.** The **structured, actionable facts** ("AD active," "NR = person X, written consent on file, valid from date," capacity status) live in a Practice-native **Consent & Legal** Contextual Aspect. The **signed artifact** (PDF/scan) lives in **Documents**. The two cross-reference.

**Consequences.** Risk/safety and capacity flows read structured facts directly without opening PDFs; Documents stays the file store. Exact surfacing is part of the still-open Contextual Aspect branch.

---

## ADR-0015 — Payments/receipts owned by Billing; Practice projects status
**Status:** Accepted

**Context.** Self-pay reality (ADR-0012). Decision to keep payments/receipts organised under a single Billing home rather than scattering them.

**Decision.** **Payments/receipts (self-pay fees, paid/pending status, receipt/invoice generation) are owned by a Billing domain.** Per the spine (ADR-0011), Practice surfaces **payment status as a read-only projection** (e.g. on the Overview / Attention), and other surfaces (Schedule) may project it too. Whether Billing earns a top-level Activity Bar slot vs. another placement is subject to the **promotion test** (still open).

**Consequences.** Adds Billing as an owning domain (roadmap addition). Practice does not own payment data — it reads it; receipt generation / payment entry happen in Billing (or via a minor command where appropriate).

---

*Open threads and deferred items are tracked in-conversation, not here. Only settled decisions land in this log.*
