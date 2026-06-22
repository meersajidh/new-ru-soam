# Schedule Activity — design log

**Status:** Design pass — core decisions LOCKED + **promoted to ADRs 2026-06-16**:
**ADR-313** (PHI gradient + Safety Score, refines Final ADR-301), **ADR-507** (Schedule = storeless UI
over provider), **ADR-508** (Sessions: Client Meeting + `MeetingProvider` port). This log remains the
reasoning journal; the ADRs are canonical. SQ-2/4/6/7 cited open in the ADRs. **Next: build (P0).**
**Started:** 2026-06-16
**Owner notation:** decisions are numbered `SD-n` (Schedule Decision). Open questions `SQ-n`.
**Related:** Product_Scope (Schedule = `ru-soam.schedule`), ADR-301 (PHI boundary — *amended here*),
ADR-302 (local-first), ADR-303 (PHI sync/E2EE), ADR-305 (provider plugins), ADR-310 (Google Calendar,
Proposed/deferred), ADR-311 (node-first), ADR-505/Practice-IA (P6 projections — this unblocks O464),
ADR-506 (domain module CQRS + ownership authoring rule).

This is a journal, working toward the ADR — same method as `docs/Activities/practice/`.

---

## 0. Framing — what we are (and are not) building

**Not a calendar app.** Calendars are *providers* (Google now; Microsoft / Apple / cal.com later).

**We are building an *encounter spine* with a pluggable *calendar-provider substrate* underneath it.**
Two layers, forced apart by the PHI boundary:

| Layer | Owns | Residency | PHI | Source of truth |
|---|---|---|---|---|
| **A — Calendar substrate** | time block, free/busy, reminders, the practitioner's unified calendar | provider (Google/MS/…) | none *(end state)* | **provider** — for scheduling/time |
| **B — Local domain** | events (Schedule) + Client Meetings (Sessions) | local protected store | yes | **workbench (local)** |

The local domain layer is **ours**; the calendar block is the **provider's**. They meet at a link
(`event.external_ref = {provider, event_id}`). Provider optional ⇒ node-first preserved (no provider /
offline → local events/meetings still exist, no calendar block).

**Layer B splits across two Activities — see §3.** Schedule owns the *events* (all types); Sessions owns the
clinical *Client Meeting* (the client-appointment subset). Do **not** use the term "encounter."

**Scheduling, scoped:**
- *General (Calendly):* availability rules, self-booking, buffers, booking links → **mostly post-MVP** (solo practitioner books manually).
- *MH practice (SimplePractice):* the appointment is **the clinical encounter anchor**, not a calendar slot. It is the spine for: Practice (client + lifecycle `referral→intake_scheduled`), **Sessions** (encounter → progress note), **Billing** (encounter = billable unit), **Risk/Attention** (no-show on high-risk client = obligation). This framing is what matters for us.

---

## 1. PHI posture — ADR-301 as a destination, not a wall (LOCKED)

ADR-301 is the **end goal, not the starting position**. We meet practitioners where they are today: full
reliance on a calendar provider that already holds client PHI (trusted by them / their institution). We give
them a **gradual, non-disruptive migration path** toward the ADR-301 end state, with anti-lock-in (export) and
the explicit aim of weaning them off tools like Calendly.

### SD-1 — ADR-301 splits into two scopes (amends ADR-301; *not* a Schedule-local detail)

ADR-301's thesis is "the PHI boundary is architectural, not a UX toggle." We are deliberately introducing a
*consented, measured* provider-PHI surface, which is the framing 301 was written to forbid — so this requires
an **ADR-301 amendment (or refining ADR)**, not a quiet Schedule decision. The split:

- **PHI → our backend / sync cloud (ADR-303): never. Absolute. Structural. Unchanged.** This is the real 301.
- **PHI → the user's own third-party provider (their Google account): a bounded, audited, default-off,
  *interim* deviation** the app drives to zero. The app acts here as the **user's agent over the user's own
  data**, not as custodian shipping PHI to *us*.

**Honesty rule for ADR wording:** writing PHI to a provider — even consented + audited — is **us originating a
PHI egress**. Audit makes it **accountable, not compliant**. We state it as *"301-compliant against our cloud
(absolute); a recorded, user-owned, actively-closing deviation against the user's own provider."* We do **not**
redefine "audited" as "compliant."

### SD-2 — PHI Safety Score is a first-class concept, and it is the *engine*

A score (scale we design) measures how much of the practitioner's PHI exposure still rides on the provider.
It is not a passive dashboard — it is the mechanism that **nudges users toward the end state**: tracks progress
in numbers, flags deviation, drives the interim toward zero. Each PHI-bearing capability the user enables has a
distinct, named impact on the score.

### SD-3 — The adoption ramp (provider = scheduling source-of-truth throughout)

1. **Read-as-is** — read the PHI already in their calendar (continuity, no disruption). *(PHI inflow — see SD-5.)*
2. **Optional PHI-free writes** — write **opaque blocks** ("Busy" / token, no name) onto the calendar. The safe write mode.
3. **Export PHI out** — so trusting us with custody is never lock-in.
4. **Turn off PHI writes** → provider becomes the **PHI-free scheduling substrate only** = Layer-A end state = ADR-301 destination.

Possible far end state: our own calendar + Calendly-like tool, browser-accessible, fully secured. Out of scope now; noted.

### SD-4 — Out-of-box default = no PHI read, no PHI write

Two **separate, explicit** opt-ins, each its own consent step with its own score impact:
- **PHI-read** opt-in (ingest existing calendar PHI).
- **PHI-write** opt-in (write client-identifying detail to the calendar).

Default-off is what keeps the SD-1 amendment defensible. The score is always visible.

### SD-5 — "Read" is PHI *inflow*; filter by individual, not by calendar (LOCKED)

Reading "Therapy w/ Jane Doe 3pm" pulls that PHI into **our** renderer/store — so even the gentlest step makes
us a processor of it. Consequences:

- **No hard "dedicated calendar" constraint.** Instead: **calendar = events; scheduling = events tied to an
  individual; the client roster is the filter lens.** An event not linked to a managed client is out of
  scope / invisible. Personal life filters itself out by never matching.
- **Processing rule:** ingest → match-to-client → **persist only linked events; discard unlinked.** Personal /
  unlinked events are never stored. This contains blast radius without constraining the calendar.
- The **matching seam** (event → client, via attendee email or manual link) is the **same design** as
  *onboard-from-calendar* (read a calendar, propose new clients from attendees). Treat read + onboard as **one
  linking seam**, designed together. Both are external→local PHI inflow.

---

## 2. Bundle taxonomy + the provider port (LOCKED)

### SD-6 — One provider bundle per provider, not connector/reader/writer

The connector/reader/writer 3-bundle split is over-decomposition. It collapses into **one ADR-305 provider
bundle per provider**, exposing **read = query caps** and **write = command caps** — the CQRS split we already
have (`bindQuery` / `bindCommand`, ADR-506). "Reader" and "writer" are *capabilities of one bundle*, not bundles.
"Connector" = the bundle's ADR-305 Flow-A credential + grant, also part of the same bundle.

### SD-7 — Generic `CalendarProvider` port; Google = first adapter

The valuable abstraction is a **provider-agnostic `CalendarProvider` port** (rough surface: `listEvents(range)`,
`getFreeBusy(range)`, `createEvent` / `updateEvent` / `deleteEvent`, sync/watch). Adapters conform: **Google
first; Microsoft / Apple / cal.com / CalDAV additive later** as new bundles, encounter spine unchanged.
**Design the port now, build one adapter.** Promote the port to a base package only at the **2nd** consumer
(same "until module #2" discipline as the deferred base-extraction O194). Until then it lives with Schedule.

### SD-8 — Layer / trust / network placement

- **Two bundles, not one.** The **encounter spine** = the `ru-soam.schedule` *domain module* (owns Layer-B
  tables + encounter CQRS + manifest, ADR-506). The **Google adapter** = a *separate provider bundle*
  implementing the `CalendarProvider` port. Schedule *consumes* the port → swapping the adapter leaves the
  encounter spine untouched. This is what makes "provider swappable" real.
- **Provider-connection *mechanism* = base, reused as-is:** OS-keychain credential (ADR-304), Flow-A provider
  grant (ADR-305), brokered outbound via Main (ADR-203). Calendar is the canonical **"System B" provider token**
  already named in ADR-311 Am1 (OS-keychain, Flow-A, brokered) — consistent, no new credential machinery.
- **Trust tier (ADR-418):** the adapter reads existing-PHI events and writes blocks ⇒ **first-party trust**
  (may touch PHI), runs FP-Host-side; **credential never enters the bundle or renderer** — Main injects it and
  makes the call. (Exact Main-broker vs FP-Host-logic residency split = implementation detail for the ADR.)
- **PHI egress path:** the event payload is built **domain-side, gated by the PHI-write opt-in (SD-4)** —
  opaque block by default, client-identifying detail only when the user has opted in. Main injects the
  credential and performs the outbound call. Main is in the egress path (it already owns the PHI/KEK zone).

---

## 3. Schedule / Sessions boundary — superset & subset (LOCKED)

### SD-9 — Schedule owns Calendar + Events; Sessions owns Client Meeting

- **Schedule = the superset, a *UI over the provider* (storeless — see SD-12).** *Presents* **Calendar(s)** +
  **Events** of *all* types; the **provider owns the event data**. Event taxonomy:
  - **Appointment** — event with guest participant(s) ≠ owner: *client* or *non-client* (friend/colleague).
  - **Time block** — solo work event (case analysis, research, lunch, admin).
  Schedule presents the calendar mechanics of *all* of these + the provider substrate (§2). It does **not** own
  clinical meaning, and must not assume the calendar holds only client appointments.
