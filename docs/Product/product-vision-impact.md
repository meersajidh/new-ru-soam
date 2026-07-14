# Product Vision + Scope v2 — Architectural Impact Assessment

**Status:** Reference (assessment, 2026-07-13; re-assessed 2026-07-14 after the
instrument-of-representation reframe)
**Owner:** Product
**Basis:** all 5 new docs + ADR-405, ADR-507/508/509 spot-checks, OI registry rows.

## TLDR

Nothing built breaks — the ledger's posture ("data models unaffected, migrate incrementally") holds up under scrutiny. Real impact = **three new ADR obligations created** (loop-mechanics platform ADR, case-entity record extension, per-surface bundle ADRs for 5 new Activities), **four existing ADRs now under supersession pressure on their UI half** (505, 507, 509 partially, 502's Audit-Viewer anchor), and **a handful of stale registry rows** (O72, O197, O421). Plus several second-order platform questions nobody has flagged yet — bundle-id stability, erase-cascade under case keying, Library's cloud content channel, Trust-vs-Recovery boundary.

**Re-assessment 2026-07-14 (origin-polemic capture + instrument-of-representation reframe):
conclusions unchanged.** No built ADR ever used the "two relationships" framing, so
demoting the system to instrument creates zero new supersession pressure. Ripple is
vocabulary and one strengthening — details in §1.

