# Today Activity — Persona-A reference spec (iteration 1, settled)

**Status:** Settled reference for **persona A** (solo psychologist/counselor), 2026-07-15
**Derives from:** `today-discovery.md` §0.1 (hypotheses H5/H1/H3, decided) + the Claude
Design canvas iteration (`prototypes/canvas-v1`, `canvas-v2-attention-led`,
`canvas-v3-loud` + their OBSERVATIONS.md).
**Scope:** the therapist persona only. Personas B (psychiatrist) / C (assessment) may
adjust content weighting and the agenda-rail density; the structure below is the tested
baseline, not yet proven invariant (H0 open).
**Not yet:** real cap wiring or a bundle — this is the design reference a
`ru-soam-today` bundle spike would build to.

---

## 1. What Today is

The home surface answering **"What needs me now?"** for a solo therapist. A **worklist +
attention lens**, not an editor or a calendar — every item routes into a deeper surface.
Decided emphasis (H5/H1): **attention-led** — the worklist owns the main surface; the
calendar is reference.

## 2. Layout — the three workbench zones

```
┌────┬─────────────────┬──────────────────────────────────┬───────────────┐
│ A  │ THE LADDER      │  NEEDS YOU NOW  (worklist, hero)  │ AGENDA (rail) │
│ c  │ (stakes index)  │                                   │               │
│ t  │  ● Safety     1 │  [Safety banner — act only]       │ 09:00 Ananya  │
│ i  │  ● To complete5 │                                   │ 10:00 Rohit ⋯ │
│ v  │  ● Confirm    1 │  To complete (5)                  │  · note owed  │
│ i  │  ● Follow-ups 0 │   ▸ Rohit  OVERDUE 1D  [Write…]   │ NOW·UP NEXT   │
│ t  │                 │   ▸ Kavya  DUE TODAY   [Continue] │ 12:00 Kavya ⋯ │
│ y  │  (helper line)  │   ▸ Aarav  MISSING     [Screen]   │ 14:00 …       │
│    │                 │  Confirm & nudge (1) …            │ …             │
└────┴─────────────────┴──────────────────────────────────┴───────────────┘
   status bar: Synced · account · env · version
```

- **Left · primary sidebar = "THE LADDER"** — a compact stakes **index**: the four groups
  with counts, acting as jump-nav. **This is the single source of counts** (no separate
  counter bar). A one-line helper ("A worklist, ordered by clinical stakes. Work down the
  center; the day rail is on the right.").
- **Center · editor = "Needs you now"** — the worklist, given full room. The hero.
- **Right · aux sidebar = "Agenda"** — the day compressed to a glanceable rail (reference,
  not the main event), with a **NOW / up-next** highlight.
- **Chrome** (keep, it makes it native): menu bar, activity rail with **Today active**
  among the 8 Activities, editor tab, status bar.
- **Header** (center top): greeting + date + a light summary line ("6 sessions · 3 need
  you · 1 safety"). Coarse glance only; per-stakes counts belong to the ladder index.
  *(Micro-open: summary line vs ladder is a mild count overlap — tolerated as different
  grain; revisit if it reads redundant.)*

## 3. The stakes ladder (the signature — one escalation system)

Order = clinical failure-asymmetry. Groups, top to bottom:

1. **Safety** — interrupt-class. Rendered as a **pinned banner at the top of the center**,
   the loudest element on the page. Copy: "SAFETY · CANNOT BE SNOOZED OR DISMISSED · This
   item can only be acted on." **Only affordance = act** (e.g. "Open safety plan"). No
   Snooze, no Except.
2. **To complete** — proof-debt: intake incomplete, no risk screen, consent missing, note
   owed, on-hold past review.
3. **Confirm & nudge** — unconfirmed sessions, follow-ups.
4. **Follow-ups** — show the calm **"all clear — nothing to chase"** state when empty.

## 4. Worklist item anatomy (center)

Each item, roomy and self-contained (act without opening anything):

- **Stakes dot** (color = group) + **client name**.
- **Kind label** (muted): "Progress note · 1 day owed", "Intake incomplete · session
  today", etc.
- **Urgency tag** (adopted from V3 — real triage info): `OVERDUE 1D` · `DUE TODAY` ·
  `MISSING` · `UNSIGNED` · `34 DAYS`.
- **One-line reason** in plain language.
- **Subtle colored left-border** on the item, keyed to stakes (red = safety/missing,
  amber = proof-debt, blue = confirm). Subtle, a scan aid — not a loud stripe.
- **Actions, always visible** (not hover-hidden): the specific **Fill** verb primary
  (Write note / Continue intake / Screen / Send consent / Review), then **Snooze** and
  **Except (N/A)**. Safety items expose none of these — act-only.

**Dose = calm** overall (H3): quiet by default, Safety the only loud thing, urgency tags +
subtle borders the only adopted "loud" elements, **no redundant count chrome**.

## 5. Agenda rail (right)

Time-ordered day, compact: time · client (or "Personal") · modality · a **tiny debt
marker** where an appointment has attached debt (the actionable version lives in the
center worklist). A **NOW · up-next** treatment on the imminent session.

**Port forward from canvas V1:** a richer dedicated **"NOW / up-next" focus card** (V1 had
one; V2/V3 folded it into the rail) — keep a distinct up-next affordance, not just a rail
highlight.

## 6. Data mapping (for the bundle spike)

| Surface region | Real source |
|---|---|
| Worklist proof-debt | `record.patient.query.listAttention` → `deriveObligations` (kinds: `intake_incomplete`, `no_risk_screen`, `missing_consent_doc`, `on_hold_stale`) |
| Worklist confirm/sessions | `sessions.meeting.query.listUpcoming` + unconfirmed state |
| Safety | risk events / safety-plan state (interrupt-class) |
| Agenda rail | `schedule.calendar.query.listWindowEvents` + `record.patient.query.resolveParticipant` classification |
| Ladder counts | derived from the above (single source) |

A `ru-soam-today` bundle would **own no tables** — pure cross-bundle projection
(`product-vision-impact.md` §2.2).

## 7. Theme

Base-luma tokens (warm neutral, burnt-amber accent), Inter Tight, radius 0.625rem.
**Light and dark** both. Full workbench chrome.

## 8. Open / deferred

- **H0 invariance** — **CONFIRMED for persona B (psychiatrist, 2026-07-15).** Same 3-zone
  frame carried a dense 12-session day with no structural change; the **thin agenda-rail
  HELD 12 rows** (the feared break did not happen). Persona C (assessment/sparse) still open
  but low-risk. See `prototypes/canvas-persona-b/OBSERVATIONS.md` + `today-discovery.md`.
- **`measure_due` (H6)** — validated on persona B; earns first-class placement (dashed
  PROPOSED chip reads clean). Not yet in `deriveObligations` → **O-today-6** now actionable;
  add `measure_due` (MBC PHQ-9/GAD-7 cadence) and consider `med_recon_due` (psychiatry).
- **Up-next focus card** — port from V1 (see §5).
- **Snooze / Except persistence** — new persisted shape; belongs to the loop-mechanics
  platform ADR, not Today's (O-today-5).
- **Cross-bundle read model** — the Today bundle ADR's forcing question (O-today-4).
