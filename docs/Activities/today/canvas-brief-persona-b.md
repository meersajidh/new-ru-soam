# Canvas brief — Today persona B "psychiatrist" (tests H0 invariance + rail density + H6)

Paste this as a **follow-up in the same Claude Design project** that built V1/V2/V3 (keeps
the workbench chrome, base-luma tokens, and theme). If you're in a fresh project, paste
`canvas-brief.md` Block 0 first, then this.

**What we're testing (one thing moves — the *content*, not the structure):**
- **H0 — structure invariance.** Persona A settled the 3-zone attention-led layout
  (ladder index left · worklist center · agenda rail right). Does that same frame still
  read well for a **psychiatrist with a dense day** — or does a packed schedule force a
  structurally different Today? **Keep the structure identical to the persona-A winner
  (V2).** Only the persona + mock content changes.
- **Rail density** — the thin right agenda rail is the thing most likely to break on a
  **12-session day**. We want to *see* whether a compact rail can hold 12 rows and still
  be glanceable, or whether it collapses into an unreadable stripe.
- **H6 — `measure_due` as first-class attention.** Psychiatry runs measurement-based care
  (PHQ-9 / GAD-7 cadence). Include a **`measure_due`** obligation kind, clearly marked as
  **PROPOSED** (not yet in the real derivation), to test whether it earns a place.
- **Content weighting** — proof-debt shifts from therapy notes toward **medication /
  legal debt** (med-recon, prescription/consent) + shorter, higher-volume notes.

---

## The prompt

> Build a **persona B** version of the Today screen — same app, same workbench chrome,
> same warm-neutral base-luma theme (light + dark), and the **exact same 3-zone structure
> as the attention-led version (V2)**: left primary sidebar = the stakes **ladder index**
> (group names + counts, jump-nav, the single source of counts); center editor = **"Needs
> you now"** worklist (the hero, roomy, inline visible actions); right aux sidebar = the
> **agenda day rail** (compact, reference, with a NOW / up-next treatment). Do **not**
> redesign the layout — this is a content swap to a different practitioner, testing whether
> the same frame holds. Change the practitioner, the day, and the obligation mix.
>
> **Persona: Dr. Arjun Menon, consultant psychiatrist.** A **dense day — 12 sessions**,
> shorter (20–30 min med-review slots plus a couple of longer intakes). This is the whole
> point: the day is packed, so the agenda rail must carry ~12 rows. Show it honestly — if
> a compact rail can hold 12 sessions and stay glanceable, prove it; use a NOW marker and
> an up-next highlight so the eye lands on the imminent one. Time-order the day, each row =
> time · client (or "Personal") · modality · a tiny debt marker where that appointment has
> attached debt.
>
> **Center worklist — psychiatry-weighted proof-debt.** Same ladder, same item anatomy as
> V2 (stakes dot + client name, muted kind label, an **urgency tag** — OVERDUE 1D / DUE
> TODAY / MISSING / UNSIGNED / 34 DAYS, a one-line plain reason, a **subtle colored
> left-border** keyed to stakes, and **inline visible actions**: the specific Fill verb +
> Snooze + Except). The mix leans clinical/legal, not therapy notes:
>
> - **Safety** (pinned banner, act-only, no snooze/except): a client flagged for a
>   **medication risk** — "Sertraline + tramadol interaction flagged · review before
>   next script." Only affordance = "Open safety plan" / "Review interaction."
> - **To complete** (proof-debt):
>   - **Med reconciliation** owed — "Meds not reconciled · session today" — tag `MISSING`.
>     *(Mark this a PROPOSED kind — `med_recon_due` — same as `measure_due` below; med-recon
>     is not yet a real obligation.)*
>   - **`measure_due` (PROPOSED)** — "PHQ-9 due · last score 34 days ago" — tag `34 DAYS`.
>     A second one: "GAD-7 not administered this episode" — tag `MISSING`. Style these with
>     a small **PROPOSED** chip so they're visibly not-yet-real.
>   - **Progress note owed** (shorter psychiatry note) — "Med-review note · 1 day owed" —
>     tag `OVERDUE 1D`.
>   - **Prescription / consent (Legal)** — "Controlled-med consent unsigned" — tag
>     `UNSIGNED`.
>   - **Intake incomplete** — one new referral mid-intake — tag `DUE TODAY`.
> - **Confirm & nudge**: 2–3 unconfirmed sessions from the packed day.
> - **Follow-ups**: keep short, or show the calm "all clear" line.
>
> **Keep from V2 exactly:** the full workbench chrome (menu bar, activity rail with Today
> active among the 8 Activities, editor tab, status bar); the Safety banner rule; the
> greeting/date + one terse summary line ("12 sessions · 5 need you · 1 safety"); **no
> metric tiles, no charts, no KPI hero**. Dose = **calm**: quiet by default, Safety the
> only loud element, empty groups collapse to a soft line; urgency tags + subtle borders
> are the only adopted "loud" elements. The PROPOSED chips are a muted outline style, not
> loud.
>
> Indian psychiatry mock data (names, MHA-2017 terms where they fit, per-session UPI as a
> quiet peek if it fits the rail — do not add a payments region). Build **light and dark**;
> check the amber and the stakes borders read on both. Responsive: on a narrow window the
> agenda rail drops below the worklist — show that the 12-row rail still works stacked.

---

## Why this variant (rationale, for the record)

Persona A fixed the structure; persona B is the **first real H0 test** — hold the layout
constant, swap to a psychiatrist's dense day and clinical/legal debt mix, and see if the
frame survives. Two specific stress points: (1) the **thin agenda rail** carrying 12 rows
(the caveat flagged in the persona-A spec §8), and (2) whether **`measure_due` /
`med_recon_due`** feel like they belong (H6 → O-today-6). One variable moves (persona +
content); the structure is deliberately frozen so a break is attributable to the frame,
not the redesign.

If the rail holds and the ladder still reads → H0 confirmed for B, structure is one
surface. If the packed day makes the rail unreadable or the psychiatrist clearly wants the
agenda foregrounded → H0 is challenged, and the *next* iteration forks the layout (that
fork is deliberately **not** in this brief — one variable at a time).

## After it generates

Bring the bundle back the same way (zip → `prototypes/canvas-persona-b/`). I'll screenshot
(light + dark, wide + narrow) + read source, write `OBSERVATIONS.md`, and fold the verdict
into `today-discovery.md` (H0 result + H6 `measure_due`/`med_recon_due` call) and, if the
frame holds, add a persona-B content-weighting note to `today-persona-a-spec.md` (or split
a shared "Today spec" if B diverges enough).
