# Claude Design canvas brief — Client 360 (Caseload Activity)

**What this is.** The **Client 360** = the per-person unified profile that lives inside the
**Caseload** Activity (`ru-soam.caseload`, Scope v2 #3: *"the person-level journey across
cases — the 360"*). Not a new Activity — the person-level console inside Caseload. Goal
allegiance: **loop infrastructure, owns no domain**; serves **Insight** (the representation
talks back) + **Fidelity** (the mirror is true). The model's line (goals doc): *Activities
fulfill goals, the **360 zooms by goal lens**.*

**The thesis it must prove.** ru-soam's 360 is the **instrument-of-representation made
visible for one client** — a mirror answering, at person level: *"Who is this person to my
practice, and is my representation of them true and current?"* Its differentiator is
**representation completeness** (expected − provided) surfaced **per relationship facet**.
That is what a **CRM 360** (contact fields + transaction feed) and a **flat EHR chart**
(tabs of raw data) both miss — and both are the failure modes to avoid.

**The five facets** (the practice sub-domains; Vision "facets of the relationship"):
**Clinical · Safety · Legal-Compliance · Financial · Operational.** Safety is interrupt-class.

**Method.** Same as the Today prototypes: paste **Block 0** first (context + one rich mock
client + design language), then **Variant 1** as a follow-up. Variants 2/3 (named at the
end) test the one real open question — **the organizing spine** — as later turns. One
variable per turn. Fresh canvas project (different surface from Today).

---

## The key design question (what the variants isolate)

**How does the 360 organize?** — the 360's version of Today's structure question.

- **V1 · facet-lens-led** (this brief's POV) — the five facets are the primary axis; each
  shows claim / proof / completeness / proof-debt. Person identity + episodes on top.
  Directly renders "zoom by goal lens." **Recommended lead.**
- **V2 · case/episode-led** (named, next turn) — person → their episodes (a returning
  client has more than one) → facets nest inside the active episode. Tests person-vs-case
  primacy and how a *closed* episode is represented.
- **V3 · completeness-led / "the mirror as hero"** (named, next turn) — lead with the
  representation-integrity scorecard (is my mirror true & current?), facets as drill-down.
  Tests whether "mirror health" should be the front door.

---

## BLOCK 0 — context, data, design language (paste first)

> I'm designing the **Client 360**, the per-person profile inside the **Caseload** console
> of a local-first clinical workbench for **solo mental-health therapists in India**. It is
> the unified representation of ONE client across all their episodes of care and across
> **five relationship facets — Clinical, Safety, Legal, Financial, Operational**.
>
> **The whole point — read carefully.** This is NOT a CRM contact card (avatar + fields +
> activity feed) and NOT a flat EHR chart (tabs of raw records). It is a **mirror of the
> therapeutic relationship** that answers: *"Who is this person to my practice, and is my
> representation of them true and current?"* Its signature idea is **representation
> completeness**: for each facet, what the practitioner *expects* to have on file vs what is
> *actually provided* — surfacing where the record is **in step** with reality vs
> **lagging** (proof-debt). Organize by the five facets and by loop/completeness state, not
> by data type. No KPI tiles, no big-number hero, no charts-for-charts'-sake, no social
> activity feed.
>
> **Exact mock client — use this, don't invent clinical data:**
>
> **Meera Nair**, 34, she/her, Bengaluru. UPI self-pay, sliding scale ₹900/session.
> Referred by GP **Dr. Anil Rao** (2024). Emergency contact: husband **Karan Nair**. With
> the practice **since Feb 2024**. A **returning client — two episodes**:
> - **Episode 1 — "Generalised anxiety" — CLOSED** (Feb–Aug 2024, 14 sessions, CBT;
>   terminated by mutual agreement, goal met). PHQ-9 20→6, GAD-7 18→5. One risk event
>   (Apr 2024, passive suicidal ideation, resolved; safety plan made). Discharge summary on
>   file.
> - **Episode 2 — "Depressive relapse" — ACTIVE** (since Mar 2026, 9 sessions, CBT +
>   behavioural activation). PHQ-9 17→11, improving slowly. Current.
>
> **Per-facet state (active episode, carrying episode-1 history) — this is the material the
> facet lenses render:**
> - **Clinical** — active relapse-prevention plan, 3 goals (1 met, 2 in progress); PHQ-9
>   trend improving; next goal review due this week. Claim: "in active treatment,
>   improving." Proof: 9 session notes, 2 PHQ-9 scores this episode. **Proof-debt: progress
>   note owed (last session 2 days ago).** → in step except the owed note.
> - **Safety** — **no active risk flag.** Safety plan on file, updated Mar 2026; last
>   screen 2 weeks ago. History: 1 resolved risk event (2024). Claim: "no current risk."
>   → in step. (Show the calm resting state + access to history; Safety is the only element
>   allowed to go loud, but here it is at rest.)
> - **Legal-Compliance** — informed consent signed (Mar 2026), teletherapy consent signed.
>   Claim: "consented for treatment + telehealth." **Proof-debt: release-of-information to
>   refer back to Dr. Rao requested but unsigned.** → lagging (ROI missing).
> - **Financial** — sliding scale ₹900/session, UPI; 7 of 9 sessions paid. Claim:
>   "self-pay, mostly current." **Proof-debt: ₹1,800 outstanding (2 sessions unpaid),
>   2 receipts owed.** → lagging (payment behind).
> - **Operational** — weekly Wed 11:00 teletherapy; 9 attended, 1 no-show (May 2026).
>   Claim: "weekly, engaged." **Next session tomorrow (Wed) — UNCONFIRMED.** → in step
>   except the unconfirmed sitting.
>
> **App chrome (this lives inside a VS-Code-like workbench):**
> - A thin **52px vertical activity rail** far left, 8 icons — Today, Intake, **Caseload
>   (active)**, Encounters, Plans, Payments, Library, Trust. Caseload shows the accent
>   marker. Quiet; it frames the surface.
> - An **editor tab** reading **"Meera Nair"** (a person opened in the Caseload console).
> - A status bar (Synced · account · env · version).
>
> **Design language — match this exact system (warm-neutral "base-luma", shadcn-style
> tokens). Theme-aware: build BOTH light and dark, toggleable.**
> - Typeface: **Inter Tight** everywhere (tabular-nums for money, dates, scores). No
>   secondary display face.
> - Radius: 0.625rem. Subtle borders + very soft shadows; a calm clinical tool.
> - Brand accent = **burnt amber**. Light: primary `oklch(0.555 0.163 48.998)` on
>   `oklch(1 0 0)` bg, text `oklch(0.153 0.006 107.1)`, muted-fg `oklch(0.58 0.031 107.3)`,
>   border `oklch(0.93 0.007 106.5)`. Dark: bg `oklch(0.153 0.006 107.1)`, card
>   `oklch(0.228 0.013 107.4)`, primary `oklch(0.62 0.15 55)`, border `oklch(1 0 0 / 10%)`.
>   Semantic: destructive/red `oklch(0.577 0.245 27.325)`, warning/amber
>   `oklch(0.68 0.14 70)`, info/blue `oklch(0.55 0.13 245)`, success/green
>   `oklch(0.56 0.12 150)`. (If your tooling can't use oklch, convert faithfully to hex.)
> - **Facet accents** (quiet, for the lens dots/borders only — not loud): Clinical =
>   info/blue, Safety = destructive/red, Legal = a muted violet `oklch(0.55 0.12 300)`,
>   Financial = success/green, Operational = the amber accent. Use them as small keys, not
>   fills.
>
> **Quality bar:** responsive down to a narrow window (regions stack, no horizontal page
> scroll), visible keyboard focus, honor reduced-motion. **Dose = calm** (same as our Today
> screen): quiet by default; "in step" reads as a soft, settled state; "lagging" /
> proof-debt gets a subtle amber cue and an inline route action, never a red wall. Safety at
> rest is calm. Copy: sentence case, plain verbs ("Write note", "Send ROI", "Record
> payment", "Confirm session", "Open safety plan").
>
> Acknowledge you've got this context. I'll then ask for a specific layout variant.

---

## VARIANT 1 — facet-lens-led "the mirror" (paste as follow-up)

> **Build the facet-lens-led Client 360.** Structure, top to bottom:
>
> **1. Person header (identity + relationship, not a CRM card).** Meera's name, age +
> pronouns, a quiet contact line (phone, UPI, "self-pay · sliding scale ₹900"), and small
> tags (returning client). A **one-line relationship summary**: "With your practice since
> Feb 2024 · 2 episodes · currently in active treatment." Then **episode chips** — "2024 ·
> Generalised anxiety · closed" and "2026 · Depressive relapse · active" — the active one
> selected. The header states the relationship; it does not list fields.
>
> **2. The mirror strip (the differentiator — make it legible as ONE integrity read).** A
> calm horizontal row of the **five facets**, each showing a small facet key (dot/label),
> an **in-step vs lagging** indicator, and a count of open proof-debt where any. Clinical =
> in step (1 note owed) · Safety = in step · Legal = lagging (ROI) · Financial = lagging
> (₹1,800) · Operational = in step (1 unconfirmed). This answers "is my representation true
> & current?" at a glance. It is an **integrity strip, not a KPI dashboard** — no big
> numbers, no charts.
>
> **3. The five facet lenses (the body — the hero).** One section per facet, in this order:
> **Clinical · Safety · Legal · Financial · Operational.** Each lens shows: the **claim** in
> plain clinical language (what's true now), the **proof** backing it (artifacts / counts /
> a tiny trend where it matters, e.g. PHQ-9 17→11), an **in-step / lagging** marker, and any
> **proof-debt with an inline route action** (Clinical → "Write note"; Legal → "Send ROI";
> Financial → "Record payment"; Operational → "Confirm session"). **Safety lens at rest:**
> calm — "No current risk · safety plan current · last screen 2 weeks ago" with access to
> the resolved-2024 history; it is the one element licensed to go loud, but here it stays
> quiet because there's nothing active. Give each lens room to read and act without leaving
> the page.
>
> **4. Right rail — the journey (reference).** The person's timeline across both episodes:
> Feb 2024 opened → 2024 risk event (resolved) → Aug 2024 discharge → Mar 2026 re-opened →
> now. Compact, narrative, reference-only — the relationship over time, not an audit log.
>
> Keep the workbench chrome (activity rail with Caseload active, the "Meera Nair" tab,
> status bar). Build **light and dark**; check the amber and the facet keys read on both.
> Responsive: on a narrow window the journey rail drops below the lenses, and the mirror
> strip wraps. Same **calm dose** as our Today screen — this is a clinical relationship
> mirror, not an analytics dashboard.

---

## Named counter-variants (later turns — do not paste yet)

- **VARIANT 2 · case/episode-led.** Same content, different spine: the **episodes** are the
  primary axis (person header → episode selector as the main structure → the five facets
  nest *inside* the active episode). Show how a **closed episode** (2024 anxiety) reads vs
  an active one. Tests: is the person or the episode the right front door, and does facet
  state belong per-episode or person-wide (Safety/Legal history spans episodes; Clinical is
  episode-scoped)? Make that tension honest.
- **VARIANT 3 · completeness-led ("mirror as hero").** Lead with the representation-
  integrity read expanded to the top hero — a calm per-facet "in step / lagging" scorecard
  with the open proof-debt as the primary content — and the full facet lenses as a
  drill-down below or on click. Tests whether "is my mirror true & current?" earns being the
  front door, or whether it over-weights debt and reads like a nag.

## After each generates

Bring the bundle back the same way (zip → `prototypes/canvas-360-vN/` under this folder).
I'll headless-screenshot (light + dark, wide + narrow) + read source, write `OBSERVATIONS.md`,
and — once the spine is decided — fold the verdict into a Caseload/360 discovery + reference
spec (parallel to `today-persona-a-spec.md`).
**Method gotcha (from the Today pass):** canvas `.dc.html` renders UI via `x-import
RuSoam.Button/Icon` web components that only paint inside the canvas runtime — in headless
`file://` they show as empty boxes. Judge component fidelity from canvas's own live preview +
source; headless is valid for layout, tokens, data, and dark-flip only.
