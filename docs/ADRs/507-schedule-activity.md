# Schedule Activity: a UI over calendar providers

**ID:** ADR-507
**Status:** Draft
**Date:** 2026-06-16
**Layer:** domain
**Supersedes:** —
**Superseded by:** —
**Takes up:** ADR-310 (Google Calendar provider integration, previously Proposed/deferred)
**Related:** [Product Scope](../Product/Product_Scope.md) (Schedule = `ru-soam.schedule`), ADR-305 (provider credentials, Flow-A), ADR-203 (brokered networking), ADR-310 (Google Calendar), ADR-311 (node-first; "System B" provider tokens), ADR-313 (PHI gradient), ADR-418 (bundle trust tiers), ADR-506 (domain module model), ADR-508 (Sessions / Client Meeting — the persisted half), ADR-505 / [Practice IA](../Activities/practice/practice-information-architecture.md) (P6 projection source). **Design journal + decisions:** [`docs/Activities/schedule/schedule-design-log.md`](../Activities/schedule/schedule-design-log.md) (SD-1..SD-13).

## Context

Product Scope names **Schedule** an MVP Activity ("book and view appointments"), and ADR-310 deferred
Google Calendar as a provider plugin "until scheduling is scoped." That condition is now met. The
[Schedule design log](../Activities/schedule/schedule-design-log.md) worked the model out; this ADR
formalizes the Schedule half. The persisted clinical half (Client Meeting) is ADR-508.

The load-bearing realization (design log §0, SD-12): **we are not building a calendar app.** Calendars
are *providers*. Schedule is the **UI + provider-integration layer**; the provider is the master of
events; the only thing we persist is the clinical subset (Client Meeting, ADR-508).

## Decision

### 1. Schedule is a *storeless UI over the provider* — it owns no tables (SD-12)

The **provider is the master of all events**. Schedule renders the practitioner's calendar and issues
create/update/delete through the provider port. It persists nothing of its own. Any local calendar
cache (deferred) is a **view-performance cache for the UI, never a source of truth**. The only persisted
domain object in the whole Schedule/Sessions pair is the Client Meeting (ADR-508).

### 2. `CalendarProvider` port — provider-agnostic; one adapter at a time (SD-6, SD-7)

A provider-agnostic port (rough surface: `listEvents(range)`, `getFreeBusy(range)`,
`createEvent`/`updateEvent`/`deleteEvent`, sync/watch). Adapters conform: **Google first;
Microsoft / Apple / cal.com / CalDAV additive later** as new bundles, the rest of Schedule unchanged.
**Design the port now, build one adapter.** Promote the port to a base package only at the **2nd**
adapter (the "until module #2" discipline, cf. deferred O194); until then it lives with Schedule.

### 3. One provider bundle per provider — not connector/reader/writer (SD-6)

Each provider = **one ADR-305 bundle**: its Flow-A credential + grant ("connector"), **read = query
caps**, **write = command caps** (the CQRS split we already have, `bindQuery`/`bindCommand`, ADR-506).
"Reader"/"writer" are *capabilities of one bundle*, not separate bundles.

### 4. Trust, credentials, network (SD-8)

- **First-party trust (ADR-418):** the adapter reads existing-PHI events and writes blocks ⇒ may touch
  PHI ⇒ runs first-party-host-side. The **credential never enters the bundle or the renderer** — Main
  injects it and performs the outbound call (ADR-203 brokered networking).
- **Credential model = ADR-305 Flow-A**, OS-keychain (ADR-304). Calendar is the canonical **"System B"
  provider token** already named in ADR-311 Am1 (distinct from identity/"System A"). No new credential
  machinery — reuse the provider framework.
- Separate, **incremental** consent at the scheduling entry point, not at sign-in (as ADR-310 decided).

### 5. Schedule presents *all* event types; owns no clinical meaning (SD-9)

Event taxonomy presented: **Appointment** (guest participant ≠ owner — *client* or *non-client*) and
**Time block** (solo work: case analysis, research, lunch, admin). Schedule must **not assume** the
calendar holds only client appointments. Clinical meaning belongs to Sessions (ADR-508).

