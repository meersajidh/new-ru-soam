# Product Scope V1 → V2 — Relationship & Migration Ledger

**Status:** Reference (living until migration completes)
**Owner:** Product
**Date:** 2026-07-14
**Audience:** anyone asking "what happened to V1, and how did it become V2?"
**Companions:** `Product_Scope.md` (V1, as-built) · `Product_Scope_v2.md` (the
catalogue going forward) · `Product_Vision.md` + `docs/Activities/practice/goals-and-loops-discovery.md`
(the frame that motivated the rewrite).

---

## Why V2 exists

V1 (2026-05-28) catalogued surfaces by instinct — nouns first: record, sessions,
calendar, measures. It was right about the mechanism (Activity/Aspect vocabulary,
classification rule, promotion test) and right about most nouns; current bundles and
ADRs (505/507/508) were built against it and work.

The goals-and-loops discovery (2026-07-12) reframed the product: all practice work =
tending goal-domain loops; navigation should follow the practitioner's **recurring
questions**, not entity types. Mapping V1 against the goal model exposed structural
gaps — above all, no surface answered "what needs me now?" — and V2 was derived fresh
from the model rather than patched.

**V1 remains the as-built record** for surfaces that exist today. It is historical,
not authoritative for new design; new per-surface work cites V2.

## What the goal-model mapping found in V1

(Full analysis: goals doc §7a.)

- **Three surface roles** hid inside the flat catalogue: domain executors (Sessions,
  Assessments, Schedule, Billing-candidate), loop infrastructure (Practice, Catalog,
  Documents, Audit Viewer), and one straddler — Planner, whose treatment-goals half
  was Clinical *expectation authoring* while its tasks half was Operational execution.
- **Financial domain had no committed owner** (Billing was only candidate O421).
- **Safety had no executor Activity — correctly** (interrupt-class, projects into
  context; must never be a place you navigate to).
- **Audit Viewer uniquely served a guarantee** (Custody — vision's five guarantees,
  the instrument's own terms), not a practice domain.
- **Catalog + Documents were the two halves of the PHI line** (expectation-side
  library vs provided-side proofs) — instinct had the split, the model explains it.
- The misses were **rhythms, not nouns**: no Today, intake buried inside Practice,
  expectations scattered.

## The mapping ledger (V1 → V2)

| V1 (as-built) | V2 | Change |
|---|---|---|
| *(attention lens inside Practice)* | **Today** | NEW Activity — V1's biggest miss: "what needs me now?" as a place; likely the most-visited surface |
| *(intake workflow inside Practice)* | **Intake** | promoted to top level — own unit (case-run), terminals, bulk migration mode |
| Practice | **Caseload** | reframed: explicitly the per-case loop console — owner of nothing, window on everything |
| Sessions | **Encounters** | ≈ unchanged; Ease allegiance explicit (capture rides the encounter); still owns Client Meeting (ADR-508) |
| Schedule | *(absorbed: Today + Plans)* | demoted — calendar = a tool of Operational, not a domain: agenda half → Today, session-plan half → Plans, booking = an action not a place. Provider plumbing (accounts, sync, event cache — ADR-507/313) unchanged underneath |
| Assessments | *(absorbed: Encounters + Caseload + Library)* | demoted to Clinical measurement instrument: administered in Encounters, trended in Caseload, defined in Library |
| Planner | **Plans** | reframed: expectation authoring for ALL domains (treatment plan, session plan, fee terms); execution-tasks move to Today. Resolves the straddle |
| Billing (candidate, O421) | **Payments** | confirmed unconditional — a decided goal domain demands an executor; ends the candidate hedging |
| Catalog | **Library** | ≈ unchanged — instinct was right where the model is structural |
| Audit Viewer | **Trust** | widened: from audit log to the whole practitioner↔system engagement surface — instrument health (custody posture, proof-debt, backup state) |
| Documents (aspect) | Documents (aspect) | unchanged; identity clarified — the proof shelf |

Summary: instinct nailed the **nouns**; the model added the **rhythms** (Today,
Intake, Plans).

## Migration posture

- **Nothing here orders a rebuild.** MVP work-in-progress; built surfaces (Practice,
  Sessions, Schedule bundles; provider plumbing; record CRUD) keep running against V1
  identities until each migrates.
- Migration is **incremental and per-surface**; per-surface migration OIs are raised
  when reconciliation is scheduled, not pre-emptively.
- Existing bundle ADRs (505/507/508) keep citing V1 until their surface migrates;
  their data models (Client Meeting, provider tables, record spine) are unaffected by
  the catalogue reshuffle.
- When the last surface migrates, V1 is archived and this ledger becomes historical.
