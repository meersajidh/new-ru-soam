# Schedule — cross-session event cache + incremental sync (O495 / multi-cal slice 6)

**Status:** Planned (delegate-ready). NOT built.
**Date:** 2026-06-20
**Owner:** Architecture
**Depends on:** ADR-507 Am1 (committed; declares events un-cached/live-fetch — THIS lifts that) · `__viewQuery` window-cache (committed 2026-06-20) · ADR-452 PHI-at-rest · ADR-506 store ABI.

---

## Why

Today's `__viewQuery` window-cache is **in-session only** (query-core lives in iframe
JS memory). Every app launch / iframe remount = cold Google fetch; the whole window is
re-pulled each time. This slice adds a **persistent local `event` table** so:

- launch renders **instantly from disk** (no spinner, no Google wait), refresh in background;
- sync is **incremental** via provider sync tokens (Google `syncToken` delta) — fetch only
  *changed* events, not the whole window;
- works partially offline; survives restart + iframe remount.

This **reverses ADR-507 Am1 §"events un-cached"** → requires **ADR-507 Am2** (or a new ADR)
authorising the event cache + its residency.

## Model

Two-tier read path:
- **Disk (`event` table, `protected`)** = cross-session source of truth for render.
- **query-core in-memory (`listWindowEvents`)** = de-dups the DB read within a session (unchanged).
- **Live Google** = reached ONLY by background `sync`, which writes to disk.

`schedule.html` barely changes: it already renders from `listWindowEvents`; that query just
flips source **live-Google → event table**. Add: trigger sync on open + repaint when sync lands.

**Read-only simplifies conflict:** Schedule is read-only (provider authoritative; write-back is
later, ADR-313 ramp). So sync = pure upsert of provider truth — **no LWW** (O23 stays closed
until write-back). Field-partitioning (per ADR-508) only matters for the Sessions link, not here.

## Tables (owned by `ru-soam-schedule`, FP-Host, `residency:'protected'` — titles are PHI)

`event`:
- `id` (local `evt_<uuid>`), `account_id`, `calendar_id` (local handle),
  `external_account_id`, `provider_calendar_id`, `provider_event_id`
- PHI/display: `title`, `start`, `end`, `all_day`, `location`, `meeting_link`,
  `organizer_email`/`organizer_name`/`organizer_self`, `attendees` (JSON), `status`
- bookkeeping: `updated_at`, `synced_at`
- UNIQUE `(external_account_id, provider_calendar_id, provider_event_id)` (mirrors ADR-508 Am1 key).

Sync bookkeeping — add columns to existing `calendar` table (or a `calendar_sync` adjunct):
- `sync_token` (Google nextSyncToken), `last_synced_at`, `sync_status`, `sync_window_min`.

Manifest: `ownedTables += event` (+ migration vN: create table + indexes; ALTER `calendar` for
sync cols). Index `event` on `(calendar_id, start)` for window reads.

## Adapter (google-calendar-adapter.mjs)

`syncEvents(externalAccountId, providerCalendarId, { syncToken?, timeMin? }) → { upserts[], deletions[], nextSyncToken }`:
- No `syncToken` (first sync) → full list bounded by `timeMin` (e.g. now −3mo); page through; capture `nextSyncToken`.
- With `syncToken` → incremental; Google returns changed + cancelled. Map `status:'cancelled'` → `deletions[]`.
- **`410 Gone`** (token expired) → clear token, signal caller to full-resync.
- Reuse existing event mapping (`mapEvent`); keep the organiser-hash fix (resource-id organisers → calendar name).

## CQRS caps (index.mjs)

- **Query `listWindowEvents(from,to)`** → SELECT from `event` (all added calendars in window),
  stamp local `calendarId`/`calendarColor` (join `calendar`). Same return shape as today →
  `schedule.html` unchanged. (`listAggregatedEvents` stays live for Sessions `sync` OR is also
  flipped to read cache — decide; keeping it live avoids touching Sessions.)
- **Command `syncEvents`** (phi:true) → for each ADDED calendar: read `sync_token`, call adapter
  `syncEvents`, upsert `event` rows (`store.write` insert/`updateWhere`), delete cancelled +
  (on 410) wipe+full-resync, write back `nextSyncToken`/`last_synced_at`. Audit PII-free
  (`{providerType, calendarCount, upserts, deletions}`). Returns summary.

## schedule.html wiring

- On activate/open + after connect: fire `syncEvents` (background; don't block first paint —
  paint from cache immediately).
- When `syncEvents` resolves with changes → `__viewQuery.invalidate(['schedule.calendar','windowEvents'])`
  so the cached DB read refetches the now-updated rows. (Sync→repaint signal; reuse the pattern,
  no `store.changed` in iframes.)
- First-ever launch (empty cache) → cache miss → sync populates → invalidate → paint.

## Erase / lifecycle / pruning

- **Calendar delete / account disconnect → cascade-delete its `event` rows** (PHI cleanup;
  `deleteWhere({calendar_id})` / by `external_account_id`). Wire into existing
  `removeCalendar`/`disconnectAccount`/`deleteAccount`.
- No `patient_id` on `event` (client linking is Sessions' layer) → roster-erase doesn't cascade
  here; O490 unaffected. But event titles ARE PHI → the account/calendar cascade above is the
  cleanup path.
- **Prune** events older than the rolling `sync_window_min` on each sync to bound the table.

## Slices (delegate units)

1. **ADR-507 Am2** (authorise event cache + residency) — paper only.
2. `event` table + `calendar` sync columns + migration vN + manifest ownedTables.
3. Adapter `syncEvents` (incremental, syncToken, deletions, 410 full-resync, timeMin bound).
4. `syncEvents` command (upsert/delete/token bookkeeping/prune) + `listWindowEvents` reads `event`.
5. schedule.html: sync-on-open + invalidate-on-sync-complete; instant cache render.
6. Cascade-delete event rows on calendar/account removal.

## Decisions to confirm before building

- **Sync scope:** all ADDED calendars (matches client-side visibility) — recommend yes.
- **First-sync window:** `timeMin = now − 3mo` (bound the initial pull); prune beyond.
- **`listAggregatedEvents` (Sessions sync source):** leave live (simplest) vs flip to cache.
  Recommend leave live this slice (Sessions already works; smaller blast radius).
- **Sync cadence:** on-open + manual "Sync now" for v1; periodic timer deferred.
- **ADR-507 Am2 vs new ADR:** amend 507 (same area).

## Verify (dogfood)

- Cold launch → events render from cache **before** any Google call (instrument: cache read
  vs network). Background sync updates in place.
- Incremental: edit/add/delete an event in Google → "Sync now" pulls only the delta (not full
  window); cancelled event disappears.
- Restart app → events present immediately (no spinner).
- Delete a calendar → its `event` rows gone (query DB).
- 410 path: force token-expiry → full resync recovers.
- Dev: passphrase `sajid.rusoam`, CDP :9333, raw-CDP `suppress_origin=True` into the opaque
  iframe; index.mjs/adapter change = full `just dev-desktop` restart; schedule.html = iframe
  `location.reload()`.
