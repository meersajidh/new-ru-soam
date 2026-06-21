# Phase 2 — Ingress Clinical Design Pass (Schedule aux · calendar→intake · Client Meeting record)

**Status:** REVIEWED 2026-06-21 — decisions Q1–Q4 resolved (below). Ready to promote (ADR-508 Am2) +
slice for build.
**Scope:** the three reprioritized items (after pre-prod O490+O307f, before PHI egress O499):
2. Schedule aspects for the aux sidebar + panels.
3. Sessions + Practice **intakes from calendars**.
4. **Client Meeting record** surface. *(Notes pulled OUT — see §3 / its own ADR.)*
**Frame:** these are not three features — they are three stages of **one funnel**.
**Prototype:** 3 reference screenshots of the aux event-detail slot (CLIENT / PROBABLE / PERSONAL
states) — provided 2026-06-21; the slot design in §1 is transcribed from them.
**Related:** ADR-508 (Sessions=Client Meeting), ADR-507 (Schedule storeless UI), ADR-505 (Practice
record + lifecycle), ADR-506 (domain-module CQRS + ownership), ADR-313 (PHI gradient), O484/O488/O489.

---

## 0. The unifying frame — "the calendar is the front door"

A calendar (Google / front desk / Calendly) is where appointments are **born**. The workbench turns a
calendar event into clinical data through one funnel:

```
calendar event ─▶ classify (who is this?) ─▶ ┌ link existing client
                                             ├ onboard NEW client (intake)   ─▶ Client Meeting ─▶ (clinical record)
                                             └ exclude (not a client)
```

| Item | Funnel stage | What it is |
|---|---|---|
| **2 — aux/panels** | the **surface** you see + act on an event | the aux event-detail slot = the per-event **action surface** for all 5 states |
| **3 — intake** | the **onboard-new** path | calendar booking → referral → `intake_scheduled` (highest-value ingress) |
| **4 — Client Meeting record** | the **destination** | "Open in Sessions" → the Client Meeting record tab |

