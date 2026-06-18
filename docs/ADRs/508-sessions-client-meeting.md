# Sessions Activity: the Client Meeting (persisted clinical subset of the calendar)

**ID:** ADR-508
**Status:** Draft
**Date:** 2026-06-16
**Layer:** domain
**Supersedes:** —
**Superseded by:** —
**Related:** [Product Scope](../Product/Product_Scope.md) (Sessions = `ru-soam.sessions`), ADR-507 (Schedule — the storeless UI half; §10 = provider-residency split), ADR-506 (+Am1) (domain module CQRS + ownership — the authoring rule this follows; Am1 = provider-connectivity base caps), ADR-505 / `record.patient` (identity authority), ADR-313 (PHI gradient — localizes to the sync here), ADR-302/307/452 (local + protected store), ADR-305/203/418 (provider plugins, brokered, trust), ADR-311 (System-B provider tokens), ADR-502 (audit ledger), ADR-310 (Google Calendar/Meet). **Design journal:** [`docs/Activities/schedule/schedule-design-log.md`](../Activities/schedule/schedule-design-log.md) (SD-9..SD-13).

## Context

The [Schedule design log](../Activities/schedule/schedule-design-log.md) split scheduling into two
Activities: **Schedule** = a storeless UI over the calendar provider (ADR-507); **Sessions** = the
clinical subset we actually persist + sync. This ADR scopes the persisted half. It is the **only**
store in the Schedule/Sessions pair, and it follows the ADR-506 authoring rule (CQRS-explicit,
FP-Host-resident, manifest-declared from the start).

Sessions (Product Scope) is "document clinical sessions." Its full surface = **Client Meeting + Notes +
Transcriptions + Reports + (more)**. This ADR scopes **Client Meeting only** — the spine the rest hang
off; Notes/Transcriptions/Reports get their own Sessions design pass (O487).

## Decision

### 1. Client Meeting = the persisted, synced domain module (ADR-506)

A first-party FP-Host-resident module, CQRS-explicit, manifest-declared. Owns its table(s); persists via
the generic base store caps (`store.write`/`store.query`). PHI ⇒ **protected-store residency** (ADR-452).
It is the clinical view of a client appointment: which client, kind, status, the link to its calendar
event, and (later) links to the note / transcription / report and the online meeting.

### 2. Locally persisted, dual-origin, provider-master-once-linked (SD-12)

**Not "local-first"** (that wrongly implies app-only origin). A Client Meeting arrives two ways:

- **App-origin** — created in-app → pushed to the provider (via the ADR-507 `CalendarProvider` port).
- **Provider-origin** — booked directly on the provider (**Calendly / Google / front desk**) → pulled
  by sync → resolved (§4) → minted. **This is the main discovery path, not an edge.**

