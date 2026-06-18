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
- **SQ-7 — PHI Safety Score scale design** (SD-2) — what it measures, the number, how each opt-in moves it.

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
