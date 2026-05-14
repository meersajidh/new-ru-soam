# Implementation Plan

**Status:** Draft
**Date:** 2026-05-13
**Owner:** Architecture

This document slices the committed ADRs (100 / 200 / 300 / 400 / 500 ranges) into feature-sliced implementation phases. Each phase is a dogfoodable artifact, not just a code drop. Phases are sequential by default; cross-cutting workstreams run alongside.

## Principles

1. **Trust zones before features.** Main / Renderer / Bundle Host process boundaries exist before any product surface lands.
2. **Mechanism before product.** No first-party product bundle ships until the host, view hosting, capability spine, crypto, and audit are real.
3. **Each phase produces a visible dogfoodable artifact.** Not "library complete"; "you can open the app and see X work".
4. **PHI gated behind crypto.** No table that may hold PHI gets a writer before KEK + at-rest encryption land.
5. **Audit before data.** The audit log spine exists before the first capability writes anything worth auditing.

## Phase 0 — Baseline verification

**Goal:** confirm Electron + React SPA + TanStack scaffolding holds.

**Deliverable:** `pnpm dev` opens an empty Electron window; React mounts; TanStack Router + Query initialised; type-check + lint pass.

**ADRs:** ADR-101, ADR-201

**Open items:** none binding.

**Exit:** hot-reload Renderer; Main starts cleanly; CI runs the build.

## Phase 1 — Process skeleton + IPC contract

**Goal:** three processes alive. Main ↔ Renderer typed IPC. Bundle Host = Node process spawned on demand, no real work yet.

**Deliverable:** typed IPC channel with request/response + event semantics; Bundle Host spawn / teardown lifecycle; crash semantics (host crash logged, Renderer unaffected).

**ADRs:** ADR-101 (trust zones), ADR-102 (IPC), ADR-201 (no `<webview>`), ADR-410 (host process model).

**Open items:** O64 (host spawn timing), O66 (host crash UX), O67 (host log routing).

**Exit:** kill Bundle Host externally → Renderer survives; log shows clean teardown; IPC remains typed end-to-end.

## Phase 2 — Workbench shell + Parts + theming

**Goal:** workbench renders empty slots. No bundles, no editors. Theme tokens flow.

**Deliverable:** TitleBar / Banner / Middle (five slots) / StatusBar. LayoutService + ThemeService + ServiceRegistry + `useService` hook. Default Dark + Default Light themes load. Two-region StatusBar with one placeholder entry per region.

**ADRs:** ADR-401, ADR-402, ADR-409, ADR-412, ADR-413.

**Open items:** O57–O63, O96–O100, O104–O110.

**Exit:** can toggle Primary Side Bar / Panel / Aux Side Bar via keyboard; theme swap is live with no flicker; ServiceRegistry resolves typed identifiers.

## Phase 3 — Command + context-key + keybinding spine

**Goal:** command-driven shell with palette, before any feature uses commands.

**Deliverable:** CommandService (Renderer mirror + Main registry), ContextKeyService with the VSCode-style expression evaluator, KeybindingService. Command Palette opens. About six platform commands wired (`workbench.toggle*Bar`, `workbench.openSettings`, `workbench.openCommandPalette`, etc.).

**ADRs:** ADR-406, ADR-407.

**Open items:** O86–O95.

**Exit:** `Ctrl+Shift+P` opens the palette; when-clauses gate visible commands; reserved-namespace check rejects bad registrations; PHI-adjacent context keys never appear in any persisted payload.

## Phase 4 — Workspace concept + lifecycle

**Goal:** Workspace = Entity. Open / close / lock lifecycle reaches services that care.

**Deliverable:** WorkspaceService, workspace open / close events, `workspace.entityId` context key, persisted-layout reload on workspace open, lock-state stub (real KEK lands in Phase 8).

**ADRs:** ADR-403; ADR-501 referenced but not implemented.

**Open items:** O53–O56, O98 (lifecycle reset matrix).

**Exit:** open a mock workspace → context keys emit; layout persists across reopen; close → all workspace-scoped services reset per the matrix.

## Phase 5 — Editor area + resource URIs

**Goal:** editor mechanism lands before any concrete editor type.

**Deliverable:** EditorService, tabs, splits (nested grid in the central column), `editors` contribution-point loader (still no bundles), one built-in placeholder editor that takes a `placeholder://...` URI and renders text. Read-only editor surface verified.

**ADRs:** ADR-404.

**Open items:** O73–O77.

**Exit:** open two placeholder editors side-by-side; drag tab between groups; close all → empty editor area placeholder shows.

## Pre-Phase-6 gate — 100-range amendment pass

Before Phase 6 starts referencing the wrong text, apply the deferred amendments to the 100-range:

- **ADR-101** — add Bundle Host as the fourth trust zone (alongside Main / Renderer / web-trust).
- **ADR-103** — capability implementations may live in the Bundle Host; routing through Main.
- **ADR-104** — manifest read by Main, registry sent to Renderer at boot.
- **ADR-105** — `activate(...)` runs in the Bundle Host.

This is a documentation-only pass; no code changes. It is a hard gate, not a side task.

## Phase 6 — Bundle Host real: manifest, activation, capabilities

**Goal:** Bundle Host runs real bundle code end-to-end (no UI yet). Capability calls route Renderer → Main → Host and back.

**Deliverable:** manifest reader in Main, registry pushed to Renderer at boot, activation triggers spawn + `activate(...)`, capability binding + invocation. Test bundle: registers one capability (`echo.ping`); Renderer calls it via `useCapability`.

**ADRs:** ADR-103, ADR-104, ADR-105, ADR-410.

**Open items:** O65 (host hardening surface), O68 (activation timing).

