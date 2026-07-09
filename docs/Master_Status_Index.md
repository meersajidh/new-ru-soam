# Master Status Index

**Status:** Living tracker
**Date:** 2026-07-02
**Owner:** Architecture
**Purpose:** One-screen stock-take of every track — platform phases, product Activities, cross-cutting workstreams — with completion state and what remains. Derived view over `Implementation_Plan.md`, `Open_Items.md`, `docs/Activities/*`, and project memory. **Not** a source of truth; each row points at its authoritative doc. Refresh when a track's status changes.

---

## How to read the numbering (three schemes, not one sequence)

The repo uses several independent numbering conventions that look sequential but are not:

- **Phases 0–13** — platform / architecture spine. Source: `docs/Implementation_Plan.md`. Sequential.
- **P-A / P-B / P-C / P-D** — *Schedule* Activity UI build-plan phases. Source: `docs/Activities/schedule/schedule-ui-build-plan.md`. Local to that Activity.
- **P0 – P6** — *Practice* Activity build-plan. Source: `docs/Activities/practice/practice-build-plan.md`. Separate local sequence — **collides in name** with platform Phases but is a different track.
- **A1–A8** — the *Schedule read-only backlog* list. Source: `docs/Activities/schedule/read-only-backlog.md` §List A. A1 participant-class hint · A2 meeting-link provider detection · A3 idle auto-lock (O502) · A4 migration OI-3 gate · A5 dedup/merge (**done**) · A6 remaining migration OIs · A7 `__viewQuery` rollout (O497) · A8 view tech-stack ADR (**done → ADR-419/O496**). This is the "A-series."
- **SD-nn / slice-N** — informal per-session work-chunk tags inside the Schedule–Sessions–Migration arc (SD-nn = schedule design-log decisions; slice-N = Sessions/Migration build slices). Not a governed sequence.
- **O###** — Open Items, the real cross-cutting backlog. Authoritative registry: `docs/Open_Items.md` (345 rows; ~132 Deferred, ~23 Partial). Full open list in the appendix below.

Product work (Practice / Schedule / Sessions / Migration) branched off platform Phase 10 as **parallel Activity tracks** with their own local phase letters. This is why platform Phase 8 sits unstarted while Phases 9–11a and multiple product tracks are done.

---

## A. Platform phases (`Implementation_Plan.md`)

| Track | Purpose | Planned stages | Status | % | Remarks |
|---|---|---|---|---|---|
| Ph 0–7.5c | Trust zones → shell → commands → workspace → editor → bundle-host → view iframe → RuEdit primitive | 0, 1, 2, 2.5, 3, 4, 5, 5.5, gate, 6, 6.5, 7, 7.5a/b/c | **Complete** | 100% | Spine solid, committed. |
| **Ph 8 — Snippet engine** | `/abbrev`+Tab expansion in RuEdit (ADR-416) | 1 phase, fully specced | **NOT STARTED** | 0% | Leapfrogged — crypto/store/cloud/product built instead. Fully planned, cold. Largest "planned-but-abandoned" platform item. |
| Ph 9 / 9a / 9b / 9c | Crypto + KEK + lock/unlock, multi-workspace | 9a, 9b, 9c | **Complete** | 100% | 9c picker superseded by sign-in modal. |
| Ph 10a / 10b | Local Store (SQLCipher) + audit ledger + TanStack wiring | 10a, 10b | **Complete** | 100% | |
| **Ph 11a — Cloud identity** | Cloud Run identity svc, JWT, telemetry | 11a | **Complete → PARKED** | 100% | Live `asia-south1`. Telemetry default-off pending O468 90d-purge. |
| **Ph 11b — Sync** | Outbound queue + cloud mirror + conflict policy | 11b | **NOT STARTED** | 0% | Blocked on O23 (CRDT/OT/LWW undecided). |
| **Ph 12 — Recovery / Onboarding / Settings** | Settings editor, recovery-code flow, onboarding, bundles surface | 1 phase | **NOT STARTED** | 0% | Carries O24 / O26 / O38–42 / O49 / O52 recovery + settings items. |
| **Ph 13 — Audit Viewer bundle + editor polish** | First anchored 1P bundle; editor UX debt (O111 / O112 / O152) | 1 phase | **NOT STARTED** | 0% | Editor polish (drag preview, split-divider drag, tab context menu) parked here. |

---

## B. Product Activity workstreams (`docs/Activities/*` + memory)

