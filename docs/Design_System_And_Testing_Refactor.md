# Design-System Organization + Test Automation — Refactoring Scope & Plan

**Status:** Draft
**Date:** 2026-07-06
**Owner:** Architecture
**Tracking IDs:** O516 (design-system organization), O517 (automated-testing foundation); builds on O194 (base-pkg extraction).

This is a **living tracking doc**. Check items off as they land. Two workstreams (Lane A design system, Lane B testing) share one foundation step and one convergence point — sequencing is the whole point of this document.

---

## 1. Why (motivation)

The codebase is at ~85% platform / ~35% product. Two forces make now the right time to invest in structure *before* building more clinical surface:

1. **Design-system entropy.** Shared UI primitives (`<Icon>`, `usePopover`, `ResizeHandle`, RuEdit, view-kit fragments) are scattered, not owned by a boundary. Each new Activity re-derives conventions. Left alone this compounds.
2. **Zero automated tests.** Verification today = `pnpm compile` + `lint` + manual dogfood. Correctness-critical pure logic (sync merge, migration dedup, PHI invariants) has no regression net. Bugs surface in dogfood sessions months late, or not at all.

**Goal:** organize the design system into an owned boundary, and stand up an automated-test foundation with CI teeth — sequenced so each unblocks the other.

---

## 2. Non-goals (explicitly rejected / deferred)

- **Storybook — rejected for now.** Poor fit for this architecture: two render surfaces (`app://` shell + sandboxed cross-origin `view://<bundleId>` iframes under strict CSP), CSS-class-axis theming (palette × luminance × font-set, ADR-413) rather than prop-driven variants, and pervasive DI/bridge coupling (`window.soam`, `window.soamView`, registry singletons) that Storybook can't reproduce without heavy per-story mocking. Storybook *showcases* a design system; it does not *create* one. Reconsidered only later, scoped to the extracted view-kit package, if isolated interaction-testing ever justifies it (see Tier-3 track).
- **Tier-3 E2E (Playwright + `_electron`).** Iframe / CSP / `view://` origin / IPC round-trip / PHI-at-rest behavior is cross-process, cross-origin, real-Electron — Vitest cannot touch it. Separate track, later. Listed here only so its boundary is explicit; not scheduled in this doc.
- **jsdom / component-DOM tests before extraction.** Gated behind Lane A step 2 (see convergence point). Doing them earlier = full-platform mocking, high friction, mocks drift from truth.

---

## 3. Scope

### Lane A — Design-system organization (O516, builds on O194)

- **A1 Inventory** — enumerate current UI primitives; classify genuinely-shared vs one-off. Output = a table of candidates with current location + proposed home.
- **A2 Extract** — pull shared primitives into an owned boundary (`@ru-soam/view-kit` and/or `basebench` base pkg per O194). **Requires ADR** — new module boundary (range 400–499). One-way dependency, lint-enforced, consistent with ADR-106 base/domain split.
- **A3 Dev gallery route** — dev-only TanStack route (e.g. `/dev/design-system`) rendering extracted primitives in the *real* renderer: real theme/DI/fonts, real Tailwind, live axis toggles (palette × luminance × font-set). Truthful visual review in-context — the 80% of Storybook value at ~1 day cost.

### Lane B — Automated-test foundation (O517)

- **B0 Vitest infra** — Vitest *projects* mode mirroring pnpm workspaces; `environment: 'node'` default (no jsdom yet); colocated `*.test.ts` (existing convention). One proof test. Wire `vitest run` into the existing dependabot CI gate beside type-check + lint.
- **B1 Tier-1 pure-logic tests** — highest bug-density pure functions first:
  - Sync merge (field-partitioned, no-LWW, orphan-on-delete)
  - Migration dedup (union-find `listDuplicates`, alias matching)
  - Classification (4 grid classes)
  - Attention lens / Intake checklist (pure read-derivation)
  - Store predicate validation (equality-AND, PRAGMA col-allowlist, non-empty-predicate guard)
  - context-key expr eval, keybinding resolution, CQRS `cap.kind_mismatch` gate
  - Cloud token math (JWT / refresh rotation, sans network)
- **B2 Tier-1b invariant guards** (highest ROI for a PHI app — encode ADR invariants so regressions trip CI):
  - PHI caps structurally denied on untrusted host (ADR-418)
  - `account_id` never client-asserted; telemetry events PHI-free shape (ADR-311/312)
  - `trustClass` platform-assigned, never self-declared (ADR-418)
  - keys / ciphertext Main-only (ADR-301/506)

### Convergence — Tier-2 component/DOM tests

After **A2** lands: extracted presentational primitives test clean (jsdom, minimal mocks). Gallery route (A3) + Tier-2 tests hit the same units from two angles — visual + assertion. This coupling is *why* extraction precedes component testing (not just Storybook).

---

## 4. Sequence

