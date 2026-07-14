# Product Scope v2.0 — Goal-Derived Activity Catalogue

**Status:** Draft v2.0 (living document) — **the Activity catalogue**
**Owner:** Product
**Date:** 2026-07-13
**Derives from:** `Product_Vision.md` (goal sets + principles) and
`docs/Activities/practice/goals-and-loops-discovery.md` §7 (derivation).
**History:** the V1 catalogue, what changed and how built surfaces migrate →
`ProductScopeV1-V2.md`.

---

## Purpose

The model's frame (goals doc §0/§7b, distilled in Vision): all practice work =
tending the facets of the relationship, so **navigation follows the practitioner's
recurring questions, not entity types**. EHR-usability
research says rhythm-misalignment, not missing nouns, is what burns clinicians —
entity-first catalogues miss the rhythms (nothing answers "what needs me now?").

Every Activity row must state: the **question** it answers, its **goal allegiance**
(which relationship facets — the practice sub-domains — / guarantees — see Vision),
and its **role**:

- **Domain executor** — where one goal domain's reality moves.
- **Loop infrastructure** — serves every domain's loop, owns none.

## Vocabulary

**Aspect** = the uniform view primitive; Navigation Aspect (Primary Side Bar, coupled
to Activity Bar) vs Contextual Aspect (Secondary Side Bar / Panel, bound to the active
entity). **Activity** = a top-level navigation surface in the Activity Bar.
Classification rule: default is Aspect; promotion to Activity requires a compelling
case; promotion is an abstraction lift. Duality: Activities project Contextual Aspects
of themselves into other contexts. (Mechanism: ADR-405/402/408/404.)

**Facets ↔ domains:** the Vision calls the practice goal domains **facets of the
relationship**; the facets form the practice **sub-domains** that this catalogue's
"domain" / "domain executor" labels refer to.

## The Activity catalogue (v2)