| Track | Purpose | Planned stages | Status | % | Remarks |
|---|---|---|---|---|---|
| **Practice** | Client record Activity (roster, Overview, aspects, intake, attention) | P0, P1, P2, P3, P4, P5, **P6** | P0–P5 **Complete + committed**; **P6 NOT STARTED** | ~85% | P6 = real projection cards (next-session / last-note / scores / payment / agenda) + overlays (O464). Was blocked on Schedule/Sessions data — now unblockable. |
| **Schedule (read-only)** | Multi-cal Activity over providers; owns event tables | P-A, P-B, P-C, P-D, data layer | P-A ✅ · P-B ✅ (multi-cal redesign) · P-C ⚠️ superseded (agenda remnant) · P-D ✅ · data ✅ | ~90% | Read-only foundation DONE. Remnant = "Today's agenda" tab (low value). O486 = MS/Apple/CalDAV providers. |
| **Sessions** | Client Meeting (only clinical persistence); event→client linking | slices 1, 2, 3, 4a, 4b, §6 | **Complete + committed** | ~65% of full vision | Foundation done. **Open: O499 PHI egress write-half + Safety Score write-side; O501 Notes subsystem (own ADR); O487 transcriptions / reports.** Main unfinished clinical surfaces. |
| **Migration onboarding** (ADR-509) | Bulk calendar→client onboarding of established practice | Slice 1, 2a, 2b, A5-dedup | **Complete + committed** | ~70% | **9 OIs open** (OI-1/2/3/5/6/7/8/9/11). Pending: People-API reconnect dogfood (code-verified, not runtime), ADR-508 §4b amendment owed. |

---

## C. Cross-cutting / infra trackers (project memory)

| Track | Purpose | Status | % | Remarks |
|---|---|---|---|---|
| **View-stack migration** (ADR-419 / O497) | 14 bundle views vanilla→React + strict CSP + Tailwind | **Complete + committed** (`1dea7cd`) | ~95% | Only open: O512 (untrusted TP-Host CSP tier). |
| View-layer refactor (O466) | Shared `__viewBoot` seam | **Done + committed** | 100% | Sibling debt: aspects.html section-split (not started). |
| **Design-system foundation** (ADR-421 / O516) | ONE `@basebench/ui` on shadcn standard (CSS-var contract + Base UI + single multi-source SVG Icon), both surfaces; named-theme×mode | **Complete + committed** (F1–F6) | 100% | Supersedes ADR-420. Gallery = dev-only editor tab (`workbench.developer.openDesignGallery`). Guide: `docs/Guides/design-system.md`. Residual: O518 (Base UI submenu-on-modal), O519 (aspects.tsx Section/KvRow debt), O520 (gallery view-iframe leg). |
| **Testing foundation** (O517) | Vitest projects + test pyramid + CI gate | **Complete + committed** (B0/B1/B2) | 100% of foundation | T1 pure-logic + T1b invariant guards landed; `pnpm test` in CI (behavior gate ≠ type gate). T2 component/DOM (jsdom) + T3 E2E (Playwright+`_electron`) deferred. Guide: `docs/Guides/testing.md`. |
| **Cloud backend** (Ph 11a) | Identity svc | **Live + committed, PARKED** | 50% of cloud | Sync half (11b) unbuilt. O468 purge = gate before telemetry ships on. O476 System-B consent. |
| OAuth port | Google OAuth client | **Done** (client) | ~60% | O309a server-verify folded into Cloud 11a (done); O309b licensing deferred. |
| Release / update (ADR-204 / 308) | electron-updater, R2, NSIS + deb | **v0.1.9 shipped**, mature | ~90% | Deferred OIs: signing, APT-repo, beta-UI, version-floor, backup-migration. |
| ADR-506 migration | Pure-base Main + CQRS ladder | **Complete + committed** | 100% | Deferred: O445 dep-graph, O441 trustClass-tag, O451 cap-transport, rung-H untrusted host. |
| O452 PHI-at-rest | Protected vs operational store split | **Committed** | ~90% | Deferred: O26 KEK-rotation, prod PHI migration. |
| Workbench UX thread | Font propagation, StatusBar glyph | Staged / committed | — | **⚠️ Open bug: WorkspaceSwitcher "more hooks" crash, reproducible with 2 accounts** (~`WorkspaceSwitcher.tsx:162`). Unresolved. |
| Win dev launch | VM dev-launch reference | Reference note | — | electron.exe extraction workaround. |
| **Unit 1–3 (version + notifications + update alerts)** | Version status-bar entry (U1) + full-parity `NotificationService` port completing the Phase-9 reserved service (U2) + update-alert surfacing & what's-new modal = release A.3 (U3) | **PLANNED, NOT STARTED** | 0% | Whole track. Source: `docs/UNIT_1-3_Implementation_Scope.md`. Dependency-ordered U1→U2→U3. No new ADRs. Prereqs (CI + R2 dist) done. |
| **Schedule read-only backlog** (A1–A8) | Remaining read-only Schedule polish | A5 ✅ · A8 ✅ · **A1/A2/A3/A4/A6/A7 open** | ~40% | A1 participant-class hint (couple/group), A2 meeting-link provider detection (Zoom/Teams list) = **not previously in this index**. A3=O502, A4=migration OI-3, A6=migration OIs, A7=O497. Source: `read-only-backlog.md`. |

