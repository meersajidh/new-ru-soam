## Remaining items — all trigger-gated

**Trigger A — a 2nd domain module exists (ADR-506 follow-ups):**

- **O445** — full FK/dependency-graph resolution (partial done; full graph waits for module #2)
- **O441** — iframe-relay `trustClass` tag
- **O451** — cap-transport topology (Main-broker vs direct renderer↔host MessagePort)
- **rung-H** — 2nd untrusted (third-party) Bundle-Host

**Trigger B — a projecting Activity exists (Schedule/Sessions, O197):**

- **P6** — Practice projection cards (next-session/last-note/scores/goals/payment/agenda) — currently mock, source-pilled
- **O464** — Practice overlays (`patient_overlay`/`setOverlay`) — deferred to P6 with projections

**Trigger C — Cloud Backend zone exists (Phase 11/12):**

- **O309a** — server ID-token verify / RS256 JWT / refresh-token storage
- **O309b** — licensing / subscription JWT
- **O310a** — calendar provider plugin (ADR-310, Flow-A)
- **O23** — sync conflict resolution (undecided)

**Trigger D — a real consumer needs it (Practice deferred):**

- **O461** — protected-blob per-object DEK envelope + framed streaming (needs large-payload / rotation consumer)
- **O462** — in-app document _viewing_ (decrypt-to-memory render; P3 shipped attach-only)
- **O463** — protected-blob orphan-sweep (crash-window reconciliation)
- **O455** — Overview entry-intent mode-select (view-mode persistence done; entry-intent picker deferred)
- **aspects.html section-split** — view-layer tech-debt sibling of O466 (not started)

**Trigger E — command must fire for an inactive bundle:**

- **O430** — lazy-activate-on-command (re-eval'd today: depends on `onCommand`/`onEvent` wiring **O134/O135**, no consumer)

**Trigger F — scheduled / dated:**

- **O467** — remove temporary `minimumReleaseAgeExclude` ~2026-06-15 (cloud routine `trig_01Dz5C13nea9UVwwDjSt6unS` armed)

**Trigger G — other deferred infra:**

- **O194/O195/O196** — `basebench` base-package extraction + Layer-field sweep + brand rename (ADR-106 Phase A leftovers)
- **O26** — KEK-rotation re-wrap (O452 deferred)
- **prod PHI migration** out of `local-store.db` (O452 deferred)
- **O88** — command `audit`-field shape; **O87** — command arg schema (ADR-406 deferred)

**Biggest real next thread:** P6 (Trigger B) — but it stands up a _projecting_ Activity first (Schedule/Sessions, O197), which is net-new product surface, not a loose-thread cleanup. That's where "sweep" ends and "next feature" begins.