**Design principle (confirmed Q1):** the aux slot *is* the action surface. Selecting any event shows its
classification **and the right next action** — for **client / probable / new / personal-admin /
excluded**. Items 2+3 meet there (the intake/onboard action is the aux's "new" state). Item 4 is where
"Open in Sessions" lands.

Everything here is **read/ingress** — writes nothing back to the provider (egress = O499). PHI stays on
the read side of ADR-313.

---

## 1. Item 2 — the aux event-detail slot (O488b) + panels

### 1a. The aux slot — transcribed from the prototype
New **auxiliary viewContainer** in `ru-soam-schedule` (`location:"auxiliary"`) + iframe
`event-detail.html`, fed by a **cross-iframe selection bus** (click an event in `schedule.html` →
publish selection → aux receives it; mirrors `view-focus-bus.ts`/O465 + the O455 channel pattern) and a
new **`schedule.activeEvent`** context key (new domain-reserved `schedule.*` namespace → Open Item).
Selection stays a **class-toggle** (never `renderCalArea()` — the scroll-jump bug). The slot
**supersedes the interim inline modal popover.**

**Layout (all states):**
1. **Header** — event title (roster identity, not raw) · date + start time · close ✕.
2. **Classification banner** — colored dot + label + a state badge:
   - CLIENT → green "Client session" · **CONFIRMED**
   - PROBABLE → amber "Probable client" · **UNCONFIRMED**
   - PERSONAL → grey "Personal · admin" · **PERSONAL**
   - (EXCLUDED → muted "Not a client"; NEW/unmatched → "Unrecognised" — both per §1b actions)
3. **Time** — When (start–end) · Duration · **Platform** (Zoom / Google Meet / …) or **Location**.
4. **Join** — when a meeting link exists: **"Join {Zoom|Google Meet}"** button + the URL. *(This is
   O489 — folded into this slice; needs the `soamView.openExternal` verb → Main `shell.openExternal`.)*
5. **Participants** — avatar (initials) + name + role tag (**Client** / **You · organiser** / …).
6. **Client link** — the **state-dependent action block** (§1b).
7. **Source** — **Calendar** (which calendar, color dot) · **Raw title** (the verbatim provider title,
   e.g. "T Sherpa teletherapy") + the **honesty note**: *"This title rides on Google. The client's
   identity shown above comes from your roster, not the raw title."* The raw title is shown **only here**
   (never on the calendar chips, which use roster identity) — read-side, user's own consented calendar.

### 1b. Client-link block — per state (the action surface)
| State | Block content | Actions |
|---|---|---|
| **CLIENT** (linked) | "{Name} · Linked from roster" ✓ | **Open in Sessions** (→ §3 record tab) |
| **PROBABLE** (candidate) | "This event matches '{Name}' in your roster but isn't linked yet. Confirm to connect it to their clinical record." | **Link to {Name}** (primary) · "This is a client session" · **Not a client** (→ suppress) |
| **NEW** (unmatched / none) | "Not recognised from your roster." | **New intake client** (→ §2 intake flow) · **Link to existing…** (roster picker) · **Not a client** |
| **PERSONAL / EXCLUDED** | "Marked as personal / admin." | **Reclassify** |

These are the **same verbs** as the Sessions needs-linking panel, surfaced **per-event** in the aux.
All via the slice-3 resolver caps + `linkProviderEvent`, renderer-coordinated (view-binds, not
manifest-gated → no Schedule→Sessions host cycle, same as §6/4b).

### 1c. Panels — decision Q1
**No new Schedule panel.** The aux slot = per-event surface; the existing **Sessions needs-linking
panel** = batch triage. The planned "Today's agenda" panel is dropped (the calendar work-area is the
agenda; Practice owns the cross-Activity Agenda projection).

### 1d. ADR need — none
Reuses view-focus-bus / O455 channel + an additive aux container. New domain context-key namespace =
Open Item. O489 (`openExternal` verb) = additive, host-allowlisted to http/https.

### 1e. Slice A1 (infra + display-only) — BUILT + DOGFOOD-VERIFIED 2026-06-21 (uncommitted)
`ActiveEventService` (non-persisted renderer relay, mirrors `ScheduleCountsService`) + `soamView.setActiveEvent`
verb + `BundleViewIframe` init/context/onDidChange relay + `request.setActiveEvent`/`request.openExternal`
(O489 Join renderer-handler pre-wired, no button yet) + `schedule.activeEvent` context key + aux
viewContainer (`event-detail`, `when:"schedule.activeEvent"`) + `event-detail.html` (full prototype layout,
display-only) + inline popover removed from `schedule.html` (4 click sites → `setSelection`+`setActiveEvent`)
+ classify enrichment (`ev._match = {matchClientId}` / `{candidates}`, null-safe, for A2).
**Precedence fix (`src/domain/bootstrap.ts` `syncContext`):** the Schedule work-area tab's `entityId:"schedule"`
was leaking into `patient.activeId` (pre-existing latent bug) → made Practice's `when:"patient.activeId"` aux
shadow Schedule's event-detail + emit "Client not found: schedule". Fixed: `patient.activeId`/`record.activeId`
only adopt the tab entityId when `resource` contains `ru-soam-practice/`; `schedule.activeEvent` is gated on the
Schedule calendar tab being focused (`resource` contains `ru-soam-schedule/schedule.html`) AND an event selected
— so it's registration-order-independent. Dogfood (CDP, real Google Calendar): aux renders PROBABLE event full
detail; deselect unmounts; no Client-not-found. **A2 carry-over:** header still shows raw provider title while the
honesty note says "identity comes from your roster" — A2's client-link block adds a `record.patient.query.get`
name lookup → header switches to roster identity for linked/probable.

### 1f. Slice A2 (per-state actions + Join + name lookup) — BUILT + DOGFOOD-VERIFIED 2026-06-21 (uncommitted)
3 files: `view-bridge.ts` (+`openActivity(containerId)` verb) · `BundleViewIframe.tsx` (+`request.openActivity` → `ContributionService.setActiveContainerId` + show PrimarySideBar) · `event-detail.html` (the build). The aux now binds caps view-side (best-effort: `sessions.meeting`, `record.patient`, `record.patient.query` — NOT manifest-gated, same precedent as §6 classify + needs-linking) and renders a **state-dependent client-link block** between Participants and Source:
- **linked** (`client_session`+`_match.matchClientId`) → "{Name} · Linked from roster ✓" + **Open in Sessions**.
- **probable-single** (`probable_client_session`+`matchClientId`) → "Matches {Name}…" + **Link to {Name}** (`addAlias`+`linkProviderEvent`) + **Not a client** (`suppressParticipant`, repEmail-gated).
- **probable-multi** (`candidates.length>1`) → **Link to client…** (roster picker) + **Not a client**.
- **excluded** / **personal** → "Marked as…" + **Link to a client…** (picker, reclassify-by-link).
- **new** (unclassified/none) → "Not recognised…" + **New intake client** (inline form → `create`+`linkProviderEvent`) + **Link to existing…** (picker) + **Not a client**.

Plus: **Join** button (platform-labelled from URL — Zoom/Google Meet/Teams → `soamView.openExternal`); **async name lookup** (`record.patient.query.get(matchClientId)` → header title + desc + Link button all swap to `displayName`, raw title stays only in Source — **resolves the A1 carry-over**) with a `_renderToken` stale-guard (bails if event switched mid-await); in-flight disable + lock/error inline. All PHI via `textContent`. `linkProviderEvent` is 2-arg (no `kind` — that's B). **Bug caught in review:** the implementer's editor rewrote every JS string delimiter as curly quotes (U+2018/U+2019) → runtime `SyntaxError` → blank view; **compile + lint missed it (neither parses `.html`)** → fixed (493 balanced delimiter pairs, zero content apostrophes → safe replace) + validated via `node --check` on the extracted script. **Lint rule learned: view-asset `.html` script edits need an explicit JS syntax check, not just compile/lint.** Dogfood (CDP, synthetic events of each class against real roster client "Hussain, MS"): all 6 blocks render correct buttons; Join label correct; name lookup → header/desc/button all "Hussain, MS"; Source keeps raw title + honesty note; **Open in Sessions fired live → active container switched schedule→sessions**; roster picker loads real client; ctx key flips true/false on select/deselect; zero console errors. Mutating link/suppress/create NOT fired against real data (identical to committed slice-4b caps) — verified at UI+wiring+picker-load level.

---

## 2. Item 3 — intakes from calendar (onboard-from-calendar, SD-13 realized)

A **new** client books (front desk / Calendly / Google) → appears on the calendar → becomes a
**referral** → their booking *is* the scheduled intake. The aux "NEW → **New intake client**" action
(and the needs-linking "promote") drives it.

### 2a. The flow (decision Q2 = explicit)
The promote/onboard affordance is the **explicit** "New intake client" — we never silently assume a
calendar event is a clinical intake. On invoke (renderer-orchestrated, mirrors slice-4b's cross-bundle
chain):
1. `record.patient.create({givenName, contactEmail})` → `record.patient.setStage(id,'referral')`.
   Pre-fill from the event where safe: contact = participant email/phone, **source = "calendar
   booking"**; presenting-concern blank (clinician fills).
2. `sessions.meeting.linkProviderEvent(event, clientId, { kind:'intake' })` — `kind` becomes a
   parameter (today hardcoded `session`).
3. `record.patient.setStage(id,'intake_scheduled')` — **a Practice command** (ADR-508 §8 / O484:
   Sessions/Schedule never write `patient_lifecycle`). `setStage` already exists.
4. An **existing `referral`-stage client** who gets a linked intake meeting → same `→ intake_scheduled`
   transition (the confirm/link path too, not only promote).

### 2b. O484 projection contract (Sessions → Practice, read-only)
- **Practice "next client meeting"** ← `sessions.meeting.query.listUpcoming` / `listForPatient`.
- **Practice intake checklist** "first appointment scheduled" ← satisfied by a linked Client Meeting
  (`getIntakeCompleteness`, already exists, reads cross-bundle).
- Lifecycle **stays Practice** — the calendar only *triggers* the Practice command.

### 2c. ADR need
**ADR-508 Amendment 2** (intake orchestration + the O484 projection contract) + a Practice-IA note.
Not a fresh ADR.

### 2d. Slice B (intake orchestration + O484 projection) — BUILT + DOGFOOD-VERIFIED 2026-06-21 (uncommitted)
Decisions at build: **reuse the existing `intake` lifecycle stage** (NOT `intake_scheduled` as §2a step 3
sketched — no new enum/UI/ADR-505 change); **build orchestration + projection together**. The
existing-referral auto-advance (§2a step 4) is **DEFERRED** — only the create-new path sets `kind:intake`
+ `setStage('intake')`; there is no "link as intake to existing" affordance this slice.
- **`kind` param** — `sessions.meeting.linkProviderEvent(event, clientId, opts?)` threads `opts.kind`
  into the shared `linkEvent` (4th arg); INSERT branch uses `opts.kind ?? 'session'` (validated vs
  `VALID_KINDS`); reconcile/legacy-backfill branches never touch `kind` (local-authoritative, no LWW).
- **Orchestration** — both create-new entry points (aux `event-detail.html` "New intake client",
  Sessions `needs-linking.html` "Create & link") run `create → linkProviderEvent(evt, id, {kind:'intake'})
  → record.patient.setStage(id,'intake','Intake scheduled from calendar')`. Link-to-existing / confirm
  paths unchanged (generic `session`).
- **O484 projection (view-bind, no manifest cycle)** — Practice `overview.html` "Next meeting" line
  (best-effort `sessions.meeting.query.listForPatient` → earliest `startsAt > now`) + `intake.html`
  derived 11th "First appointment scheduled" item (`done = list.length > 0`, displayed total → 11). The
  FP-Host `getIntakeCompleteness` cap stays 10-item Practice-only; the 11th row is view-only. Refreshes
  on record re-open/activate (Practice doesn't subscribe Sessions `store.changed`).
- **Dogfood (CDP, synthetic client, erased after):** create-new → `getLifecycle.stage==='intake'` +
  `listForPatient` one row `kind:'intake'`/`linked`; link-existing (no kind) → second row `kind:'session'`,
  intake row unchanged; `erase` → O490 cascade removes client + both meetings. Projection data layer
  proven via `listForPatient`; projection UI render reviewed (deterministic DOM) not visually staged.

---

## 3. Item 4 — the Client Meeting **record** surface (notes pulled out)

Decision Q3 = build the Client Meeting record; **Q4 = Notes are a separate topic / own ADR** (they span
Sessions + Practice + Schedule, need templating, summarization, and a confidentiality/privacy tier —
too big to fold in here).

### 3a. In scope this pass — the record tab
"**Open in Sessions**" (aux §1b) opens the Client Meeting as its **own editor tab** (mirrors Practice's
Client Overview / artifact-tab pattern, ADR-505): client (from roster) · time · kind · status · modality
· source · the linked provider event · **status management** (mark completed / no-show / cancelled) ·
deep-link back to the client's Practice record. The read-only "Upcoming Meetings" list rows become
openers. **No note authoring** — a **"Notes" placeholder** points at the forthcoming Notes subsystem.

### 3b. Out of scope — the Notes subsystem (own workstream + ADR)
Notes get a **dedicated design pass + full ADR** (reshapes/absorbs O487). Why it's separate (Q4): notes
occur in **multiple contexts** (a session note in Sessions, a clinical note in a Practice aspect, an
ad-hoc note from Schedule), and need **templating** + **summarization** + a **privacy tier** (progress
vs private/process/psychotherapy notes, with structurally-excluded cross-Activity projection). That is
its own architecture — not a slice of this pass. Also deferred (unchanged): **transcriptions**,
**reports** (O487 backlog), **MeetingProvider** (O486), **PHI egress/writes** (O499).

### 3c. ADR need
The record tab alone = no new ADR (a Sessions view over the existing `client_meeting` + status
commands that already exist). The **Notes ADR is separate** and gates any note work.

### 3d. Build note (Slice C — BUILT 2026-06-21)
`apps/desktop/bundles/ru-soam-sessions/view-assets/meeting-record.html` (new) + manifest `views[]`
entry. `openInEditor` verb generalized with `targetBundleId` (view-bridge.ts + BundleViewIframe.tsx)
— domain-agnostic, backward-compatible. Sessions meetings-list rows clickable → record tab.
Schedule aux "Open in Sessions" resolves meeting id via `sessions.meeting.query.listForPatient`
(O493 triple match) and opens the record tab directly; falls back to activity-switch on miss.
Trust-gate for untrusted bundles filed as Open Item (first-party-only today).

---

## 4. Cross-cutting invariants

- **Pure-base Main / ADR-506** — new logic in FP-Host bundles; new tables manifest-declared, residency
  `protected`; no Main domain code.
- **PHI-read gate (ADR-313)** — the whole ingress funnel sits behind `sessions.calendarPhiReadOptIn`
  (default off).
- **Lifecycle ownership** — only Practice writes `patient_lifecycle`; the calendar triggers Practice
  commands.
- **No provider writes** — ingress only (egress = O499).
- **PHI-safe rendering** — event/participant/raw-title/note text via `textContent`; audit enum/id-only.
- **O490 erase cascade** auto-covers every new `patient_id`-keyed table (zero wiring).

---

## 5. Execution slices (post-review)

| Slice | Item | Scope | ADR? |
|---|---|---|---|
| **A1** ✅ | 2 | **Aux slot infra + display-only** — aux viewContainer + `event-detail.html` + `ActiveEventService` relay + `schedule.activeEvent` key + prototype layout (all 5 states, display) + Source/raw-title + popover removal + classify `_match` enrichment + bootstrap precedence fix. O489 renderer-handler pre-wired. **BUILT + DOGFOOD-VERIFIED 2026-06-21, uncommitted.** | No (Open Items: context-key namespace, O489 verb) |
| **A2** ✅ | 2 | **Per-state action blocks + Join button** — 6-state client-link block (linked→Open-in-Sessions · probable-single→Link-to-{Name}+Not-a-client · probable-multi→roster-picker+Not-a-client · excluded/personal→link-picker · new→New-intake-client[create+link]+Link-to-existing+Not-a-client) via slice-4b caps (`addAlias`/`linkProviderEvent`/`suppressParticipant`/`create`, view-bind not manifest-gated) + `record.patient.query.get` name lookup (header + desc + button → roster identity) + working Join (platform-labelled, `soamView.openExternal`) + Open-in-Sessions (new `soamView.openActivity` verb → `setActiveContainerId`). PROBABLE 3rd "This is a client session" button folded into Link-to-{Name}. New-intake = create+link only (referral/stage flow is B). **BUILT + DOGFOOD-VERIFIED 2026-06-21, uncommitted.** | No (Open Item: `openActivity` verb) |
| **B** ✅ | 3 | **Intake-from-calendar** — create-new ("New intake client" / "Create & link") → `kind:'intake'` link param + renderer-orchestrated `setStage('intake')` (REUSED existing stage, NOT `intake_scheduled`) + O484 projection (overview next-meeting line + intake 11th "first appointment" item, view-bind). Existing-referral auto-advance DEFERRED. **BUILT + DOGFOOD-VERIFIED 2026-06-21 (orchestration end-to-end; projection data-layer proven, UI render reviewed), uncommitted.** | ADR-508 Am2 ✅ |
| **C** ✅ | 4 | **Client Meeting record tab** — open from aux "Open in Sessions" + list; detail + status management + Practice deep-link; **Notes placeholder only**. `meeting-record.html` (new Sessions view); `openInEditor` generalized with optional `bundleId` for cross-bundle open (view-bridge + BundleViewIframe). **BUILT + DOGFOOD-VERIFIED 2026-06-21, uncommitted.** | No (Open Item: O500 cross-bundle-open trust-gate) |
| **—** | (4) | **Notes subsystem** — separate design pass + **full ADR** (multi-context, templating, summarization, privacy tier). NOT this pass. | **ADR (separate)** |

**Sequence (Q5 — proposed):** A → B → C. A first (the hub the others plug into; biggest visible win).
B next (highest clinical value, reuses existing commands). C last (the "Open in Sessions" destination).
O489 Join rides inside A. The Notes ADR is queued independently.

---

## 6. Decisions resolved (2026-06-21 review)
- **Q1 (panels):** aux slot = the action surface for **all 5 states** (client/probable/new/personal/
  excluded); no new Schedule panel; existing Sessions needs-linking panel stays. ✅
- **Q2 (intake detect):** **explicit** "New intake client" action. ✅
- **Q3 (item-4 scope):** Client Meeting **record** this pass; transcriptions/reports deferred. ✅
- **Q4 (notes):** **Notes = separate workstream + full ADR** (multi-context: sessions/practice/schedule;
  templating + summarization + privacy tier). Pulled out of this pass; the record tab carries a
  placeholder. ✅
- **Q5 (sequence):** A → B → C, O489 inside A — *proposed, confirm.*
