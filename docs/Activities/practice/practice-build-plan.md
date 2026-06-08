# Practice — Release-Phased Build Plan (Draft v0.1)

**Status:** Active plan. Derived from `practice-information-architecture.md` (the IA
matrix). Ordered by **data dependency** + **information readiness**. Each phase is
**release-worthy** (dogfoodable; leaves the app green). Residual design unknowns are
tracked as Open Items and resolved as clarity emerges — not blockers to starting.

**Authoring rule for all owned data:** ADR-506 — CQRS-explicit (`bindCommand` /
`bindQuery`), FP-Host-resident, manifest-declared, `residency:'protected'` (O452),
audited (ADR-502). Owned writes touching PHI are **renderer-domain commands**
(ADR-417 pattern) so PHI never enters a host.

**Spine-first principle (IA §12):** build Practice-*owned* data real; leave
*projections* (Sessions/Schedule/Assessments/Planner/Billing) as Mock placeholders
until a minimal owner is stood up in Phase 6.

---

## Maturity legend (used by this plan and on the UI)

- **Concrete** — real owned data, real read/write.
- **WIP** — wired but incomplete (missing fields/validation/edge-cases).
- **Mock** — pure placeholder / projection from an unbuilt Activity.

The UI marks every card/aspect with its state (Phase 0). The plan uses the same words.

---

## Phase 0 — Legibility (maturity-marking system)

**Goal:** every Practice surface visibly declares Concrete / WIP / Mock.

- Maturity registry (element id → state) as single source of truth.
- `data-maturity` attribute + token-driven CSS (palette tokens, not `@theme` —
  tree-shake gotcha); reuse the prototype source-pill, extend it to carry maturity.
- Always-on subtle markers (border + pill + tooltip) + an optional **"highlight build
  status"** toggle (View menu / StatusBar) that intensifies them for a full-surface scan.
- Apply to current views: projection cards → **Mock**; static owned aspects → **WIP**;
  Roster + `setStatus` (O433) + lifecycle stage (Am3) → **Concrete**.
- Short convention note in `docs/Guides/styling-system.md` (renderer/bundle CSS only;
  no ADR).

**Depends on:** nothing. **Info:** ✅ full. **Open:** O-MATURITY (scheme id registry).
**Ships:** legible state of the whole surface.

---

## Phase 1 — Spine: Profile + Lifecycle (real)

**Goal:** the client record's identity layer is real and editable.

- Tables: `patient_profile`, `patient_lifecycle` (protected residency).
- Commands: `setProfile`, `setProblemList`, `setStage` (Am3 already specs `setStage`).
- Queries: `getProfile`, `getLifecycle`, `getOverview` (header slice).
- **Profile** contextual aspect: real read + edit (demographics, preferred language,
  medication-awareness, diagnosis/problem-list).
- Overview header + diagnosis chips + lifecycle stage chip → **Concrete**.
- Intake create-path form writes a real `patient_profile`.

**Depends on:** existing `record.patient` module. **Info:** ✅ full. **Ships:** real
demographic record.

---

## Phase 2 — Spine: People/Circle + Consent & Legal (real)

**Goal:** the relational + legal facts layer is real.

- Tables: `patient_circle_member`, `patient_consent_state` (protected).
- Commands: `addCircleMember`, `updateCircleMember`, `setNR`, `setConsentState`.
- Queries: `getCircle`, `getConsentState`.
- **People / Circle** aspect (NR, caregivers, family, emergency) — real.
- **Consent & Legal** aspect (Advance Directive status, informed + tele consent,
  capacity status, §23 exception flag) — real (the flag is *displayed/edited* here;
  the §23 *flow* is Phase 4).
- Overview badges (AD / capacity / tele) + Circle mini → **Concrete**.

**Depends on:** Phase 1 pattern. **Info:** ✅ full. **Ships:** legally-aware record.

---

## Phase 3 — Documents

**Status: BUILT 2026-06-08** (compile+lint+node-check green, code-reviewed; runtime
CDP verify pending workspace unlock). Lean protected blob store (O454) + `patient_document`
+ `attachDocument`/`removeDocument`/`listDocuments` + Documents aspect (attach/list/remove)
+ erase-cascade blob unlink. **Viewing deferred → O462** (decrypt-to-memory render, in the
right Activity context).

**Goal:** per-client PHI files attached and viewable.

- Table: `patient_document`. Commands: `attachDocument`, `removeDocument`.
- **Documents** aspect (file list) + inline upload from Consent & Legal; missing
  required docs surface as Attention items (Phase 5).
