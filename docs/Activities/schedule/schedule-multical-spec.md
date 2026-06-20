# Schedule — multi-account / multi-calendar spec

**Status:** Slices 1–3 BUILT + committed + dogfood-verified (`668d957`, 2026-06-20); slices 4 + 5 absorbed into slice 3; slice 6 + cross-bundle O493/O490 pending. **Date:** 2026-06-19 (design) / 2026-06-20 (build).
**Canonical for:** the account/calendar data model, the account-aware provider port, the revised CQRS
caps, and the build slices for multi-account calendars.
**ADRs:** [ADR-507 Am1](../../ADRs/507-schedule-activity.md#amendment-1--schedule-owns-a-thin-accountcalendar-model-multi-account--2026-06-19)
(Schedule owns tables; account-aware port), [ADR-314](../../ADRs/314-multi-account-provider-credentials.md)
(account-keyed broker), ADR-506 (FP-Host module + store ABI), ADR-508 (Sessions link — cross-bundle),
ADR-313 (PHI gradient), ADR-452 (protected store).
**Supersedes (for our context):** the generic green-field proposal in `schedule-multical-design.md` —
that was provider-research without our trust-zone / PHI / FP-Host / broker constraints. Adapted here:
domain model + port + registry + overlay **kept**; monorepo-per-provider packages, keytar, optional
encryption, and the v1 sync-token event cache **rejected/deferred** (see ADR-507 Am1).

---

## 1. Model — Provider type → Account → Calendar → Event

```
ProviderType (google | microsoft | apple | caldav)   ── owns the ADANPTER (ADR-507 §2), no row
  └─ provider_account   (a connected account; owns a Main-side grant)        ── TABLE (protected)
       └─ calendar       (an Added handle: user name + color + selected)     ── TABLE (protected)
            └─ event      (live-fetched, in-memory overlay; NO table in v1)
```

- **Calendar = a handle (user's framing).** The nav row is a stable local `calendar` row pointing at a
  provider's calendar; provider-specific organization stays behind the adapter.
- **Connect ≠ Add.** *Connect* = OAuth-grant an account (creates a `provider_account`). *Add* = register
  a specific provider calendar with a user name + color (creates a `calendar`). One connect can yield
  many adds.

## 2. Tables (Schedule FP-Host module owns; `residency: 'protected'`)

### `provider_account`
| col | type | note |
|---|---|---|
| `id` | TEXT PK | local `acct_<uuid>` |
| `provider_type` | TEXT NOT NULL | `google` (v1) |
| `external_account_id` | TEXT NOT NULL | **broker-discovered** (Google `sub`/email); grant key dimension (ADR-314) |
| `email` | TEXT | account email (PII → protected) |
| `display_name` | TEXT | provider-given |
| `connection_state` | TEXT NOT NULL DEFAULT `'connected'` | `connected`/`disconnected`/`error` — a **label**; broker grant is source of truth |
| `created_at` / `updated_at` | INTEGER | |

UNIQUE(`provider_type`, `external_account_id`) — dedupe re-connects. **No tokens** (Main-only, ADR-314).

### `calendar`
| col | type | note |
|---|---|---|
| `id` | TEXT PK | local `cal_<uuid>` — the stable handle |
| `account_id` | TEXT NOT NULL | → `provider_account.id` |
| `provider_calendar_id` | TEXT NOT NULL | provider's calendar id within the account |
| `display_name` | TEXT NOT NULL | **user-assigned** (overrides provider name) |
| `color` | TEXT NOT NULL | **user-assigned** (theme token / hex) |
| `is_primary` | INTEGER | provider-derived |
| `read_only` | INTEGER | provider capability (gates future writes) |
| `selected` | INTEGER NOT NULL DEFAULT 1 | visibility/overlay toggle — **persisted (replaces P-B localStorage `calVisibility`)** |
| `added_at` / `created_at` / `updated_at` | INTEGER | |

UNIQUE(`account_id`, `provider_calendar_id`). Erase: account delete → cascade its calendars.

### `event` — **deferred, no table in v1**
Live-fetched via `listEvents(accountId, calendarIds, range)`, aggregated in memory as
`Map<calendarId, CalendarEvent[]>`, overlaid by `selected`. A cached `event` table + sync metadata
(sync tokens / delta) is a **later phase** (own residency:protected + re-opens O23). Out of scope.

## 3. Account-aware `CalendarProvider` port (FP-Host)

```ts
interface CalendarProvider {
  providerType: ProviderType;
  authenticate(): Promise<ProviderAccount>;                 // → Main broker grant; returns account meta, NO tokens
  listCalendars(accountId: string): Promise<ProviderCalendar[]>;
  listEvents(accountId: string, calendarIds: string[], range: DateRange): Promise<CalendarEvent[]>;
  // writes (later): createEvent/updateEvent/deleteEvent(accountId, calendarId, …)
}
```
- `authenticate()` calls Main `credential.broker@1.0` `grant({ provider, scopes })`; broker discovers
  `externalAccountId`, stores token account-keyed, returns metadata. Adapter then `store.write`s the
  `provider_account` row.
- All reads egress via `net.brokeredFetch@1.0` with `{ providerType, accountId }` so Main injects the
  right token. Registry = `Map<ProviderType, CalendarProvider>` inside the bundle.

## 4. Revised CQRS caps (Schedule bundle — supersedes P0 `getStatus`/`listEvents`/`connect`/`disconnect`)

**`schedule.calendar.query@1.0`** (`kind: query`, phi:true): `listAccounts`,
`listAddedCalendars` (handle rows), `listProviderCalendars(accountId)` (discover, for Add-flow),
`listEvents(range)` (aggregated across `selected` calendars), `getAccountStatus(accountId)`.

**`schedule.calendar@1.0`** (`kind: command`, phi:true): `connectAccount(providerType)` →
grant + create `provider_account`; `disconnectAccount(accountId)`; `reconnectAccount(accountId)`;
`addCalendar({accountId, providerCalendarId, name, color})`; `updateCalendar(id, {name?, color?, selected?})`;
`removeCalendar(id)`.

Manifest deps add `store.write@1.0` + `store.query@1.0` + `credential.broker@1.0` + `net.brokeredFetch@1.0`;
`ownedTables: ['provider_account','calendar']`; bundle `residency: 'protected'`.

## 5. Event identity (cross-bundle — O493)

Multi-account makes a bare `provider_event_id` non-unique. The globally-unique key is
**(`external_account_id`, `provider_calendar_id`, `provider_event_id`)**. Sessions
(`client_meeting`, ADR-508) already has `provider_id` + `provider_event_id` + `calendar_id`; it must
store the **provider-level** triple (survives local `calendar` row delete/re-add), not the local
`cal_<uuid>` handle.

**RESOLVED (O493) — BUILT + dogfood-verified 2026-06-20 (uncommitted), formalized in ADR-508 Am1.**
`client_meeting` gained `external_account_id` + `provider_calendar_id` (migration v2 + composite
index); link key = `(provider_id, external_account_id, provider_calendar_id, provider_event_id)`,
provider-level. Sessions `sync` consumes `schedule.calendar.query.listAggregatedEvents` (which now
stamps each event with `providerCalendarId` [captured pre local-handle remap] + `externalAccountId`);
`linkEvent` = full-triple lookup + legacy-NULL backfill; orphan pass composite-keyed +
selected-calendar-guarded. Dogfood: 2 accounts, shared invite ⇒ same event id on both calendars →
**2 distinct rows** (pre-fix collapsed to 1), reconcile no-dup. **O490 (cross-bundle erase cascade)
remains open — close before prod** (build parked; seam + Option-1 recommendation in Open_Items O490 row).

## 6. Revisit of committed P-B

- `calendar.selected` replaces the `ScheduleViewStateService` localStorage `calVisibility`.
- Drop the P-B nav **view-switcher buttons** (redundant with the work-area header).
- Channel keeps `view` (work-header persistence) and/or carries selected-calendar ids; chips get a
  mild translucent background = the calendar's `color`.

## 7. PHI posture

Tables are `protected` (PII). Event titles stay `phi:true` + lock-gated (unchanged). Classification
colors (§6 of P-A) are render-time derivations, never stored, never written to the provider (ADR-507
§6). The PHI gradient (ADR-313) still localizes to writes/sync, not this model.

## 8. Build slices (design-first done; these are code, review + dogfood each)

1. ✅ **Broker account-keying + migration** (O492, ADR-314) — COMMITTED + CDP-verified. `credential-broker.ts`
   + `brokered-fetch.ts` account dimension; single-grant migration.
2. ✅ **Schedule data slice** (O494) — COMMITTED + CDP-verified. `provider_account` + `calendar` tables,
   account-aware port (Google), revised CQRS caps, registry. Additive (kept P0 caps + Sessions runnable).
3. ✅ **Nav redesign** (O495) — COMMITTED + dogfood-verified 2026-06-20 (`668d957`). Colored-tick CALENDARS
   list, add-calendar wizard (work-area tab, name + 10-swatch color), bottom-pinned multi-account ACCOUNTS
   section + context menus, per-cal Edit/Delete/Reconnect, chip tinting by calendar color, organiser-hash
   fix, `add`/`open-in-window` codicon buttons, event live-fetch aggregation across `selected` calendars.
   **Absorbed slices 4 + 5.**
4. ✅ **Classifications section** (O491) — DONE (folded into slice 3): per-classification counts via a
   non-persisted `ScheduleCountsService` relay + a `classFilter` field on `ScheduleViewState` (client-side
   visibility, no refetch). No shared classify service needed — `schedule.html` (binds Sessions + Practice
   for §6 classify) relays counts to nav over the existing channel.
5. ✅ **Per-calendar context menu** (ADR-417) — DONE (folded into slice 3): calendar + account right-click
   menus. **Per-cal open-in-own-tab DROPPED** (checkbox overlay supersedes — editor-tab color-dot infra
   built then reverted; do not reintroduce).
6. ⬜ **Later** — event cache + incremental sync; Microsoft / Apple / CalDAV (O486); calendar writes
   (ADR-313 ramp). **Plus cross-bundle O493 (Sessions link-key qualify by account + calendar) + O490
   (erase cascade) — before linking multi-account events / before prod.**

## 9. Open Items

O492 broker account-keying · O493 Sessions link-key qualification · O494 Schedule account/calendar
tables + port + caps · O495 multi-calendar live-fetch aggregation/overlay · O491 nav classifications
(counts + filter) · O486 additional providers · O490 cross-bundle erase cascade (now spans
`provider_account`→`calendar` and the Sessions link).