```
0. B0 Vitest infra + CI            ← do FIRST (foundation, cheap, unblocks all)
│
├─ Lane A:  A1 inventory ── A2 extract (ADR) ── A3 gallery route
│                               │
│                               ▼ (after A2)
│                          Tier-2 component/DOM tests
│
└─ Lane B:  B1 Tier-1 pure logic ── B2 invariant guards
                (runs parallel to Lane A — no dependency)

  ...later, separate track: Tier-3 E2E (Playwright + _electron)
```

Lane A and Lane B are independent up to the convergence point. Tier-1/1b tests do **not** wait on extraction — they cover domain/platform logic, not UI.

---

## 5. Trackable checklist

| Step | Item | Depends on | ADR? | Status |
| ---- | ---- | ---------- | ---- | ------ |
| B0 | Vitest projects config + node-env + colocated `*.test.ts` | — | no | ☑ Done (`vitest.config.ts`, projects: desktop/editor/domain/view-kit, node env) |
| B0 | One proof test (`when-clause` parser/eval — see note) | B0 config | no | ☑ Done (`when-clause.test.ts`, 10 cases, green) |
| B0 | Wire `vitest run` into CI gate (beside compile + lint) | B0 config | no | ☑ Done (`dependabot_ci.yml` "Run tests" step) |
| A1 | Primitive inventory table (shared vs one-off) | — | no | ☐ Not started |
| A2 | ADR: view-kit / base-pkg module boundary | A1 | **yes (400s)** | ☐ Not started |
| A2 | Extract primitives into owned boundary | A2 ADR | — | ☐ Not started |
| A3 | Dev gallery route (`/dev/design-system`) | A2 | no | ☐ Not started |
| B1 | Tier-1 pure-logic tests (fan-out) | B0 | no | ◑ In progress — done: context-key `when-clause`, keybinding serialize (`chordFromEvent`/`isModifierEvent`), store.write predicate core (extracted → `store-write-validate.ts`). Remaining: migration-dedup, sync-merge, classification, cloud token math, attention/intake |
| B2 | Tier-1b invariant-guard tests | B0 | no | ☐ Not started |
| C | Tier-2 component/DOM tests | A2 + B0 | no | ☐ Not started |
| — | Tier-3 E2E (Playwright + `_electron`) | — | tbd | ⏸ Deferred (separate track) |

> **B0 proof-test note.** Target switched from sync-merge / migration-dedup to
> the context-key `when-clause` parser/evaluator (`apps/desktop/src/platform/context-key/when-clause.ts`).
> Reason: both original candidates live *inside* `registerCapability` handlers in
> bundle `.mjs` files (not exported, only observable through store-write I/O) — a
> "proof" test there would exercise a store mock, not a pure unit, and needs
> extraction first. `when-clause` is a pure, dependency-free, already-exported
> unit and is itself on the B1 list (context-key expr eval). Migration-dedup
> extraction+test moves to B1, where the extraction is appropriate anyway.

---

## 6. Constraints & risks

- **Vitest ≠ type gate.** Vitest uses esbuild transform, not `tsc` — it will *not* enforce `erasableSyntaxOnly` / project-refs / `verbatimModuleSyntax`. Keep `pnpm compile` as the type gate; Vitest is the behavior gate. Two separate CI jobs.
- **A2 is an ADR-gated architectural change** (new module boundary / trust-zone-adjacent). Do not extract before the ADR is written and accepted. Reconcile with O194 (base-pkg extraction) and O195/O196 (Layer-field sweep, brand rename) — the extraction may partially subsume or unblock those.
- **Node-env only until convergence.** Introducing jsdom before A2 pulls in the exact heavy-mock friction this sequence is designed to avoid.
- **Don't let Vitest and dogfood diverge on truth.** Tier-1/1b assert on pure functions (safe). Anything touching bridges/iframes/CSP stays dogfood/E2E — never fake it in a unit test and call the invariant "covered."
- **B1 is mostly extract-then-test, not just test.** Discovered while landing B1: the high-value pure logic (store-predicate, migration-dedup, sync-merge, cloud token math) is embedded inside `registerCapability` handlers / service classes / bundle `.mjs`, not exported. Each unit needs a *behavior-preserving extraction* of its pure core into a dependency-free module first (no ADR — same package, not a boundary change), then a colocated test. `when-clause`/keybinding were the rare already-pure exceptions. Pattern established by `store-write-validate.ts` (extracted from `store-write-cap.ts`): move verbatim, keep error strings/codes identical, re-import into the cap, re-export any types external modules consumed. Verify: vitest + `pnpm compile` + existing node:test store suite all green.

---

## 7. Related

- O194 — extract base pkg (`basebench`) — Lane A2 reconciles with this.
- ADR-106 — base/domain boundary the extraction sits inside.
- ADR-413 — theming/icons (class-axis) — why gallery route beats Storybook.
- ADR-418 / ADR-301 / ADR-506 — the invariants B2 encodes.
- `docs/Guides/styling-system.md` — styling rules the design system must honor.