- **Sessions = the subset.** Owns the clinical **Client Meeting** (= a client appointment seen clinically) +
  Notes + Transcriptions + Reports + (more, TBD). The clinical Layer-B object lives here, **not** in Schedule.
  *This is the only persisted+synced domain object (SD-12).*
- **A client appointment is a *link*, not a move.** The event stays on the provider's calendar (Schedule shows
  it); Sessions gains a Client Meeting record that **points to the source event**
  (`clientMeeting.source = {scheduleEventId}`). It appears in both Activities' views.

### SD-11 — Subset projects onto superset via *derived* classification tags

Each Activity has its own view. The overlap is made visible by classification tags
(`client_session` · `probable_client_session` · `not_client_session` · default `unclassified`) that drive
Schedule's calendar display (e.g. color-coding). **Tags are *derived projections* of state already stored for
other reasons — not a per-event row, and never written to the provider** (a tag on the provider event would
leak its clinical nature — PHI-ish):

| Tag | Durable source (already stored) |
|---|---|
| `client_session` | the Client Meeting row itself (intrinsic — no extra storage) |
| `probable_client_session` | the pending-candidate queue (the one genuinely new state) |
| `not_client_session` | the hashed suppression set (identity/Practice, SD-10) |
| `unclassified` | none — absence of the above |

Schedule **reads** the tag and stores nothing itself; nothing goes to the provider; no tag row is created for a
personal/time-block event (respects SD-5 "persist only linked"). Materialize a cache only if perf demands.

> **Reconciles Practice-IA wording** (decision owed): the IA mapped *Appointments → projection from Schedule*.
> Refined — Practice's **"next client meeting"** projects from **Sessions** (Client Meeting, backed by a
> Schedule event's time); the **agenda / full calendar** projection comes from **Schedule**. Two distinct
> projections, two owners.

## 4. Identity resolution & promotion seam (LOCKED)

### SD-10 — Resolver owned by `record.patient`; Sessions orchestrates; three scenarios

Linking an event to a client = **participant identity resolution**, keyed on match strength. Gated entirely by
the **PHI-read opt-in (SD-4)** — no matching runs until the user opts into reading calendar PHI.

| Scenario | Match signal | Action | Learns |
|---|---|---|---|
| **Auto** | strong-id (email/phone) **exact** in roster | auto-link → Client Meeting + tag `client_session` | — |
| **Candidate** | name matches, strong-id differs/absent | tag `probable_client_session`, surface for confirm | confirm ⇒ **add the id as an alias on the client record** → future auto |
| **Manual** *(default for new/unknown)* | no match | user flags: **promote → new client + Client Meeting**, *or* **exclude → suppression** + tag `not_client_session` | exclude ⇒ **suppression set** |

**Ownership of the flow:**
- **`record.patient` (Practice) = identity authority.** Exposes
  `resolveParticipant({email?, phone?, name?}) → { match: clientId } | { candidates: clientId[] } | { none }`.
  Also owns **alias enrichment** (the "whitelist" — *not* a separate list; confirming an id enriches the
  client's identifier set, so it's deterministic next time) and the **suppression set** (the "blacklist" —
  known-non-client identifiers; **stored hashed**, since we only need to *suppress*, never read back — keeps
  non-client PII out of the store, DPDP).
- **Sessions = orchestrator.** Reads events from Schedule → calls `resolveParticipant` → mints the Client
  Meeting on match → tags the Schedule event (SD-11).
- **Schedule = events + participants + tag field.** Provides raw event/participant data; accepts tags.

One identity authority, not three. This is the **same seam as onboard-from-calendar** (SQ-5) — reverse
direction of the same resolver.

**Banked tensions (not blockers):**
- **Auto-link must be fully audited + reversible** — clinical Client Meetings born from a calendar read need a trail.
- **Shared strong-id edge** (family on one phone/email breaks "unique") → manual-confirm fallback covers it.
- **Persist only linked** (SD-5): unmatched/non-client events are never stored as Client Meetings; suppression is hashed.

---

## 5. Data liveness & sync (SQ-3) (LOCKED)

### SD-12 — Provider = master; Schedule = storeless UI; Sessions = the only persistence

- **Provider is master of all events.** Full source of truth for the calendar.
- **Schedule is a UI over the provider** — renders the calendar, issues create/update/delete through the
  `CalendarProvider` port. **Owns no tables.** The "calendar cache later" (Part I.2e) is only a *view-performance*
  cache for Schedule's UI, never a source of truth.
- **The Client Meeting (Sessions) is the only persisted + synced domain object.** It is **locally persisted,
  dual-origin, provider-master-once-linked** — *not* "local-first" (that wrongly implies app-only origin):
  - **App-origin** — created in-app → pushed to the provider.
  - **Provider-origin** — booked directly on the provider (**Calendly / Google / front desk**) → pulled by
    sync → resolved via SD-10 → minted. *This is the main discovery path, not an edge.*
- **It caches a minimal snapshot of its source event — time, duration, status — NOT the provider's event
  title** (PHI-minimal; client identity comes from our roster). So "next meeting" works offline and projects
  into Practice offline.
- **Node-first preserved:** the clinical spine (Client Meetings) is local and works offline / provider-less.
  No provider → Schedule (the calendar UI) is dormant; you manage Client Meetings directly. Provider stays
  optional (SD-0).

### SD-13 — Field-partitioned source-of-truth; orphan-on-delete; PHI ramp localized to the sync

- **No merge/LWW needed — the two sides own different fields.** Provider authoritative for an event's
  **time / existence**; local authoritative for the **clinical** side (Client Meeting, classification inputs,
  notes). On sync, reconcile the snapshot to the provider.
- **Orphan-on-delete:** provider deletes/moves a synced event while we hold a Client Meeting → **flag the
  meeting, never silently drop clinical data.** (Cleaner than the O23 LWW assumption.)
- **Writes need connectivity** (provider owns the calendar). Offline → a local Client Meeting that **syncs up**
  when the provider reattaches.
- **The entire PHI ramp (SD-3/SD-4) localizes to the Sessions↔provider sync engine** — push opaque-block vs
  PHI-block, read existing PHI — governed by the two opt-ins + the score. Schedule-the-UI carries no PHI policy
  of its own. *One PHI surface, one place.*

---

### SD-14 — Provider residency split (resolves SD-8) → promoted to ADR-507 §10 + ADR-506 Am1 (2026-06-17)

Raised by an architecture review of the built P0 against ADR-506 (pure-base Main) / ADR-418 (trust tiers).
SD-8 had deferred the "exact Main-broker vs FP-Host-logic residency split" to the ADR; ADR-507 §3/§4 left
it ambiguous and the P0 build resolved it Main-ward (whole Google adapter + `calendar.provider@1.0` PHI cap
in `electron/main/calendar/`) — re-introducing the ADR-504 "PHI handler in Main" anti-pattern ADR-506
retired. Resolved (LOCKED):