- **Infra (decided — O454 resolved, lean protected blob store):** base `blob.put`/`get`/`delete`
  capability over encrypted files in `$workspace/protected-blobs/<id>` (single per-workspace
  KEK-wrapped key `protected-blobs.key.json`, close-on-lock via the existing lock seam, lazy-provisioned).
  `patient_document.storage_ref = blob:<id>`. **P3 build prereq = stand up the blob store**
  (sibling key + lock wiring + `blob.*` cap), then the document commands/aspect on top. Erase (O457):
  `removeDocument` + patient-erase must unlink blobs via `blob.delete` (DB cascade is rows-only).
  Full envelope (per-object DEK + streaming) deferred → O461. Detail: ADR-302 §"Protected blob store" + ADR-307.

**Depends on:** Phase 2; lean protected blob store (O454, infra ready to build). **Ships:**
document handling.

---

## Phase 4 — Risk / Safety (O419 keystone)

**Goal:** the safety column — banner + aspect + audited §23.

- Table: `patient_risk_event`. Commands: `addRiskEvent`, `setCapacity`,
  `toggleException` — **all audited** (ADR-502); §23 flag in
  `patient_consent_state.confidentiality_exception_active`.
- **Risk / Safety** contextual aspect (always present): capacity · §23 state · NR
  engagement · SI status · means restriction · safety-plan status; actions Open
  safety / Log §23.
- **Conditional Overview banner** (shows on active concern; expandable to aspect body).
- **Safety-plan editor** as an owned writable artifact tab.
- 🟡 **Residual design:** safety-plan editor fields + §23 confirmation UX
  (**O419** keystone residue; design at phase start).

**Depends on:** Phase 2 (consent_state). **Info:** 🟡 mostly (prototype settled
banner+aspect = both). **Ships:** clinically-safe record — major milestone.

---

## Phase 5 — Overview modes + Intake checklist + Attention + Overlays

**Goal:** the workflow layer that aggregates the spine.

- **Three view modes** (dense / focused / timeline) as a persisted preference
  (renderer-only axis, like Activity-Bar density). **O-VIEWMODES.**
- **Intake checklist** in the Work Area (completeness state, e.g. "6/9") → drives
  **Intake** lens membership + seeds Attention.
- **Attention** obligations from owned completeness/lifecycle (intake incomplete,
  missing consent doc, no initial risk screen, on-hold past threshold);
  projection-derived obligations (overdue note, unbooked) deferred to Phase 6.
  **O-ATTENTION** (final set).
- **Overlays**: `patient_overlay` + `setOverlay` (review / pin / flag over projections).
- Consider **Attention as default landing lens** (UX principle, IA §9).

**Depends on:** Phases 1–4 data. **Info:** 🟡 obligation set partly open. **Ships:**
workflow-complete Practice.

---

## Phase 6 — Real projections (incremental family)

**Goal:** replace Mock projection cards with real data, one owner at a time, by value.

- Stand up the **minimal** owning Activity behind a card only when its value demands
  it — e.g. a tiny **Sessions** note-store → Notes projection + last-note card →
  Concrete; overlays attach to real notes.
- Then **Schedule** (Agenda + Appointments + confirm/no-show minor cmd),
  **Assessments** (Scores), **Planner** (Goals), **Billing** (Payment — gated on the
  A1/O421 promotion decision).
- Each owner = its own per-Activity MVP scoping (**O197**) + bundle ADR + mini-release.

**Depends on:** independent each. **Info:** ⚠️ each needs O197 scoping. **Ships:**
breadth, rolling.

---

## Dependency summary

```
P0 (legibility) ─ standalone, do first
P1 (Profile/Lifecycle) → P2 (Circle/Consent) → P4 (Risk, reads consent_state)
                                              ↘ P3 (Documents, needs blob store)
P1..P4 ────────────────────────────────────→ P5 (modes/Intake/Attention/Overlays)
P6 (projections) ── parallel/rolling, each needs its owner (O197)
```

**Release milestones:** P0–P2 = *real client record* · P4 = *clinically-safe record*
(keystone) · P5 = *workflow-complete Practice* · P6 = *breadth*.

## Decisions to make (tracked, not blocking)

1. ~~**O-BLOBSTORE** — protected blob store vs bytes-in-DB~~ **DECIDED 2026-06-08 → O454: lean protected blob store** (encrypted files, single KEK-wrapped key, close-on-lock). Full envelope deferred → O461. P3 unblocked, no longer slips behind P4.
2. **A1 / O421** — confirm Billing as an Activity, else Payment card stays Mock.
3. ~~**P4 residual** — safety-plan fields + §23 UX (O419).~~ **DONE 2026-06-06 → O460** (P4 built + verified).
4. **Attention default landing** (P5 UX call).

## Open-item ledger for this plan

`O-MATURITY` · `O-BLOBSTORE` · `O-VIEWMODES` · `O-ATTENTION` — to be assigned real
O-numbers in `docs/Open_Items.md`. O419 (Risk residue), O420 (data-model increments),
O421 (Billing), O197 (per-Activity scoping) already exist.