**Exit:** test bundle echoes Renderer call; bundle crash is isolated (workbench survives); deactivation tears down the host process cleanly.

## Phase 7 — View hosting: `view://` + iframe + bridge

**Goal:** bundles render UI in a sandboxed iframe.

**Deliverable:** `view://` protocol handler in Main, sandbox + CSP applied, bridge surface (`bindCapability`, lifecycle events, theme snapshot, resource snapshot), theme propagation to the iframe document root. Test bundle ships a view that calls its own capability through the bridge.

**ADRs:** ADR-411.

**Open items:** O78–O85.

**Exit:** test bundle view opens in the Editor Area and in the Panel; theme swap propagates to the iframe; the iframe cannot reach `window.soam`, the renderer ServiceRegistry, or `require('electron')`.

## Phase 8 — Crypto + KEK + workspace lock / unlock

**Goal:** PHI gate lands before any patient / session schema goes near disk.

**Deliverable:** KEK derivation, workspace unlock UI, KEK relock command, encryption-at-rest primitives (key handling, envelope format, table-level encryption hooks ready for Phase 9), "KEK locked" StatusBar entry live, PHI capability calls refused while locked.

**ADRs:** ADR-301 (crypto), ADR-303 (KEK / recovery; recovery UX lands Phase 11), ADR-403 (lock state).

**Open items:** crypto-domain open items (300-range; tracked in the ADRs).

**Exit:** force-restart → must unlock to access PHI; relock works mid-session; cold storage of the still-empty PHI tables shows ciphertext only; lock state is a context key consumed by when-clauses.

## Phase 9 — Local Store + audit log + TanStack Query data wiring

**Goal:** capability-backed data flow real; audit spine in place; encryption-at-rest applied from the first write.

**Deliverable:** SQLite-backed Local Store in Main, change-event capability, TanStack Query invalidation bridge, one demo capability that reads/writes a non-sensitive table (e.g., user preferences). Audit log capability: append-only store, redaction discipline (no PHI-adjacent context keys in audit payloads), every capability invocation that should audit, does.

**ADRs:** ADR-302 (Local Store), ADR-403 (workspace settings cascade), ADR-407 (PHI-adjacent key scrubbing), ADR-412, ADR-502 (audit infrastructure; viewer bundle ships Phase 12).

**Open items:** O55, O97, O100, O95 (context-key scrub list).

**Exit:** prefs survive restart; mutation invalidates query; demo proves the pipeline without touching PHI; audit table records every audited capability call; redaction verified by test.

## Phase 10 — Sync queue + cloud mirror

**Goal:** local-first writes propagate; conflict policy committed.

**Deliverable:** outbound sync queue, server-side mirror endpoint, conflict resolution per ADR-302 policy, sync-state StatusBar entry.

**ADRs:** ADR-302, ADR-304 (sync), ADR-305 (cloud transport).

**Open items:** 300-range sync items (tracked in those ADRs).

**Exit:** offline edit → reconnect → mirror converges; conflict surfaced in UI; cloud receives ciphertext only (structural enforcement per ADR-301).

## Phase 11 — Recovery + Onboarding + Settings surfaces

**Goal:** three of the four core Activity Bar items real (Recovery, Onboarding, Settings). Bundles surface lands here as the fourth.

**Deliverable:** Settings editor (built-in, not a bundle), Recovery flow (KEK recovery codes), Onboarding flow, Bundles surface (list installed, enable / disable, view manifest).

**ADRs:** ADR-405, ADR-303 (recovery UX).

**Open items:** O69–O72.

**Exit:** fresh install → Onboarding → workspace created → KEK set → recovery codes captured → Settings reachable; existing install → Recovery flow restores access from a recovery code.

## Phase 12 — Audit Viewer bundle (first first-party bundle)

**Goal:** dogfood the whole stack with the only first-party bundle anchored in the ADR set (ADR-502).

**Deliverable:** Audit Viewer ships as a bundle (not built into the shell). Bundle manifest, activation, view hosted in the Primary Side Bar or Editor Area (decision in the bundle's design doc), reads audit store via capability, respects redaction.

**ADRs:** ADR-502, ADR-405, ADR-411.

**Open items:** any audit-viewer-specific items raised when the bundle is designed.

**Exit:** Audit Viewer activates on demand, runs in the Bundle Host, renders in a sandboxed iframe, reads only through capabilities, has no privileged path back to the renderer.

## Cross-cutting workstreams

These run alongside the phases, not in sequence with them.

### Product-scoping doc (Open Item O72)

Owner: product, not architecture. Must land **before Phase 13** (first product bundle beyond the Audit Viewer). Defines the first-party bundle catalogue (Patients / Sessions / Calendar / Tasks / Library / etc.) with anchored sources for each.

### Theme token catalogue (Open Item O107)

Grows phase by phase as new surfaces appear. Freeze for v1 before any third-party theme bundle is invited in.

### Documentation discipline

Each phase that lands new mechanism updates the corresponding ADR's Open Items list — items resolved are struck through; new items uncovered are appended. ADRs remain the source of truth; the implementation plan does not duplicate their content.

### Security review cadence

After Phase 7 (view hosting), Phase 8 (crypto), Phase 9 (audit), and Phase 10 (sync), a focused security pass on the just-landed surface. PHI never reaches cloud in plaintext is the load-bearing invariant; each pass re-verifies it structurally, not by inspection.

## What this plan deliberately does not cover

- Specific product features (Patients, Sessions, Calendar, etc.). Owned by the product-scoping doc.
- Multi-tenancy / clinic expansion. Deferred to post-503 per ADR-501.
- Telemetry, error reporting, update channel. Drop into a later phase when the feature surface stabilises.
- The exact engineering breakdown of each phase (sprints, tickets, owners). Belongs in the project tracker, not in architecture documentation.
