# Practice Activity — Continuation Brief (Compaction)

> Paste this into a fresh chat (same project) to resume. It is a self-contained handoff: project frame, working method, settled decisions, open threads, and the immediate next step. Companion files: `practice-adr-log.md` (canonical decisions) and `practice-functional-design-draft.md` (current synthesis).

## What we're doing
Designing the **functionality of the Practice Activity** for a **local-first desktop workbench (Electron)** for **individual mental-health practitioners**. UI follows VS Code's composition model (Activity Bar, Primary Side Bar, Secondary Side Bar, Work Area, Panel). PHI is local-first and never leaves the device in plaintext; privacy and data-minimisation are first principles. **MVP launches in India.**

We are designing *functionally, from lived clinical workflow* — not from technical architecture — and discovering the Aspects of Practice that fall out of real work.

## Working method (please preserve)
- **One question at a time.** Do not advance until the user explicitly agrees a thread is settled; never close prematurely (it loses their thread).
- Provide a **recommended answer** per question; **flag opinions** with reasoning and **flag assumptions**.
- **Web-search** anything factual/current; don't design against guesses. Don't pander or steer for engagement.
- Maintain an **ADR log** for settled decisions and an in-conversation **tracker** (Open / Closed / Deferred).
- Resolve dependencies root-first.

## Vocabulary
- **Aspect** = uniform building block. **Navigation Aspect** (Primary Side Bar; pick → opens Work Area). **Contextual Aspect** (Secondary Side Bar / Panel; bound to active Work Area content).
- **Activity** = top-level Activity-Bar domain. **Projection** = read-only view of another Activity's data. **Command** = minor owner-exposed in-place write. **Overlay** = Practice's own annotation over a projection.
- Roadmap Activities: Practice, Sessions, Schedule, Assessments, Planner, Catalog, Audit Viewer (+ Billing added per ADR-0015).

## Settled decisions (ADR-0001 … 0015 — see ADR log for full text)
1. **0001** Active-client context + Overview-plus-artifacts (Model B): select client → sets active-client context + opens Client Overview; finer artifacts are their own tabs; Contextual Aspects bind to the client.
2. **0002** Separate roster *arrangement* (sort/group/filter/search on one set) from *membership* (own Aspect).
3. **0003** The record is a function of the client, not the navigation path (deterministic).
4. **0004** A lens *primes* the entry-point; never mutates the record/aspects.
5. **0005** "Agenda" (Recent/Today/Upcoming) is a read/launch projection of Schedule.
6. **0006** Four Navigation lenses: **Roster · Agenda · Attention · Intake**.
7. **0007** Cross-activity model: projection (read) / navigation-launch (forbidden) / command (delegated minor write). Owner is sole writer.
8. **0008** **Sessions is a separate Activity**; Practice reads notes as a read-only projection (git-diff analogy). No owner-write minor edit for notes.
9. **0009** Shell navigation law + **global ambient focused-client** shared across Activities (activity switch → side bar only; Work Area on selection).
10. **0010** Writes onto a projection = Practice-owned **overlays** (review/pin/flag), never owner-writes.
11. **0011** **Spine resolved:** all function-domains stay Activities; Practice is the client-centric reader/launcher. Assessments & Planner inherit the pattern (revisitable).
12. **0012** India MVP regulatory frame (MHA 2017 + DPDP 2023 + Telemedicine/Telepsychiatry 2020); local-first = compliance posture; solo practitioner = non-Significant Data Fiduciary, light DPDP consent burden, binding MHA confidentiality/consent duties.
13. **0013** MVP exclusions: insurance-claim machinery, ABDM/ABHA, multi-practitioner/clinic registration, client-facing portal. User = solo RCI psychologist / psychiatrist / counsellor, self-pay, possibly hybrid tele.
14. **0014** Consent objects: *structured facts* (AD/NR/consent/capacity) in a **Consent & Legal** aspect; *signed PDFs* in **Documents**; cross-referenced.
15. **0015** Payments/receipts owned by **Billing**; Practice projects payment status read-only. Billing's Activity-Bar status pending the promotion test.

## Navigation Aspects (settled set)
- **Roster** (base; sort/group/filter/search; diagnosis = group, tenure = sort).
- **Agenda** (Recent/Today/Upcoming; Schedule projection).
- **Attention** (system-derived obligations — exact set OPEN).
- **Intake** (pre-active pipeline — stages OPEN).

## Contextual Aspects (draft)
- **Projections (read-only):** Notes (Sessions), Scores & Trends (Assessments), Appointments (Schedule), Goals & Tasks (Planner), Payment status (Billing).
- **Practice-native:** Profile (incl. preferred language, med-awareness, diagnosis), People/Circle (NR, caregiver, family, emergency contact), Consent & Legal (AD/consent/capacity facts), Documents, Risk/Safety (OPEN — keystone), Overlays.

## Open threads (priority order)
1. **Risk / Safety** — the keystone. MHA makes this where **capacity + Nominated Representative + Advance Directive + §23 confidentiality exception** all activate together. Decide: dedicated aspect vs. always-visible banner vs. both; how the exception is surfaced and logged. **← recommended next.**
2. **Lifecycle / status model** (intake → active → on-hold → discharged) — drives Intake stages + Attention's obligation set.
3. **Full Contextual Aspect set + Client Overview composition** — confirm/refine.
4. **Promotion test** — does anything in Practice lift to an Activity; do Billing / Audit Viewer earn Activity slots?
5. **Note-privacy split** — progress notes vs. private process/psychotherapy notes.

## Deferred
Couples/family "case" object · cross-client outcome analytics home · telehealth modality details · ABDM/ABHA (post-MVP) · Assessments/Planner deep-dive · payments placement detail.

## Immediate next step
Resume the **Contextual Aspect branch, opening on Risk/Safety**, India-grounded, per open thread #1.