---

## The genuinely-inconclusive shortlist (never cleanly concluded)

Ranked by how orphaned:

1. **Platform Phase 8 (Snippet engine)** — fully planned, 0% built, leapfrogged. Cleanest abandoned outset-goal.
2. **Sessions clinical surfaces** — O501 Notes (needs own ADR), O499 PHI egress write-half + Safety Score, O487 transcriptions / reports. Sessions vision ~⅓ unbuilt.
3. **Practice P6** — projections + overlays; was blocked on Schedule/Sessions existing (now they do → unblockable).
4. **Migration 9 open OIs** — OI-3 Sessions-link gate is the notable one; rest are refinement.
5. **Platform Ph 11b / 12 / 13** — sync (blocked on O23), recovery/settings, audit-viewer + editor-polish. All 0%, all downstream.
6. **Loose ends** — WorkspaceSwitcher crash bug (open), People-API reconnect dogfood (pending), ADR-508 §4b amendment (owed), aspects.html section-split (debt), O468 telemetry-purge gate.

---

## Appendix — full open Open-Item registry (Deferred / Partial)

Every OI whose status is **Deferred** or **Partial** as of 2026-07-02, grouped by what unblocks it. Authoritative rows live in `docs/Open_Items.md`; this is a derived pick-up view (mirrors `Trigger_Gated_Items_List.md` but exhaustive). `Resolved` / `Done` / `Closed` items omitted.

### Blocked on Phase 11 (Cloud sync transport)
- **O23** — operational sync conflict resolution (CRDT/OT/LWW — undecided; gates 11b)
- **O19** — brokered networking caching
- **O20** — brokered networking failures
- **O27** — backup cadence / granularity
- **O29** — same KEK/DEK for sync + backup
- **O30** — Linux keychain backend policy
- **O41** — cloud ciphertext deletion API contract (11/12)
- **O55** — workspace settings cloud-mirror policy
- **O75** — save-failure UX
- **O183** — schema version wire-tagging for sync
- **O416b** — shared / clinic snippet registries + persistence (10/11)

### Blocked on Phase 12 (Recovery / Onboarding / Settings)
- **O24** — PHI export / import flow shape
- **O26** — KEK rotation policy (also re-wrap keychain creds, O307f)
- **O38** — local backup file format
- **O39** — DPAPI loss-detection heuristic
- **O40** — KMS access-loss UX
- **O49** — audit retention per event kind
- **O52** — consent UI text hashing
- **O62** — Activity Bar `top` position
- **O71** — platform item discoverability
- **O77** — aggregate save prompt
- **O92** — configuration-derived context-key mirror
- **O156** — `changePassphrase` opens dialog (9c/10, Partial)
- **O161** — workspace rename command
- **O174** — prerelease (beta) channel UI
- **O192** — zoom control in Settings (needs zoom service)

### Blocked on Phase 13 (Audit Viewer + editor polish)
- **O50** — audit ledger export format
- **O51** — audit emission lint (13 / first PHI cap)
- **O58** — grid engine / library choice
- **O61** — narrow-window side-bar behaviour
- **O66** — bundle debugging mechanism (Partial)
- **O91** — reserved-namespace context-key enforcement
- **O95** — expression-evaluator perf budget + PHI-adjacent scrub list (Partial)
- **O101** — output-channel routing
- **O109** — a11y theme contrast budget
- **O111** — editor split-ratio persistence
- **O152** — EditorService event granularity