**Manifesto pass (2026-07-14, later same day): vision slimmed to origin → statement →
who → facets + guarantees → differentiation → consequences.** Frame mechanics,
principles, non-goals, and guarantee tiers moved to journal-residence
(goals-discovery) by deliberate choice — below vision-level. Vocabulary: practice
goal domains = **facets of the relationship** in the vision; the facets form the
practice **sub-domains** behind the catalogue's "domain" labels (bridge noted in
Scope v2). Safety facet includes *privacy* by definition ("privacy is about the
person, confidentiality is about the data"). Still no structural impact; the
journal-residence consequence is captured in §1.

---

## 1. Product_Vision.md — impact: governance, not structure

Vision sits _above_ scope; no conflicts with any ADR. What it changes:

- **New authority chain established:** Vision → Scope v2 → per-surface bundle ADRs → loop-mechanics platform ADR. This adds a **required "goal allegiance" field to the O197 brief method** — every future 500-series ADR must state which loops it moves. Cheap, real discipline gain.
- **Reaffirms without amending:** ADR-301 — local-first stated as the structural answer to privacy and sovereignty (the vision's one named Core Principle). The manifesto pass removed the ADR-501/503 citations; tenancy boundaries live in those ADRs themselves.
- **Non-goals + principles are journal-resident (manifesto pass 2026-07-14):** the vision dropped its Principles and Non-goals sections as below-vision-level. Subordination, authority respect, means-agnosticism, guarantee tiers, and the non-goal list (no insurance, no data-entry service, no workflow engine, clinic deferred) now live only in `goals-and-loops-discovery.md` (§0 reframe, §0c, §5, §5a). They still bind: per-surface ADRs cite the discovery sections directly until the loop-mechanics ADR promotes them into settled design.
- **Means-agnosticism = the AI-agent gate.** Any agent-harness proposal must clear a 5-guarantee × 2-direction rubric (goals doc §5a). That's a de-facto ADR-acceptance criterion for a whole future workstream. Worth noting in Architecture Log when you commit.

**Instrument-of-representation reframe (2026-07-14) — impact re-checked:**

- **Vocabulary now binds future ADRs.** "System goals" is retired for **the five
  guarantees**; practitioner↔system is an **engagement**, not a relationship; the
  system is the **instrument of representation** beneath the practice loop. Per-surface ADRs
  and the O197 goal-allegiance field should say "domains / guarantees." No built
  ADR/code uses the old terms — cost is zero.
- **Subordination strengthened, not changed.** An instrument is definitionally
  subordinate — the principle stops being an assertion to police and becomes a frame
  property. Acceptance-criteria force (no forced workflows, no system-centric
  metrics) is unchanged.
- **Trust Activity question rephrased** ("is the instrument holding its
  guarantees?") — Scope v2 already updated; the future Trust bundle ADR inherits the
  wording. ADR-502 subsumption pressure unchanged.
- **Catch-up loop re-housed, not removed** — now a subordinate maintenance loop
  keeping the representation true, inside the one practice loop. The loop-mechanics platform
  ADR obligation (§3) is untouched; only its framing sentence changes.
- **Origin-polemic capture** (administration/documentation critique, "by therapists,
  for therapists") = positioning only; no architectural surface.

## 2. Product_Scope_v2.md — impact: biggest surface, concentrated on 4 ADRs

ADR-405 survives untouched — it deliberately committed mechanism only and deferred catalogue to "the product-scope doc"; v2 just swaps which doc that is. Catalogue additivity holds; multiple `activityBar.items` per bundle already legal. But:

**ADRs under supersession pressure (UI half only):**

| ADR               | Pressure                                                                                                                                                                                                                                 | Severity                                                     |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **505 Practice**  | Practice splits 3 ways: Caseload (roster/console) + Intake (workflow layer promoted out) + Today (attention lens promoted out). Data model (`patients` + adjuncts) untouched, but 505's Activity identity dissolves.                     | largest built-surface migration                              |
| **507 Schedule**  | Activity demoted entirely — grid/agenda → Today, session-plan half → Plans, booking → contextual action. Provider plumbing (tables, sync, broker) explicitly survives. 507 becomes a data-plane ADR wearing a dead UI hat.               | needs an amendment note when migration scheduled             |
| **509 Migration** | Bulk migration MODE currently lives in the _Schedule_ bundle surface; v2 rehomes it inside **Intake** Activity. Nobody has written this relocation down — it's implied but unowned.                                                      | flag as a migration OI                                       |
| **502 Audit**     | §"Visibility to the user" anchors Audit Viewer as an Activity (the only one ADR-405 names!). Trust _widens_ it (custody posture, proof-debt, backup state). Anchor still satisfied, but the Trust bundle ADR should formally subsume it. | low, but it's the one Activity architecture itself committed |

**508 Sessions → Encounters** = rename only; Client Meeting untouched.

**Stale registry rows** (all still point at V1): **O72** (resolved-by pointer → Product_Scope.md), **O197** (remaining list says "Sessions, Schedule, Assessments, Planner, Catalog" — three of those no longer exist as Activities), **O421** (direction resolved: Payments unconditional; row still says "tracked, not committed"). Also **O464/P6** note says "P6 likely stands up first projecting Activity" — that Activity now has a name: **Today**.

**Second-order platform questions v2 raises (unflagged anywhere):**

1. **Bundle-id stability.** v2 gives indicative ids (`ru-soam.caseload`, `ru-soam.today`…). But bundleId is load-bearing: `view://` origins, manifest `ownedTables`, tab dedup, `targetBundleId` resolution, context keys. Renaming `ru-soam-practice` → anything ripples through all of it. Cheap answer: **keep bundle ids stable, migrate Activity items/labels only** — one bundle may contribute multiple activity-bar items (405 allows it), so Practice bundle could ship Today+Intake+Caseload items without a single table or origin moving. Worth deciding _before_ the first per-surface ADR.
2. **Today = the first true cross-bundle projection surface.** Proof-debt + unconfirmed sessions + safety flags + agenda spans 3+ bundles' data. That's O464's projection machinery _plus_ a cross-bundle read model no ADR covers yet (O69's ghost, partly answered by ADR-504/506 `record.*`, but Today reads Sessions + Schedule + future Payments too). The Today bundle ADR will be the forcing function.
3. **Library's cloud-update channel = a new architectural surface.** "Ship-and-update from our cloud" is PHI-free so no ADR-301 conflict — but it's a new content-distribution path (brokered networking ADR-203, or riding the ADR-204 update channel, or a new scheme). No ADR covers first-party content assets updated out-of-band. Needs one.
4. **Trust Activity vs core-shell Recovery item (ADR-405/306).** Trust shows "backup/recovery state"; Recovery is a core-shell surface for the flows themselves. Boundary (read-only posture vs privileged flows) is intuitive but should be stated in the Trust bundle ADR — Recovery is deliberately _not_ bundle-grantable.

## 3. goals-and-loops-discovery.md — impact: one big new platform ADR owed + PHI-model refinement

The conceptual center; its architectural fallout is mostly _future obligations_, correctly deferred:

- **Loop mechanics = a new cross-Activity platform ADR** (Scope v2 already says so). Contents: expectation templates, claims, proofs, proof-debt, snooze/exception (forced-complete + forced-reality pair). Every one of those is a **new persisted shape** → per your own convention, ADR or OI required before build. This will be the biggest platform ADR since 506.
- **Expectation-vs-provided = a new residency class question.** Expectation-side content (templates, checklists, goal definitions) is PHI-free by construction → belongs in `local-store.db` (operational) or even cloud-updatable, while everything person-linked stays `protected`. ADR-452's split gets a third category: _shippable content_. §6 is explicit that goal domains do NOT slice PHI — `protected` stays universal for person-linked data. Good — no erosion of ADR-301.
- **Graded disclosure scopes feed O499 directly.** ADR-313's Safety-Score rebuild gains a principled minimum-necessary model (accountant→Financial, referral→Clinical subset). O499's row should eventually cite §6 — right now it only knows the write-half/opt-in framing.
- **Safety = interrupt-class, no-snooze** — constrains Today's design (interrupts can't be dismissed like proof-debt) and retroactively validates the built Practice risk-banner pattern.
- **Subordination + Authority = soft acceptance criteria** for all future ADRs (no forced workflows; migration door must never gate) — subordination now definitional under the instrument frame (§1). These belong in the vision doc (they are) and, I'd argue, one line in the Architecture Log.

## 4. Intake / onboarding discoveries — impact: the case entity is the sleeping giant

- **Case = the largest pending data-model change since the record spine.** Built `patients` = persons; case is a NEW canonical entity: case table + case-person membership + case-scoped artifacts (engagement contract, commitment event, intake run/terminals, case history). Extends `record.*` under ADR-504→506 (Scope v2 flags this). Ripples nobody has written down:
  - **Erase cascade (O490):** `store.eraseSubject` iterates on `keyColumn='patient_id'`. Case-scoped tables keyed by `case_id` won't match — DPDP erase of a person must resolve person→cases→case-scoped rows (and decide what erasing one member of a couple case means). The eraseSubject design's column-absence auto-exemption becomes a _hazard_ here, not a feature.
  - **`client_meeting` (ADR-508)** is patient-keyed; intake doc §1b.6 says case history (sessions, notes, in-engagement assessments) is _case_-scoped. A person in two concurrent cases has two case histories — patient-keyed meetings can't express that. ADR-508 unaffected today, flagged for when case lands.
  - **Within-case confidentiality (§1b.8)** correctly exported to O501 Notes — but it means the Notes ADR must know about cases. Sequencing: **case entity design should precede or accompany O501**, or Notes bakes in patient-only keying.
- **Intake spine = new state machine, new shapes:** queue items (contact person ≠ subject of care — two roles per item), run status, 5 terminals + exit-node dimension, task threads with `{case,person}` scope, commitment events with pluggable evidence. All → the Intake bundle ADR.
- **ADR-509 reconciliation — mild, real tension.** 509 committed migration as an independent MODE, _not_ a branch of the per-event funnel; intake doc §4b says migrated clients = queue items entering deep in the funnel, "confirms the common-queue model." Reconcilable (the mode _builds/pre-positions_ queue items; 509 §92 already anticipated a shared conceptual queue) — but the onboarding doc's own §6 says queue mechanics must be re-derived, not assumed. That queue-mechanics topic is now the designated resolver; ADR-509's owed §4b-adjacent amendment should wait for it.
- **Practice profile = credentials + service catalogue** → new persisted config shape + a natural home: ADR-403/405's **Onboarding core-shell item** (empty-workspace surface) already exists as the first-run mount point. Topic 3 (first-run) has an architectural landing zone waiting.
- **BYOF ingestion:** CSV import + doc attachment = local-only, zero new trust-zone crossings — architecturally free. The template _library_ half is the same cloud-content channel as Scope-v2 point 3 above (one ADR covers both).
- **ADR-416 snippet engine** (Phase 8, 0%, leapfrogged): Library's row includes "snippet content" — when the Library bundle ADR lands, decide whether 416 is subsumed or stays a platform primitive Library consumes.

---

## Consolidated: what is actually owed, in rough order

1. **Registry hygiene (cheap, now):** update O72/O197/O421 rows; add O464 note (Today = first projecting Activity); raise the ADR-509-migration-rehome OI.
2. **Decision before first per-surface ADR:** bundle-id stability posture (recommend: ids stable, Activity items migrate).
3. **Per-surface bundle ADRs** (already queued): Today, Intake, Plans, Trust, Payments — Today's will force the cross-bundle read-model question; Trust's must state the Recovery boundary + subsume ADR-502's anchor.
4. **Case-entity design** — schedule before/with O501 Notes; must answer the erase-cascade keying question.
5. **Loop-mechanics platform ADR** — when first built (likely with Today or Plans).
6. **Cloud content-distribution ADR** — before Library ships templates.
