# Menu and keybinding contributions

**ID:** ADR-417
**Status:** Accepted
**Date:** 2026-05-31
**Supersedes:** —
**Superseded by:** —
**Related:** ADR-102, ADR-104, ADR-405, ADR-406, ADR-407, ADR-408, ADR-409, ADR-411, ADR-412, ADR-413, ADR-502

## Context

ADR-406 committed the command-driven architecture and named — but explicitly did **not** schema — the two contribution surfaces that turn commands into things a practitioner can actually reach:

> "Menu and keybinding contribution shapes are sibling contribution points; their details land in ADR-104's contribution catalogue (O7) and the menus-and-keybindings detail ADR." — ADR-406 §"Menus, keybindings, and the palette"

This is that detail ADR. Three forces make it due now:

1. **Consumers are blocked on it.** O106 (status-bar entry context menu), O112 (editor tab context menu — explicitly "Depends on command-menu mechanism"), and O162 (status-bar quick-switcher dropdown — "Requires a StatusBar dropdown/menu primitive that does not yet exist") all wait on a menu primitive that does not exist. The Practice slices grew a roster, an editor-tab interaction model, and view-owned headers (commits `440eaaa`, `c4dad3a`) whose natural next interactions — right-click a roster row, right-click a tab, a view-header overflow `⋮` — have nowhere to attach.

2. **Bespoke popovers are accreting.** `SettingsMenu.tsx`, `AccountSelect.tsx`, and the user-avatar menu are each hand-rolled popover-and-list widgets with their own outside-click, focus, and positioning code. Without a shared primitive every new menu re-implements the same chrome and drifts.

