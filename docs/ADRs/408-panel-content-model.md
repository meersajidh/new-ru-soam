# Panel content model

**ID:** ADR-408
**Status:** Accepted
**Date:** 2026-05-13
**Supersedes:** —
**Superseded by:** —
**Related:** ADR-104, ADR-402, ADR-405, ADR-410, ADR-411

## Context

ADR-402 commits the Panel as one of the five slots of the Middle Section and confirms it ships in MVP. ADR-402 names the contribution point (`panel.views`) but does not commit *what kinds of views the Panel hosts* or *how a Panel view differs from a Side Bar view*.

VSCode's Panel hosts cross-cutting work surfaces — Problems, Output, Terminal, Debug Console, Ports — that don't belong to any single editor. The unifying property is "task-or-context content that supports the work happening in the Editor Area without being part of any one editor". Ru-soam's Panel needs the same role: a home for surfaces that the practitioner refers to *alongside* an editor, not *inside* one.

The first-party catalogue of Panel views is, like the activity-bar item catalogue (ADR-405), a product-scope question. One Panel view is architecturally anchored: the **Output** channel from ADR-410 (bundle stdout / stderr / debug output). This ADR commits the mechanism and the one anchored view, and defers the rest to product scope.

## Decision

### Panel hosts multiple views; one active at a time

The Panel is a single Part (ADR-401) that contains:

- A **tab strip** in its title area listing the available Panel views (by id, with title and optional icon).
- A **content area** showing the active view.
- A **maximize / restore** affordance (the Panel can take the full editor column when expanded).

Multiple Panel views can be active in the registry; only one renders at a time. Switching is via the tab strip, the command palette (`workbench.panel.activate <viewId>`), or a keybinding.

Panel views do not have splits (the Panel is not a nested grid). The Editor Area has splits; the Panel does not. This is intentional — the Panel is for ambient work surfaces, not document editing.

### Contribution shape

A bundle contributes a Panel view through the `panel.views` contribution point:

```json
// illustrative
"contributes": {
  "panel.views": [
    {
      "id": "ru-soam.tasks.queue",
      "title": "Tasks",
      "icon": "$(checklist)",
      "view": "ru-soam.tasks/views/queue",
      "when": "workspace.entityId",
      "priority": 100
    }
  ]
}
```

Each Panel view declares `id`, `title`, optional `icon`, the `view` identifier (referenced by ADR-411's view hosting), an optional `when` clause (ADR-407), and a `priority` for ordering in the tab strip (higher first; ties broken by insertion order).

### Anchored Panel view: Output

The platform owns one Panel view by name: **Output**. It is the canonical surface for:

- Bundle process stdout and stderr (per ADR-410 §"Devtools / debugging").
- Platform-level diagnostic output (sync worker, recovery scenario log, capability error traces in dev mode).
- A future "Audit stream" channel may live here or as its own Panel view; that's a product/scope call.

The Output view has its own internal **channel** model: each producer (a bundle, a platform service) gets a named channel; the user can switch channels within the Output view. Channels are emitted by Main; the Renderer renders them into a virtualised log surface.

Output is implemented in the **core shell** (not as a bundle). The reason: bundle stdout/stderr routing is a platform responsibility — bundles cannot own the surface they themselves log into. The Output Panel view is the one core-shell Panel view this ADR commits.

### First-party catalogue: deferred

The remaining Panel views (Tasks queue, Alerts, Audit stream — whatever the workbench ends up shipping with) are first-party bundles or core-shell features whose surfaces happen to live in the Panel. Their existence and selection is the product-scoping doc's responsibility (per ADR-405's deferral pattern).

This ADR does **not** commit:

- Whether Tasks gets a Panel view or only a Side Bar view.
- Whether the audit ledger is browsed via the Audit Viewer activity item (ADR-502) or also streams into the Panel.
- Whether session transcripts (if a transcription feature lands) appear in the Panel.

Downstream bundle ADRs and the product-scope doc make those calls.

### Lifecycle

Panel views activate the same way other bundle contributions activate (ADR-105):

- The tab appears in the tab strip when the bundle's manifest is registered (at boot, per ADR-410).
- The bundle code activates when the user clicks the tab, or when an activation event fires (e.g., a new error pushes the Tasks view to active).
- The view iframe (ADR-411) is created on first activation; subsequent visibility toggles reuse the iframe (kept alive while the user might come back) until the user explicitly closes the Panel.

When the Panel is hidden, active Panel views remain bound — their iframe is hidden, not torn down. The view bridge receives `onDeactivate` events on hide and `onActivate` on show. A view that wants to suspend its work on hide does so in its `onDeactivate` handler.

### Auto-activation

The Panel can auto-open when a registered view requests attention. The mechanism: a view can call `soamView.requestPanelReveal()` (a `soamView` extension, ADR-411 O79). Use cases:

- A recovery scenario hits — the platform reveals the Output channel to surface diagnostic output.
- A bundle wants to surface a high-severity Task — the Tasks view requests reveal.

Auto-activation is rate-limited (Open Item O103). A view that requests reveal frequently is treated as noisy and demoted.

### Persistence

Panel state — visible / hidden, active tab, size, maximised flag — is persisted as part of the workspace layout state (ADR-403). Re-opening the workspace restores the user's last Panel configuration.

The view-content state (scroll position, filter, search query) is the view's responsibility, persisted optionally via ADR-404 O76 mechanism.

### What this ADR does not commit

- The set of Panel views beyond Output.
- The Output view's exact channel model UX (channel switcher placement, search-in-log, copy-out, filter, etc.). Implementation detail.
- The Tasks / Alerts / Audit-stream split between activity-bar item, Panel view, or both. Product scope.

## Consequences

### Positive

- The Panel slot has a defined contribution shape and one anchored view from day one.
- Output as core-shell ensures bundle diagnostic output has a guaranteed home regardless of which bundles are installed.
- The first-party catalogue is deferred where it belongs (product scope), not extrapolated here.
- Auto-activation is named so the mechanism is consistent rather than each bundle inventing its own.

### Negative

- A Panel with only "Output" visible feels empty until the first first-party Panel view lands. Mitigated by Output being immediately useful to bundle developers.
- The split between "is this a Side Bar view or a Panel view" is a UX judgement bundle authors must make. Documentation needed.

### Neutral

- Panel = bottom-of-editor-column (per ADR-402); not a global drawer.

## Considered Options

- **No Panel in MVP** — _Rejected_: deferred per Q4 product input; bundle diagnostic output needs a home.
- **Panel hosts a single hardcoded view (e.g., Output)** — _Rejected_: too narrow; the Panel slot would be wasted for many workflows.
- **Panel views as bundle contributions, Output anchored as core-shell, first-party catalogue deferred to product scope** _(chosen)_ — Matches the activity-bar deferral pattern; commits the mechanism; preserves the slot's value.

## Open Items

- **O101** — Output channel routing for bundle stdout / stderr. Implementation detail of ADR-410's debugging hook; lands here as the receiving surface.
- **O102** — Panel view persistence depth. Active tab + size known; whether scroll / filter / search persists per view.
- **O103** — Auto-activation rate limiting and demotion policy. Rules for views that request reveal too often.
