# Schedule Activity — Read-Only Scope Backlog

Status snapshot 2026-06-27. Read-only foundation is structurally complete
(P-A grid, P-B multi-cal nav, event cache + incremental syncToken sync,
classification, `__viewQuery` window-cache, ingress funnel A/B/C, ADR-509
migration slices 1/2a/2b). This doc captures the remaining read-only work,
split into **In Scope** (address now) and **Deferred**.

Source: triage of three user-reported Schedule issues (2026-06-27) +
`practice-migration-path.md` + workstream memory pointers.

---

## List A — IN SCOPE (address now)

### A1. Participant-class hint (couple / group therapy)
Events with >2 participants (incl. user) are likely couple (1 other) or
group (2+ others) therapy. Surface a participant-class hint in chip subline,
card, popover, and aux event-detail.

- **Data**: `attendees[]` already mapped end-to-end (adapter → `event` table
  → renderer). No new cap, no schema.
- **Derive at render**: count attendees excluding `self`/organizer →
  individual / couple / group.
- **Honesty rule**: it is a *count hint*, not a clinical assertion. Attendee
  list ≠ therapy roster (resource rooms, declined invitees, organizer-only).
  Label = "3 participants", NOT an authoritative "Group therapy" clinical tag.
  Clinical interpretation belongs to the future context-tag layer (O501).

### A2. Meeting-link detection (Zoom / Teams / Modern Health / etc.)
Today `meetingLink` is filled only from Google structured fields
(`hangoutLink` / `conferenceData`, `google-calendar-adapter.mjs:164`).
Zoom/Teams/Modern Health links arrive in the `location` slot or the event
**body** — neither is surfaced as a join link.

Detection = TWO steps for free-text sources (location + body):
1. **Extract** a URL from free text — generic `https?://…` regex. Provider-
   agnostic; stays in code; the provider list cannot do this part.
2. **Classify** the extracted URL — match its host against a provider list to
   decide "is this a meeting link" + the display label.

**Domains are DATA, not logic (user inputs adopted 2026-06-27).** Nothing about
a provider domain is hardcoded in a code path. The provider list is a single
user-editable list of `{ name, domain }`; built-in defaults (Zoom, MS Teams,
Whereby, doxy.me) are **pre-seeded editable rows** in that same list.

- **Churn-proof**: if a provider changes its domain, the user edits the row —
  NO code change, NO release. Code ships a new default only for convenience;
  existing users could already self-fix.
- **Seeding rule**: seed defaults only when the pref is unset/empty; later
  default additions = additive merge by domain (never clobber a user edit).
- **Google Meet is separate** — matched by the structured `conferenceData`/
  `hangoutLink` API shape, not by a domain string. It need not be in the list.

What stays in code (provider-agnostic, never churns): the generic URL extractor
+ the Google structured-field path. What is pure data (editable): every
`{ name, domain }` pair, defaults included.

- **`location` case**: `location` IS mapped. Extract+classify a meeting URL
  from `location` when structured `meetingLink` is empty.
- **body case**: event `description`/body is **NOT mapped, NOT stored, NOT
  crossed to the renderer** today. PHI-minimization: do NOT store the full
  body. Run the detector **in the adapter at sync time**, write only the
  extracted URL into `meeting_link` + a `meeting_provider` label column.
- **Provider-list storage**: PHI-free pref `schedule.meetingProviders` (JSON
  `[{ name, domain }]`; domains are not PHI). Adapter reads the merged list via
  a `prefs` dep at sync time. Settings UI = add/remove/edit list editor in the
  Schedule settings panel (defaults visible + editable). Sole-renderer-writer
  service mirroring `ScheduleRefreshSettingsService`.
- **Caveat**: editing the list only affects FUTURE syncs until a re-scan; a
  list change should ideally trigger a re-sync (note it, low pri).
- **Schema**: `event` table migration bump (current v3 → v4) to add
  `meeting_provider`. Full `just dev-desktop` restart (manifest/adapter/Main).
- **Shared util**: `detectMeetingLink({ location, description }, providers) →
  { url, provider } | null`. Precedence: Google-structured > location > body.
  Reuse existing `joinLabel` (`event-detail.html:1744`) for the button label,
  falling back to the matched provider name.

### A3. Idle auto-lock interval — configurable (O502)
Workspace inactivity lock currently uses a hardcoded
`IDLE_TIMEOUT_MS = 300_000` (`electron/main/lock/auto-lock.ts:19`; the comment
already flags "Phase 10 wires settings cascade per O307b"). Make it a setting,
alongside auto-refresh, in gear → Settings.

