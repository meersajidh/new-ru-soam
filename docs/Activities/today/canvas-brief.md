# Claude Design canvas brief — Today Activity (therapist, H5 + H3)

How to use this: paste **Block 0** first (it sets context, data, and design language for
the whole session). Then paste **Block A**, then **B**, then **C** as follow-up turns —
each produces one variant. Attach the three reference screenshots
(`prototypes/*.png`) and, if useful, `today-discovery.md`. Tell canvas the screenshots
are the *current basic baseline to surpass*, not a target to copy.

---

## BLOCK 0 — context, data, design language (paste first)

> I'm designing **"Today"**, the home screen of a local-first clinical workbench for
> **solo mental-health therapists in India** (think a private-practice psychologist or
> counselor). Today answers one question: **"What needs me now?"** It is a launcher +
> attention lens, not an editor — every item routes the therapist *into* deeper
> surfaces. It is NOT a generic admin dashboard, and must not read like one (no KPI
> tiles, no big-number-and-sparkline hero, no chart widgets).
>
> **The surface has two kinds of content:**
> 1. **Agenda** — today's sessions, time-ordered.
> 2. **"Needs you now"** — cross-client attention, *typed and ranked by clinical
>    stakes*. This ranking is the whole point; a flat to-do list is the failure mode.
>
> **The stakes ladder (the signature idea — make it legible as one escalation system):**
> - **Safety** — interrupt-class. A flagged client risk. **Cannot be snoozed or
>   dismissed** — the only affordance is to act. Render it as a pinned, distinct
>   element, visually the loudest thing on the page even in a calm design.
> - **Proof-debt** — the record is behind reality: intake incomplete, no risk screen,
>   consent missing, a note owed, a client on hold past review. Affordances: **Fill /
>   Snooze / Except (N/A)**.
> - **Confirmations & nudges** — unconfirmed sessions, follow-ups. Affordances: Fill /
>   Snooze.
>
> **Exact mock content — use this, don't invent clinical data:**
>
> Therapist: **Dr. Sethi**. Day: **Tuesday, 14 July**.
> Agenda:
> - 09:00 Ananya Rao — CBT, in-person, 50 min
> - 10:00 Rohit Menon — teletherapy, follow-up (⚠ progress note owed from yesterday)
> - (open until noon)
> - 12:00 Kavya Iyer — intake, in-person, **UNCONFIRMED** (⚠ intake screening pending) — this is "now"
> - 14:00 Dev & Priya Sharma — couples, teletherapy
> - 15:30 Meera Nair — CBT, in-person, 50 min
> - 17:00 Supervision — Dr. Banerjee (personal, not a client)
>
> Needs-you-now:
> - **SAFETY:** Sana Kapoor — elevated risk noted last session, safety plan not updated. (act now, no snooze)
> - Proof-debt: Rohit Menon (progress note, 1 day owed) · Kavya Iyer (intake incomplete, session today) · Aarav Gupta (no risk screen, never screened) · Priya Deshpande (teletherapy consent unsigned) · Ishaan Verma (on hold 34 days, past 30-day review)
> - Confirm/nudge: Kavya Iyer (unconfirmed, 12:00 today) · (follow-ups: none — show a calm "all clear" state)
>
> **App chrome to include (this lives inside a VS-Code-like workbench):**
> - A thin **52px vertical activity rail** on the far left with 8 icons — Today (active),
>   Intake, Caseload, Encounters, Plans, Payments, Library, Trust. Today shows an
>   accent marker. Keep it quiet; it frames the surface, it isn't the star.
> - A light greeting/date header. Optional terse summary ("6 sessions · 3 need you · 1 safety").
>
> **Design language — match this exact system (a warm-neutral "base-luma" theme,
> shadcn-style tokens). Theme-aware: build BOTH light and dark, toggleable.**
> - Typeface: **Inter Tight** for everything (tabular-nums for times). No secondary display face.
> - Radius: 0.625rem. Subtle borders + very soft shadows; this is a calm clinical tool.
> - Brand accent = **burnt amber**. Light: primary `oklch(0.555 0.163 48.998)` on
>   `oklch(1 0 0)` bg, text `oklch(0.153 0.006 107.1)`, muted-fg `oklch(0.58 0.031 107.3)`,
>   border `oklch(0.93 0.007 106.5)`. Dark: bg `oklch(0.153 0.006 107.1)`, card
>   `oklch(0.228 0.013 107.4)`, primary `oklch(0.62 0.15 55)`, border `oklch(1 0 0 / 10%)`.
>   Semantic: destructive/red `oklch(0.577 0.245 27.325)`, warning/amber
>   `oklch(0.68 0.14 70)`, info/blue `oklch(0.55 0.13 245)`, success/green `oklch(0.56 0.12 150)`.
>   (If your tooling can't use oklch, convert faithfully to hex.)
>
> **Quality bar:** responsive down to a narrow window (regions stack), visible keyboard
> focus, honor reduced-motion, no horizontal page scroll. Spend boldness on the stakes
> ladder; keep everything else disciplined and quiet. Copy: sentence case, plain verbs,
> active voice ("Write note", "Send consent", "Open safety plan").
>
> Acknowledge you've got this context. I'll then ask for three specific variants.

---

## BLOCK A — V1 baseline (two regions, calm)

> **Variant 1 — the reference.** Two side-by-side regions: **Agenda on the left**,
> **"Needs you now" on the right**, a hairline divider between. Safety = a pinned banner
> above both. Attention is grouped by the stakes ladder, each group a small labelled
> section with a low-key count. **Calm dose:** muted by default, per-item actions appear
> on hover, empty groups collapse to a quiet "all clear" line. Nothing shouts except
> Safety. Ship it polished — spacing, rhythm, and type are the craft here.

## BLOCK B — V2 integrated overlay (tests H5: one timeline vs two regions)

> **Variant 2 — same content, different structure.** Instead of two regions, make it
> **one integrated day timeline**: each appointment row carries its own debt inline
> (Rohit's row shows "note owed"; Kavya's shows "unconfirmed" + "intake incomplete",
> each with actions). Below the timeline, a docked **"Also needs you — not on today's
> calendar"** strip holds debt for clients NOT being seen today (Aarav, Priya, Ishaan).
> Safety banner still pinned. Same calm dose. The design question this tests: does
> attaching debt to the appointment read *better* than a separate attention region —
> and does the off-calendar dock feel like a natural home or an awkward patch? Make that
> tension honest, don't hide it.

## BLOCK C — V3 loud (tests H3: does surfacing help or fatigue?)

> **Variant 3 — same two-region structure as Variant 1, but the LOUD end of the dial.**
> A sticky top counter bar ("1 Safety · 4 To complete · 2 Confirm · 1 Note due" as
> colored pills), filled count badges on every group header, a colored left-border on
> every attention item, uppercase urgency tags ("OVERDUE 1d", "DUE TODAY", "MISSING"),
> and all actions always visible as solid buttons. Deliberately busy and insistent —
> this is the alert-fatigue pole. It should feel like it's nagging. We're testing
> whether more surfacing helps or overwhelms; make the overwhelm real so the comparison
> is fair.

---

## Notes for driving the canvas

- If it drifts generic (KPI tiles, gradient hero, chart cards), push back: *"this is a
  clinical attention surface, not an analytics dashboard — kill the metrics tiles, the
  stakes ladder is the hero."*
- Ask for **both light and dark** in each variant; check the amber reads on both.
- Ask it to keep the **exact mock names/data** — accuracy matters for evaluating the
  clinical rhythm.
- After all three, ask for a **side-by-side of V1 vs V3** (same data) to make the H3
  calm-vs-loud judgment in one view; and **V1 vs V2** for H5.
- Richer-than-baseline asks worth adding once the frame lands: subtle load-in sequence
  for the attention groups, a "now" line on the agenda, hover micro-states, an empty
  all-clear illustration moment.
