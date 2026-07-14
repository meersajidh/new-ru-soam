# Canvas brief — Today V2 "attention-led" (tests reframed H5 / H1)

Paste this as a **follow-up in the same Claude Design project** that built V1 (it keeps
the context, tokens, mock data, and workbench chrome). If you're in a fresh project,
paste `canvas-brief.md` Block 0 first, then this.

**What we're testing:** V1 you built is **agenda-led** — the calendar owns the center,
and "Needs you now" is a compact list squeezed into the left sidebar. This variant flips
it to **attention-led** to answer the core question: *is Today a calendar or a worklist?*
Keep everything else identical to V1 so only this one variable moves.

---

## The prompt

> Build a second version of the Today screen — same app, same workbench chrome, same
> mock data, same warm-neutral base-luma theme (light + dark). Change exactly ONE thing:
> **make the "Needs you now" worklist the main event, and demote the agenda to support.**
>
> **Center (editor) = "Needs you now", given real room.** The stakes-ladder attention
> list is the hero here, not the calendar. For each item show the client, the reason it
> needs me, and its **actions inline and visible** (not hover-hidden): Fill (the specific
> verb — "Write note", "Continue intake", "Screen", "Send consent", "Review"), plus
> **Snooze** and **Except (N/A)**. Group by the ladder: **Safety** (pinned, loud, no
> snooze/except — act only) → **To complete** (proof-debt) → **Confirm & nudge** →
> **Follow-ups** (show the calm "all clear" state). Give each item enough space to read
> and act without opening anything. This is a worklist you actually work down.
>
> **Right aux sidebar = the agenda, as a compact day rail.** Time-ordered sessions,
> smaller, reference-only — glanceable "what's my day" without dominating. Keep the
> "NOW / up-next" treatment for the imminent session (Kavya 12:00). Debt that maps to an
> agenda item can show a tiny marker on that row, but the actionable version lives in the
> center worklist, not here.
>
> **Keep from V1:** the full workbench chrome (menu bar, activity rail with Today active,
> tab, status bar), the Safety banner rule (cannot be snoozed), the greeting/date, and a
> terse summary ("6 sessions · 3 need you · 1 safety"). **Drop the "Today at a glance"
> metrics list entirely** — it read like an analytics dashboard; the summary line covers
> counts. This is a clinical attention surface, not a KPI dashboard: no metric tiles, no
> charts, no big-number hero. The stakes ladder is the only thing allowed to be bold.
>
> **Dose = calm** (same as V1): quiet by default, Safety the only loud element, empty
> groups collapse to a soft line. The difference from V1 is placement/room, not loudness.
>
> Use the exact same mock content (Dr. Sethi, Tuesday, Sana Kapoor safety, Rohit note-
> owed, Kavya intake/unconfirmed, Aarav no-screen, Priya consent, Ishaan on-hold, etc.).
> Build light and dark; check the amber reads on both. Responsive: on a narrow window the
> agenda rail drops below the worklist.

---

## Why this variant (rationale, for the record)

Canvas's V1 turned the structural question from the briefed "overlay vs two-region" into
"**where does the attention list live?**" — it chose sidebar-attention + agenda-center.
This variant is the clean counter: **attention-center + agenda-rail**. Comparing the two
answers whether the solo therapist's home surface should foreground the *worklist* (act
on debt) or the *calendar* (see the day). One variable moves (what owns the center), so
V1-vs-V2 is a fair A/B.

Deferred still: **H3 dose** (loud) — a quick styling fork off whichever structure wins;
brief it after this comparison lands.

## After it generates

Bring the bundle back the same way (zip → `prototypes/canvas-v2-attention-led/`). I'll
screenshot + read source, then we judge V1 (agenda-led) vs V2 (attention-led) side by
side and fold the verdict into `today-discovery.md` §0.1.
