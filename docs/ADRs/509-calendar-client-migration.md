# Calendar → Client Migration: onboarding an established practice from the calendar

**ID:** ADR-509
**Status:** Draft
**Date:** 2026-06-23
**Layer:** domain
**Supersedes:** —
**Superseded by:** —
**Related:** [Calendar → Client Onboarding design](../Activities/sessions/calendar-client-onboarding-design.md)
(rev 2 — the journal this ADR promotes), [Ingress clinical design](../Activities/sessions/ingress-clinical-design.md)
(the BAU per-event funnel this sits beside), ADR-505 (Practice — lifecycle authority; new `migrated` stage +
`client_migrations` queue table), ADR-507 (Schedule — owns `calendar`; new `calendar_migration_run` ledger +
state cols), ADR-508 (Sessions — Client Meeting; migration does **not** auto-link), ADR-313 Am2 (linking
always-on; local provider-PHI read is not an egress), ADR-314 (multi-account credentials), ADR-506 (domain
module CQRS + ownership — the authoring rule the new tables follow), ADR-452 (protected-store residency),
ADR-502 (audit ledger).

## Context

The ingress funnel (ADR-508 §4, `ingress-clinical-design.md`) onboards a client **one calendar event at a
time** from the aux event-detail slot. That is the right shape for **business-as-usual (BAU)**: a fresh
calendar entry usually means a genuinely new clinical relationship.

It is the **wrong shape for migration**. When a practitioner first connects an established practice's
calendar, the whole window — months of past sessions across many distinct people — lands at once. Per-event
triage would be N clicks for what is conceptually **one bulk act**. The two cases were collapsed in the
rev-1 onboarding draft; this ADR separates them.

**The load-bearing distinction (design doc §0.1):**

| | meaning | when | mechanism |
|---|---|---|---|
| **new-to-user** | genuinely new clinical relationship | BAU | per-event aux funnel (ADR-508 §4) |
| **new-to-system** | chart not yet in the app (may be a long-standing real client) | migration | **bulk migration mode (this ADR)** |

At the migration moment *every* probable client is new-to-system but mostly **not** new-to-user. After
migration, BAU kicks in and the per-event funnel is correctly biased toward new intake.

## Decision

### 1. Migration is an independent MODE, not a branch of the per-event funnel

Migration has two entry points:

1. **Upfront, at calendar-add time** — a connected calendar with `migration_status = pending` has nothing
   linked; its whole window is the migration cohort → the app offers the bulk migration surface.
2. **Later, as a deliberate EDIT step** — the user re-runs migration on purpose: a **full erase + reload**
   or a **delta / incremental reload** of the calendar.

This **promotes the previously-deferred bulk-migration surface to the primary migration path**, and
**scopes the per-event two-button UI (ADR-508 §4) to BAU only**.

### 2. Migration is calendar-STATE + a run LEDGER + a candidate QUEUE — three persisted pieces, two-table residency split

Migration is tracked, never transient.

**(a) Calendar state** — new columns on the Schedule-owned `calendar` table (ADR-507):

- `migration_status`: `pending` (connected, never migrated) → `in_progress` → `complete`
- `last_migrated_at`
- `last_synced_through` — window high-water mark; the **delta-reload anchor**

**(b) Run ledger** — new **Schedule-owned**, **operational (PHI-free, counts only)** table
`calendar_migration_run`, one row per load/reload op:

```
calendar_migration_run
  id
  calendar_id          → calendar row
  kind                 'initial' | 'full_reload' | 'delta_reload'
  started_at / completed_at
  window_from / window_to
  events_scanned       count
  identities_found     count (distinct unmatched at scan time)
  status               'running' | 'done' | 'failed'
```