| # | Activity | Bundle id (indicative) | Question it answers | What the practitioner does | Role | Goal allegiance |
|---|---|---|---|---|---|---|
| 1 | **Today** | `ru-soam.today` | "What needs me now?" | Start the day; work the agenda; act on interrupts (Safety flags) and due loop-work (proof-debt, unconfirmed sessions, follow-up nudges) across all clients. The default home surface. | loop infrastructure | **Insight**; Safety's roster-wide surface |
| 2 | **Intake** | `ru-soam.intake` | "Who's at my door?" | Triage the inbound queue (both doors: BAU drip + migration bulk); run intake spines case-by-case (Inquiry → Screening → Commitment → Enrollment → confirm); record terminals; run bulk calendar→caseload migration mode. | loop infrastructure (seeds all loops) | Operational + seeds every domain |
| 3 | **Caseload** | `ru-soam.caseload` | "Where does this case stand?" | Browse persons/cases; open a case's loop console: the five domain lenses, gap lists, claim/proof state, expectation completeness; the person-level journey across cases (the 360). | loop infrastructure (the per-case console — owns no domain) | ALL practice domains |
| 4 | **Encounters** | `ru-soam.encounters` | "Run the session, capture as I go" | Conduct/record the clinical encounter (Client Meeting): notes, in-session assessments, risk capture — capture at the moment of creation, no after-hours re-keying. | domain executor | **Clinical**; the Ease guarantee's structural answer |
| 5 | **Plans** | `ru-soam.plans` | "What did we agree?" | Author and revise expectations: treatment plan (Clinical), session plan/cadence (Operational), fee terms + sliding scale (Financial), per-case expectation tuning (which items apply, N/A rules). | loop infrastructure (expectation side of all domains) | expectation authoring, ALL domains |
| 6 | **Payments** | `ru-soam.payments` | "Am I getting paid?" | Per-client payments ledger: fees due, payments received (UPI-first), receipts, outstanding balances. Self-pay only (insurance workflows structurally out of scope — goals doc §7b). | domain executor | **Financial** |
| 7 | **Library** | `ru-soam.library` | "Where's my reusable content?" | Browse/maintain PHI-free content assets: form templates (biopsychosocial, consent, screeners — India/MHA-aware), worksheets, psychoeducation, snippet content. Ship-and-update from our cloud (PHI line: expectation side). | loop infrastructure (expectation-content library) | expectation side, cross-domain; Ease |
| 8 | **Trust** | `ru-soam.trust` | "Is the instrument holding its guarantees?" | Review the audit/consent ledger; custody posture (what's protected, what left the boundary, disclosures); proof-debt overview; backup/recovery state. The practitioner↔system engagement surfaced — instrument health. | loop infrastructure (the instrument surfaced) | **Custody**, Fidelity (guarantees); Legal secondary |

Bottom-group platform items (Bundles, Settings, Recovery, Onboarding) remain
core-shell, not Activities (ADR-405) — unchanged.

### Deliberate absences

- **No Safety Activity.** Safety is interrupt-class and per-person contextual: it
  *projects* into wherever the practitioner is (banner, contextual aspect, Today
  interrupts) — never a place you navigate to. Roster-wide safety attention rides
  Today's Insight machinery.
- **No Schedule Activity.** The calendar is a *tool* of the Operational domain, not a
  domain: agenda half → Today; session-plan half → Plans; booking = an action
  available in context. Provider plumbing (accounts, sync, event cache — ADR-507/313)
  is unchanged underneath.
- **No Assessments Activity.** A standardized measure is a Clinical measurement
  instrument: administered in Encounters, trended in Caseload. Instrument definitions
  live in Library.
- **No generic Tasks/Planner.** Execution-tasks surface on Today (due loop-work);
  goal/expectation authoring lives in Plans — the two loop roles stay separate.

## Aspects (Contextual) — starting set

Identified so far; per-Activity scoping (O197 method, per-surface ADRs) owns the rest.

| Aspect | Role in the model | Bound to | Projects into |
|---|---|---|---|
| **Documents** | the proof shelf — provided-side artifacts across ALL domains (signed consents → Legal, reports → Clinical, receipts → Financial) | active person/case | Caseload, Encounters |
| **Safety** (banner + safety-plan + risk events) | interrupt-class projection of the Safety domain | active person | everywhere the person is open; Today (roster-wide) |
| **This-case sessions / assessment trends / audit entries / payment status** | per-domain loop lenses | active case | Caseload console |

## Cross-surface data

The canonical Client/Patient record stays owned by the domain module and exposed as
`record.*` capabilities (ADR-504 → ADR-506; FP-Host-resident). Every v2 Activity
consumes `record.*` rather than re-declaring types. The case entity (intake doc §1)
will join the canonical set when built. Client-vs-Patient label stays a
product-configuration value (UI copy only; `patient.*` context keys unchanged).

## Lifecycle & ownership

- **This doc is the catalogue source of truth.** New per-surface design cites it.
  Built surfaces created under the V1 catalogue migrate incrementally —
  `ProductScopeV1-V2.md` owns that ledger.
- Per-surface design lives in a bundle ADR (500-range), stating which goal
  expectations the surface tends and which loops it moves — the O197 method continues
  with goal-allegiance now a required part of the brief.
- The catalogue grows additively; a new surface needs a row here (default Aspect,
  promotion argued via the classification rule AND goal allegiance) + a bundle ADR.
- Loop mechanics (expectation/provided, claim/proof, proof-debt) are cross-Activity
  platform machinery — they get their own ADR when built, not a bundle ADR.

## Open items

- Migration of V1-built surfaces (per-surface OIs raised when scheduled —
  `ProductScopeV1-V2.md`).
- O421 — resolved in direction (**Payments** unconditional); bundle ADR pending.
- Today / Intake / Plans / Trust — no bundle ADRs yet; first per-surface passes.
- Case entity ownership (intake doc §1) — canonical-record extension when built.