### Blocked on first clinical bundle / view / editor
- **O73** — resource URI scheme registry
- **O74** — autosave default + override
- **O76** — view-state serialisation depth
- **O80** — view iframe sandbox flags (Partial)
- **O81** — bundle-view CSP exact text (Partial)
- **O82** — declarative-view component vocabulary
- **O83** — a11y across iframe boundary
- **O84** — iframe pooling / count budgeting
- **O93** — bundle context-key authority limits
- **O102** — panel-view persistence depth
- **O103** — auto-activation rate limiting
- **O104** — status-bar priority scheme
- **O105** — status-bar update rate-limit
- **O110** — theme + iframe propagation cost
- **O138** — side-bar / panel slot iframe mounting
- **O139** — crash-placeholder UI for orphaned iframes
- **O140** — `view.activate(viewId, ctx)` bundle hook
- **O141** — view-bridge follow-ups (onResize / notifyDirty / …)
- **O142** — typed `ThemeTokens` on `soamView.theme`
- **O149** — read-only mode UI toggle on scratch
- **O150** — command-palette commands for RuEdit toolbar
- **O154** — tab dedup policy

### Snippet / RuEdit follow-ups (post-Phase-8, or use-case-driven)
- **O129** — custom atomic blocks (Vitals / Allergies / MedList)
- **O130** — React-in-nodeView strategy
- **O131** — stable ID v4 → v7
- **O132** — print pipeline (JSON → PDF)
- **O146** — heap-snapshot dispose-leak harness
- **O416a** — type-constrained placeholders
- **O416c** — snippet authoring UI
- **O416d** — snippet recursion
- **O416e** — DataLink placeholder (chart/FHIR phase)
- **O416f** — Template phase (whole-doc scaffolds)
- **O416g** — trigger-character override
- **O416h** — completion popup UX (Partial)
- **O120** — voice dictation adapter
- **O121** — multi-clinician collab (Yjs)

### Schedule / Sessions / Migration follow-ups
- **O464** — Practice overlays (`patient_overlay` / `setOverlay`) → P6
- **O486** — MeetingProvider port + first video adapter (Meet/Zoom)
- **O487** — full Sessions design pass (Notes / Transcriptions / Reports)
- **O488** — Schedule real aux event-detail slot (data done; slot deferred)
- **O489** — one-click "Join meeting" launch
- **O491** — Schedule nav classifications section (counts + filter)
- **O499** — PHI ramp write-half (calendar write-back + write opt-in)
- **O501** — Notes subsystem (own full ADR)
- **O502** — idle auto-lock interval setting
- **O506** — top-chrome header-height alignment
- **O507** — grid `connected` sticks false on cold-load race
- **O508** — meeting-provider defaults re-seed on reload
- **O510** — bulk "re-scan all meeting links"
- **O514** — System-B provider token loss/expiry (Google account needs periodic manual reconnect; People-API "not connected" symptom)
- **Migration OI-1/2/3/5/6/7/8/9/11** — ADR-509 §Open Items (OI-3 = Sessions-linking confirm gate)

### Protected blob store
- **O461** — per-object DEK envelope + framed streaming AEAD (needs consumer)
- **O462** — in-app document viewing (decrypt-to-memory render)
- **O463** — orphan-sweep (crash-window reconciliation, pre-1.0)

### Untrusted host / trust tiers (needs 2nd untrusted Bundle-Host = rung-H)
- **O137** — ESM-side hardening depth
- **O500** — cross-bundle editor-open trust-gate
- **O512** — untrusted (TP-Host) view CSP + sandbox tier
- **O441** — iframe-relay `trustClass` tag
- **O445** — full FK / dependency-graph resolution (partial done)
- **O451** — cap-transport topology (Main-broker vs direct MessagePort)

### ADR-503 (Clinic tenancy — inactive until 503 advances)
- **O36, O43, O44, O45, O46, O47, O53, O54** — roles / referral / entity migration / partitioning / concurrent views / switcher / bundle enablement

### Provider-plugin ecosystem (post-Phase-13)
- **O33, O34, O35, O37** — plugin registration / validation hook / rate-limit / scaffolding

### Base-layer extraction (ADR-106 Phase A leftovers — rung 2)
- **O194** — extract base package `@basebench/core-shell`
- **O195** — ADR/doc Layer-field classification sweep
- **O196** — brand → `basebench` identifier rename

### Crypto / credential posture
- **O28** — crash-dump PHI scrubbing (first telemetry surface)
- **O307a** — Strategy A (user-owned KMS)
- **O307b** — idle-timeout configurability (Partial)
- **O307c** — passphrase strength policy hardening (Partial)
- **O307d** — hardware-bound passphrase / biometric
- **O307f** — per-keychain-credential walk-up policy (Partial)
- **O307g** — real Google OAuth integration (Partial)
- **O309b** — subscription & licensing model
- **O309c** — prod OAuth credential delivery (Partial)

