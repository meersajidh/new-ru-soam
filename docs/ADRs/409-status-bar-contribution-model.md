# Status-bar contribution model

**ID:** ADR-409
**Status:** Accepted
**Date:** 2026-05-13
**Supersedes:** —
**Superseded by:** —
**Related:** ADR-104, ADR-401, ADR-402, ADR-406, ADR-407

## Context

The Status Bar is the always-visible strip at the bottom of the workbench window (ADR-401). VSCode's Status Bar hosts entries from core and from extensions: file encoding, line/column, git branch, problem count, language mode, sync state, notification triggers. Each entry is small, glanceable, and may be clickable to invoke a command. Items live on the left or right side and sort by a priority number.

Ru-soam's Status Bar plays the same role: ambient indicators (sync state, KEK lock state, dirty count, active workspace identifier) plus quick-action triggers (toggle Panel, command palette shortcut, current consent state) plus bundle-contributed indicators (active session timer, transcription state, etc.).

This ADR commits the contribution shape, the priority / placement model, and the anchored core entries. Per the same deferral discipline used in ADR-405 and ADR-408, the first-party set beyond the anchored entries is the product-scope doc's call.

## Decision

### Two sides, priority-ordered

The Status Bar has two regions:

- **Left** — entries that describe state of the current workspace / active editor (the "what am I looking at?" zone).
- **Right** — entries that describe global / cross-cutting state (the "what's happening behind the scenes?" zone).

Each region renders entries left-to-right in **priority order, higher priority first** (matching VSCode). Priority is a number contributed at registration time. Ties break by registration order.

### Contribution shape

A bundle (or the core shell) contributes a status-bar entry:

```json
// illustrative
"contributes": {
  "statusBar.items": [
    {
      "id": "ru-soam.sessions.timer",
      "alignment": "left",
      "priority": 100,
      "text": "$(clock) 12:34",
      "tooltip": "Session timer",
      "command": "ru-soam.sessions.timer.toggle",
      "when": "view.activeContainerId == 'sessions' && record.activeKind == 'session-note'"
    }
  ]
}
```

Each entry declares:

- `id` — stable, namespaced (per ADR-406 conventions).
- `alignment` — `left` or `right`.
- `priority` — number.
- `text` — display text; may include icon tokens (`$(icon-name)` per ADR-413 icon registry).
- `tooltip` — hover text.
- `command` — optional command id invoked on click (per ADR-406). No handler = non-interactive entry.
- `when` — optional `when` clause (per ADR-407) gating visibility.
- `severity` — optional, one of `default | info | warning | error`. The platform may colour the entry accordingly.

`text` and `tooltip` are updated at runtime via the `statusBar` capability:

```ts
statusBar.update('ru-soam.sessions.timer', { text: '$(clock) 12:35' });
```

The entry's `id` is the handle; only the bundle that registered the id may update it.

### Anchored core entries

The platform commits these Status Bar entries as core shell (always present, not removable):

| Id                          | Alignment | Purpose                                                                  |
| --------------------------- | --------- | ------------------------------------------------------------------------ |
| `workbench.workspace.entity`| left      | Active workspace name (Entity name, or "No workspace open").             |
| `workbench.editor.dirty`    | left      | Aggregate dirty count: "3 unsaved" or hidden when zero.                  |
| `workbench.sync.state`      | right     | Sync state indicator (`sync.state` context key → icon).                  |
| `workbench.kek.lock`        | right     | KEK lock state ("Locked", "Unlocked"). Clicks to re-lock / unlock.       |
| `workbench.notifications`   | right     | Notification trigger (bell icon, badge with count).                      |
| `workbench.bundle.activity` | right     | When any Bundle Host activity is in-flight (spinner; per ADR-410).       |

Other entries — session timer, transcription state, task overdue count, etc. — are bundle contributions decided by product scope.

### Update budget

Status-bar entries update visibly; a noisy entry (updating every animation frame) thrashes the user's peripheral vision and consumes layout work. The platform applies an update budget:

- Updates are **coalesced per entry**: multiple `statusBar.update(id, ...)` calls in the same tick render once.
- A per-entry **rate limit** caps updates to at most N per second (default 4, configurable; Open Item O105). Excess updates are dropped to the most recent.
- The `text` value is constrained in length (a small char budget); over-budget text is truncated with an ellipsis. The full text remains in `tooltip`.

This keeps the bar a stable peripheral surface rather than a busy ticker.

### Visibility

A status-bar entry is visible when its `when` clause is true (or absent). Entries become invisible when their `when` flips false; they re-appear when it flips true. The platform does not collapse empty regions — the bar always renders, even with only core entries.

### Click and hover

Clicking an entry with a `command` declared invokes the command (per ADR-406). Right-click or long-press opens a contextual menu (Open Item — overlaps ADR-407 follow-ups). Hover shows the tooltip; tooltip rendering supports light markdown for richer summaries (icons + short multi-line text).

### Persistence and reordering

Entry placement is determined by `alignment` + `priority`. The user cannot reorder entries via drag-and-drop in MVP (Open Item to revisit if desired). The user can hide individual entries (a "Show / Hide" submenu on the Status Bar's context menu); hidden state is persisted to workspace state (per ADR-403).

Bundle-hidden defaults are not respected by the platform: the user always has final say.

### What this ADR does not commit

- The exact priority numbers for each anchored entry (visual design / tuning).
- Right-click menu shape for entries.
- Drag-to-reorder behaviour (not in MVP).
- Status bar height and typography.

## Consequences

### Positive

- One contribution point, one shape, two sides. Predictable for bundle authors.
- Anchored core entries cover the cross-cutting workbench state that users expect to see (sync, lock, workspace name, unsaved count, notifications).
- Rate limit and length cap keep the bar useful as a peripheral surface.
- Hide / show is user-controllable; bundles cannot force visibility.

### Negative

- A bar with many bundle entries can get crowded. Mitigated by hide-by-user and by `when`-clause gating, but visual density is real.
- The line between "this belongs in the Status Bar" and "this belongs in a Panel notification" is a UX judgement bundle authors must make.

### Neutral

- VSCode bar shape is familiar; status-bar contribution is a well-trodden pattern.

## Considered Options

- **Single-region Status Bar (no left/right split)** — _Rejected_: collapses the "current state" vs "global state" distinction; ordering becomes harder; familiar two-sided pattern dropped without benefit.
- **No contribution point; status bar is hardcoded core entries only** — _Rejected_: bundles cannot surface their state ambient-glance; forces all such state into Panels or banners.
- **Two-sided, priority-ordered, declarative entries with runtime update budget, core entries anchored** _(chosen)_ — Matches VSCode; gives bundle authors a familiar shape; respects user attention budget.

## Open Items

- **O104** — Priority scheme: free-form integers vs banded ranges (e.g., 0-99 core / 100-499 first-party / 500+ third-party). Affects sort stability and collision behaviour.
- **O105** — Update rate-limit value and configurability. Default 4/s; per-entry override case.
- **O106** — Status-bar entry right-click menu / context menu. Hide-this-entry, show-all, configure-this-entry, etc.