It caches a **minimal snapshot of its source event — time, duration, status — NOT the provider's event
title** (PHI-minimal; the client's identity comes from *our* roster, not the calendar title). So
"next meeting" works offline and projects into Practice offline. No provider → purely-local Client
Meetings (manual scheduling) still work — node-first holds.

### 3. Field-partitioned source-of-truth — no LWW; orphan-on-delete (SD-13)

The two sides own **different fields**, so there is no merge problem:

- **Provider authoritative** for an event's **time / existence**.
- **Local authoritative** for the **clinical** side (Client Meeting, classification state, notes).

On sync, reconcile the snapshot to the provider. **Orphan-on-delete:** if the provider deletes/moves a
synced event while we hold a Client Meeting, **flag the meeting — never silently drop clinical data.**
(Cleaner than the O23 LWW assumption.) Writes need connectivity; offline → a local Client Meeting that
syncs up when the provider reattaches.

### 4. Identity resolution & promotion — resolver owned by `record.patient`; Sessions orchestrates (SD-10)

Linking an event to a client = **participant identity resolution**, keyed on match strength, **gated by
the PHI-read opt-in (ADR-313)**:

| Scenario | Signal | Action | Learns |
|---|---|---|---|
| **Auto** | strong-id (email/phone) exact in roster | auto-link → Client Meeting + `client_session` | — |
| **Candidate** | name matches, strong-id differs/absent | `probable_client_session`, surface for confirm | confirm ⇒ add id as an **alias on the client record** → future auto |
| **Manual** *(default)* | no match | **promote → new client + Client Meeting**, or **exclude → suppression** + `not_client_session` | exclude ⇒ **suppression set** |

- **`record.patient` (Practice) = identity authority** — exposes
  `resolveParticipant({email?,phone?,name?}) → {match} | {candidates[]} | {none}`, owns **alias
  enrichment** (the "whitelist" is *not* a list — it enriches the client's identifier set) and the
  **suppression set** (the "blacklist" — non-client identifiers **stored hashed**; we only need to
  suppress, never read back — keeps non-client PII out of the store).
- **Sessions = orchestrator** — reads events from Schedule, calls `resolveParticipant`, mints the Client
  Meeting on match.
- **Same seam, both directions** — surfacing existing clients *and* onboarding new ones from the calendar.
- **Auto-link is fully audited + reversible** (ADR-502) — clinical records born from a calendar read need a trail.

### 5. Classification tags are derived from durable Sessions/identity state (SD-11)

`client_session` (intrinsic to a Client Meeting row), `probable_client_session` (the pending-candidate
queue — the one genuinely new state), `not_client_session` (the hashed suppression set), `unclassified`
(none). Schedule **reads** these (ADR-507 §6); Sessions stores no per-event tag and **writes nothing to
the provider**.

### 6. `MeetingProvider` port — online meetings (Meet / Zoom / …) (NEW, SD-6/7/8 discipline)

A Client Meeting may include an **online meeting**. Video providers (Google Meet, Zoom, …) follow the
**same provider-port pattern** as the calendar (ADR-507 §2–4 **+ §10**, ADR-506 Am1): a provider-agnostic
**`MeetingProvider` port** (create/get/cancel a meeting, return a join link), **one bundle per provider**,
first-party trust. Same **residency split** as the calendar adapter: adapter logic → **FP-Host bundle**;
it **consumes the A1.1 base caps** — the provider-agnostic credential broker (Flow-A OS-keychain creds,
System-B, ADR-311/305) + the Main **brokered-fetch** base cap (manifest `apiHosts` allowlist, ADR-203/410).
Credential/KEK/egress never enter the bundle; no FP-Host raw egress.

- **Google Meet rides the Calendar API** (`conferenceData`) — a Google adapter may implement **both**
  `CalendarProvider` + `MeetingProvider` via **one grant**. **Zoom** = its own adapter + own grant.
- The **join link is metadata** (low-PHI if opaque); the meeting **title/PHI is governed by ADR-313**
  (default opaque — never embed client name).
- **Deferred build (O486)** — the port + first adapter land after the calendar spine.

### 7. The PHI gradient localizes to the Sessions↔provider sync (ADR-313)

This sync is the **single place** ADR-313's two opt-ins + ramp are enforced: read existing PHI, write
opaque-block vs PHI-block. The score (O483) is computed from what this sync exposes. One PHI surface.

### 8. Projections & ownership boundaries

- **Practice "next client meeting"** projects from here (reconciles Practice IA; agenda projects from Schedule, ADR-507 §8). **Unblocks Practice P6 / O464 / O456 projection-derived obligations.**
- **Client Meeting = candidate billable unit** → Billing projection (O421 / O484).
- **Lifecycle stays Practice.** Sessions/Schedule do **not** write `patient_lifecycle`; the
  `referral → intake_scheduled` transition is a Practice command (ambient facet, Product Scope A2).

## Consequences

### Positive

- One persisted object, one sync, one PHI surface — the rest of scheduling is the provider's problem.
- Provider-origin discovery (Calendly/Google) is first-class, so the app fits existing workflows.
- Field-partitioning sidesteps the general sync/merge (O23) problem for this domain.

### Negative

- The identity-resolution + suppression machinery is non-trivial and PHI-sensitive (audit + hashing required).
- Orphaned meetings (provider-side deletes) need a defined surfacing/cleanup UX.

## Considered Options

- **Client Meeting owned by Schedule** — _Rejected_: wrong ownership; Schedule is storeless UI (SD-9/12).
- **LWW merge of event fields** — _Rejected_: field-partitioning makes merge unnecessary (SD-13).
- **Persist every calendar event locally** — _Rejected_: violates "persist only linked" (ADR-313 §5); bloats PHI surface.

## Open Items

- **O485** — provider sync engine (shared with ADR-507 P1): provider-origin discovery, resolution wiring, snapshot reconciliation.
- **O486** — `MeetingProvider` port + first video adapter (Meet/Zoom).
- **O487** — full Sessions Activity design pass (Notes / Transcriptions / Reports).
- **O484** — Client Meeting → Practice / Billing projection interfaces.
- **O483** — PHI ramp + Safety Score on the sync (ADR-313).
- **SQ-2 (design log)** — the Client Meeting field/status-enum shape is fixed at build time here.
  **RESOLVED (P1 slice 2, 2026-06-18).** `client_meeting` table (residency `protected`): `id`,
  `patient_id` (plain column — **no cross-bundle FK**, see below), `kind`
  (`intake|session|review|consult|other`, default `session`), `status`
  (`scheduled|completed|cancelled|no_show`, default `scheduled`), `modality` (`in_person|online|null`),
  `starts_at`/`ends_at` (epoch ms; `ends_at` nullable), `source_origin` (`app|provider`),
  `sync_state` (`local|linked|orphaned`), `provider_id`/`provider_event_id`/`calendar_id` (null until
  slice 4), `created_at`/`updated_at`. **No free-text PHI columns** (no event title, no notes — the
  client's name comes from *our* roster per §2; notes = O487). The provider/sync columns are present
  from the start (so no slice-4 migration churn) but slice 2 only writes `app`/`local`.

## Build status

- **P1 Slice 2 — Sessions Client Meeting store + standalone Sessions Activity: BUILT + live-verified
  2026-06-18 (O485).** New `ru-soam-sessions` first-party FP-Host bundle (zero Main TS), CQRS-explicit
  per ADR-506: `sessions.meeting.query` (kind `query`: get/listForPatient/listUpcoming) +
  `sessions.meeting` (kind `command`: create/update/setStatus/delete), both `phi:true`; persists via the
  base `store.write`/`store.query` caps; activity-bar item + a read-only "Upcoming Meetings" list view
  (manual-create form intentionally dropped — the real creation path is provider-origin sync, slice 4).
  CRUD round-trip verified end-to-end via CDP. **`patient_id` has no `REFERENCES patients(id)`** — a hard
  cross-bundle FK would break Practice's patient-erase cascade (which only covers Practice-owned tables);
  the cost is that erasing a client leaves orphaned `client_meeting` rows → cross-bundle DPDP erase cascade
  tracked **O490** (must close before clients are linked to meetings in production). §4 identity resolution
  + §3 provider sync (the columns above light up) land in slices 3/4.
