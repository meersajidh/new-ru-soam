# Testing Guide

**Status:** Active guideline
**Date:** 2026-07-09
**Origin:** O517 (automated-test foundation). This guide is the durable record of the Vitest setup and the test-tier policy.

---

## Run

```bash
pnpm test          # vitest run — the behavior gate (all projects)
pnpm test:watch    # vitest — watch mode
```

`pnpm test` is wired into CI (the "Run tests" step in `.github/workflows/dependabot_ci.yml`), **separate from** the type gate.

## Two gates, don't conflate them

- **`pnpm compile` = the TYPE gate.** `tsc -b` enforces project-refs, `erasableSyntaxOnly`, `verbatimModuleSyntax`. Keep it.
- **`pnpm test` = the BEHAVIOR gate.** Vitest transforms with esbuild, which does **not** enforce any of the above. A green Vitest run is not a type-check. Two separate CI jobs, by design.

## Config

`vitest.config.ts` — **projects** mode mirroring the pnpm workspace: one project per package that holds tests (`desktop`, `editor`, `domain`, `view-kit`). `environment: 'node'` everywhere (no jsdom yet — Tier-2 DOM tests aren't in scope). Tests are **colocated** `*.test.ts` beside the unit they cover.

Two pre-existing store tests (`electron/main/store/{backup,schema-gate}.test.ts`) use Node's built-in `node:test` runner (driven by the `apps/desktop` `test` script), not Vitest — excluded in the config until a deliberate conversion.

## Test tiers (the pyramid)

| Tier | What | Status |
| ---- | ---- | ------ |
| **T1 — pure logic** | Highest-bug-density pure functions, tested directly. | ✅ Done |
| **T1b — invariant guards** | Encode ADR invariants so a regression trips CI (highest ROI for a PHI app). | ✅ Done |
| **T2 — component / DOM** | Presentational primitives under jsdom. | ☐ Deferred (needs jsdom; unblocked now that primitives are extracted into `@basebench/ui`). |
| **T3 — E2E** | Playwright + `_electron` — iframe/CSP/IPC, KEK-at-rest, cross-process. | ⏸ Separate deferred track. |

**T1 covers** (pure units, extracted where needed): context-key `when-clause` eval, keybinding serialize, store-write predicate validation (equality-AND + PRAGMA col-allowlist + non-empty guard), schedule classification (4 grid classes), migration dedup (union-find), sessions provider-sync (derive/collect/composite/orphan/reconcile — field-partitioned, no-LWW), cloud rotation-delay clamp, Practice attention/intake read-derivation.

**T1b covers** (real gates, not mocks): registry PHI-by-`trustClass` + CQRS-kind + PHI-lock (drives the real `invokeCapability`); `account_id` never client-asserted + telemetry events PHI-free shape; telemetry PHI-free construction.

> **Covered-by-construction, not by a unit test.** Two ADR-418/301 invariants are guaranteed *structurally* — a unit test would assert a mock, not the invariant:
> - **`trustClass` never self-declared.** The host→Main wire (`host.consume.invoke`) carries `bundleId` only; there is no `trustClass` field to send. Main resolves it from its own `activated`-bundle record. The registry test proves the gate trusts only the identity Main supplies.
> - **keys / ciphertext Main-only.** Enforced by the residency split (PHI tables in the KEK-gated protected store) + the store-write ownership/predicate gate. The crypto / KEK-at-rest layer is cross-process real-Electron → T3, not a Vitest unit.

## Writing a test

- Colocate: `foo.ts` → `foo.test.ts` beside it.
- Test a **pure unit**. If the logic lives inside a `registerCapability` handler or an IPC path, **extract** the pure core first (that extraction is itself the win) rather than mocking a store to observe it.
- **Don't fake it.** A test that asserts its own mock proves nothing. If an invariant is structural, document it covered-by-construction (above) instead of writing a hollow test.
- Node env only. Anything needing a DOM is T2 (deferred).