### 6. Classification tags are *derived* and *displayed*, never stored by Schedule, never written to the provider (SD-11)

Schedule color-codes events by classification (`client_session` / `probable_client_session` /
`not_client_session` / `unclassified`). These tags are **derived projections** of state Sessions /
identity already store (Client Meeting link / pending-candidate queue / hashed suppression set — ADR-508);
Schedule **reads** them and stores nothing. A classification tag is **never written to the provider event**
(it would leak the event's clinical nature — PHI-ish).

### 7. The PHI gradient (ADR-313) localizes to the sync, not the UI

Schedule-the-UI carries no PHI policy of its own. *What* gets read/written to the provider (opaque block
vs client-identifying PHI) is governed by ADR-313's two opt-ins + score, and decided in the
Sessions↔provider sync (ADR-508). The port mechanism can carry either payload; ADR-313 governs which.

### 8. Projection into Practice (reconciles Practice IA)

Practice's **agenda / full-calendar** view projects from **Schedule**; Practice's **"next client
meeting"** projects from **Sessions** (Client Meeting backed by a Schedule event's time — ADR-508).
Two distinct projections, two owners. (Updates the Practice-IA wording that mapped "Appointments" wholesale to Schedule.)

### 9. Node-first preserved

The provider is **optional**. No provider connected → Schedule (the calendar UI) is dormant; the user
manages Client Meetings directly in Sessions (which is local, ADR-508). Offline → calendar view degraded;
the clinical spine is unaffected.

### 10. Provider residency — adapter logic → FP-Host; credential lifecycle + network egress → Main (resolves SD-8, the §3/§4 tension)

§3 (provider = a bundle's CQRS caps) and §4 (credential never enters the bundle; Main injects + performs
the outbound call) left the **code-residency split** implicit; the design log SD-8 deferred "exact
Main-broker vs FP-Host-logic residency" to this ADR. Resolved into three pieces:

- **Adapter logic = FP-Host (domain bundle).** Provider-specific knowledge — API endpoints, scope sets,
  request shaping, response→`CalendarEvent` mapping, the `CalendarProvider` port implementation — runs in
  the first-party bundle's FP-Host logic half. It is domain code (ADR-506 §9: domain → FP-Host) and must
  **not** live in Main.

- **Credential lifecycle = Main, provider-agnostic base mechanism.** Token at-rest (KEK-wrapped per
  O307f), refresh, and the interactive grant (`shell.openExternal` + loopback PKCE) are Main-only — the
  KEK never leaves Main (ADR-307 / ADR-418 §2) and `shell` is a Main API. Exposed as a **generic,
  provider-agnostic credential broker** keyed by `{provider, account, scopes}` — **not** a Google- or
  calendar-named Main cap. This keeps Main domain-free (ADR-506 §1) while it owns the key-bearing half,
  and makes additional providers (§2) cheap.

- **Network egress = a Main brokered-fetch base cap; NOT FP-Host raw egress.** The bundle shapes the
  request and calls a generic **brokered-fetch** base capability; Main validates the target host against
  the bundle's manifest-declared allowlist (`apiHosts` — *data*, not logic, cf. `ownedTables` ADR-506 §6),
  injects the short-lived access token, performs the outbound call, and returns the raw response for the
  bundle to map. **The refresh token and the KEK never leave Main; only the short-lived access token is
  used inside Main's broker — it is never handed to the bundle.**

  **Why not FP-Host's own egress** (the rejected option "X"): ADR-410 makes *"no network access from the
  host by default; outbound brokered through Main"* a standing trust-zone invariant, and ADR-418 §4's
  bug-vs-malice rule (the most-PHI-adjacent code is what we least want de-sandboxed) applies directly to a
  PHI-holding process — direct egress is a **PHI-exfil-on-bug** vector (a buggy dependency could phone
  home). Brokered-fetch keeps a single auditable chokepoint, shrinks blast-radius to declared hosts, and
  gives the future untrusted Bundle-Host egress-denial **for free** (it is simply never granted the cap).
  Granting FP-Host raw egress would require **amending ADR-410** — rejected. *(Note: the FP-Host Node
  process today has latent OS-level network reachability because its module deny-list omits
  `http`/`https` and global `fetch` cannot be module-denied — a sandbox gap, contra ADR-410, not a grant.
  It is unused by any current bundle and is being closed; airtight host-surface hardening stays tracked by
  O137.)*

This makes the provider bundle a true ADR-506 vertical slice: domain logic in FP-Host, key/credential/egress
**mechanism** consumed from base.

#### P0 build deviation (CORRECTED in P1 slice 1 / O485, 2026-06-18)

**Resolved.** The four-part refactor below landed and was verified end-to-end (compile/lint
green; live Google grant → events render through the new base caps). (a) the Google adapter
logic moved into the `ru-soam-schedule` FP-Host bundle (`google-calendar-adapter.mjs`);
(b) the provider-agnostic `credential.broker@1.0` + `net.brokeredFetch@1.0` base caps were
added (`electron/main/capability/`); (c) the view cap was split into `schedule.calendar.query`
(`kind: query`) + `schedule.calendar` (`kind: command`); (d) `electron/main/calendar/` was
deleted, so the stale comment is gone and **Main is pure-base again**. The remaining O485 work
(provider-origin sync, identity resolution, calendar writes) is unaffected by this slice. Original
deviation note retained below for history.

The shipped P0 (`apps/desktop/bundles/ru-soam-schedule` + `electron/main/calendar/`) predates this decision:
the Google adapter (OAuth, token store, `listEvents` fetch, event mapping) and the `calendar.provider@1.0`
cap all run in **Main**, with the FP-Host bundle a hollow relay. This is a **known, temporary deviation**
from §10 — Main is *not* pure-base while it stands (contra ADR-506 §"pure-base Main REACHED") — tracked to
the P1 refactor (O485): (a) move adapter logic into the FP-Host bundle; (b) introduce the
provider-agnostic credential-broker + brokered-fetch base caps; (c) split the bundle's view-facing
`schedule.calendar` into a **query** cap (`getStatus`/`listEvents`) and a **command** cap
(`connect`/`disconnect`) per §3 + ADR-506 §3/§7, and classify `kind` accordingly (the P0 cap is wrongly
marked `kind: query` while exposing mutating `connect`/`disconnect`); (d) fix the stale
`calendar-cap.ts` comment claiming the cap is "not renderer-visible" — the single shared registry +
allowlist-free `soam-channel` make it renderer-reachable (no PHI hole — renderer is a trusted PHI peer —
but the relay indirection is unenforced). Until P1 the deviation is **contained**: the cap is `phi:true` +
lock-gated + first-party-only, so PHI exposure is unchanged.

## Consequences

### Positive

- No event store to keep in sync with the provider — the provider is simply the source of truth.
- Multi-provider is real and cheap: a new adapter, nothing else changes.
- All PHI policy is in one place (the ADR-508 sync), not smeared across the UI.

### Negative

- Schedule renders nothing without a provider — so the *buildable provider-less value* is Sessions
  (ADR-508), and Schedule's UI lights up only once the Google adapter (P1) lands. Build order reflects this.
- The heaviest/riskiest work (Flow-A OAuth + brokered calendar API + sync) is concentrated in P1.

## Considered Options

- **Schedule as a local event store mirroring the provider** — _Rejected_: duplicates the provider, creates a real two-way sync/merge problem, and contradicts "provider is master."
- **connector / reader / writer as three bundles** — _Rejected_: over-decomposition; collapses into one bundle's CQRS caps (SD-6).
- **Storeless UI over a `CalendarProvider` port, persistence only in Sessions** _(chosen)_.

## Open Items

- **O485** — Google Calendar provider build (P1): `CalendarProvider` port + Flow-A adapter + brokered calendar API + provider-origin discovery/sync + identity resolution (ADR-508 §) + onboard-from-calendar. **Subsumes ADR-310 O310a.**
- **O483** — PHI ramp + Safety Score on the sync (P2, ADR-313).
- **SQ-6 (design log)** — MVP cut / build order. Working plan: **P0 = Sessions Client Meeting spine (provider-less)**, P1 = Google provider, P2 = PHI ramp.
- Provider-event field shape is **provider-defined** (we don't model it) — SQ-2 concerns only the persisted Client Meeting (ADR-508).
