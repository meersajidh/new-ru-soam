# Workspace concept: workspace = Entity

**ID:** ADR-403
**Status:** Accepted
**Date:** 2026-05-13
**Supersedes:** —
**Superseded by:** —
**Related:** ADR-101, ADR-102, ADR-301, ADR-302, ADR-307, ADR-401, ADR-405, ADR-407, ADR-501, ADR-503 _(proposed)_

## Context

VSCode's `Workspace` is a load-bearing concept: it is the unit of configuration, trust, state, recents, settings overrides, and activation scope. A folder (or a `.code-workspace` file) opens, and everything else — extensions, file watchers, language servers, debugger configs, search index — scopes to it.

The workbench design needs an equivalent. Without one, the same scoping concerns that VSCode collected under `Workspace` would scatter across the codebase: each feature would invent its own "current thing", settings would have no clear home, recents would not exist, and the eventual Clinic-tenancy case (ADR-503) would require retrofitting.

Ru-soam is not a code editor; its underlying objects are not files in a folder. The workspace concept therefore needs to map to a ru-soam-native boundary, not a borrowed one. The tenancy ADRs (501 / 503) have already named that boundary: the **Entity**.

This ADR commits the mapping: one workspace = one Entity. It also fixes the scope vocabulary the rest of the workbench will use (active patient, active session, etc.) so context keys (ADR-407) and contribution `when` clauses have a defined input set.

## Decision

### Workspace = Entity

The platform's workspace is the Entity (ADR-501). Opening a workspace is opening an Entity. In MVP every Entity is Individual; in ADR-503's Clinic case the same shape holds, just with different Entity contents.

A workspace is therefore:

- A boundary of **ownership** — Operational and Clinical data inside the workspace belong to its Entity (per ADR-302).
- A boundary of **capability scope** — capabilities bind entity-scoped by default (per ADR-501).
- A boundary of **configuration** — workspace settings override user defaults; user defaults override platform defaults.
- A boundary of **state** — what was open last, layout, recently viewed records, pinned items.
- A boundary of **audit attribution** — ledger entries (ADR-502) carry the workspace's Entity.

It is **not** a boundary of trust. The PHI boundary (ADR-301) is enforced at the process boundary, not at the workspace boundary; switching workspaces does not change which code is privileged.

### One workspace per window

A workbench window hosts exactly one workspace. MVP has exactly one Entity, so a window hosts that one Entity. Multi-Entity practitioners (post-ADR-503) open a second window for a second workspace, or use an in-shell workspace switcher (see Open Items).

This matches VSCode's per-window discipline and keeps state machinery simple. A bundle does not have to choose "which workspace am I scoped to?" — it is scoped to its window's workspace, period.

### What a workspace carries

A workspace has the following persistent state:

- **Workspace settings** — per-Entity overrides on platform / bundle configuration. Stored in Local Store under the Entity's namespace. Cloud-mirrored as Operational data if the user has cloud sync on.
- **Layout state** — which side bars are open, panel sizes, last-opened views. Stored locally; not cloud-mirrored by default (device-specific; see Open Items).
- **Recent items** — recently viewed patients, sessions, records. Stored locally, not synced (device-local privacy preference, see Open Items).
- **Active scope** — see next subsection.

These are scoped to the workspace; switching workspaces (post-MVP) reloads them.

### Active scope vocabulary

Inside a workspace, the user navigates to specific records — a patient, a session, a task. The currently-focused record is the **active scope**. Active scope is a flat dictionary of context keys (ADR-407 will formalise the shape), not a nested concept.

The keys the platform commits to surfacing — illustrative, not exhaustive:

