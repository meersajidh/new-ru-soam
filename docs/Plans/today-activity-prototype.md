# Plan — Today Activity, design prototype (disposable)

**Status:** Plan (approved for prototype build 2026-07-14)
**Owner:** Product / build
**Medium:** claude.ai design Artifact (self-contained HTML mockup) — **not** repo code
**Derives from:** `docs/Product/Product_Vision.md` (Insight + Safety guarantees),
`docs/Product/Product_Scope_v2.md` (Activity #1 Today),
`docs/Activities/practice/goals-and-loops-discovery.md` §3–§5 (catch-up loop +
failure-asymmetry).

---

## Context

The product was reframed (Vision + Scope v2, 2026-07-14) from an entity-first
catalogue to **8 goal-derived Activities** whose navigation follows the
practitioner's recurring questions. **Today** ("what needs me now?") is the biggest
V1 miss and the likely most-visited surface — the roster-wide **Insight** guarantee
made primary navigation, plus **Safety**'s roster-wide projection.

First prototype of the new Activity set. Decisions taken this session:

- **Scope:** build **Today, deep** (not a thin all-8 IA pass).
- **Placement:** Today is a **new independent Activity**. The new set coexists with
  the current Practice / Schedule / Sessions Activities for now; the old ones are
  removed later. Today is therefore designed **afresh**, not bolted onto Practice.
- **Fidelity:** **prototype / disposable.** Medium = a claude.ai design Artifact
  (fast, app-faithful, zero repo-code risk, iterable on layout before committing).
  Promotion to a real `ru-soam-today` bundle is the follow-up if the shape lands.

## What Today must show (grounded in the model + existing code)

Two stacked regions (the user-approved shape):

1. **Agenda** — today / this-week timeline. Real-app source:
   Schedule `schedule.calendar.query.listWindowEvents` + per-event client
   classification via `record.patient.query.resolveParticipant`
   (`bundles/ru-soam-schedule/view-src/schedule.tsx:180-215`). Each row: time,
   client (or "Personal" / "Unclassified"), modality, and **confirmation state**
   (an unconfirmed session is loop-work).

2. **Needs you now** — the cross-client attention / loop engine. Real-app source:
   `record.patient.query.listAttention` →
   `deriveObligations(row, now)`
   (`bundles/ru-soam-practice/attention-intake.mjs:72-94`), plus Sessions
   `sessions.meeting.query.listUpcoming`. Grouped by the catch-up-loop
   failure-asymmetry (goals doc §3, §4 design note):

   | Group | Real obligation kinds | Affordances |
   |---|---|---|
   | **Safety flags** (interrupt-class) | risk / safety-domain | click-through only — **no Snooze, no Except** (§4: a safety gap can't be snoozed) |
   | **Proof-debt** | `intake_incomplete`, `no_risk_screen`, `missing_consent_doc`, `on_hold_stale` (`ON_HOLD_REVIEW_DAYS = 30`) | Fill · Snooze · Except |
   | **Unconfirmed / due sessions** | Sessions upcoming + unconfirmed | Fill · Snooze |
   | **Follow-up nudges** | due loop-work | Fill · Snooze |

   Per-item verbs come from the loop model §3 ("practitioner: fill / snooze /
   except"): **Fill** = click-through to the client/case; **Snooze**; **Except**
   = mark N/A.

Framing chrome: an Activity-Bar rail showing **all 8 V2 Activities** (Today, Intake,
Caseload, Encounters, Plans, Payments, Library, Trust) with **Today active**, so the
new IA reads at a glance; a date header; and a terse "what's clear" affirmation when
a group is empty (Reliability / Insight tone, not a nag surface).

## Faithfulness constraints

- App visual language: Inter Tight, the basebench-ui token palette (signature theme,
  base-luma), Phosphor-style icons — but **inline everything** (Artifact CSP blocks
  external hosts; icons as inline SVG).
- Theme-aware (light + dark).
- Mock data: 6–9 clients, a believable day (2–3 sessions incl. one unconfirmed),
  one Safety flag, a spread of proof-debt kinds, one on-hold-stale. Indian
  solo-practitioner flavour (names, UPI, MHA terms) per the Vision's target user.
- Product-scope-faithful mock, **no live cap wiring**.

## Build steps

1. Invoke `frontend-design` skill (project UI convention) + `artifact-design` skill
   (required before writing an Artifact page).
2. Write `today-activity.html` in the session scratchpad — two-region layout +
   activity rail + mock data + fill/snooze/except (Safety = no-snooze).
3. Publish via Artifact (favicon ☀️, title "Today — ru-soam").
4. Report the URL + a region→cap promotion map (below) so the bundle path is obvious.

## Region → real-cap promotion map (for the follow-up bundle spike)

- Agenda → `schedule.calendar.query.listWindowEvents` + `record.patient.query.resolveParticipant`.
- Proof-debt → `record.patient.query.listAttention` + `deriveObligations`.
- Sessions group → `sessions.meeting.query.listUpcoming`.
- New `ru-soam-today` bundle would own **no tables** — pure cross-bundle projection
  surface (the first true one; see `docs/Product/product-vision-impact.md` §2.2).

## Verification

Visual self-review of the published Artifact, light + dark:
- Safety group has no Snooze/Except control.
- Proof-debt kinds match the four real obligation types.
- Agenda shows an unconfirmed session.
- Page body never scrolls horizontally.
- All 8 Activity items render in the rail with Today active.

No repo gates apply — nothing in the repo changes.

## Not in scope

- No real cap wiring, no `ru-soam-today` bundle, no manifest / view build.
- No other Activities beyond their labels/icons in the rail.
- No loop-mechanics platform ADR / case-entity work (owed later — impact doc §3–§4).
