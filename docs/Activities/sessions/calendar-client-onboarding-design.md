# Calendar → Client Onboarding Workflow — Design Lockdown

**Status:** 🟡 **DRAFT 2026-06-23 (rev 2)** — design forks resolved in conversation; captured here for review.
NOT yet promoted to ADRs. Open sub-points flagged inline (§7) for a second thrash before finalising.
**rev 2 (2026-06-23):** migration reframed as an **independent mode** (not a per-event branch) — see §0.1, §6.
Two populations now map to two *mechanisms*, not two buttons in one funnel.
**Author intent:** lock down the workflow by which a **calendar event becomes a client** — covering
**two populations**: genuinely-new intakes *and* existing real-world clients being **migrated in** (the
migration path for a new user bringing an established practice into the app).
**Builds on:** the ingress funnel (`ingress-clinical-design.md`, COMPLETE 2026-06-21). This doc extends
that funnel's "onboard NEW client" branch into a proper two-population onboarding model + backfill.
**Related (amendments owed, not yet written):** ADR-505 (Practice lifecycle — new `migrated` stage),
ADR-508 (Sessions — backfill-on-link), ADR-313 Am2 (linking always-on, no PHI gate).
**PROMOTED:** rev 2 migration model → **ADR-509** (Draft, 2026-06-23) — calendar→client migration as an
independent mode; this doc is its design journal.

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

## 0.1 Frame rev 2 — "new-to-user" ≠ "new-to-system"; migration is a MODE

The two populations are not two buttons in one funnel — they are two **mechanisms**, separated by a
distinction the rev-1 draft conflated:

| | meaning | when | mechanism |
|---|---|---|---|
| **new-to-user** | genuinely new clinical relationship (first real-world contact) | BAU | per-event aux funnel (§2) |
| **new-to-system** | chart doesn't exist in app yet (may be a long-standing real client) | migration | **bulk migration mode** (§6) |

**At the migration moment, *every* probable client is new-to-system but mostly NOT new-to-user** —
per-event triage would be N clicks for one conceptual act. **After migration, BAU kicks in**: a fresh
calendar entry is *likely* new-to-user (a real new intake), so the per-event funnel is the right default.

**Migration is therefore an independent flow, not a branch of the per-event funnel:**

1. **Upfront, at calendar-add time** — connect a calendar → nothing linked yet → whole window is the
   migration cohort → app offers the bulk migration surface.
2. **Later, as a deliberate EDIT step** — user re-runs migration intentionally: a **full erase + reload**
   or a **delta / incremental reload** of the calendar.

This **promotes the rev-1 "bulk migration" (D6/§6) from *deferred* to *the primary migration path***, and
**scopes the §2 two-button per-event UI to BAU only** (biased toward new intake).

### Migration is calendar-STATE + a run LEDGER

Migration is tracked, not transient:

- **Calendar state** (on the existing Schedule `calendar` table, ADR-507):
  - `migration_status`: `pending` (connected, never migrated) → `in_progress` → `complete`
  - `last_migrated_at`
  - `last_synced_through` (window high-water → delta-reload anchor)
