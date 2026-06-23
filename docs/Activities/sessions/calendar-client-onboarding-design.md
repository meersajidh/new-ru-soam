# Calendar → Client Onboarding Workflow — Design Lockdown

**Status:** 🟡 **DRAFT 2026-06-23** — design forks resolved in conversation; captured here for review.
NOT yet promoted to ADRs. Open sub-points flagged inline (§7) for a second thrash before finalising.
**Author intent:** lock down the workflow by which a **calendar event becomes a client** — covering
**two populations**: genuinely-new intakes *and* existing real-world clients being **migrated in** (the
migration path for a new user bringing an established practice into the app).
**Builds on:** the ingress funnel (`ingress-clinical-design.md`, COMPLETE 2026-06-21). This doc extends
that funnel's "onboard NEW client" branch into a proper two-population onboarding model + backfill.
**Related (amendments owed, not yet written):** ADR-505 (Practice lifecycle — new `migrated` stage),
ADR-508 (Sessions — backfill-on-link), ADR-313 Am2 (linking always-on, no PHI gate).

---

## 0. Frame — the calendar is the front door, for two populations

The ingress funnel established: `calendar event → classify → link / onboard / exclude`. This doc nails
the **onboard** branch, which serves two distinct populations the previous pass collapsed into one:

| | **New intake** | **Established migrant** |
|---|---|---|
| who | genuinely new client, first contact | client the practitioner *already* sees, new only to the app |
| app's view | new clinical relationship | a chart whose onboarding happened **offline** |
| past sessions | none (or one consult) | months of history already on the calendar |
| consent/legal | to be obtained | obtained offline (must NOT be fabricated) |
| lifecycle | `intake` | `migrated` → `active` |

**Core principle:** the workbench must represent "onboarding already happened outside the app" **without
lying** — never auto-assert `consent_state`. The `migrated` stage carries that truth explicitly.

---

## 1. Resolved decisions (conversation 2026-06-23)

| # | Fork | Decision |
|---|---|---|
| **D1** | new-intake vs migrant distinction | **Two explicit paths** at create-from-calendar (two buttons). Needs UX thrash (§7). |
| **D2** | migrant onboarding-status representation | **Distinct `migrated` lifecycle stage** (not active+flag, not silent active). Resolves → `active` on confirm. |
| **D3** | create depth | **Quick inline create for both** (name + attendee email auto). Enrich later in Practice. Full-form capture rides deferred bulk pass. |
| **D4** | backfill of other in-window events | **Auto-link all in-window** (past-3mo + future) via re-sync after alias add. |
| **D5** | recurring series | **Folded into identity backfill.** Series only matters when identity present — alias already covers all occurrences. **No series modeling now.** Identity-absent series case = deferred O-item. |
| **D6** | bulk migration surface | **Deferred** (open item). v1 = per-event aux + existing needs-linking panel. |

---

## 2. The onboard UI — two buttons (unclassified / new state)

Aux event-detail, `unclassified` event with no roster match:

```
┌─────────────────────────────────────────────┐
│ Not recognised from your roster.             │
│                                              │
│ [ New intake ]      [ Add existing client ]  │  ← both quick inline (name; email auto-filled)
│ [ Link to existing ][ Not a client ]         │
└─────────────────────────────────────────────┘
```

| button | create | meeting `kind` | lifecycle stage |
|---|---|---|---|
| **New intake** | `record.create({givenName, contactEmail})` | `intake` | `intake` |
| **Add existing client** | `record.create({givenName, contactEmail})` | `session` | **`migrated`** |
| **Link to existing** | — (picks roster client) | `session` | unchanged |
| **Not a client** | — | — | `suppressParticipant` |

Both create paths are **reversible** (stage mutable) → low stakes → two buttons, no wizard.
Identity seed = attendee `name` + `email` only (Google attendees carry no phone). Enrich later.

---

## 3. The `migrated` lifecycle stage (D2)

New Practice-owned lifecycle stage. Practice remains identity + lifecycle authority (ADR-505).

```
referral ─▶ intake ─▶ active ─▶ ...
                ▲
   migrated ────┘   (migrant joins here, graduates to active on confirm)
```

- **Semantics:** "this chart's onboarding happened outside the app; verify + backfill before treating as
  fully active."
- **Does NOT touch `consent_state`** — no fabrication. The stage itself is the prompt.
- **Drives a light "complete migration" derived checklist** (mirror of the intake checklist, migration-
  flavored: verify consent on file · backfill history · confirm contact details). Pure read-derivation
  via the existing Attention/Intake workflow layer — no new persisted state.
- **Graduation:** a "Confirm migration → active" action (a `setStage` call) when the checklist clears.
- **Projection effects:** suppress the intake "first appointment" projection for `migrated` clients
  (they have history, not a first appointment). "Next meeting" projection still applies.

> **Why a stage, not active+attention-item:** chosen explicitly (D2). A distinct stage makes migrant
> status first-class + queryable, and prevents migrated charts looking identical to fully-onboarded ones.
> Cost = one stage added to the lifecycle vocab + every consumer (stage UI, checklist, projections).

---

## 4. Backfill — auto-link all in-window (D4)

When a participant is promoted/linked (any onboard or link action), backfill their other calendar events:

```
onboard / link
   │
   ├─ record.create (if new)               [Practice]
   ├─ record.addAlias(clientId,{email})    [Practice — identity now resolvable]
   ├─ sessions.linkProviderEvent(event)    [Sessions — clicked event linked]
   ├─ ★ sessions.meeting.sync ★            [Sessions — NEW: re-sync after alias]
   │      → every in-window event resolving to this identity auto-links
   │        past-3mo  → linked client_meeting rows (clinical history)
   │        future    → linked rows
   └─ bumpCalRev()                         [grid reclassifies immediately]
```

- **New behavior:** the aux flow must **trigger `sessions.meeting.sync` after the alias add**. Today it
  links only the clicked event; the alias makes *future* syncs link, but past-in-window events stay
  unclassified until a manual sync. D4 closes that — migration captures history on the spot.
- **Mechanism reuse:** sync already auto-links single-distinct-match. Once the alias exists, the
  identity resolves → those events qualify → auto-link. No new linking logic, just an added sync trigger.
- **Window:** existing sync window (`timeMin = now − 3mo`, `timeMax = now + 365d`) — past 3mo of history.
- **Cost:** more writes per promote (bounded by in-window event count for that identity). Acceptable.

> **Open (§7):** should backfill re-sync be **scoped to the new identity** (cheaper) or a full
> all-calendars sync (simpler, current `sync` shape)? Default = reuse existing full `sync`; optimize later.

---

## 5. Recurring series — folded into identity (D5)

**No series modeling in this pass.** Reasoning (user's reframe): series only matters *when identity is
present*, and there the **identity alias already covers every occurrence** (all occurrences share the
attendee email → all resolve → all link via §4 backfill). Per-occurrence `client_meeting` rows stay
(each session = distinct clinical event with its own notes — never collapsed).

The only case series modeling would add value = **identity absent** (client named in title only, no
attendee email — e.g. migrated paper-era calendars), where `recurringEventId` would be the only grouping
handle. **Deferred** to an open item; build only if dogfood shows the identity-absent recurring case is
common.

---

## 6. Bulk migration — deferred (D6)

First calendar connect dumps months × many distinct unknown people — the migration cohort exactly.
One-at-a-time in aux is slow. A dedicated **bulk roster-builder** (group distinct unmatched identities,
batch promote/exclude, "add all as established") would serve migration directly — but is **out of scope**
for this lockdown. v1 leans on per-event aux + the existing needs-linking triage panel. Filed as O-item.

---

## 7. Open sub-points — thrash before ADRs

> Flagged for the second design pass. Resolve these, then promote to ADR-505 Am / ADR-508 Am.

1. **`migrated` stage placement + vocab.** Exact position in the lifecycle enum; does it gate any
   existing stage transitions? Interaction with `referral`. Migration-checklist item set (what exactly
   must clear to graduate).
2. **Migration-checklist derivation.** Reuse intake-checklist read-derivation infra vs a parallel
   derivation? What are its items (verify consent / backfill history / contact details / …)?
3. **Backfill sync scope.** Identity-scoped re-sync vs full `sync` (§4 open note). Cost vs simplicity.
4. **Backfill UX feedback.** When backfill links N past events, how is that surfaced? ("Linked 7 past
   sessions" toast? silent? a count in the linked card?) Migration wants confidence the history landed.
5. **"Add existing client" labeling.** Button copy — "Add existing client" vs "Already a client" vs
   "Migrate client". Migration framing for new users.
6. **Consent honesty copy.** What the migrated-stage UI says re consent — must be accountable, never
   affirmatively "consented". Mirror the ADR-313 honesty-copy rule.
7. **Past-event linking + clinical safety.** Backfilling past meetings creates historical records with
   no notes. Confirm that's inert/safe (no false clinical assertions) and how they read in Sessions.
8. **Reversibility of migrated→active.** Is graduation one-way? Can a mis-tagged intake become migrated
   and vice-versa? (Stage is mutable — confirm no data loss either direction.)
9. **Identity-absent onboarding.** New intake where the event has NO attendee email (title-only).
   Current create still works (name only) but no alias → no backfill, no future auto-link. Acceptable?
   Or prompt for an email? (Ties to the deferred series case, §5.)

---

## 8. Architectural touch-points (for the eventual build, post-ADR)

- **ADR-505 Am (Practice):** add `migrated` lifecycle stage + "confirm migration → active" command;
  suppress intake "first appointment" projection for `migrated`; migration-checklist derivation.
- **ADR-508 Am (Sessions):** backfill-on-link = trigger `sync` after alias; `kind=session` for
  established; series-persistence deferred note.
- **`event-detail.html` (Schedule aux):** split the new-state into `New intake` + `Add existing client`
  buttons (kind/stage differ); fire backfill sync after every link/create; surface backfill result (§7.4).
- **No PHI gate** — linking is always-on (ADR-313 Am2). Reading the user's own provider PHI locally is
  not an egress. Clean.

## 9. New open items (to file on finalise)

- **O-xxx** — bulk-migration surface (roster-builder review screen). [D6]
- **O-xxx** — series persistence (`recurringEventId` decision), identity-absent recurring case only. [D5]