- **Adapter logic (endpoints / scopes / request shaping / event mapping / port impl) → FP-Host bundle**
  (domain, ADR-506 §9). **Credential lifecycle (KEK-wrapped storage / refresh / `shell.openExternal` grant)
  → Main**, as a **provider-agnostic base credential broker** (KEK can't leave Main; `shell` is Main).
  **Network egress → a Main brokered-fetch base cap** (manifest `apiHosts` allowlist + short-lived-token
  inject; refresh-token + KEK never leave Main).
- **Rejected "X" (FP-Host's own egress):** would contradict ADR-410's standing *"no host network by
  default, brokered through Main"* invariant + ADR-418 §4 (don't de-sandbox the most-PHI-adjacent code —
  direct egress = PHI-exfil-on-bug). Chose **"Y"** (Main brokers): single auditable chokepoint, blast-radius
  = declared hosts, untrusted-host egress-denial for free, no ADR-410 amendment needed.
- **Latent finding:** the FP-Host Node process can currently reach the network (deny-list omits
  `http`/`https`; global `fetch` can't be module-denied) — a sandbox gap vs ADR-410, unused by any bundle,
  being closed now (deny-list + global-neuter); airtight host hardening stays O137.
- **P0 deviation tracked to O485 (P1):** move adapter → FP-Host, add the base broker + brokered-fetch caps,
  split `schedule.calendar` query/command (CQRS), fix the stale "not renderer-visible" comment.

**BUILT + verified — O485/P1 slice 1, 2026-06-18 (committed).** The full residency split landed: NEW
`credential.broker@1.0` + `net.brokeredFetch@1.0` provider-agnostic Main base caps (`phi:true`); Google
adapter moved into `bundles/ru-soam-schedule/google-calendar-adapter.mjs`; `electron/main/calendar/`
deleted (**Main pure-base again**); view cap CQRS-split (`schedule.calendar.query` + `schedule.calendar`);
manifest `apiHosts` allowlist (first use — base mechanism per ADR-506 Am1.1). Chose "Y" as designed —
egress brokered by Main. Found-in-review: broker now drops a `tokenUrl`-less/expired stored token
gracefully (P0-era grants need one re-connect). Live-verified end-to-end via CDP (grant → brokered-fetch →
GCAL → events render). **Arg convention confirmed:** host→Main `bindCapability().call(method, argsArray)`
passes the array straight through (NOT spread); renderer→cap `bindQuery().call(method, a, b)` IS spread.
Remaining O485 (provider-origin sync, identity resolution, calendar writes) = later P1 slices.

### SD-15 — Sessions Client Meeting store (P1 slice 2) → BUILT + live-verified (2026-06-18)

First persistence in the whole Schedule/Sessions pair (ADR-508): new `ru-soam-sessions` first-party
FP-Host bundle, authored to the ADR-506 rule (CQRS-explicit, FP-Host-resident, manifest-declared) by
mirroring `record.patient`. **Zero Main TS** — a manifest with `residency:"protected"` + `ownedTables` +
`migrations` self-registers ownership + protected residency through the existing store-cap discovery path.

- **Caps:** `sessions.meeting.query` (kind `query`: get/listForPatient/listUpcoming) + `sessions.meeting`
  (kind `command`: create/update/setStatus/delete), both `phi:true`. Persists via base
  `store.write`/`store.query`. Audit detail = enums only (`{kind,status}`), never `patient_id`/times/text.
- **Table `client_meeting`** (`protected`) — SQ-2 shape fixed (see ADR-508 §SQ-2); provider/sync columns
  present but inert (slice 2 writes only `source_origin='app'`/`sync_state='local'`).
- **Surface:** standalone Sessions **Activity** (activity-bar item + primary view) — a **read-only**
  "Upcoming Meetings" list. The manual-create form + client-picker (originally planned) was **dropped on
  user call** — the real creation path is provider-origin sync (slice 4), so a hand-create UI would be
  throwaway-ish; the list renders what slices 3/4 populate.
- **Cross-bundle FK decision:** `patient_id` is a plain column, **no `REFERENCES patients(id)`** — a hard
  cross-bundle FK would break Practice's patient-erase cascade. Cost = orphaned `client_meeting` rows on
  client erasure → cross-bundle DPDP erase cascade tracked **O490**.
- **Verified** via CDP (the empty-state list proves the query path + migration; a scripted
  create→list→setStatus→delete→relist round-trip proves the command path + store.write ownership gate;
  no `cap.denied`/`kind_mismatch`).

**Next P1 slices:** identity resolution (`record.patient.resolveParticipant` + alias enrich + hashed
suppression, ADR-508 §4) → provider-origin discovery/sync (pull→resolve→mint, orphan-on-delete, §3) →
calendar writes. These light up the inert provider/sync columns + the classification stubs.

### SD-16 — Identity resolver + alias + hashed suppression (P1 slice 3) → BUILT + live-verified (2026-06-18)

The owned half of SD-10: identity authority added to `record.patient` (Practice). **Zero Main TS** — two
files in `ru-soam-practice` (manifest + index.mjs). Sessions orchestration is **slice 4** (no provider
events to resolve yet).

- **`record.patient.query`:** `resolveParticipant({email?,phone?,name?})` →
  `{outcome:'match'|'candidates'|'none'|'suppressed'}` (+ `clientId`/`candidates`). Order: suppression
  check → strong-id exact (email/phone, base contact ∪ alias) → name fallback. An explicit `outcome`
  discriminant was added atop ADR-508's `{match}|{candidates}|{none}` shape (clearer for the slice-4
  orchestrator). `+ getAliases(clientId)`.
- **`record.patient` command:** `addAlias(clientId,{email?,phone?})` (confirm-candidate enrichment →
  deterministic next time) + `suppressParticipant({email?,phone?})` (exclude).
- **Two new owned tables:** `patient_identity_alias` (PHI, patient-keyed → erase-cascaded) +
  `participant_suppression` (**sha256-hashed `kind:value` only, NO patient_id, NO plaintext** →
  intentionally survives a client erase; the erase loop's `OWNED_ADJUNCT_TABLES` filter now excludes it,
  since a `deleteWhere({patient_id})` would throw on the missing column).
- **Normalization:** email lower+trim; phone digit-strip (`\D`→''), with a nested-`replace()` digit-strip
  in the base-contact phone SQL so formatted stored numbers match. Hashing = WebCrypto
  `subtle.digest('SHA-256')` (no `node:` import — matches the file's `globalThis.crypto`/`Buffer` idiom).
- **PHI:** alias value (PHI) lives only in the protected store; audit detail enum-only (`{kind}`);
  resolver returns clientIds only — no PHI crosses out. **ADR-313 PHI-read opt-in NOT enforced here** —
  the gate is upstream at the provider read (slice 4). Unsalted hash = MVP-acceptable (KEK-encrypted
  store); keyed/salted = later hardening OI.
- **Verified** via CDP (synthetic patient, erased after): match (email/base-phone/alias-email/alias-phone),
  none, candidates (name), addAlias→re-match, suppress→suppressed, erase cascade clean (alias dropped,
  suppression survived). No `cap.denied`/`kind_mismatch`/`locked`.

**Next = slice 4:** provider-origin discovery/sync — pull Schedule events → call `resolveParticipant` →
mint Client Meeting (Sessions orchestrates); field-partitioned reconcile, orphan-on-delete; lights up the
inert provider/sync columns + classification/needs-linking. Then calendar writes (app-origin push).

### SD-17 — Provider-origin auto-link sync (P1 slice 4a) → BUILT + live-verified (2026-06-18)

Sessions becomes the orchestrator (SD-10 / §4). User chose option 2 (auto-link **+** triage), split into
**4a = engine** (this) and **4b = triage panel**.

- **Cross-bundle host→host orchestration is sanctioned + now used.** The Main loader
  (`electron/main/fp-host/loader.ts` `registerRoutingHandlers`) registers *every* bundle's caps into the
  one Main registry with a host-forwarding + lazy-activation handler; `invokeCapability` resolves any, and
  the PHI gate passes for `trustClass:'first-party'` (all in-package bundles). So Sessions FP-Host consumes
  `schedule.calendar.query` + `record.patient.query` — **declared in manifest `dependencies`** (validated
  at activation). Reusable pattern for any cross-domain consume.
- **`sessions.meeting.sync`:** pull `listEvents(now,+90d)` → per event, participants = attendees `!self` +
  organizer (deduped by email) → `resolveParticipant` each → **exactly one distinct `match` ⇒ auto-link**;
  else → transient `needsLinking[]`.
- **`linkEvent(event,clientId)` (shared, 4b reuses):** upsert keyed on `provider_event_id` — insert =
  `linked`; re-pull = `reconciled`, **time snapshot only** (`kind`/`status` local-authoritative =
  field-partitioned, no LWW). Orphan scan **window-scoped** to the pulled `[from,to]` (else past /
  far-future linked rows would be falsely orphaned — caught in review); absent events → `orphaned`, never
  deleted.
- **PHI:** `needsLinking[]` (titles + participant emails/names) is a **transient return value to the
  renderer, never persisted** — a stored queue would put non-client PII at rest, exactly what §4's hashed
  suppression avoids. Audit detail enum-only.
- **Verified** on a real Google Calendar (raw CDP): single-match auto-link (`linked:2`), reconcile re-sync
  no-dup (`reconciled:2`), ambiguous shared-email → `candidates` → `needsLinking`. Orphan code-reviewed,
  not live-fired. No `cap.denied`/`kind_mismatch`/`locked`.

**Next = slice 4b:** "Needs linking" triage panel (renders the transient report; confirm→`addAlias`,
promote→`create`, exclude→`suppressParticipant`, + `linkProviderEvent`). Then Schedule §6 classification
colors (Schedule-side), ADR-313 ramp (O483/P2), calendar writes.

### SD-18 — "Needs Linking" triage panel (P1 slice 4b) → BUILT (2026-06-18)

The triage half of option 2 (SD-17). A `panel.view` contributed by Sessions (`needs-linking.html`,
`when: workspace.activeId`, priority 90).

- **Self-contained, no cross-iframe state.** The panel holds NO shared state with `meetings.html`. It binds
  `sessions.meeting` (command), `record.patient` (command), `record.patient.query` (for the candidate
  name-map) via the view-bridge — cross-bundle renderer binds, no manifest command-dep needed (the bridge
  isn't gated by the bundle's host dependency list). Its own "Refresh" button re-runs `sessions.meeting.sync`
  and renders `report.needsLinking`; auto-runs once on first activate. **Re-run sync to refresh — nothing
  persisted.**
- **Actions (renderer-coordinated, through the slice-3 resolver caps):** candidate → `addAlias(clientId,{email})`
  then `linkProviderEvent`; promote → `create({givenName:name, contactEmail:email})` then `linkProviderEvent`;
  exclude → `suppressParticipant({email})`. Suppressed participants render greyed, no actions.
- **`sessions.meeting.linkProviderEvent(event,clientId)`** (new): validates client via `record.patient.query.get`,
  reuses the shared `linkEvent` with audit detail `{source:'provider', via:'triage'}`. `linkEvent` made
  origin-tolerant (`event.id ?? event.providerEventId`) so auto + manual share it; `sync` entries now carry
  `meetingLink` so manual link derives modality. Shell `icon-registry` gained `link` for the panel chrome.
- **PHI:** event titles + unmatched-participant names/emails arrive only in the transient report and render via
  `textContent` — never written to a table, never logged. `suppressParticipant` stores only the sha256 hash
  (host-side). Audit enum-only. Resolved cards removed by `providerEventId` (not array index) → concurrency-safe
  if two in-flight actions resolve before re-render.
- **Verified:** panel registers, iframe mounts (`view://ru-soam-sessions/needs-linking.html`), bridge up,
  auto-sync renders. Initially the all-linked/empty state; later live-verified **with 2 real unmatched events**
  rendering correctly (raw CDP dump + screenshot).
- **UI (reworked 2026-06-18 to match the approved prototype — was nested cards, looked heavy):** **flat,
  one-row-per-event** — status dot (amber=candidate / grey=no-match) + compact `Wkday Day · time` (no AM/PM,
  drop `:00`) + bold title + muted derived subline (`Name matches "<Client>" in roster` / `Multiple roster
  matches` / `No roster match — likely personal`) + right-aligned actions. **Single candidate → one-click
  `Confirm <FirstName>`** (filled-accent primary). **Multi / no-match → `Link to client`** opens an **inline
  picker** (roster search list + "New client name" input → `create` + link). **`Not a client`** (ghost) →
  `suppressParticipant`, rendered only when the rep participant has email/phone. One event collapses to a single
  representative participant (`pickRep`: first `candidates`, else first `none`; all-suppressed/match → row
  skipped). Filled primary follows the host accent token (theme-driven).

**Next:** Schedule §6 classification colors (Schedule-side — reads Sessions via `meeting.getByProviderEventId`),
ADR-313 ramp + PHI Safety Score (O483/P2), calendar **writes** (app-origin push), O490 cross-bundle erase cascade
(now relevant — 4a/4b link real clients to provider events).

## Open queue (not yet concluded)

- **SQ-2 — Concept model: Schedule entities vs Sessions entities (NEXT — stay at concept level, no fields yet).**
  Schedule: Calendar, Event (+ taxonomy SD-9, tag SD-11, `external_ref`). Sessions: Client Meeting (+ source
  link). Recurrence + availability → defer (post-MVP). Fields/status enums are an ADR/build artifact, not now.
- **SQ-3 — Data liveness / online mode — *RESOLVED* by SD-12/SD-13** (provider-master, storeless Schedule,
  Sessions-only persistence, field-partitioned sync, PHI ramp localized).
- **SQ-4 — Domain interfaces (Part II.3) — *partially resolved by SD-9/10/11.*** Remaining: Practice projections
  (next-client-meeting ← Sessions; agenda ← Schedule), Billing (Client Meeting = billable unit?), lifecycle
  `intake_scheduled` (Practice owns the stage transition; Schedule/Sessions do not write `patient_lifecycle`).
- **SQ-5 — Onboard-from-calendar / migrate existing clients — *folded into SD-10*** (reverse direction of the
  same `resolveParticipant` seam). Design together.
- **SQ-6 — MVP cut + build phases.** Likely: local event/Client-Meeting spine first (unblocks Practice P6),
  Google provider next slice, PHI ramp + score after.
- **SQ-7 — PHI Safety Score scale design** (SD-2) — *RESOLVED 2026-06-20 (ADR-313 Am1 / SD-24).* 0–100 "% PHI
  kept local"; `100 − 60·E/M − 40·writeOptIn` when read-on; weights = the one tunable; read opt-in is the gate.

### Decisions owed to other docs — DONE 2026-06-16
- ✅ ADR-313 (refines Final ADR-301 — new ADR, not in-place amendment) + ADR-507 (Schedule) + ADR-508 (Sessions: Client Meeting + `MeetingProvider`).
- ✅ ADR-301 header `Refined by: ADR-313`. README ADR index += 313/507/508.
- ✅ Open_Items O483 (score scale) / O484 (projection interfaces) / O485 (Google Calendar build, **subsumes O310a**) / O486 (`MeetingProvider`) / O487 (full Sessions pass).
- ✅ Product_Scope: Sessions owns Client Meeting + Schedule = storeless-UI-over-provider + Schedule/Sessions split note + PHI Safety Score note.
- ✅ Practice-IA: Appointments-projection wording reconciled (next-client-meeting ← Sessions; agenda ← Schedule).

## P-A UI build (2026-06-17) — BUILT, dogfooded, user-verified "perfect" (UNCOMMITTED)

Built from the Claude Design handoff (`schedule-ui-build-plan.md`). **Scope = P-A only** (the calendar work-area surface); P-B nav / P-C panel / P-D status-bar score not built. Iterated over several implementer passes, each reviewed + dogfooded via CDP (`:9333`).

- **Calendar = editor work-area pinned tab** (`?id=schedule`, singleton). Activity-bar → primary container shows **`nav.html`** = thin opener stub (auto-opens the tab on activate + "Open calendar" fallback); the real nav sidebar is P-B. `schedule.html` rewritten.
- **Week/Day = true time-grid** (`HOUR_H=56` must equal CSS `--tg-hour-h`; full 0–24 grid; rAF scroll-to-7AM; all-day strip; accent now-line, computed-at-render; greedy lane-packing for overlaps). **Day + Agenda centered in a 780px bordered/elevated card.** **Agenda = 3-col** (time | title + derived modality subline | UNCLASSIFIED badge), header "Upcoming · this week" at offset 0. **Month** 130px cells, ≤5 pills + leading dot.
- **Selection highlight = `setSelection()` class-toggle on existing nodes — never `renderCalArea()`** (a rebuild re-runs the scroll-to-7AM rAF → "screen jumps on event click"; the root cause behind the popover-jump report). Don't regress.
- **Inline detail popover = modal**: transparent backdrop (scroll-lock + outside-click close), clamp+flip within the iframe viewport (measure after show), `focus({preventScroll:true})`. Content: title (textContent — PHI-safe) + time + **computed duration** + location + meeting-link (**selectable URL + COPY button**: `navigator.clipboard`→`execCommand` textarea fallback, both in the click gesture — opaque-origin sandbox blocks the clipboard API) + participants (initials avatar + name + "you"/"organiser" tags).
- **Event chips:** title + modality icon (`device-camera-video` if `meetingLink`, else `location`) + participant subline (**organiser-preferred**, else first non-self).
- **Data — O488 adapter-extension partially pulled forward (user request):** `CalendarEvent` (provider.ts) + `google-adapter.ts` now map optional `location` / `meetingLink` (hangoutLink-preferred, video-entrypoint fallback) / `organizer` / `attendees` — the Google API already returned them; P0 was dropping. **PHI-safe:** rides the existing `phi:true` lock-gated `calendar.provider@1.0` cap into the renderer (a trusted PHI peer, ADR-418); read-only; no new trust-zone crossing. The real **aux detail SLOT** (separate iframe + selection bus + `schedule.activeEvent` context key) stays deferred — only data + inline-popover display landed.
- **Editor-tab descriptor (new renderer/bridge surface, no ADR — UI verb + renderer-only field, not persisted/cross-zone):** `EditorTab.description` + `EditorService.updateTab(instanceId, patch)` (immutable replace + idempotent no-op) + `EditorGroup` render + `.editor-tab-description` CSS + new `soamView.setTabDescription` view-bridge verb (mirrors `setOverviewViewMode`; `BundleViewIframe` resolves it against its `instanceId` = tab id). Calendar sets it per view → tab shows "Schedule" + muted "Wk of Jun 15" / "17 Jun" / "Jun 2026", updating on navigation.
- **Platform codicon set extended** (`electron/main/fp-host/view-codicons.ts` `PATHS`, real `@vscode/codicons` paths): `copy` / `link` / `layers` / `close` / `warning` / `debug-disconnect` / `globe` / `clockface` — also fixed several views' silently-blank icons (popover close `x`, the time-row clock). ADR-413 Am1 = platform owns the icon set (single swap point).
- **Still INERT (P1/O485):** classification (all `unclassified`), client-linking, needs-linking. **Follow-ups:** O488 = real aux detail slot remainder; **O489 = one-click Join launch** (`soamView.openExternal` verb → existing `shell.openExternal` cap; copy-link is the interim).

## SD-20 — Multi-account / multi-calendar (2026-06-19) — design committed, build pending

**Trigger:** the nav redesign (user-labelled, color-coded, multi-calendar UX). Forced lifting two
incremental invariants. **Decisions (ADR-promoted):**

- **ADR-507 Am1** — Schedule **owns tables** (overrides §1 storeless for two `protected` tables only:
  `provider_account` + `calendar`; events stay un-cached/live-fetched). Port becomes **account-aware**.
- **ADR-314** — broker **account-keyed** grants (`{providerType, externalAccountId}`), Main-only,
  identity broker-discovered (unspoofable); **System A (identity) ≠ System B (provider)** even at the
  same Google address.
- **Calendar = a handle** (user's framing): a stable local row → `{account_id, provider_calendar_id}`
  + user name/color/`selected`. **Connect ≠ Add.**
- **Cross-bundle:** event-id must be qualified by account+calendar → Sessions link-key (O493) +
  erase (O490) coordination required before linking multi-account events.
- **Revisits P-B:** `calendar.selected` replaces localStorage `calVisibility`; nav view-switcher
  buttons dropped (redundant with work-header).

**Canonical spec:** [`schedule-multical-spec.md`](./schedule-multical-spec.md) (tables, port, CQRS caps,
event-identity, 6 build slices). **Open Items:** O491 (nav classifications), O492 (broker account-keying),
O493 (link-key qualification), O494 (tables+port+caps), O495 (live-fetch aggregation). **Status: BUILT —
slices 1–3 committed + dogfood-verified (`668d957`, 2026-06-20); see SD-21.** The generic green-field input
(`schedule-multical-design.md`, user research) is adapted, not adopted wholesale (trust-zone-blind; see spec header).

## SD-21 — Multi-account / multi-calendar BUILD (slices 1–3) → COMMITTED + dogfood-verified (2026-06-19 → 06-20)

**Slice 1 (O492, broker account-keying — `8c7cfdf`).** `credential-broker.ts` keyed `{providerType, externalAccountId}`
via the existing credentialStore `ref` dimension (no `CredentialType` union change); `grant` does broker-internal
account-discovery (Google `calendars/primary` → id=email=externalId; Main-internal fetch, not apiHosts-gated) +
returns `{ok, account}`; `status/revoke/getValidAccessToken/clearToken` + `net.brokeredFetch` gain optional `accountId`;
idempotent legacy single-grant migration (refresh→discover→re-key→drop legacy; leave-as-is on fail = forces re-grant);
`credentials/index.ts` += `listRefs` (prefix-slice, dot-safe email refs). No-`accountId` callers resolve the single
account (>1 ⇒ null). CDP-verified migration (account-keyed token, zero legacy keys).

**Slice 2 (O494, Schedule data — `f7720e6`) ADDITIVE.** `ru-soam-schedule` manifest += `residency:protected` /
`ownedTables:[provider_account,calendar]` / migration-v1 / 7 queryTemplates / `store.{write,query}` deps; adapter +=
`providerType:'google'` + 5 account-aware methods + shared `mapEvent`; index.mjs += registry + 5 query + 6 command.
Store-writes in index.mjs (adapter = pure port); audit detail PII-free. `connectAccount` upserts by external id;
`listAggregatedEvents` remaps provider-cal-id → local `cal_<uuid>` + attaches color; `selected=0` filters out. CDP-verified
full CRUD path on real Google Calendar.

**Slice 3 (O495, nav redesign — `668d957`) — the visible UX; absorbed slices 4 + 5.** Built as the user's prototype
redesign (Phases A→B→C + revisions). `nav.html` rewrite: CALENDARS colored-tick list (toggle → `updateCalendar(selected)`
→ calRev refetch) + title-row codicon buttons (`open-in-window` reopen aggregate tab + `add` open wizard) + FILTER BY
CLASSIFICATION (5-state live counts via new non-persisted `ScheduleCountsService` relay + `classFilter` on `ScheduleViewState`,
client-side visibility no-refetch — **closes O491**) + bottom-pinned multi-account ACCOUNTS section (connected = active
highlight; right-click Disconnect/Reconnect/Delete, no inline buttons) + per-cal right-click Edit/Delete/Reconnect (manifest
`menus` + renderer-domain cmds in `src/domain/bootstrap.ts`, `window.soam` positional + calRev bump) + per-row `email /
calendar` tooltip + cal/acct rows share classif hover/active. **Add-calendar wizard** = `calendar-setup.html` work-area tab
(connect → choose account [no "Use" label] → pick provider calendar [dedupe, Primary/Read-only badges] → name + 10-swatch
color → `addCalendar`; edit-mode `?mode=edit&id=` reuses name+color → `updateCalendar`). `disconnectAccount` now unchecks the
account's calendars; new `deleteAccount` = full forget (broker revoke → cascade-delete calendars → delete account row,
audit PII-free). **Organiser-hash fix** (`mapEvent`): secondary/holiday calendars return resource-id `organizer.email`
(`@group.calendar.google.com` / `@group.v.calendar.google.com` / contains `#`) → show calendar name, drop hash.
`view-codicons.ts` gains multi-path + `fill-rule` support + `open-in-window`. `view-bridge` += `setScheduleCounts` +
`requestContextMenu` `contextOverrides` (validated plain-primitive obj in `BundleViewIframe`; blast-radius = own menu visibility).

**Dropped in-session (net zero — do NOT reintroduce):** per-calendar scoped tabs / "Open in New Tab" — user killed it
("checkbox overlay supersedes separate tabs"); editor-tab color-dot infra (`EditorInstance.color`, EditorGroup dot,
view-bridge/iframe color) + `schedule.html` `?id=cal_*` scope filter all built then fully reverted.

**3 cap-call conventions (keep straight):** index.mjs/adapter internal caps = ARRAY-wrapped (`storeWrite.call('delete',[...])`);
renderer-domain `window.soam` + view `soamView` = POSITIONAL.

**NEXT:** cross-bundle **O493** + **O490** — see SD-22.

## SD-22 — Cross-bundle gates: O493 link-key BUILT, O490 erase-cascade PARKED (2026-06-20)

**O493 — Sessions link-key qualification → BUILT + dogfood-verified (committed `e486dfc`), formalized ADR-508 Am1.**
Bare `provider_event_id` collides across accounts/calendars (same Google event id appears on every attendee
copy). Fix = provider-level triple, NOT the local `cal_<uuid>` handle (survives `calendar` row delete/re-add,
no cross-bundle FK). `client_meeting` += `external_account_id` + `provider_calendar_id` (migration v2 = 2 `ALTER`
+ composite index `idx_meeting_provider_v2`); link key = `(provider_id, external_account_id, provider_calendar_id,
provider_event_id)`. Sessions `sync` source migrated `listEvents` → `listAggregatedEvents` (multi-cal, follows
**selected** calendars — events from an un-added primary stop syncing; user-confirmed scope). `linkEvent` =
full-triple lookup → **legacy-NULL backfill-upgrade** (pre-O493 bare-id rows filled in place, no dup) → insert;
reconcile fills NULL qualifiers. Orphan pass = composite-key compare + **selected-cal guard** (de-selected/removed
calendar's rows NOT orphaned; legacy `|` key skipped). Schedule `listAggregatedEvents` stamps `providerCalendarId`
(captured **before** the local-handle remap) + `externalAccountId`. Column-absence keeps `participant_suppression`
exempt; `schedule.html` classify unaffected (uses only `provider_event_id`). 5 files: ADR-508 Am1 +
`ru-soam-sessions` manifest+index.mjs + `ru-soam-schedule` index.mjs + `schedule.html` (verify). **Dogfood**
(real Google Calendar, 2 accounts, shared invite ⇒ same event id `7m3e8…` on both primaries — invitee RSVP-Yes
needed for the API copy): synthetic client → `linkProviderEvent` both copies → **2 distinct `client_meeting` rows**
(same `provider_event_id`, diff `external_account_id`; pre-O493 collapsed to 1); re-link → both `reconciled`, same
ids (no-dup); cleanup clean. compile+lint green.

**O490 — cross-bundle DPDP erase cascade → SEAM DOCUMENTED, BUILD PARKED (user: revisit before prod).**
Gap: Practice `record.patient.erase` cascades only over Practice-owned tables; Sessions `client_meeting`
(plain `patient_id`, no FK) survives → orphaned PHI. Now live-relevant (O493 links provider events in). Findings:
(1) **no cross-bundle FP-Host event seam** — `store.changed` (`electron/main/index.ts:135`) is Main→renderer
only; (2) **Main-internal callers bypass per-table ownership** — `enforceOwnership` (`store-write-cap.ts:162`)
returns early for `caller===undefined`, so privileged cross-owner writes are already sanctioned; (3) Main holds
the full table→owner map (`_tableOwnerMap` / `getOrderedMigrationSets()` in `migrations.ts`) + PRAGMA
introspection; (4) **column-absence = auto-exemption** (`participant_suppression` has no `patient_id` col →
naturally skipped). **Recommendation = Option 1: base cap `store.eraseSubject@1.0`** (Main-internal cross-table
cascade by key column: iterate owned tables → PRAGMA-check the column → `deleteWhere` each, residency-routed,
one audit/table; Practice swaps its `OWNED_ADJUNCT_TABLES` loop for a single `eraseSubject('patient_id', id)`
call, keeps blob-unlink before + `patients` parent-delete after; Sessions unchanged; future patient-keyed bundles
auto-covered; base stays domain-free; open question = authority gate, proposal `phi:true` + first-party). Option 2
(decoupled erase-event fan-out) needs new FP-Host event infra + per-bundle handlers — heavier. Full detail in
`docs/Open_Items.md` O490 row. Needs an ADR before code.

**NEXT:** commit O493 → (O490 parked, revisit before prod) → slice 6 (event cache + incremental sync;
Microsoft/Apple/CalDAV [O486]; calendar writes [O483 / ADR-313 ramp]). → see SD-23.

## SD-23 — Query-core view data layer + persistent event cache (slice 6) → COMMITTED + dogfood-verified (2026-06-20)

Two committed steps that finish the Schedule **data layer** (read-only, multi-cal).

**(a) `__viewQuery` — query-core view data layer + in-session window-cache (committed `<query-core commit>`).**
New platform seam: `@tanstack/query-core` injected into sandboxed iframes (`view-query.ts` + generated
`view-query-vendor.ts` [Vite IIFE, **`mode:'production'` + `define` mandatory** else `process` undefined in the
opaque sandbox] + `view-protocol.ts`) exposing `window.__viewQuery` (`observeQuery` / `runMutation` / `invalidate`,
cap-agnostic). **Hard lesson:** `QueryObserver.subscribe` does NOT replay current state → a cached-fresh query never
fires the listener → the view hangs on its spinner forever; the wrapper MUST emit `getCurrentResult()` once on
subscribe. Schedule **window-cache:** events fetched ONCE per month-grid window (`listWindowEvents` = all added
calendars), shared across Day/Week/Month/Agenda; render filters CLIENT-SIDE (range ∩ calendar-visibility ∩ classFilter);
calendar toggle = client-side 0-fetch (was a 2-3s Google refetch); `runClassifyPass` once per window. `staleTime:5min`.
Rollout to other views = O497; bundle-view tech-stack ADR = O496.

**(b) Persistent event cache + incremental sync (slice 6, O495) → COMMITTED `e486dfc`, dogfood-verified.**
The cross-session half. **ADR-507 Am2** reverses Am1's "events un-cached" and authorises a `protected` `event` table
(read-only ⇒ **pure upsert of provider truth, no LWW — O23 stays closed**). `ru-soam-schedule` migration **v2** =
`event` table (UNIQUE on the O493 triple `external_account_id, provider_calendar_id, provider_event_id`) + sync
bookkeeping cols on `calendar` (`sync_token` / `last_synced_at` / `sync_status` / `sync_window_min`). Adapter
`syncEvents(extAcct, provCal, {syncToken?, timeMin?})` = full list bounded by `timeMin = now−3mo` when no token /
incremental delta when a token is present / `410 Gone` → wipe token + full-resync / `status:'cancelled'` → deletions.
Command `syncEvents` (per added calendar: insert → `updateWhere`-on-UNIQUE upsert, cancelled-delete, persist
`nextSyncToken`, PHI-free audit). **`listWindowEvents` + `listAggregatedEvents` BOTH FLIPPED to read the `event` cache**
(single source of truth — user decided over the plan's "leave live" default; `mapEventRow` ≡ live shape incl. O493
triple + color; live Google reached ONLY inside `syncEvents`). **Sessions ordering (Am2):** Sessions `sync` fires the
cross-bundle `schedule.calendar.syncEvents` BEFORE reading `listAggregatedEvents` (offline-tolerant); manifest gains the
`schedule.calendar@1.0` dep. Cascade-delete event rows on removeCalendar / disconnectAccount / deleteAccount (disconnect
also clears the sync token). schedule.html: background sync on activate/connect/added-set change → invalidate the
window-events query on change.

**Bug found + fixed mid-dogfood:** the full-sync set `orderBy:'startTime'` — Google **suppresses `nextSyncToken`** on any
list request that uses `orderBy`, so the token never persisted and incremental silently degraded to a full re-pull every
sync (235 events each time). Fix = drop `orderBy` (events are sorted client-side anyway). Re-verified after restart:
re-sync = 0 upserts; a real Google add+delete → exactly 1 upsert / 1 deletion (true delta); cache + token survive restart;
calendar-delete cascade purges rows. 410-resync code-reviewed only (can't force token-expiry on demand).

**Pre-prod follow-up = O498:** prune (events older than `sync_window_min` — `deleteWhere` is equality-only, can't express
`start < cutoff`) + full-sync `timeMax` bound (open-ended `singleEvents` expansion of recurring series). Both are
bounding/hygiene, not correctness — read path always reads a bounded window.

**Schedule data layer is now complete** (multi-cal accounts/calendars + classification + cross-bundle link-key + persistent
cache + incremental sync). Remaining Schedule work is feature, not foundation: O486 (more providers), O483 (writes /
ADR-313 PHI ramp), O488 (aux event-detail slot), P-D status-bar PHI Safety Score (blocked on O483).

## SD-24 — PHI-read opt-in + Safety Score engine + P-D chrome (O483 read-half) → BUILT + dogfood-verified (2026-06-20)

Resolves SQ-7. O483 bundled five sub-parts; this phase builds the **read-half** (read opt-in + gate + score engine
+ P-D status-bar chrome) and defers the **write-half** to **O499** (calendar write-back + PHI-write opt-in). No new
PHI egress originates this phase — only a consent gate over reads + an honest score.

**Score scale (ADR-313 Am1):** 0–100 "% of clinical scheduling PHI kept local." Computed in the **Sessions FP-Host
bundle** (owns `client_meeting`; output = PHI-free aggregate). `readOptIn=false → 100`; `readOptIn=true →
max(0, 100 − round(60·E/max(M,1)) − (writeOptIn?40:0))`, where `M` = provider-origin linked meetings, `E` = those whose
provider event still carries client-identifying detail (**v1 `E=M`**, no opaque-write path yet). Weights `60/40` = the one
tunable; `writeOptIn` always false until O499. Deviation flag = `readOptIn || writeOptIn`. Honesty copy binds the chrome
("Accountable, not compliant — N meetings carry identifying detail," never "compliant").

**The gate is a policy two consumers honor** (not one call site): Sessions `sync` short-circuits to the empty shape when
read-off (before any `syncEvents` / `listAggregatedEvents` / `resolveParticipant`), **and** Schedule §6 classification
(`schedule.html` `runClassifyPass`) skips `resolveParticipant` → all `unclassified` when read-off. One opt-in flag both
read; do not duplicate the policy. Opt-in stored as pref `sessions.calendarPhiReadOptIn` (default-off, `cloud.telemetryMode`
precedent); toggle audited (Sessions enum event + the auto `prefs.set` audit).

**P-D chrome = shell-only** (no iframe view-state channel): `workbench.phi-safety` status-bar entry (`scope:'workspace'`,
hides on lock) + a `usePopover` consent popover (mirrors `WorkspaceSwitcher`) showing the score, posture, honesty line, and
the PHI-read consent toggle (PHI-write shown disabled / "coming soon"). Score fetched via `sessions.meeting.query`
`getSafetyScore`; toggle via `sessions.meeting` `setPhiReadOptIn`.

Build = 3 slices: A (this doc lock) · B (read opt-in + both gates + audit) · C (score query + P-D chrome). See the plan
file + ADR-313 Am1.

**BUILT + dogfood-verified (committed `675225c`, real Google Calendar, CDP :9333, 2026-06-20):** default-off → `getSafetyScore`
100; `sync` while read-off returns the empty shape with **no** provider read; opt-in → `sync` reads provider (13
`needsLinking`, 0 persisted); promote one event → client + `linkProviderEvent` → M=1 → **score 40** (`100−round(60·1/1)`);
opt-out → `sync` empty + score 100; temp client/meeting erased clean. P-D entry shows the number at a glance (`scope:'workspace'`),
popover renders score + posture + honesty line + working read toggle + disabled write row. **Bug found + fixed mid-dogfood:**
the popover `fetchScore` bound `sessions.meeting` (the **command** cap) instead of `sessions.meeting.query` → `cap.kind_mismatch`
→ "could not load score" + an empty entry (the mount-prefetch failed for the same reason). One-line cap-id fix → entry shows
"100", popover loads. (Reusable lesson: a query-cap method called via `bindQuery('<bundle>.meeting', …)` instead of
`'<bundle>.meeting.query'` fails CQRS kind-check — the bind succeeds, the `.call` throws.) Compile+lint green. Two accepted
review calls: read-off blanks **all** classification incl. already-linked (clean consent-off state; rows still in the Sessions
list); the score counts **orphaned** linked rows as exposure (more honest — still provider-resident).

## SD-25 — Schedule v2 UX fixes from dogfood test session (2026-06-21) — PARTIAL, UNCOMMITTED

Thorough dogfood test of the Schedule Activity (CDP, real Google Calendar, 1 account / 3 calendars:
Primary + Holidays-India[readonly,unselected] + Test). Found bugs → planned + delegated fixes (3 implementer
passes). **ALL UNCOMMITTED**; working tree dirty (10 files M + `schedule-cal-rev.ts` new). compile+lint green.

### Test findings (the full triage)
**Confirmed bugs:** **#1** PHI-read toggle does NOT reclassify an open Schedule view (stale classifications persist —
the documented "fails-closed → all-unclassified when read-off" only held on a *fresh* fetch/remount, not on live toggle).
**#2** Aux event-detail goes stale: not cleared when the source schedule tab closes/remounts; not re-derived on
input change (PHI toggle / roster change) — grid + aux disagree.
**UX:** **#3** "Filter by classification" inverted — clicking a class *hid* it (multi-toggle, no checkbox affordance),
opposite of click-to-focus. **#4** Agenda mislabeled "Upcoming · this week" while showing the fixed Mon–Sun week
(past days; duplicates Week view). **#5** `listWindowEvents` required ISO strings, threw on epoch-ms.
**Verified GREEN:** event cache (29 rows, account-aware O493 triple); **incremental sync delta live** (user added+deleted
a real GCal event → exactly `upserts:1` then `deletions:1`, no full re-pull; no-op = all-0); 4 views; PHI gate fails-closed
on a fresh pass + Sessions `sync` short-circuit when read-off; resolver→classify pipeline (contactEmail auto-matches →
`outcome:match`); ingress E2E (create→`linkProviderEvent{kind:intake}`→setStage→score **40** [formula exact]→**O490 erase
cascade** removes cross-bundle `client_meeting`+alias+client, score→100); calendar CRUD round-trip; add-cal wizard dedupe;
P-D popover (score/posture/honesty copy/read-toggle; write-row disabled = O499).
**Gaps (untested by constraint):** multi-account (single acct); connect/reconnect/disconnect live (consent); `removeCalendar`
cascade live; 410 token-expiry resync; MS/Apple/CalDAV (O486); writes (O499).
**Other observations:** idle auto-lock re-locked the workspace twice mid-session (CDP input doesn't reset idle timer) →
**O502** logged (user wants a configurable interval). **Primary calendar color drifted `#c0965c`→`#4eccc4` across the
restart** — unexplained, NOT a v2 change (neither agent touched color seeding); handle + event-stamped agree (`#4eccc4`)
so it is internally consistent — investigate the drift source separately.

### Decisions (locked with user)
- **#4** Agenda = **rolling next-7-days from today**, label "Next 7 days", date-nav steps by 7 (Week stays fixed Mon–Sun).
- **#2** Aux = **auto-reveal on event click when hidden** (NOT resurrect the inline popover — removed on purpose, slice A1);
  clear on source close; reload-on-context-switch generic at BundleViewIframe/contribution level (not schedule-special).
- **#3** Filter = **single-select focus** (click a class → show only it; re-click or "All events" → reset). Drop the
  classification color FILL on chips; **chip thick left border = CALENDAR color** (was classification); classification
  stays as the text badge only.
- **#1** Reactivity = route every classification-input change (PHI toggle, roster create/link/erase) through the existing
  `calRev` bump (`bumpScheduleCalRev`); no new channel field. Folds into O497 long-term.

### Build (3 delegated implementer passes)
- **Pass A (reactivity + aux):** NEW `apps/desktop/src/platform/view-mode/schedule-cal-rev.ts` (module-callback shared bump,
  mirrors `phi-safety-events.ts`); `bootstrap.ts` registers it + `syncContext` clears active-event when the schedule tab
  loses focus/closes (recursion-guarded); `PhiSafetyPopover.tsx` + `ClientEraseDialog.tsx` bump after their mutation;
  `BundleViewIframe.tsx` reveals `SlotId.AuxSideBar` on event-set when hidden; `event-detail.html` re-derives its
  classification/action block on the `calRev` push (fail-closed when read-off).
- **Pass B (view tweaks):** `schedule-view-state.ts` `classFilter` `Record<string,boolean>`→`string|null` (focusedClass,
  back-compat); `nav.html` single-focus list (color swatches dropped); `schedule.html` single-focus filter + chip border =
  `calendarColor` (`--ev-border-color`/`--cal-color` set inline, `cls-*` color rules removed) + Agenda rolling-7-day
  "Next 7 days"; `index.mjs` `toISOArg` helper (accepts epoch-ms | ISO).
- **Pass C (fix):** `schedule.html` `applyScheduleViewState` `revChanged` branch — re-run `runClassifyPass` on the
  `visibilityChanged` + spurious-bump branches (was a no-op).

### Post-build dogfood (this session)
- **#5 ✓** epoch + ISO both accepted (16 == 16).
- **#4 ✓** "Next 7 days" rolling SUN(today)→+6, tab title + counts range-scoped.
- **#3 ✓** single-select focus (click Personal → only personal); chip left border = calendar color (teal `#4eccc4`=Primary,
  coral `#e07857`=Test); classification = text badge only.
- **calRev producer ✓** (popover toggle: localStorage `calRev` 265→266→267).
- **#1 STILL BROKEN — ROOT CAUSE PINNED.** Toggling PHI-read OFF via the popover does NOT clear classes on the open
  calendar (still Excluded/Personal). Cause = `schedule.html` `runClassifyPass` (~L2015-2032): when read-off it does
  `publishCounts()` + `return` — it does **NOT clear cached per-event classification** from a prior read-on pass. Cold-load
  is fine (fresh events default unclassified); live-toggle leaves the old classes painted. Pass-C's reclassify-on-bump
  call is correct but no-ops because `runClassifyPass` itself never clears-on-off. **FIX NEEDED:** when read-off, reset each
  event's classification to `unclassified` (clear the cached `cls` on the event objects) + `renderCalArea()`, not just
  `publishCounts()`.
- **#2 aux** clear/reveal wired but NOT re-dogfooded after Pass C; the event-detail re-derive on PHI-toggle/roster-change
  is unverified.

### Resume checklist (next session, fresh)
1. **Fix `runClassifyPass` read-off CLEAR** (`schedule.html` ~L2025) — the live #1. Then re-verify toggle off→all-unclassified,
   on→real classes, both without remount.
2. **Re-dogfood #2 aux** — clear on tab close; reveal on event click when hidden; re-derive on PHI-toggle + roster change.
3. **`needs-linking.html` calRev bump** (Sessions triage confirm/promote/exclude → schedule reclassify) — Pass-A flagged
   follow-up, out of its scope.
4. Verify B's month-pill `brightness(1.15)` selected-state tweak + the chip `is-selected` left-bar (stays calendar color).
5. Investigate the Primary calendar color drift (`#c0965c`→`#4eccc4`).
6. **Then commit the lot** (the v2 fix set is one logical change; currently 11 files uncommitted).

### Resolution — fix-set COMPLETE + dogfood-verified (2026-06-22)
All 6 resume-checklist items closed; compile + lint + script-syntax green; 14 files (one logical change).

- **#1 FIXED** — `schedule.html runClassifyPass` read-off branch now RESETS every
  `ev.classification='unclassified'` + `ev._match=null` → `renderCalArea()` → `publishCounts()`
  (added stale-seq guard). Was `publishCounts()+return` = stale classes on live toggle.
  Dogfood (CDP): OFF `unclassified:3` → ON+bump `not_client:1/personal:1/unclassified:1`
  → OFF+bump back to `unclassified:3`. Live, no remount.
- **#2 aux** — reveal-on-click already wired (`BundleViewIframe:271-279`). Clear-on-close
  dynamically verified (close schedule tab → `activeEvent` null, `schedule.activeEvent` ctx key
  false → event-detail container unmounts). Re-derive: `event-detail.html reclassifyAndRender`
  read-off branch (L1588-1601) already clears (classification→unclassified, `_match=null`, strips
  attendees/organizer) — same correct pattern as #1, no fix needed.
- **#3 needs-linking calRev bump** — new view-bridge verb `soamView.bumpScheduleData()`
  (`view-bridge.ts`) → `request.bumpScheduleData` case (`BundleViewIframe`) → `bumpScheduleCalRev()`;
  called from `removeCard()` (single convergence point for confirm/promote/exclude triage actions).
  Mechanism-verified; triage→reclassify not live-fired (PHI-off ⇒ empty needs-linking queue).
- **#4** — "Next 7 days" rolling-from-today verified (no past days); month today-pill good contrast;
  chips show calendar-color left border.
- **#5 NOT A BUG** — single Primary calendar row, color `#4eccc4`; no duplicate rows; add-mode default
  = green `PALETTE[0]`; no auto-rotation; `addCalendar` requires explicit color. The teal = last
  session's `updateCalendar` recolor test write (expected mutation). Benign residual dev-DB state.
- **O502 confirmed live** — idle auto-lock re-locked the workspace mid-dogfood (CDP input doesn't
  reset the idle timer). Setting OI stands.

Files: schedule.html, event-detail.html (no change needed — verified), needs-linking.html (sessions),
view-bridge.ts, BundleViewIframe.tsx, schedule-cal-rev.ts (new), + prior-session set
(bootstrap.ts, ClientEraseDialog.tsx, PhiSafetyPopover.tsx, schedule-view-state.ts, index.mjs, nav.html).

### Follow-up — calRev reactivity bugs found post-commit, FIXED + dogfood-verified (2026-06-22)
User retest after the O503 commit found #1 + #2 still failing live ("requires close/reopen").
Two distinct root causes; the first dogfood missed both because it bumped calRev via
`scheduleViewState.setState` directly, never exercising the real consumer paths.

**Bug 1 — module-singleton bump no-op.** `schedule-cal-rev.ts` held the bump as a module-level
`let _bump` registered by `domainBootstrap`. The real consumers (PhiSafetyPopover, ClientEraseDialog,
the context-menu helper, and this session's needs-linking `bumpScheduleData`) read a *different*
module instance where `_bump` was null → `_bump?.()` silently no-ops → calRev never incremented →
no push → no reclassify. CDP-proven: importing the module + calling the export left calRev frozen
(281→281) while a probe-registered fn fired and the edit command was registered (bootstrap ran).
Classic "HMR doesn't swap boot-instantiated singletons" gotcha — a module-level mutable singleton.
FIX: `bumpCalRev()` method on `ScheduleViewStateService` (a true registry singleton); all renderer
consumers call `useService(ScheduleViewStateServiceId).bumpCalRev()`; `schedule-cal-rev.ts` DELETED;
`domainBootstrap`'s local helper now delegates to `registry.get(...).bumpCalRev()`.
Verified: real popover toggle → calRev 281→282, counts ON `nc1/p1/u1` → OFF `unclassified:3`, live.

**Bug 2 — stale calendar color on edit.** Calendar metadata (color/name) is baked onto cached event
objects at fetch (the `listWindowEvents` JOIN). The calRev "spurious bump" branch only re-ran
`runClassifyPass` on the in-memory events → repainted the STALE color. FIX: that branch now
`__viewQuery.invalidate(['schedule.calendar','windowEvents'])` → refetch with fresh JOIN metadata →
observer onData re-classifies. Refetch reads the local event cache (no Google call) — cheap, and
covers the classification-input case too. Verified: Primary color → pink reflected live (no reopen).

Files: schedule-view-state.ts (+bumpCalRev), PhiSafetyPopover.tsx, ClientEraseDialog.tsx,
BundleViewIframe.tsx, bootstrap.ts (service bump), schedule.html (spurious→invalidate);
schedule-cal-rev.ts DELETED. Compile + lint + html-syntax green.

### Commit status (2026-06-22)
O503 fully landed: round 1 (5 dogfood items) = `9b66bf9`; calRev-reactivity follow-up
(module-singleton → service-method bump + refetch-on-edit) = `1eabdec`. Tree clean.

---

## SD-26 — Refresh settings + event-popover hybrid + account auto-disconnect (O505, post-O503 discussion)

Three small UX slices from a design discussion (2026-06-22). Item #1 (rename "PHI read"
toggle → clinical-linking framing) was PARKED for later. Built in one implementer pass +
one Opus correction (poller active-gating); compile + lint + html-syntax green; all three
dogfood-verified on the live app via raw-CDP into the opaque iframes. UNCOMMITTED (read-only-git).

**#2 — Calendar refresh settings + auto-poller + manual Refresh button.**
- Two prefs on the schedule bundle: `schedule.refreshMode` ('auto'|'manual', default **manual**)
  + `schedule.refreshIntervalMin` (integer ≥ 1, default **15**). New CQRS cap methods
  `schedule.calendar.query.getRefreshSettings` + command `schedule.calendar.setRefreshSettings`
  (validates mode + interval≥1; persists via `prefs@1.0`, added to manifest deps; prefs.set auto-audits).
- Settings UI = new **SETTINGS section in the schedule nav sidebar** (Auto-refresh checkbox +
  interval number input, dimmed/disabled when manual). On change → persist via cap AND live-push
  via the new relay.
- Live cross-iframe push = new **`ScheduleRefreshSettingsService`** (non-persisted renderer relay,
  mirrors `schedule-counts.ts`) + `ScheduleRefreshSettingsServiceId` + boot register +
  `soamView.setScheduleRefreshSettings` verb + `request.setScheduleRefreshSettings` handler +
  init/context/`scheduleRefreshSettings` push in BundleViewIframe.
- Poller lives in schedule.html: `applyRefreshSettings` (re)starts `setInterval(triggerBackgroundSync,
  intervalMin·60000)` only when mode='auto' **and the view is active** (`_viewActive` flag, set in
  `events.onActivate`/`onDeactivate`). A settings push while deactivated only updates mode/interval;
  next onActivate starts the timer. View only exists while unlocked (lock unmounts iframe) → "unlocked"
  is implicit. Manual **Refresh** button (`↻`, `#btn-refresh`) in the work-header → `triggerBackgroundSync`,
  always enabled.
- **Opus correction:** implementer first gated the poller start on `_soamView` (bridge exists) instead
  of view-active → a push while deactivated would start a background Google-sync poller. Fixed to
  `_viewActive`.

**#3 — Event popover hybrid (revives the popover removed in ingress slice A1 `e9b4a2f`).**
- aux **closed** → clicking an event shows a lightweight popover (`#ev-pop-container` + backdrop):
  title/time/location/participants(You·Organiser badges)/Copy link/Join + a primary
  **"Open in side panel"** button. All text via `textContent` (PHI-safe). Recovered markup/positioning
  from the proven pre-A1 implementation, trimmed (no client-link action hub — that stays in aux event-detail).
- aux **open** → no popover; clicking an event keeps current behavior (`setActiveEvent` updates aux).
- "Open in side panel" → `setActiveEvent(ev)` (BundleViewIframe reveals aux when hidden) + close popover.
- aux visibility pushed into schedule.html via BundleViewIframe `layout.onDidChangePartVisibility`
  (filtered to `SlotId.AuxSideBar`) → `auxVisible` on init/context + `kind:'auxVisible'` push;
  schedule tracks `_auxVisible`, closes any open popover when aux becomes visible.

**#4 — Account auto-disconnect on sync auth-failure.**
- Adapter `syncEvents`: 401/403 → throw `{ code: 'auth.invalid' }` (ordered after the existing 410 →
  `sync.token_expired`). index.mjs `syncEvents` catch for `auth.invalid` → set the account
  `connection_state='disconnected'` + clear its calendars' sync_token/uncheck (mirrors `disconnectAccount`)
  + PII-free audit `{reason:'auth_failure'}`; continues other accounts; returns `disconnectedAccounts[]`.
  schedule.html `triggerBackgroundSync` → if `result.disconnectedAccounts.length` → `soamView.bumpScheduleData()`
  so the nav account list refreshes to show disconnected.

**Dogfood (real Google Calendar, raw-CDP `suppress_origin=True` into the opaque iframes):**
- #2 caps: default {manual,15}; set→{auto,3} persist+readback; intervalMin=0 + bad-mode both throw;
  restore {manual,15}. Nav toggle → interval enables, pref persists {auto}, **relay service receives push**
  {auto,15} (same plumbing proven live by activeEvent). Refresh button click = no throw.
- #3: aux-closed click → popover "O493 Collision Test" + [Copy link, Join, Open in side panel] + backdrop +
  selection; "Open in side panel" → popover closes + **aux reveals** + `event-detail.html` mounts +
  activeEvent set; aux-open click on a 2nd event → **no popover**, aux updates to new event. Popover renders
  cleanly positioned right of the anchor, no overflow.
- #4: `syncEvents` return now carries `disconnectedAccounts:[]` on a healthy token (1 cal, 0 errors).
  The auth-failure disconnect branch is code-reviewed only (can't revoke the Google grant on demand).

Files: schedule-refresh-settings.ts (NEW), ids.ts, boot.ts, view-bridge.ts, BundleViewIframe.tsx,
manifest.json, index.mjs, google-calendar-adapter.mjs, schedule.html, nav.html.

**Still open:** O502 (idle auto-lock interval setting), #1 PHI-toggle rename (parked).

### SD-26 follow-up — refresh settings moved to the gear Settings menu (2026-06-22)
User clarified "settings" = the global **gear → Settings** popover (Appearance | System), NOT the schedule nav sidebar. Relocated #2's controls + made them professional (frontend-design pass):
- New **"Schedule" panel** in `SettingsMenu` (3rd root row, after Appearance) = a `settings-section` "Calendar" with an **Auto-refresh toggle SWITCH** (`role="switch"`, iOS-pill 34×18, accent track + sliding knob, reduced-motion-safe, keyboard-focusable — not a checkbox) + a **Refresh-interval stepper** (`− 15 + min`, min 1, dimmed/disabled when manual) + a manual-mode hint "Refresh manually from the calendar toolbar." Copy is end-user voice ("Check your calendars for changes on a timer.").
- **`ScheduleRefreshSettingsService` refactored → prefs-backed** (mirrors `TelemetryModeService`): binds `prefs@1.0`, reads `schedule.refreshMode`/`schedule.refreshIntervalMin` on init + workspace-change (O474 guard), `setSettings(Partial<RefreshSettings>)` validates/clamps + persists both keys. The Settings menu is now the **sole writer** (renderer writes prefs directly — no schedule-bundle activation on settings-open). schedule.html still reads the same prefs via its `getRefreshSettings` query + receives live updates via the unchanged BundleViewIframe outbound push.
- **Removed (dead after relocation):** nav.html SETTINGS section + JS; the `soamView.setScheduleRefreshSettings` view verb + its `request.setScheduleRefreshSettings` handler (no view writes settings anymore); the bundle `setRefreshSettings` command (renderer writes prefs now). Kept: `getRefreshSettings` query, `prefs@1.0` dep, the outbound `scheduleRefreshSettings` push + `_viewActive`-gated poller.
- **Dogfood (real GCal, CDP):** gear → Schedule renders (toggle off / dimmed stepper / manual note); toggle → auto (accent track, knob right, stepper enabled, service `{auto,15}`); stepper +2−1 → 16 (DOM + service + **prefs persisted** `auto`/`16` read back via prefs cap); toggle → manual pushed `{manual,16}` **into the open schedule.html iframe** (wiretap captured it — live poller update path proven end-to-end); nav SETTINGS section confirmed gone (sections = Calendars/Filter/Accounts); restored `{manual,15}`. Compile+lint+node-check green, zero app errors.
Files: schedule-refresh-settings.ts (prefs-backed rewrite), SettingsMenu.tsx, SettingsMenu.css, nav.html (−section), view-bridge.ts (−verb), BundleViewIframe.tsx (−handler), index.mjs (−setRefreshSettings).

### SD-26 polish — refresh button + popover restored to original UI (2026-06-22)
User flagged the prior pass's quality: refresh button looked like a "patch", and the popover was a flatter rebuild, not the original. Both fixed (Opus did these directly, not delegated):
- **Refresh button:** replaced the raw unicode `↻` with a real **`refresh` codicon** (added the glyph to `view-codicons.ts` platform set, real @vscode/codicons path) rendered via `window.codicon('refresh',15)`, + a `.header-divider` hairline before it so it reads as an intentional toolbar action, not a floating glyph. Added a `.spinning` rotation while a manual sync is in flight (reduced-motion-safe, min one rotation so it doesn't flicker).
- **Popover:** RESTORED the original `#detail-popover` design from git (`e9b4a2f^`) verbatim — kind-strip, title + class badge, time row + duration badge, calendar badge, location, meeting-link as monospace selectable URL, divider, PARTICIPANTS with avatars (initials) + you/organiser role tags. Replaced the rebuilt `.ev-pop*` markup/CSS/JS (`showEventPopover`) entirely with the original `openPopover`/`closePopover` (static markup + DOM refs + once-registered listeners + window-blur dismissal). Folded the two new affordances in faithfully: inline accent **Join** (`openExternal`) + **Copy** buttons in the meeting-link row, and a single ghost **"Open in side panel"** footer button (escape to aux). The hybrid behavior is unchanged (aux-closed→popover, aux-open→setActiveEvent).
- **Dogfood (real GCal, CDP):** header refresh = crisp codicon + divider; popover renders the full rich layout (duration "1hr", "My Primary" badge, monospace meet link + Join/Copy, avatars + you/organiser); "Open in side panel" → popover closes + aux reveals + activeEvent set; aux-open click → no popover (hybrid intact). Compile+lint+node-check green, zero app errors.
Files: view-codicons.ts (+refresh glyph), schedule.html (popover restore + refresh button + header-divider).