- `workspace.entityId` — always present in any window.
- `workspace.entityType` — `individual` (MVP) or `clinic` (post-ADR-503).
- `workspace.kekLocked` — `true` when the KEK is not held in memory. _Added 2026-05-17 per ADR-307. Renamed from `workspace.locked` during Phase 9a verification to avoid collision with the pre-existing `workspace.isLocked` (workspace open/closed state on `WorkspaceService`)._
- `workspace.setupComplete` — `true` when the encryption-at-rest setup ceremony has been completed. _Added 2026-05-17 per ADR-307._
- `workspace.activeId` — UUID of the currently-bound workspace, or empty string. _Added 2026-05-17 per ADR-307 (multi-workspace amendment)._
- `workspace.nickname` — display nickname of the currently-bound workspace, or empty string. _Added 2026-05-17 per ADR-307 (multi-workspace amendment)._
- `view.activeContainerId` — which activity-bar surface is active (`patients`, `sessions`, etc.).
- `record.activeKind` — kind of record in focused editor pane (`patient`, `session-note`, `form`, `task`, etc.). Empty when no record is focused.
- `record.activeId` — identifier of the focused record. Empty when no record is focused.
- `patient.activeId` — when a patient is in scope for the focused record (a session-note inherits its patient's id here).
- `editor.isDirty` — whether the focused editor has unsaved changes.

PHI-bearing UI gates on `!workspace.kekLocked && workspace.setupComplete`. The pattern is wired in Phase 9 against a stub PHI capability; real PHI surfaces consume it from Phase 10 onward.

Bundles publish their own context keys through the contribution surface (ADR-407 will spell out the registration). The platform-published keys are the load-bearing ones; bundle-published keys are domain-specific.

The active scope is **flat**, not nested. A session-note has a patient context, but both are surfaced as flat keys — `record.activeId` and `patient.activeId` — rather than as a "scope chain". This matches VSCode's flat context-key dictionary and keeps `when` clauses simple to read and cheap to evaluate.

### Workspace trust

VSCode introduced "workspace trust" because untrusted code (an unfamiliar repo's `.vscode/launch.json`) could run on workspace open. Ru-soam does not have that problem: bundles do not execute workspace-supplied code; workspace settings are typed declarations only, not executable.

The platform's trust model is therefore not workspace-keyed:

- Bundles run in the Bundle Host (ADR-410 planned) regardless of workspace.
- Capability availability depends on the bundle's manifest and the user's consent, not on which workspace is open.
- A workspace cannot grant a bundle more privilege than the user has consented to.

There is no "trust this workspace" prompt analogue. Open Item O56 covers the future case where bundle settings might be workspace-scoped and contain potentially-risky values (e.g., a custom endpoint URL); for MVP no such surface exists.

### Forward-compatibility for multi-Entity (Clinic, ADR-503)

The workspace shape stays constant as ADR-503 advances:

- Window-to-workspace mapping stays 1:1.
- Workspace = Entity stays true.
- Active-scope vocabulary stays the same; `entityType` becomes `clinic` for Clinic workspaces.
- Bundles that consume the workspace through declared capabilities and context keys do not change.

The new pieces that ADR-503 will add — workspace switcher in the activity bar, multi-Entity practitioner identity, per-Entity practitioner roles — extend the model without rewriting it. The MVP code path already treats "the workspace" as a named binding that resolves at window-load time; switching workspaces (post-503) reuses that binding mechanism with a different Entity.

### Empty workspace state

A workbench window with no Entity loaded is a valid state — for example, just after install before onboarding completes, or after a user has signed out. In that state:

- The shell renders.
- No activity-bar items from workspace-scoped bundles appear.
- The user sees the onboarding / unlock surface.

The empty state is not the same as "Entity exists but is locked" — the latter renders the unlock gate; the former renders onboarding. The two are different surfaces in the recovery view shell (ADR-306 / ADR-401 planned).

_Amended 2026-05-17 per ADR-307:_ multi-workspace support adds a picker fork. The workspace lifecycle now has four render-distinct pre-workspace states. Routing among them happens before the workspace shell mounts:

| State | Condition | Surface |
|---|---|---|
| **Zero-workspaces** | `WorkspaceRegistry.list()` empty | `/setup/keys` route (first-run setup ceremony — owned by ADR-307; Phase 9b) |
| **Picker** | Workspaces exist, no active | `/workspaces` picker route (Phase 9c; lists nicknames, "Add new", sign-in selector) |
| **Setup pending** | Active workspace exists, `!workspace.setupComplete` | `/setup/keys` route bound to the active workspace (ceremony was interrupted before acknowledge) |
| **Locked** | `workspace.setupComplete && workspace.kekLocked` | Unlock gate Part (passphrase input + recovery-code link — owned by ADR-307) |

The `unlocked` state is when the workspace shell renders normally. Auto-lock triggers (idle, system suspend, OS screen-lock) flip the workspace back to **Locked** without unloading the workspace itself; the unlock gate replaces workspace surfaces in place. ADR-307 owns the trigger set and the timer policy.

**One OS user, many workspaces.** ADR-307's storage layout puts each workspace under `$userData/workspaces/<uuid>/`. A single OS user can host any number of workspaces; the `active-workspace.json` pointer names the currently-bound one. Sign-out clears the pointer (workspace stays on disk; KEK is wiped from memory); the user can sign back into any other workspace via the picker without quitting the app or switching OS users.

**One window, one bound workspace at a time.** The "one workspace per window" discipline (§"One workspace per window" above) still holds — but the *which* workspace is bound to a window can change at runtime via sign-out + sign-in, without quitting. Bundles see only the currently-active workspace; on sign-out + sign-in to a different workspace, services reset per the workspace-lifecycle rules in ADR-412.

**Multi-window for multi-Entity (post-503).** ADR-503's multi-Entity-per-practitioner case may want concurrent multi-workspace views (two clinic workspaces side-by-side). That uses **separate windows**, each bound to a different workspace. The MVP (ADR-501) supports a single bound workspace per window with switching; the Clinic extension is additive per the §Forward-compatibility section above.

## Consequences

### Positive

- One word — Workspace — for the cross-cutting scoping concept. Configuration, layout, recents, audit, capability scope, all attach to it.
- Workspace = Entity reuses ADR-501's tenancy boundary instead of inventing a parallel concept.
- Active-scope vocabulary is flat, matching context-key shape and `when`-clause evaluation. No scope-chain machinery to maintain.
- Multi-Entity (Clinic) extension is additive: same workspace shape, different content; bundles untouched.
- Bundles get one stable answer to "what's in scope" — through declared context keys, not through ad-hoc imports.

### Negative

- The word "workspace" is borrowed from VSCode and may mislead new contributors who expect folder semantics. Mitigated by documenting the mapping prominently (this ADR; references; onboarding for bundle authors).
- Cross-workspace operations (referrals; see ADR-501 §"Cross-entity flows") are intentionally not handled inside the workspace — they go through the export/import flow. New contributors may reach for an in-window cross-workspace feature; the answer is "open a separate window or use the share flow".

### Neutral

- MVP has exactly one workspace per practitioner, so the abstraction is technically thin in scope today. Naming it explicitly is still worth the cost; pluralising it (post-503) is cheap because the shape is committed now.

## Considered Options

- **No workspace concept; features carry their own scoping** — _Rejected_: configuration, recents, layout, capability scope each invent ad-hoc scoping. Two features disagree on what "current" means. Retrofit cost when Clinic case arrives is large.
- **Workspace = "current patient" or "current case"** — _Rejected_: too narrow. A workspace should outlive any single record; the practitioner moves between patients within the same workspace. Tying workspace to a record makes the calendar, library, and audit-viewer homeless.
- **Workspace = "current view" (activity-bar surface)** — _Rejected_: too narrow in a different direction. Switching from Patients to Calendar is not "opening a different workspace"; settings, layout, and audit attribution should not switch with it.
- **Workspace = practitioner identity** — _Rejected_: collapses identity and ownership. Forward-incompatible with Clinic Entities (where one Entity has many practitioners).
- **Workspace = Entity, one per window, flat active-scope keys** _(chosen)_ — Reuses ADR-501's tenancy boundary; lines up with VSCode's per-window discipline; keeps context-key evaluation simple; absorbs Clinic case additively.

## Open Items

- **O53** — Multi-Entity workspace switcher UX (in-shell switcher vs new window). Defer until ADR-503 advances; mechanism likely activity-bar item plus a window-management capability.
- **O54** — Workspace-scoped bundle enablement (clinic admin disables a bundle for the whole Entity). Useful for Clinic case; not in MVP scope. Settings-shape question for ADR-407 follow-ups.
- **O55** — Workspace settings cloud-mirror policy. Are layout and recents Operational (cloud-mirrored if sync is on) or device-local (never synced)? Layout = arguable Operational; recents = arguable PHI-adjacent (a list of patient IDs is access metadata). Default: layout local-only, recents local-only, explicit settings (configuration values) Operational. Confirm when first first-party bundle ships.
- **O56** — Workspace-level bundle setting risk surface (a bundle setting that points to an external endpoint, etc.). For MVP no such surface exists; for the longer term, decide whether workspace settings need a trust prompt analogous to VSCode workspace trust.