3. **The Bundle-Host trust boundary makes the iframe case non-trivial.** A bundle view is a sandboxed, origin-isolated iframe (ADR-411). It *cannot* render shell chrome and *must not* — a context menu raised over a roster row lives in third-party-trust pixels but its items invoke platform commands against the privileged shell. The menu must render in the shell, driven by a request from the view, with command dispatch flowing through Main (ADR-411's "renderer is relay, Main is broker"). The view-bridge already forwards modifier-chord `keydown` events for exactly this reason (so `Ctrl+Shift+P` works with focus inside an iframe — `c4dad3a`); context menus are the same channel, generalised.

VSCode's model answers all three with one idea: **menus and keybindings are declarative contributions that reference command ids and named slots**, and a single menu service renders every menu from contribution data filtered by `when` (ADR-407). Ru-soam adopts it. This ADR commits the `menus` and `keybindings` contribution points, the menu-id registry and grouping convention, the shell-owned context-menu primitive, and the renderer↔view action channel that lets a sandboxed view raise a shell menu.

## Decision

### Everything still references command ids

Per ADR-406, no menu item and no keybinding holds a function reference. A menu item is `{ menu-id, command-id, when?, group, order, … }`; a keybinding is `{ key, when?, command-id }`. The menu service and keybinding service resolve the id against the command registry (ADR-406) at invocation time. Overriding behaviour stays structurally clean: re-register the handler, every surface picks it up.

### The `menus` contribution point

A new contribution point, sibling to `commands`, `viewContainers`, and `panel.views`. A contribution places a command into a **named menu slot** ("menu id") with grouping metadata:

```jsonc
// illustrative — bundle manifest "contributes" block
"menus": {
  "view/context": [
    { "command": "ru-soam.practice.openClient",   "group": "navigation@1", "when": "view.id == 'ru-soam.practice.roster'" },
    { "command": "ru-soam.practice.archiveClient", "group": "1_modify@1",   "when": "view.id == 'ru-soam.practice.roster' && patient.rowStatus == 'active'" }
  ],
  "editor/title/context": [
    { "command": "workbench.editors.close",       "group": "1_close@1" },
    { "command": "workbench.editors.closeOthers", "group": "1_close@2" }
  ]
}
```

Item shape:

| Field | Meaning |
| --- | --- |
| `command` | command id (ADR-406); the item's title/icon are read from the command contribution, not redeclared |
| `when?` | ADR-407 clause gating visibility in this slot (in addition to the command's own `when`) |
| `group` | named ordering group within the slot, `group@order` (see below) |
| `alt?` | optional alternate command shown on a modifier (Alt-held); deferred shape, O424 |
| `title?` | optional slot-specific title override (rare; e.g. shorter label in a dense menu) |
| `toggled?` | optional `when` clause; when true the item renders checked/active (covers toggle commands — O423) |

Keyed by menu id. Each value is the list of items contributed to that slot. Multiple bundles contribute to the same slot; the menu service merges, filters by `when`, and orders.

### Menu-id registry: base-reserved set + namespacing

Menu ids are **slots**, not free strings. Like context keys (ADR-407) and command ids (ADR-406), they split base-reserved vs domain-reserved, and bundles may not invent base slots.

**Base-reserved slots (committed by this ADR):**

| Menu id | Surface | Anchored by |
| --- | --- | --- |
| `commandPalette` | the search-anywhere palette | implicit; a command's palette visibility |
| `editor/title` | editor tab toolbar (inline action icons, right side) | active editor |
| `editor/title/context` | right-click an editor tab | the tab's resource (O112) |
| `view/title` | a view header's inline actions + `⋮` overflow | the view (Nav/Contextual Aspect) |
| `view/context` | right-click inside a view's body | the view + its in-view selection |
| `activitybar/item/context` | right-click an activity-bar item | the activity-bar item (ADR-405) |
| `statusbar/item/context` | right-click a status-bar entry | the entry (ADR-409, O106) |
| `panel/title` | panel view header actions | active panel view (ADR-408) |

**Namespacing rule.** Base slots use the `surface[/sub][/context]` form above and are reserved — a bundle manifest declaring a `menus` block keyed by a base slot is accepted (that is how bundles contribute *items* to base slots), but a bundle may not *define a new* base-named slot. **Domain or bundle-private slots** are namespaced by bundle id: `ru-soam.practice/clientCard/context`. A bundle owns and may define slots under its own id prefix; other bundles may contribute items to them by id (same open-extension property as base slots). This mirrors the base/domain context-key split (ADR-106/ADR-407) — base owns the cross-cutting surface vocabulary; domain owns its feature-local slots.

### Group + order convention

Within a slot, items are bucketed into **named groups**, groups are ordered relative to one another, and items within a group are ordered by an integer. Syntax: `group@order` (VSCode parity).

- Group name ordering is **lexicographic by name**, so groups are conventionally prefixed with a sort digit: `navigation`, `1_modify`, `2_lifecycle`, `9_danger`. `navigation` (no digit) sorts first by convention; `9_*` sorts last (destructive actions live there).
- `@order` is an integer ordering items **within** a group; omitted ⇒ contribution order.
- The menu renderer draws a **separator** between adjacent groups. No separators within a group.

This keeps cross-bundle ordering deterministic without a central ordering authority: each item declares only its local intent and the service composes a stable result.

### The context-menu primitive: `IMenuService`

A new **renderer-owned** platform service (ADR-412 registry) that owns menu *rendering and interaction*. It is the single React popover used by every menu in the shell — the bespoke `SettingsMenu` / `AccountSelect` / avatar-menu widgets are generalised onto it (migration is incremental, not a big-bang — see §Migration).

```ts
// illustrative
interface MenuActionContext {
  /** Ephemeral context-key overrides scoped to this menu invocation
   *  (e.g. patient.rowStatus for the right-clicked row). Merged over the
   *  global ContextKeyService snapshot for `when` evaluation only. */
  readonly contextOverrides?: Record<string, CtxValue>;
  /** Opaque args forwarded to the command handler on select. */
  readonly args?: unknown[];
}

interface IMenuService {
  /** Resolve a slot's items (filtered by `when` against global + override
   *  context, grouped, ordered) without rendering — for custom surfaces. */
  getMenuItems(menuId: string, ctx?: MenuActionContext): ResolvedMenuItem[];

  /** Render the shell context menu for a slot at viewport coords.
   *  Resolves a hidden/empty menu to a no-op. Returns a Disposable that
   *  dismisses it. Selecting an item executes its command via ICommandService
   *  (ADR-406) with `args`, then dismisses. */
  showContextMenu(opts: {
    menuId: string;
    anchor: { x: number; y: number } | HTMLElement;
    ctx?: MenuActionContext;
  }): IDisposable;
}
```

Properties:

- **Shell-owned, renderer-trust.** The menu DOM is the workbench shell's, never a bundle's. It reads command metadata + `when` results; it does not run bundle code. Selecting an item calls `ICommandService.execute(id, ...args)`, which routes through Main where audit/consent/capability gates apply (ADR-406/502). The menu pixel surface is privileged; the *trigger* may be untrusted (a view's right-click) — see the action channel below.
- **`when` evaluation** reuses `ContextKeyService` (ADR-407). `contextOverrides` supplies per-invocation keys (the right-clicked row's status, the tab's resource kind) that don't belong in global context. Overrides are read-only and scoped to the single menu resolution — they never mutate the global snapshot.
- **Anchored vs positional.** `anchor` accepts viewport coords (right-click) or an element (a `⋮` button, a status-bar entry → dropdown). This one entry point covers context menus, header overflow menus, **and** the O162 status-bar dropdown — a dropdown is, for now, an element-anchored menu. **Caveat (O429):** a true dropdown/select may later warrant distinct affordances (persistent trigger active-state, label/value display, multi-select, typeahead-as-filter, width-matched-to-anchor) — whether to extend `IMenuService` with a dropdown mode or split a sibling primitive is revisited when the first real dropdown lands.
- **Interaction baseline:** outside-click dismiss, `Esc` dismiss, arrow-key navigation, type-ahead, `Enter`/click to invoke, focus restore on close, viewport-edge flipping. Owned once, here, not per call site.
- **Toggle/checked items** (O423): an item with `toggled` renders a check/active state from the clause; selecting still fires the command (the command flips the underlying state, the menu re-resolves on next open). This subsumes the deferred "toggle-icon-state" workbench thread.

Submenus (nested flyouts) and radio-groups are **not** committed here — O425.

### The `keybindings` contribution point

Today keybindings are hardcoded in `platform/keybindings/basic-shortcuts.ts`. This ADR makes them a contribution, parallel to `menus`, so bundles and (later) users can bind commands:

```jsonc
"keybindings": [
  { "key": "ctrl+shift+p", "command": "workbench.commandPalette.show" },
  { "key": "ctrl+w",       "command": "workbench.editors.close", "when": "editorFocus" }
]
```

| Field | Meaning |
| --- | --- |
| `key` | normalised chord, lowercase, `+`-joined (`ctrl+shift+p`). `cmd`/`ctrl` platform-folded by the service (one binding works cross-OS). |
| `command` | command id to fire (ADR-406) |
| `when?` | ADR-407 clause; binding is live only when it evaluates true |
| `args?` | optional command args |

Resolution: the `KeybindingService` (existing) builds a chord→bindings index from all contributions + platform defaults; on a key event it picks the highest-priority binding whose `when` holds and executes its command. **Conflict rule:** later contributions override earlier ones for the same `key`+`when` (user > bundle > platform default), matching the command-override discipline. The current `basic-shortcuts.ts` becomes the platform-default contribution — no behaviour change, just re-homed onto the contribution path.

**Multi-stroke chords** (`ctrl+k ctrl+s`) and a **user-rebinding store + UI** are deferred — O426. This ADR commits single-chord, contribution-declared, `when`-gated bindings and the override order.

### Renderer↔view action channel

The hard case: a context menu (or keybinding) raised with focus **inside a sandboxed bundle iframe** (ADR-411). The view cannot render the shell menu and must not own the privileged surface. The channel:

```
1. Bundle view captures `contextmenu` (or a modifier-chord `keydown`) in its
   document. It does NOT preventDefault-and-render; it posts a request via
   the bridge:
     window.soamView → { __soamView, kind: 'request.contextMenu',
                         menuId, coords:{x,y}, context:{…} }       (view → renderer)
2. Renderer relay receives the postMessage, translates the iframe-local coords
   to viewport coords, and calls IMenuService.showContextMenu({ menuId,
   anchor: viewportCoords, ctx: { contextOverrides: context } }).
3. The shell renders the menu (shell-trust pixels, over the iframe).
4. On select, the renderer executes the command via the commands capability →
   Main (ADR-406). If the handler lives in the bundle, Main routes to the
   Bundle Host as usual. Audit/consent gates apply in Main.
                                                                  (dispatch → Main → Host)
```

Discipline (all from ADR-411, made concrete):

- **The view proposes; the shell disposes.** The view names a `menuId` and supplies *context* (the right-clicked row's id/status), but it cannot name arbitrary commands to run, cannot inject menu items, and cannot style the menu. It contributes items the normal way (manifest `menus` block) and the shell resolves them. A malicious view can at most request a menu that resolves to *its own* declared, `when`-passing items — exactly the commands it could already invoke.
- **`context` is data, not authority.** The `context` payload becomes `contextOverrides` for `when` evaluation only. It cannot set base-reserved context keys the bundle isn't allowed to write (ADR-407 namespace rule still applies at the relay boundary — the relay rejects override keys outside the bundle's writable namespaces).
- **Coords are translated, never trusted as viewport.** The relay knows the iframe's rect and converts; a view cannot place a menu outside its own bounds.
- **`menuId` is validated.** The relay accepts only the bundle's own `<bundleId>/…` slots or the base `view/context` slot scoped to that view; a view cannot raise `editor/title/context` or another bundle's slot.

The existing keydown-chord forward (`view-bridge.ts`, `kind: 'keydown'`, modifier-chords only — never bare keys, a PHI-leak guard) is the **keybinding half of this same channel** and is retained as-is: forwarded chords are matched against the `KeybindingService` index in the renderer exactly as a shell-originated chord would be. Context menus add the `request.contextMenu` message kind alongside it.

### Migration of existing bespoke popovers

`SettingsMenu`, `AccountSelect`, the user-avatar menu, and the editor-tab density `⋮` (overview) are pre-existing hand-rolled popovers. They are **not** required to migrate in this ADR's landing — but they are the canonical first internal consumers and should move onto `IMenuService` opportunistically (when next touched), per the O166 incremental-migration discipline. New menus MUST use `IMenuService`. This avoids a big-bang refactor while stopping the bleed.

### What this ADR does not commit

- **Nested submenus and radio-group menu items** (O425).
- **Multi-stroke key chords and a user-facing rebinding store/UI** (O426).
- **The `alt`/alternate-command-on-modifier menu shape** (O424).
- **Top-level application menu bar** (the OS/window menu). The shell is frameless/custom-titlebar (ADR-401); a classic menu bar, if ever wanted, is a separate surface — not in scope.
- **Command-palette ranking** (unchanged — ADR-406 O90).
- **The exact serialized manifest validation schema** for `menus`/`keybindings` blocks lives with the manifest-validation work (ADR-104 O7); this ADR commits the field semantics, not the validator code.

## Consequences

### Positive

- The three blocked consumers (O106, O112, O162) get their mechanism; each becomes a thin contribution + a `showContextMenu` call, no bespoke chrome.
- One menu primitive, one keybinding resolver — outside-click, focus, positioning, `when`-filtering, ordering owned once. Bespoke popovers stop multiplying.
- The iframe context-menu case has a trust-correct path: shell-rendered, view-proposed, Main-brokered. A sandboxed roster row can offer a right-click menu without any trust regression.
- Keybindings join the contribution model; `basic-shortcuts.ts` re-homes with zero behaviour change, and bundles can bind commands.
- Menu-id taxonomy + `group@order` give deterministic cross-bundle composition without a central ordering authority.

### Negative

- Two new contribution points widen the manifest surface and the validation burden (ADR-104 O7).
- The renderer relay grows a second message kind (`request.contextMenu`) and the coord-translation + namespace-rejection logic at the iframe boundary — more relay code to keep trust-correct.
- Migrating the existing popovers, even incrementally, is real work that competes with feature work; until done, two menu mechanisms coexist.

### Neutral

- VSCode parity on menu ids / `group@order` helps contributors who know VSCode, and gives a reference design — at the cost of inheriting some of its quirks (lexicographic group sort, digit-prefix convention).
- The base menu-id set is a starting catalogue; adding a base slot later is an additive ADR amendment, not a breaking change.

## Considered Options

- **Per-surface bespoke menus (status quo)** — _Rejected_: every menu re-implements chrome; bundles can't contribute to shell menus; the iframe case has no sanctioned path.
- **Let bundle views render their own context menus inside the iframe** — _Rejected_: breaks ADR-411 trust model (third-party pixels invoking privileged commands with no shell mediation), can't reach shell commands, visually inconsistent, and the menu would be clipped to the iframe.
- **Imperative menu API only (no declarative `menus` contribution)** — _Rejected_: loses the command-reference / override property of ADR-406; bundles couldn't extend shell menus; ordering becomes ad hoc.
- **Fold menus into the command contribution itself (a command declares its own menu placements)** — _Rejected_: couples a command to its surfaces; a command should be placement-agnostic so different bundles can surface it differently. VSCode separates them for this reason.
- **Declarative `menus` + `keybindings` contributions referencing command ids, a shell-owned `IMenuService`, and a view-proposes/shell-disposes iframe channel** _(chosen)_ — matches ADR-406's stated design, reuses ADR-407 `when` + ADR-411 relay, unblocks O106/O112/O162.

## Open Items

- **O423** — Toggle/checked menu items: `toggled` clause semantics, check vs radio rendering, interaction with the deferred workbench toggle-icon-state. Minimal toggle ships with this ADR; radio-group is O425.
- **O424** — `alt` alternate-command-on-modifier menu item shape (VSCode's Alt-held secondary action).
- **O425** — Nested submenus (flyout) + radio-group menu items: contribution shape (`submenu` slot reference), interaction, a11y for nested popovers.
- **O426** — Multi-stroke key chords (`ctrl+k ctrl+s`) and a user-facing rebinding store + Settings UI; per-workspace vs global persistence (privacy parallel to ADR-406 O89).
- **O427** — Menu/keybinding contribution validation schema landing with the manifest validator (ADR-104 O7); collision + namespace-rejection rules at registry registration.
- **O428** — A11y for the context-menu primitive across the iframe boundary: focus capture from a view-originated menu, `aria` semantics, focus restore back into the iframe on dismiss (ties to ADR-411 O83).
- **O429** — Dedicated dropdown/select primitive vs element-anchored menu. This ADR treats a dropdown as an element-anchored `showContextMenu`; revisit when the first real dropdown (O162 StatusBar quick-switcher, or a Settings select) needs select-specific affordances. Decide: extend `IMenuService` with a dropdown mode, or split a sibling primitive sharing the popover/positioning core.