The ledger records the **scan op only** — not resolution outcomes. Resolution (promote/exclude) happens
later, possibly across app sessions, and lands in durable stores (§2c); reconciliation is by **re-scan**
(`identities_found_now == 0` ⇒ window fully resolved), not by mutating this row. Gives resumability (crash
mid-scan = an incomplete row), the delta anchor (last `done` run), and a PHI-free audit trail ("scanned 47
events, found 12 unknown identities on D"). **Names/emails never land here** — counts only, operational
residency, survives lock.

**(c) The incoming-client queue (`client_incoming`) = TRANSIENT, not persisted, source-agnostic
(revised 2026-06-23).** The candidate list (distinct unmatched identities + their seed name/email) is
produced **in-memory by the scan and handed to the roster-builder — never written at rest.** This mirrors
the existing Sessions BAU `needsLinking[]` (ADR-508 §4b), which is *deliberately* transient: "never
persisted — no non-client PII at rest."

Named **`client_incoming`** (not `client_migrations`) on purpose: it is the **source-agnostic intake
funnel** — a stream of not-yet-confirmed candidate clients. Migration is its **first source**; the BAU
per-event funnel and future bulk imports are other sources feeding the same conceptual queue. The name
describes the concept, not a table (there is no table).

The queue is **derivable**, so persistence buys nothing:

```
pending = (distinct unmatched in window)
            − (already promoted → now resolve to a client)
            − (already excluded → now in the suppression set)
```

Every **resolution lands durably in an existing store** — promote → the client record (`migrated` stage +
audit provenance); exclude → the hashed `participant_suppression` set (ADR-508 §4b). Re-running the scan
**reconstructs** the pending set from the local event cache (ADR-507 Am2 `event` table — offline-capable,
restart-safe). There is **no new persisted table for incoming candidates.**

**Why not persist it (the discarded option):** a persisted `client_incoming` table would hold the PHI of
*unconfirmed* people at rest, duplicating identity data the resolution already records in its proper home,
and adding a PHI-at-rest surface + DPDP-erase obligation for non-clients — the exact thing the
hashed-suppression design avoids. Traceability is preserved without it: promoted ⇒ client record + audit;
excluded ⇒ hashed suppression (intentionally non-attributable, per ADR-508 §4b); aggregate ⇒ ledger counts.
**Accepted tradeoff:** no readable "user excluded person X on date D for reason R" — only the hash. Counts
suffice (decided 2026-06-23); consistent with the existing suppression-set stance.

**Residency — what migration adds at rest:**

| piece | bundle | residency | persisted? |
|---|---|---|---|
| `calendar` state cols | Schedule | operational, PHI-free | ✅ |
| `calendar_migration_run` | Schedule | operational, PHI-free | ✅ (scan record) |
| `client_incoming` queue | — | — | ✗ **transient** (in-memory scan output) |
| resolutions | Practice | existing stores | ✅ (client record / hashed suppression) |

### 2d. Realisation — the queue is a derived QUERY (caps), not a table; scaling discipline

`client_incoming` is realised as a **cross-bundle derived view** — conceptually a SQL `VIEW` spanning two
bundles, materialised on demand:

```
listIncoming(calendarId) =
   schedule events in window (event cache — already persisted, ADR-507 Am2)
     ⋈  resolveParticipant(each DISTINCT participant)   [local Practice]
     →  keep outcome ∈ { none, candidates }
     →  [{ seedName, seedEmail, eventRefs, outcome }]
```

Two Practice caps realise it:

| cap | kind | does | writes |
|---|---|---|---|
| `record.migration.query.listIncoming(calendarId, {limit, offset})` | query | pages over the computed candidate set | none — pure derive |
| `record.migration.run(calendarId)` | command | runs the scan, stamps the `calendar_migration_run` ledger + flips `calendar.migration_status`, caches the transient set | PHI-free ledger + calendar state only |

**The queue self-updates — no row to mutate.** promote = `record.create` + `setStage('migrated')` → that
participant now resolves to a client → next derive drops it. exclude = `suppressParticipant` → now in the
hashed set → next derive drops it. The destination stores **are** the state; the query re-derives "still
pending" (`identities_found == 0` ⇒ done). No candidate-status column anywhere.

**No new PHI at rest.** The candidate identity PHI (attendee name/email) already lives in the Schedule
`event` cache (`event.attendees`, protected, ADR-507 Am2 — the user's own calendar data, not an egress per
ADR-313 Am2). `listIncoming` derives from PHI already cached; it does not put new PHI at rest. A persisted
candidate table would **duplicate** it.

**Scaling discipline (two magnitudes — output is small, input is the cost):**

- **Output** = distinct unmatched *people* (tens–low hundreds; a client with 60 sessions = one candidate),
  not events. Client-side paging suffices; `listIncoming` takes `{limit, offset}` from the start anyway.
- **Input** = events in window (hundreds–low thousands). Requirements:
  1. **Bounded-memory scan** — SELECT only participant columns in chunks, dedup into a `Map<participant →
     outcome>` while streaming. Memory = O(distinct participants), **not** O(events).
  2. **Resolve once per distinct participant** (cached in-pass), never once per event.
  3. **Scan on explicit action, not on every paint** — `run`/refresh performs the scan and caches the
     transient set in bundle memory; `listIncoming` pages over the cache. Re-scan only on explicit refresh.
  - Pathological case (busy clinic calendar, thousands of one-off attendees) is covered by bounded-scan +
    paginated output + the existing personal/no-external-participant classification filter; a server-side
    cursor is a later perf OI, not a Slice-1 blocker.

### 3. Ownership: Practice orchestrates the run; Schedule owns the ledger; Sessions stays out

The run is **cross-bundle orchestration**, **Practice-hosted** (seam A): `record.migration.run(calendarId)`
in Practice pulls the event window from Schedule (`schedule.calendar.query`), resolves participants with its
**own local** `resolveParticipant` (no cross-bundle hop for the expensive PHI step), returns the transient
`client_incoming` candidate list, and calls a Schedule cap to write the `calendar_migration_run` ledger row
+ `calendar` state. Practice = identity authority (ADR-505); the PHI candidate list is produced where
authority lives and never crosses a bundle boundary at rest. **Sessions is not touched during migration** —
see §5.

### 4. The migration flow

```
calendar add  (calendar.migration_status = pending)
   │
   ▼  Practice record.migration.run(calendarId)
   │     • pull event window from Schedule (local event cache)
   │     • resolveParticipant per distinct participant (local, Practice)
   │     • write calendar_migration_run ledger row (Schedule) — counts only
   │     • return TRANSIENT client_incoming candidate list (unmatched identities)
   │
   ▼  roster-builder renders the transient list (one-by-one OR batch)
   ├─ promote → record.create(stage=migrated) + audit provenance   [Practice — durable]
   └─ exclude → suppressParticipant                                 [Practice — hashed, durable]
   │
   ▼  (re-scan any time → pending reconstructs; identities_found_now==0 ⇒ done)
   │
   ▼  ★ SEPARATE, user-confirmed step (NOT automatic — §5) ★
"link this client's meetings" → backfill calendar events → Sessions client_meeting
```

### 5. Promote-to-`migrated` does NOT auto-link Sessions meetings (decoupling)

Promoting a `client_incoming` candidate to a `migrated` client record creates the **chart + identity alias**
only. It does **not** auto-populate Sessions `client_meeting`. A confirmed real client ≠ a session-bearing
client — some practices hold a session *before* formal intake. **Meeting-linking is its own user-confirmed
step**, downstream of the queue.

This is the key divergence from BAU: ADR-508 §4 auto-links all in-window events for a participant the moment
an alias is added. That **auto-link-all backfill stays valid for BAU per-event onboarding**, but migration
defers linking behind a deliberate "now link this client's meetings" action. *(Exact trigger + UX = OI-3.)*

### 6. The `migrated` lifecycle stage (Practice-owned)

A new Practice lifecycle stage (ADR-505). It is a **parallel entry point** that graduates into `active`,
not a mid-line insertion:

```
referral ─▶ intake ─▶ active ─▶ ...
                ▲
   migrated ────┘   (migrant joins here; graduates to active on confirm)
```

- **Semantics:** "this chart's onboarding happened outside the app; verify before treating as fully active."
- **Never touches `consent_state`** — no fabrication. The stage itself is the prompt (honesty rule, ADR-313).
- **Graduation:** a "confirm migration → active" Practice command (`setStage`).
- **Projection effect:** suppress the intake "first appointment" projection for `migrated` charts (they
  have history, not a first appointment); "next meeting" still applies.
- *(Exact vocab position, migration-checklist item set, reversibility = OI-1/OI-2/OI-6.)*

## Consequences

### Positive

- Migration and BAU are separated by mechanism, so each is biased correctly (bulk vs new-intake).
- Migration is tracked by a PHI-free ledger + a derivable transient queue → resumable, re-runnable, auditable
  (DPDP) **without** keeping unconfirmed-person PHI at rest.
- Minimal at-rest footprint: only `calendar` state cols + a PHI-free ledger are added; the candidate queue
  is transient and resolutions reuse existing durable stores.
- The queue is **source-agnostic** (`client_incoming`) — migration is the first feeder; BAU + future imports
  share the concept.
- Decoupling linking from promotion prevents fabricating clinical session history for not-yet-confirmed
  clients, and respects the session-before-intake workflow.

### Negative

- Two new persisted shapes (Schedule `calendar` cols + `calendar_migration_run` ledger, both PHI-free) +
  a new lifecycle stage touching every lifecycle consumer.
- A new bulk roster-builder surface to build and maintain (the per-event funnel was cheaper to reuse).
- Re-scan (not persistence) is the resumability/reconciliation mechanism — slightly more compute per
  roster-builder open, traded for zero unconfirmed-PHI at rest. Acceptable (bounded window, local cache).
- Excluded candidates leave only a hash, not a readable exclusion record (accepted tradeoff, §2c).
- Several semantics still open (erase/reload scope, mode boundary, Sessions-link gate) — built behind OIs.

## Considered Options

- **Fold migration into the per-event funnel (rev-1 draft).** _Rejected_: N-clicks for one bulk act; wrong
  bias (treats long-standing clients as new intakes).
- **Persist the candidate queue as a protected `client_incoming`/`client_migrations` table.** _Rejected_:
  holds unconfirmed-person PHI at rest, duplicating identity data the resolution already records in its
  proper home, and adds a PHI-at-rest + DPDP-erase surface for non-clients. The queue is derivable by
  re-scan; resolutions land durably; the ledger reconciles by counts. Inconsistent with the existing
  transient `needsLinking[]` + hashed-suppression stance (ADR-508 §4b).
- **Mutate resolution counts into the ledger row.** _Rejected_: resolution happens across sessions; a
  mutating "run" row has no clean completion. Ledger = scan record; reconciliation = re-scan.
- **Auto-link Sessions meetings on promote (mirror BAU §4).** _Rejected for migration_: fabricates session
  history for clients not yet confirmed session-bearing; ignores session-before-intake.

## Open Items

These are unresolved by design (design doc §7); the ADR is built incrementally as they close.

- **OI-1 — `migrated` stage vocab + placement.** Exact enum position; interaction with `referral`; whether
  it gates any existing transitions. *(design doc §7.1)*
- **OI-2 — migration checklist derivation.** Reuse the intake-checklist read-derivation infra vs a parallel
  one; the exact item set that must clear to graduate (verify consent on file / confirm contact details —
  **not** "backfill history", which is the separate §5 link step). *(§7.2)*
- **OI-3 — Sessions-linking confirmation gate.** The trigger + UX for "now link this client's meetings",
  downstream of queue-promotion (§5). Also: does BAU per-event keep its auto-link, or also gate?
  (Default: BAU keeps auto-link; migration gates.) *(§7.10)*
- **OI-4 — bulk roster-builder UX.** Grouping of distinct unmatched identities, batch promote/exclude,
  progress feedback ("queued 12 candidates"). *(§6 / §7)*
- **OI-5 — erase+reload / delta-reload semantics (parked).** Full erase+reload erases **what** — only the
  migration-origin `client_meeting` links for that calendar (re-do linking), or also `migrated` records?
  Lean: erase **links**, never auto-delete people (they may now carry notes/consent). Delta anchor =
  last `done` run's `last_synced_through`. *(§7.11)*
- **OI-6 — mode boundary.** When does `migration_status` flip to `complete` (re-scan `identities_found == 0`?
  an explicit "done"?), and how does the per-event funnel know to switch from migration-bias to
  new-intake-bias? Per-calendar or workspace-wide? *(§7.12)*
- **OI-7 — backfill UX feedback.** When linking backfills N past events, how is it surfaced ("Linked 7 past
  sessions"? silent? a count)? *(§7.4)*
- **OI-8 — identity-absent migration.** Title-only events (no attendee email) → create works (name only)
  but no alias → no backfill, no future auto-link. Prompt for email or accept? Ties to the deferred series
  case (ADR-508). *(§7.9)*
- **OI-10 — calendar-scoped exclusions. ✅ CLOSED 2026-06-24.** `participant_suppression` (ADR-508 §4b)
  was a global hashed set with no calendar mapping, so deleting a calendar/account left its exclusions
  behind. **Resolution:** the table gains `calendar_id` (composite PK `(id_hash, calendar_id)`; Practice
  migration v11 recreates it, legacy rows → `calendar_id=''` = un-scoped/surviving). `suppressParticipant`
  threads `calendarId` from all exclude sites (aux event-detail, migration roster-builder, Sessions
  needs-linking); rows are the ref-count — the same exclusion on N calendars = N rows. `suppressionCheck`
  stays GLOBAL (any row with the hash ⇒ suppressed; identity resolution is calendar-agnostic). New
  `record.patient.deleteSuppressionsForCalendar(calendarId)` (`deleteWhere {calendar_id}`); the renderer
  `calendar.delete` / `account.delete` commands call it (best-effort) so a shared exclusion survives while
  any referencing calendar remains. `unsuppressParticipant` deletes all rows by hash (global un-suppress).
  **ADR-508 §4b amendment owed** (suppression schema = calendar-scoped composite-PK).
- **OI-9 — scan perf at the tail.** Bounded-memory chunked scan + paginated output + scan-on-action caching
  (§2d) cover normal + busy solo practices. A pathological distinct-participant explosion (large clinic
  calendar) may want a server-side cursor instead of an in-memory cached set. Perf optimization, not a
  correctness blocker; revisit if dogfood shows it. *(§2d)*

## Build status

- **Design lockdown rev 2 — 2026-06-23.** This ADR promotes the rev-2 onboarding design doc.
  **Transient-queue revision (same day):** the candidate queue (`client_incoming`) is *not* persisted —
  derivable by re-scan, resolutions land in existing durable stores; only the PHI-free `calendar` cols +
  `calendar_migration_run` ledger are added at rest. No code yet.
- **Slice 1 (planned, no UI) — CDP-verifiable data + run spine:** Schedule `calendar` state cols +
  `calendar_migration_run` ledger + a ledger-write cap; Practice `record.migration.run(calendarId)`
  (scan window → local `resolveParticipant` → return transient `client_incoming` list + write ledger);
  `migrated` lifecycle stage; promote/exclude reuse existing `record.create`/`setStage`/`suppressParticipant`
  caps. `kind='initial'` only. Verify via CDP: run → candidates returned → promote → `migrated` client in
  roster.
- **Slice 2 (planned) — bulk roster-builder UI** (OI-4): the review surface, batch promote/exclude,
  auto-offer on `pending` calendars.