### Misc / long-range / low-priority
- **O1** — canonical state placement
- **O3** — capability versioning policy
- **O4** — permission scope model
- **O5** — contribution declaration form (Partial)
- **O6** — default activation trigger (Partial)
- **O7** — contribution point catalogue
- **O8** — bundle dependency declaration
- **O9** — bundle hot reload in dev
- **O10** — CSP exact policy text (Partial)
- **O13** — lint rules for hardening (Partial)
- **O14** — `Soam` interface exact shape (Partial)
- **O16** — preload event channel surface (Partial)
- **O17** — events on bridge vs capability
- **O18** — `app://` route registration
- **O21** — direct-fetch enforcement
- **O25** — operational side-door policy
- **O31** — hardware-bound credential keys
- **O42** — passphrase-wrapped backup extension
- **O48** — audit hash-chain mechanism (Partial; Merkle upgrade)
- **O56** — workspace setting trust prompt
- **O59** — banner contribution scope
- **O60** — Aux Side Bar navigation strip
- **O63** — panel-or-Aux dual contribution
- **O65** — Bundle Host isolation granularity (Partial)
- **O67** — native module / non-portable dep policy
- **O68** — Bundle Host hibernation policy (Partial)
- **O79** — `soamView` exact API (Partial)
- **O85** — WebContentsView usage policy
- **O87** — command argument schema
- **O88** — command audit field
- **O89** — recent-commands persistence
- **O90** — palette ranking algorithm
- **O94** — PHI-adjacent context-key privacy
- **O98** — workspace lifecycle reset matrix (Partial)
- **O99** — Suspense + loading discipline
- **O134** — `onCommand` activation trigger
- **O135** — `onEvent` activation trigger
- **O136** — per-line stdout/stderr attribution
- **O153** — `editor.activeResource` PHI scrub list
- **O155** — `setup.css` cross-import consolidation
- **O158** — per-row TanStack Query invalidation
- **O159** — `PlatformEvent` discriminated-union typing
- **O160** — `cap.no_workspace` error code
- **O175** — version-floor / kill-switch
- **O176** — Linux background `.deb` update
- **O184** — encrypted backup schema-version embedding
- **O187** — R2 artefact retention / lifecycle
- **O189** — panel/flyout visibility → generic UI service
- **O191** — email-based account identify at login
- **O417** — super-admin cross-workspace delete
- **O430** — lazy-activate-on-command (needs O134/O135)
- **O465** — intake-checklist item → deep-link to owning aspect
- **O467** — remove temporary `minimumReleaseAgeExclude`

### Non-OI trigger-gated items (tracked without an O###)
- **rung-H** — 2nd untrusted (third-party) Bundle-Host
- **aspects.html section-split** — view-layer tech-debt (sibling of O466)
- **prod PHI migration** out of `local-store.db` (O452 deferred half)
- **Unit 1 / Unit 2 / Unit 3** — version entry / NotificationService port / update alerts (`UNIT_1-3_Implementation_Scope.md`; planned, not started)
- **Schedule A1** — participant-class hint (couple / group therapy)
- **Schedule A2** — meeting-link provider detection (Zoom / Teams / … user-editable list)
- **Migration ADR-508 §4b amendment** — suppression schema (owed)
- **People-API reconnect dogfood** — contacts-scope enrichment code-verified, not runtime-verified

---

---

## Scan provenance

- **Full-read / extracted:** `Implementation_Plan.md`, `Open_Items.md` (all Deferred/Partial rows), `Trigger_Gated_Items_List.md`.
- **Status-block read (2nd pass, 2026-07-02):** `Cloud_Backend_Build_Plan.md`, `UNIT_1-3_Implementation_Scope.md`, `View_Stack_Migration_Plan.md`, `O513_Plan.md`, `README.md`, `Activities/practice/practice-build-plan.md`, `Activities/sessions/{sessions-activity-plan,ingress-clinical-design}.md`, `Activities/schedule/{schedule-ui-build-plan,read-only-backlog,schedule-multical-spec,event-cache-plan}.md`. 2nd pass surfaced the **Unit 1–3 track** (was missing) + **Schedule A1/A2** granular items; all other Activity statuses confirmed against memory.
- **Not read (design/frozen, don't affect a status rollup):** 52 ADRs, 8 Guides, 9 References, 1 Proposal, 11 PRs, practice design-input docs (IA / functional-draft / data-model / migration-path / adr-crosswalk / LDM / continuation-brief), schedule-design-log, calendar-client-onboarding-design.

*Regenerate by re-scanning the two surfaces above + the `project_*` memory trackers.*