- **Arch distinction**: the idle interval is consumed in **Main**
  (`auto-lock.ts`), unlike Schedule refresh settings which are renderer-side.
  So the pref must be read in Main (`electron/main/capability/prefs.ts`) and
  pushed into the live `AutoLockHandle`.
- **Scope**: platform-wide, NOT Schedule-scoped → new "Security" Settings
  panel (sibling of the existing "Schedule" / "System" panels in
  `SettingsMenu.tsx`), not the Schedule panel.
- **Mechanism**: pref `security.idleLockMin` (default 5) + an off/disable
  option; `AutoLockHandle` gains `setIdleTimeout(ms)`; IPC channel so the
  renderer pref write reaches Main live; Main reads the pref at boot to seed
  the initial timeout.

### A4. Migration — OI-3 Sessions-linking confirmation gate
Promote-to-`migrated` deliberately does NOT auto-link Sessions meetings
(ADR-509 §5). OI-3 = the trigger + UX for "now link this client's meetings".
This is the next migration item per workstream memory.

### A5. Migration — dedup / merge suggest UI  ⏸ PAUSED (discuss first)
`practice-migration-path.md` Step 5: messy calendars produce `John` /
`John S.` / `john@gmail.com` for one client. The `record.patient` alias path
exists; the **suggest-merge UI** is the gap. Surface "these may be the same
client → confirm" in the roster-builder.

> **PAUSED 2026-06-27** — user has design inputs on dedup/merge. Do NOT take up
> until that discussion happens.

### A6. Migration — remaining OIs + ADR-508 §4b amendment
ADR-509 open items still open: **OI-1** (`migrated` stage vocab/placement),
**OI-2** (migration-checklist derivation), **OI-5** (erase+reload semantics,
parked), **OI-6** (mode boundary / `complete` flip), **OI-7** (backfill UX
feedback), **OI-8** (identity-absent / title-only migration), **OI-9** (scan
perf at the tail). Plus the **ADR-508 §4b amendment owed**. (OI-4, OI-10
closed.) Triage individually as the migration workstream proceeds.

### A7. Platform — `__viewQuery` rollout (O497)
Only `schedule.html` + `nav.html` use the `__viewQuery` query-core data layer.
`event-detail.html`, `meeting-record.html`, `needs-linking.html` are still
hand-rolled. Roll them onto `__viewQuery` for consistency + cache behavior.
**Gated by A8** (the view tech-stack decision).

### A8. Platform — view tech-stack ADR (O496)
Decide + record the bundle-view tech stack (query-core forward-compat).
Precedes A7. Opus-authored decision doc.

---

## List B — DEFERRED (excluded this round)

### Out of read-only scope (write / separate ADR)
- **O499 — PHI egress / write-back + Safety Score rebuild.** Write scope.
  The PHI Safety Score is deferred *whole* to O499, rebuilt keyed to write-back
  egress (ADR-313 Am2).
