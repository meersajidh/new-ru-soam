# Canvas brief — Today V3 "loud" (tests H3: dose)

Paste as a **follow-up in the same Claude Design project** (it has V1 agenda-led and V2
attention-led). Fallback: `canvas-brief.md` Block 0 first if a new project.

**What we're testing:** V2 (attention-led) is the decided structure and it's **calm**.
This variant keeps V2's structure exactly and pushes the **dose to loud** — the alert-
fatigue pole. Comparing V2 (calm) vs V3 (loud) on the same skeleton isolates H3: does
more surfacing help the therapist act, or overwhelm them?

---

## The prompt

> Build a third version of the Today screen. **Start from V2 (attention-led):** worklist
> owns the center, "THE LADDER" stakes index in the left sidebar, agenda compressed to
> the right rail, same workbench chrome, same mock data (Dr. Sethi, Tuesday; Sana
> Kapoor safety; Rohit note-owed; Kavya intake/unconfirmed; Aarav no-screen; Priya
> consent; Ishaan on-hold). Change ONE thing: **turn the dose all the way up.**
>
> **Make it loud and insistent:**
> - A **sticky counter bar** across the top of the center: colored pills — "1 Safety · 5
>   To complete · 1 Confirm · 1 Note due" — red / amber / blue, always visible.
> - **Filled count badges** on every worklist group header and on the left ladder index.
> - A **colored left-border** on every worklist item (red = safety/missing, amber =
>   proof-debt, blue = confirm), so the whole column is striped with status.
> - **Uppercase urgency tags** on each item: "OVERDUE 1D", "DUE TODAY", "MISSING",
>   "34 DAYS", "UNSIGNED".
> - All actions as **solid filled buttons**, always visible (they already are in V2 —
>   here make them heavier/more saturated).
> - Optionally a subtle attention-pulse on the Safety item.
>
> It should feel like the screen is **nagging** — that's the point. We are deliberately
> building the overwhelm so the calm-vs-loud comparison is fair; don't soften it.
>
> Keep everything structural identical to V2 (zones, worklist-center, ladder index,
> agenda rail, Safety-cannot-be-snoozed rule). Build light and dark. The only axis that
> moves from V2 is loudness.

---

## Why (for the record)

H3 is the Insight-guarantee make-or-break: the #1 documented EHR failure is alert /
undifferentiated-queue fatigue (discovery §2, §1b). V2 proved the *structure*; this
proves the *dose*. A fair test needs a genuinely loud pole to compare the calm default
against — hence "make the overwhelm real." Expected outcome: calm wins, but the loud
version may surface a useful *middle* (e.g. counters yes, striped borders no) worth a
follow-up.

## After it generates

Bring the zip back to `prototypes/canvas-v3-loud/`. I'll screenshot + read source, then
we judge **V2 (calm) vs V3 (loud)** side by side, fold the H3 verdict into
`today-discovery.md` §0.1, and — with structure + dose both settled for persona A — the
natural next step is persona B/C (H0) or promoting the winner to a real `ru-soam-today`
bundle spike.
