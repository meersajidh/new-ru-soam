# Schedule Activity — UI build plan (from the Claude Design handoff)

**Status:** Proposed — awaiting review.
**Date:** 2026-06-17
**Source design:** Claude Design handoff bundle `Schedule Activity.dc.html` (+ `Schedule_Brief.md`,
chat transcript). The mockup renders the **full vision** of the Schedule Activity as a VS Code–style
shell. This plan maps that vision onto our real workbench slots and codebase.
**Related:** ADR-507 (Schedule = storeless UI over provider), ADR-508 (Sessions / Client Meeting),
ADR-313 (PHI gradient + Safety Score), `schedule-design-log.md` (SD-1..13), Practice IA + build plan
(the slot/aspect pattern we mirror).

---

## 1. Context

Today only **P0** exists: a single primary-sidebar view (`schedule.html`) showing a read-only Google
Calendar **week-agenda** with connect/disconnect. The design is the **vision**: primary-sidebar
navigation, a 4-mode calendar work area, secondary-sidebar event detail, a panel triage queue, and a
status-bar PHI Safety Score — light + dark.

The **shell** (titlebar, activity bar, status-bar chrome, lock gate, theme/light-dark, and the
mockup's own demo switcher) is already owned by the app. We implement **bundle view content + one
status-bar entry + one renderer view-state channel** — not the chrome. Light/dark is automatic: views
receive theme CSS vars over the existing bridge.

### Reality vs vision (what is and isn't data-backed)

| Real, data-backed now | Inert vision stub (lands P1 / O485, render as design ships) |
|---|---|
| connect / disconnect, `getStatus` | classification colour-coding (every event is `unclassified`) |
| `listEvents` read-only Google | client-linking affordances ("Link to client", "Open in Sessions") |
| 4 view modes, 6 states, date nav | "Needs linking" triage queue (stub data) |
| lens / filter / view switching | PHI Safety Score **value** (static; ADR-313 opt-ins unbuilt — O483) |

Our `CalendarEvent` shape is `{ id, title, start, end, allDay, calendarId, calendarName }` — it has
**no** participants / join link / location / modality. The design's rich event detail needs those, so
the **faithful aux detail + the adapter extension to supply that data are deferred** (see §6 / O488).

### Token & font mapping (mockup → our system)

The mockup ships its own `oklch` token block + a Google-Fonts `@import`. **Drop both.** Our real
tokens (in `src/styles/tokens.css` + theme files) are injected into every view and match ~1:1 — use
them directly: `--color-surface-base|panel|elevated|active`, `--color-fg-primary|secondary|muted`,
`--color-border`, `--color-accent(-fg|-hover|-pressed)`, `--color-info|success|warning|error`,
`--radius-sm|md` (mockup `--radius-lg` → use `--radius-md`/`--radius-card`),
`--font-sans|mono|display`. Inter Tight is inlined into views; Source Serif 4 / IBM Plex Mono fall
back gracefully via the `--font-display`/`--font-mono` tokens (CSP forbids the font CDN in views).

---

## 2. Architecture decisions

1. **Calendar = self-contained work-area editor view.** `schedule.html` is rewritten and **moves from
   the primary sidebar to the editor work area**. One iframe owns, all locally (no cross-iframe state):
   the work header (date nav `‹ Today ›`, range label, view switcher Agenda/Day/Week/Month, PHI chip),
   the four view bodies, all six states (disconnected / connecting / error / empty / connected), event
   selection + highlight, and an **interim inline detail popover** (real aux deferred — §6).
   Classification machinery is present (`kind → style` map) with every event defaulting to
   `unclassified`.

2. **Primary sidebar = new `nav.html`.** Lens switcher (Today→day · Upcoming→agenda · Week · Month),
   calendars list (visibility toggles + colour swatches), classification filters (+counts), a
   "Needs linking" vision item (badge → opens the panel), and the connection block (real
   `getStatus`/`connect`/`disconnect` + account email + state dot).

3. **One renderer view-state channel** — `ScheduleViewStateService`, modeled exactly on the proven
   O455 `overviewViewMode` channel. Carries a single payload `{ view, filter, calVisibility }` from
   `nav.html` → the calendar view. New pieces mirror O455: a renderer service, a bridge verb
   `soamView.setScheduleViewState(state)`, an inbound `kind:'scheduleViewState'` push in
   `BundleViewIframe`, and the matching request handler. Connection-state re-checks on `onActivate`
   (best-effort; promote onto the channel only if needed).

4. **Panel = new `triage.html`** via `panel.views`: tabs "Needs linking" (vision stub) + "Today's
   agenda" (real, from events).

5. **Status-bar PHI Safety Score** — a `workbench.phi-safety` entry (`anchored-ids.ts`) + boot wiring
   + a `workbench.phiSafety.details` command opening the score popover. Value is static (read-only ⇒
   high) until the ADR-313 opt-ins exist (O483). `scope: 'workspace'` so it hides on lock.

6. **Deferred → new Open Item O488** (the secondary-side-bar detail, chosen as the target placement):
   the faithful **real aux event-detail slot**, needing (a) a Google-adapter extension to map
   `location` / `conferenceData` (join) / `attendees` (participants) / derived `modality`, and (b) a
   cross-iframe **selection bus** + `schedule.activeEvent` context key (mirror `view-focus-bus.ts` /
   O465) to carry the selected event into a separate aux iframe. This pass uses the interim inline
   popover instead. Classification + client-linking remain inert until P1 / O485.

---

## 3. Files

**Schedule bundle** — `apps/desktop/bundles/ru-soam-schedule/`
- `manifest.json` — primary container `view` → `nav`; register views `nav`, `schedule`, `triage`; add
  a `panel.views` entry for `triage` (`when: workspace.activeId`). Activity-bar item unchanged. The
  aux container is intentionally **not** added (O488).
- `view-assets/nav.html` — **new** primary sidebar (decision 2).
- `view-assets/schedule.html` — **rewrite** as the work-area calendar (decision 1).
- `view-assets/triage.html` — **new** panel (decision 4).
- `index.mjs` — unchanged (the view-state channel is renderer-side; calendar data stays on
  `schedule.calendar@1.0`).

**Renderer** — `apps/desktop/src/`
- `platform/view-mode/` (new sibling file) — `ScheduleViewStateService` (mirror
  `OverviewViewModeService`; localStorage-backed, event emitter).
- `workbench/middle/BundleViewIframe.tsx` — push `scheduleViewState` on change/activate; handle
  inbound `request.setScheduleViewState`.
- `electron/main/fp-host/view-bridge.ts` — add the `soamView.setScheduleViewState` verb.
- `platform/statusbar/anchored-ids.ts` — add the `workbench.phi-safety` entry.
- `workbench/boot.ts` — register/seed the PHI entry + wire the score; register
  `ScheduleViewStateService`.
- `domain/bootstrap.ts` (or `platform-commands.ts`) — `workbench.phiSafety.details` command + popover.

---

## 4. Build phases (delegate per phase; review between)

- **P-A — Calendar work-area view.** Manifest move + `schedule.html` rewrite (header, 4 views, 6
  states, selection, inline detail). All real/local. *Exit:* open Schedule → connect → switch
  Agenda/Day/Week/Month over real events; all states reachable; event click shows detail.
- **P-B — Primary `nav.html` + `ScheduleViewStateService` channel + connection block.** *Exit:* sidebar
  lenses / filters / calendar toggles drive the calendar; connect/disconnect works from the sidebar.
- **P-C — Panel `triage.html`** + `panel.views`. *Exit:* panel shows Needs-linking (stub) + Today
  (real); badge count matches.
- **P-D — Status-bar PHI Safety Score** entry + command + popover. *Exit:* chip visible unlocked,
  hidden on lock, click opens the popover.

---

## 5. Verification

- `pnpm --filter ru-soam compile && pnpm --filter @ru-soam/editor compile` and
  `pnpm --filter ru-soam lint` green after each phase.
- **Full `just dev-desktop` restart** after manifest / FP-Host changes (HMR leaves stale fp-host).
  Dogfood: passphrase `sajid.ru-soam`, CDP `:9333`.
- Manual: Activity Bar → Schedule → connect Google → all 4 views render real events; prev/today/next;
  switch via sidebar lens **and** work-header switcher; toggle light/dark (theme follows); reach
  disconnected / connecting / empty / error / locked; event click → detail; panel tabs; PHI chip +
  popover; verify hidden when the workspace is locked.
- No PHI regression: event titles are already `phi:true` + lock-gated; no new PHI surface is added this
  pass (the adapter extension is deferred to O488).

---

## 6. Open items / follow-ups

- **O488 (new)** — faithful real aux event-detail slot + Google-adapter extension
  (location / conferenceData-join / attendees / derived modality) + cross-iframe selection bus +
  `schedule.activeEvent` context key. (Target placement chosen; implementation to be discussed.)
- **O485 (P1)** — provider sync + identity resolution makes classification / client-linking /
  needs-linking real; the inert stubs built here become live.
- **O483 (P2)** — ADR-313 PHI opt-ins make the Safety Score value real.
- After build: update `schedule-design-log.md`, CLAUDE.md Architecture Log, and the memory pointer.