- **O501 — Notes subsystem + context-tag layer.** Own full ADR. The *clinical*
  couple/group tagging (vs A1's honest count) lands here.

### Provider breadth
- **O486 — MS Graph / Outlook · Apple · CalDAV adapters.** Excluded this round
  by user direction. Google remains the only adapter. (Note:
  `practice-migration-path.md` Step 1 promises Outlook + Apple — revisit.)

### Settled (not outstanding)
- **O483 read-half gating** — reversed (ADR-313 Am2); linking is always-on,
  no gate. Closed, not deferred.

### Deliberately deferred in onboarding lockdown
- **Recurrence-pattern modeling** (`practice-migration-path.md` Step 2) —
  folded into identity, "NO modeling now."
- **Bulk migration.**

---

## Build order (In Scope)

Grouped by independence, risk, and value. Waves 1–2 are independent and can
run in parallel; Wave 3 is the migration cluster; Wave 4 is platform tech-debt.

**Wave 1 — Schedule view enrichment (the two reported view issues)**
1. **A1** participant-class hint — render-only, no schema. Fast win. *First.*
2. **A2** meeting-link detection — adapter + `event` migration v3→v4 + render.
   Batches the view work with A1 (both touch `schedule.html` +
   `event-detail.html`), but adds a schema bump + Main restart, so lands after.

**Wave 2 — Platform setting (parallel with Wave 1)**
3. **A3** idle-lock config (O502) — separate subsystem (lock + Settings);
   independent of Schedule views.

**Wave 3 — Migration onboarding (ADR-509 cluster, sequential)**
4. **A4** OI-3 Sessions-link gate. *Next migration item.*
5. **A5** dedup/merge suggest UI.
6. **A6** remaining OIs + ADR-508 §4b amendment — triage individually.

**Wave 4 — Platform tech-debt**
7. **A8** O496 view-stack ADR (decision) — gates A7.
8. **A7** O497 `__viewQuery` rollout.

---

## Briefs (Wave 1 + Wave 2 — ready to delegate)

### Brief — A1 participant-class hint

```
Goal: Show a participant-class hint (individual / couple / group) derived from
attendee count on Schedule event chips, cards, popover, and aux event-detail.

Scope:
- apps/desktop/bundles/ru-soam-schedule/view-assets/schedule.html
    (deriveModality area ~line 1999 builds " · " sublines — add a
     participant-class segment; also wherever the popover/card render)
- apps/desktop/bundles/ru-soam-schedule/view-assets/event-detail.html
    (attendees section ~line 1798 already renders the count — add the class label)

Constraints:
- Render-only. NO new cap, NO schema, NO adapter change. attendees[] is
  already present on the event object.
- Count = attendees excluding self/organizer. 0 others → no hint (or
  "Just you"); 1 other → couple/2-person; 2+ others → group.
- HONESTY: label the COUNT ("3 participants" / "Group · 3 participants"),
  never an authoritative clinical "Group therapy" assertion. Decline to label
  declined/resource attendees as participants if the attendee object carries a
  responseStatus/resource flag — check the mapped shape first.
- All attendee/participant text via textContent (PHI-safe), matching existing
  rows.
- node --check the extracted <script> of each edited .html (curly-quote
  SyntaxError = silent blank view — see reference_html_script_syntax_check).

Success criteria:
- A 1:1 event shows no group hint; a 3-attendee event shows a couple/group hint
  in chip subline + popover + aux detail.
- compile + lint green; node --check clean on both edited scripts.

Watch out for:
- attendees may be undefined (optional). Null-guard.
- Don't regress the existing modality subline ("In person", "Video · Zoom").
```

### Brief — A2 meeting-link detection

```
Goal: Detect and surface non-Google meeting links (Zoom, MS Teams, Whereby,
doxy.me, and any user-added provider) that arrive in the event location slot or
body, so they render as a Join link like Google Meet does. Provider domains are
USER-EDITABLE DATA, not hardcoded logic.

Scope:
- apps/desktop/bundles/ru-soam-schedule/google-calendar-adapter.mjs
    (mapEvent ~line 164: extend meetingLink derivation; pull the event body
     into the detector ONLY — do NOT persist the body)
- apps/desktop/bundles/ru-soam-schedule/manifest.json
    (event-table migration bump v3 → v4: add `meeting_provider TEXT` column;
     update listWindowEvents / listSelected queryTemplates to select it;
     add a `prefs@1.0` dep if not already present)
- apps/desktop/bundles/ru-soam-schedule/index.mjs
    (mapEventRow + sync upsert: carry meeting_provider through write + read;
     read schedule.meetingProviders pref and pass the merged list into sync)
- a new shared detector util (sibling .mjs in the bundle)
- apps/desktop/bundles/ru-soam-schedule/view-assets/schedule.html
- apps/desktop/bundles/ru-soam-schedule/view-assets/event-detail.html
    (use meeting_provider for the Join label; reuse joinLabel ~line 1744)
- a renderer settings service for the provider list (prefs-backed, sole
  writer; mirror apps/desktop/src/platform/view-mode/schedule-refresh-
  settings.ts) + Schedule settings panel UI in
  apps/desktop/src/workbench/middle/SettingsMenu.tsx (~line 326, add an
  add/remove/edit list editor below the refresh controls)

Constraints:
- DOMAINS ARE DATA, NOT LOGIC. No provider domain hardcoded in a code path.
  detectMeetingLink takes the provider list as an argument:
    detectMeetingLink({ location, description }, providers) → { url, provider } | null
  Step 1 = generic https?:// URL extraction (provider-agnostic, in code).
  Step 2 = classify the extracted host against `providers` (built-ins ∪ user).
  Precedence: Google-structured (existing hangoutLink/conferenceData) >
  location > body.
- Provider list = pref `schedule.meetingProviders`, JSON [{ name, domain }].
  Built-in defaults (Zoom=zoom.us, Teams=teams.microsoft.com, Whereby=
  whereby.com, doxy=doxy.me) are SEEDED into the pref only when it is
  unset/empty, as editable rows. Later default additions = additive merge by
  domain — NEVER clobber a user edit. Domains are PHI-free → operational store.
- PHI MINIMIZATION: the event description/body must NOT be stored in the
  `event` table or crossed to the renderer. Run the detector in the ADAPTER at
  sync time; persist ONLY the extracted URL (existing meeting_link col) +
  matched provider name (new meeting_provider col).
- meeting_provider stores the matched provider NAME (display string), or null.
- Migration additive + idempotent (CREATE/ALTER guarded). Follow the existing
  event-table migration shape in manifest.json. Full restart needed.
- Settings list service = sole renderer writer of schedule.meetingProviders
  (mirror ScheduleRefreshSettingsService / TelemetryModeService).
- node --check the edited view scripts.

Success criteria:
- A calendar event with a Zoom link in `location` (no Google conference)
  renders a "Join Zoom" link in chip/popover/aux.
- An event whose link is only in the body renders a Join link with the correct
  provider label, and the body itself never appears in the DB or renderer.
- gear → Settings → Schedule shows an editable provider list seeded with the
  defaults; adding a custom { name, domain } makes that provider's links detect
  on the next sync.
- Re-sync is idempotent (query-first upsert path stays clean); compile + lint
  green.

Watch out for:
- The Google adapter may not request `description` in the events.list fields
  mask — verify it's fetched; add it to the fields param if missing (NOT
  stored, only scanned).
- meeting_provider must survive the syncToken incremental path (insert AND
  updateWhere-on-UNIQUE upsert) and the cache read path (mapEventRow).
- Editing the provider list only re-classifies on the NEXT sync; a list change
  should ideally trigger a re-sync (low pri — note if not wired).
- Don't break existing Google Meet events (precedence keeps them first).
```

### Brief — A3 idle auto-lock configurable (O502)

```
Goal: Make the workspace idle auto-lock interval user-configurable in
gear → Settings, replacing the hardcoded 5-minute timeout, with an option to
disable idle auto-lock.

Scope:
- apps/desktop/electron/main/lock/auto-lock.ts
    (IDLE_TIMEOUT_MS hardcode → seeded from pref; add setIdleTimeout(ms) to
     AutoLockHandle; support a disabled state = no idle relock)
- apps/desktop/electron/main/index.ts (or wherever startAutoLock is called)
    (read security.idleLockMin via electron/main/capability/prefs.ts at boot;
     pass to startAutoLock)
- apps/desktop/electron/main/ipc/lock-channel.ts
    (new IPC: renderer → Main setIdleTimeout, so a Settings change applies live)
- apps/desktop/electron/preload/index.ts (expose window.soam.lock.setIdleTimeout)
- a renderer settings service mirroring ScheduleRefreshSettingsService
    (apps/desktop/src/platform/view-mode/schedule-refresh-settings.ts is the
     template; prefs-backed, sole renderer writer; new file under
     src/platform/security/ or similar) + register in boot + ids.ts
- apps/desktop/src/workbench/middle/SettingsMenu.tsx (+ .css)
    (new "Security" panelView sibling of 'schedule'/'system' with a nav entry
     on 'root': enable toggle + interval stepper, mirroring the Schedule
     refresh panel at ~line 326)

Constraints:
- Pref key: security.idleLockMin (number, minutes; default 5). A separate
  enable flag or a sentinel (0 / null = disabled) — implementer picks, document
  it. Default behavior unchanged (5 min, enabled).
- The interval is consumed in MAIN. The renderer writes the pref AND notifies
  Main via IPC so the change is live without restart (don't rely on next-boot
  only). Main also reads the pref at boot to seed the timeout.
- Sole-renderer-writer pattern: the new service is the only renderer writer of
  security.idleLockMin, mirroring TelemetryModeService / ScheduleRefreshSettings.
- Settings panel is platform-wide "Security", NOT the Schedule panel.
- Do not change the powerMonitor suspend / lock-screen triggers — only the idle
  timer is configurable.

Success criteria:
- gear → Settings shows a Security panel; changing the interval relocks after
  the new idle duration without an app restart; disabling stops idle relock
  (suspend/lock-screen still lock).
- pref persists across restart; Main seeds from it at boot.
- compile + lint green; the developer.lock.simulateIdle command still works.

Watch out for:
- auto-lock currently captures idleTimeoutMs in closure at startAutoLock —
  setIdleTimeout must update the live value the setInterval reads, not a stale
  copy.
- prefs.ts in Main is operational-store backed (PHI-free) — idleLockMin is a
  pref, fine there.
```

---

## Notes / coupling

- **A2 carries a schema migration** (event v3 → v4) and a Main/manifest change
  → full `just dev-desktop` restart to verify.
- **A8 (O496 ADR) precedes A7 (O497 rollout).**
- Waves 1 and 2 are independent → can be delegated in parallel.
- Dogfood per the workstream conventions (raw-CDP into opaque iframe with
  `suppress_origin=True`; passphrase `sajid.rusoam`; CDP :9333).
</content>
</invoke>