- **Migration-run ledger** — new **Schedule-owned**, **PHI-free (counts only)** table
  `calendar_migration_run`, one row per load/reload op:

  ```
  calendar_migration_run
    id
    calendar_id          → calendar row
    kind                 'initial' | 'full_reload' | 'delta_reload'
    started_at / completed_at
    window_from / window_to
    events_scanned       count
    identities_found     distinct unmatched
    promoted_count / linked_count / excluded_count
    status               'running' | 'done' | 'failed'
  ```

  Gives: resumability (crash mid-run = incomplete row), delta anchor (last `done` run's window high-water),
  DPDP/honesty audit ("migrated 47 events on D, queued 12 candidates"), and a tracked record of
  erase+reload ops. **Counts only — names/emails never land here** (residency split, below).

### Ownership + decoupling (decided 2026-06-23)

**Q1 — ownership (seam A, Practice-hosted).** `calendar` table + `calendar_migration_run` = **Schedule-owned**.
The run itself is **Practice-hosted** orchestration (`record.migration.run`): Practice pulls the event
window from Schedule, resolves participants locally, returns the transient candidate list, and calls a
Schedule cap to write the ledger. The ledger records only the **scan summary** (counts), not resolution.

**Q2 — residency: only PHI-free shapes persist; the queue is TRANSIENT (revised 2026-06-23).**

| piece | bundle | residency | persisted? |
|---|---|---|---|
| `calendar` state cols (`migration_status`, `last_migrated_at`, `last_synced_through`) | Schedule | operational, PHI-free | ✅ |
| `calendar_migration_run` (scan record: counts/window/kind/status) | Schedule | operational, PHI-free | ✅ |
| **`client_incoming` queue** (candidate identities) | — | — | ✗ **transient** |
| resolutions (promote → client record; exclude → hashed suppression) | Practice | existing stores | ✅ |

**The incoming-client queue (`client_incoming`) is transient, not a table.** Named source-agnostic on
purpose: migration is its first feeder; BAU per-event + future imports are other sources of the same
"not-yet-confirmed candidate clients" stream. It mirrors the existing Sessions `needsLinking[]` (ADR-508
§4b) — deliberately never persisted to keep non-client PII out of the store.

**It is derivable, so persistence buys nothing:**

```
pending = (distinct unmatched in window)
            − (already promoted → now resolve to a client)
            − (already excluded → now in the suppression set)
```

Each resolution lands **durably in an existing store** (promote → client record + `migrated` stage + audit
provenance; exclude → hashed `participant_suppression`). Re-running the scan reconstructs `pending` from the
local event cache (offline/restart-safe). **Traceability without the table:** promoted ⇒ client record +
audit; excluded ⇒ hash (intentionally non-attributable); aggregate ⇒ ledger counts. Reconciliation by
re-scan: `identities_found_now == 0` ⇒ window fully resolved. Accepted tradeoff: no readable exclusion
record, only the hash — counts suffice (consistent with the existing suppression-set stance).

### The decoupled migration flow

```
calendar add  (calendar.migration_status = pending)
   │
   ▼  Practice record.migration.run(calendarId)
   │     • pull event window from Schedule (local event cache)
   │     • resolveParticipant per distinct participant (local, Practice)
   │     • write calendar_migration_run ledger row (Schedule) — counts only
   │     • return TRANSIENT client_incoming candidate list
   │
   ▼  roster-builder renders the transient list (one-by-one OR bulk)
   ├─ promote → record.create(stage=migrated) + audit provenance   [Practice — durable]
   └─ exclude → suppressParticipant                                 [Practice — hashed, durable]
   │
   ▼  (re-scan any time → pending reconstructs; identities_found_now==0 ⇒ done)
   │
   ▼  ★ SEPARATE, user-confirmed step (NOT automatic) ★
"link this client's meetings" → backfill calendar events → Sessions client_meeting
```

**Critical decoupling:** promoting a `client_incoming` candidate to a `migrated` client record does **NOT**
auto-link calendar events into Sessions `client_meeting`. A confirmed real client ≠ a session-bearing
client — some practices run a session *before* intake. Meeting-linking is its own gated step. (§4
auto-link-all backfill stays valid for **BAU per-event onboarding only**, not migration.) → OI in §7/§9.

---

## 1. Resolved decisions (conversation 2026-06-23)

| # | Fork | Decision |
|---|---|---|
| **D1** | new-intake vs migrant distinction | **Two explicit paths** at create-from-calendar (two buttons). Needs UX thrash (§7). |
| **D2** | migrant onboarding-status representation | **Distinct `migrated` lifecycle stage** (not active+flag, not silent active). Resolves → `active` on confirm. |
| **D3** | create depth | **Quick inline create for both** (name + attendee email auto). Enrich later in Practice. Full-form capture rides deferred bulk pass. |
| **D4** | backfill of other in-window events | **Auto-link all in-window** (past-3mo + future) via re-sync after alias add — **BAU per-event onboarding only** (rev 2). Migration does NOT auto-link; see D7. |
| **D5** | recurring series | **Folded into identity backfill.** Series only matters when identity present — alias already covers all occurrences. **No series modeling now.** Identity-absent series case = deferred O-item. |
| **D6** | bulk migration surface | **rev 2: PROMOTED to the primary migration path** (was deferred). Migration = independent mode at calendar-add + deliberate edit step. Per-event aux = BAU only. See §0.1, §6. |
| **D7** | migration ↔ Sessions linking | **rev 2: DECOUPLED.** Migration promotes identities (from the transient `client_incoming` queue) → `migrated` client records. Linking events into Sessions `client_meeting` is a **separate user-confirmed step**, never automatic on promote. |
| **D8** | migration tracking | **rev 2:** calendar-STATE (`migration_status` on `calendar`) + PHI-free run LEDGER (`calendar_migration_run`, Schedule-owned). **D8a (revised same day):** the candidate queue (`client_incoming`) is **TRANSIENT/derivable, not persisted** — no unconfirmed-PHI at rest; resolutions land in existing durable stores; reconciliation by re-scan. Source-agnostic name (migration = first feeder). |

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

## 4. Backfill — auto-link all in-window (D4) — **BAU per-event only (rev 2)**

> **rev 2 scope:** this auto-link-all backfill applies to **BAU per-event onboarding** (the §2 funnel),
> NOT migration. Migration uses the decoupled queue path (§0.1, §6): promote-to-`migrated` does not
> auto-populate `client_meeting`; linking is a separate confirmed step (D7).

When a participant is promoted/linked **via the BAU per-event funnel**, backfill their other calendar events:

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

## 6. Bulk migration — the primary migration path (D6, rev 2)

First calendar connect dumps months × many distinct unknown people — the migration cohort exactly. **rev 2
promotes this from deferred to the primary migration path** (see §0.1 for the full mode framing).

- **Entry:** auto-offered when a calendar's `migration_status = pending` (fresh connect), or re-invoked via
  the deliberate EDIT step (full erase+reload / delta reload).
- **Surface:** a **bulk roster-builder review screen** — group distinct unmatched identities (from the
  Schedule migration run), batch **promote** (→ Practice `client_migrations` queue → `migrated` records)
  / **exclude** (→ suppress). Reads the queue (`client_migrations`, status=pending), writes resolution.
- **Does NOT link Sessions** — promotion populates the Practice queue + `migrated` records only;
  meeting-linking is the separate confirmed step (D7).
- **Tracked:** every run writes a `calendar_migration_run` ledger row (counts, window, kind).

**Still open for build-out (§7):** exact roster-builder UX (grouping, batch actions, progress feedback),
and the erase+reload / delta-reload semantics (Q3, parked).

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
10. **[rev 2] Sessions-linking confirmation gate (D7).** Promoting a migration candidate to a `migrated`
    client record must NOT auto-link calendar events into Sessions `client_meeting`. A confirmed client ≠
    a session-bearing client (some practices run a session before intake). Define the trigger + UX for
    "now link this client's meetings." (Parallel: does BAU per-event onboarding keep its §4 auto-link, or
    also gate? Default = BAU keeps auto-link; migration gates.)
11. **[rev 2] Erase + reload / delta-reload semantics (Q3, parked).** Full erase+reload erases *what* —
    only the migration-origin `client_meeting` links for that calendar (re-do linking), or also `migrated`
    client records? Lean: erase **links**, never auto-delete people (they may now carry notes/consent).
    Delta-reload anchor = last `done` run's `last_synced_through`. Pin exact scope before build.
12. **[rev 2] Migration ↔ BAU mode boundary.** When does a calendar flip `migration_status` →
    `complete` (all queue rows resolved? user "done" action?), and how does the per-event aux funnel know
    to switch from migration-bias to new-intake-bias? Is the boundary per-calendar or workspace-wide?

---

## 8. Architectural touch-points (for the eventual build, post-ADR)

- **ADR-505 Am (Practice):** add `migrated` lifecycle stage + "confirm migration → active" command;
  suppress intake "first appointment" projection for `migrated`; migration-checklist derivation;
  **new `client_migrations` table (protected) = migration queue + history** (candidate identities,
  status, refs to calendar + run). [rev 2]
- **ADR-507 Am (Schedule):** `calendar` state cols (`migration_status`, `last_migrated_at`,
  `last_synced_through`); **new `calendar_migration_run` table (operational, PHI-free)** = run ledger
  (counts, window, kind, status). [rev 2]
- **ADR-508 Am (Sessions):** backfill-on-link = trigger `sync` after alias **for BAU per-event only**;
  `kind=session` for established; **migration linking is a separate confirmed step, not on promote** (D7);
  series-persistence deferred note.
- **`event-detail.html` (Schedule aux):** split the new-state into `New intake` + `Add existing client`
  buttons (kind/stage differ); fire backfill sync after every link/create; surface backfill result (§7.4).
- **No PHI gate** — linking is always-on (ADR-313 Am2). Reading the user's own provider PHI locally is
  not an egress. Clean.

## 9. New open items (to file on finalise)

- **O-xxx** — bulk-migration roster-builder review screen (the primary migration surface). [D6, rev 2 §6]
- **O-xxx** — Sessions-linking confirmation gate: promote-to-`migrated` must not auto-link
  `client_meeting`; linking is a separate confirmed step. [D7, rev 2 §7.10]
- **O-xxx** — migration tables: Schedule `calendar_migration_run` (PHI-free ledger) + `calendar`
  state cols; Practice `client_migrations` (protected queue + history). [D8, rev 2 §0.1]
- **O-xxx** — erase+reload / delta-reload semantics (Q3 parked). [rev 2 §7.11]
- **O-xxx** — series persistence (`recurringEventId` decision), identity-absent recurring case only. [D5]
