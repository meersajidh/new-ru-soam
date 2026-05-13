# Command-driven architecture

**ID:** ADR-406
**Status:** Accepted
**Date:** 2026-05-13
**Supersedes:** —
**Superseded by:** —
**Related:** ADR-103, ADR-104, ADR-401, ADR-402, ADR-407, ADR-410, ADR-502

## Context

A workbench has many ways to ask the platform to *do* something: the user can click a menu, press a key, type into a palette, run a macro, click a status-bar action, or follow a notification's action button. Each of these would, in a naive design, wire up its own bespoke handler. The result is a tangle: the "save current record" handler lives in three places (menu callback, keybinding callback, palette callback), three implementations drift, and bundles contributing new menu items cannot reach the same handler the core shell uses.

VSCode's answer is the **command-driven architecture**: every action is a named string command (e.g., `editor.action.formatDocument`). The menu item, the keybinding, the palette entry, and the API all reference the *same string*. There is exactly one handler per command. The string ID decouples *who calls* from *who handles*. Bundles override behaviour by registering a new handler for an existing ID; new actions are added by registering a new ID.

Ru-soam adopts the same model. Commands become the workbench's **dispatch vocabulary** — the single name space through which UI surfaces, contributions, and other commands invoke action. This ADR commits the command system: registry, contribution shape, argument convention, execution path across the Renderer / Main / Bundle Host trust zones, audit interplay with ADR-502, and the relationship to capabilities (ADR-103).

## Decision

### Command = string ID + handler

A **command** is:

- a stable, namespaced string **id** (e.g., `audit-viewer.exportRange`, `workbench.toggleSideBar`),
- a **title** (user-visible label) and an optional **category** (palette grouping),
- an optional **`when`** clause (ADR-407) gating its visibility / invocability,
- an optional **icon** (for menu / status-bar rendering),
- exactly one **handler** function, registered with the command registry by the contributor.

Handlers accept positional arguments (`(arg1, arg2, ...)`) and return a value (or a Promise). Arguments are simple structures — strings, numbers, booleans, plain objects, arrays. Heavy or live-object payloads do not travel through commands; they travel through capabilities (ADR-103).

### Command registry

A single **command registry** owns the id → handler map for the workbench. The registry:

- lives logically in Main (the trust broker), with a Renderer-side mirror of the *contributions* (id + title + category + when + icon — i.e., the metadata needed to render menus and the palette) shipped at boot.
- is populated from contribution manifests at workbench start: every bundle's manifest's `commands` block is parsed and registered before the bundle is activated. The handler is *not* registered yet at this point; only the metadata.
- accepts handler registration at activation time. When a bundle activates, it calls `commands.registerHandler(id, fn)` in its `activate(...)` (running in the Bundle Host); Main records the binding.

This separation — metadata at boot, handler at activation — is what lets the palette and menus *show* commands without forcing every bundle to activate. The handler binding lands lazily.

If a command is invoked while its handler is not registered (bundle inactive), the registry runs the bundle's activation events first; once active, the command runs. This matches VSCode's lazy-activation discipline (ADR-105).

### Execution path across zones

A command's invocation can originate anywhere:

- From the **Renderer** — via `commands.execute(id, ...args)` exposed on `window.soam.bindCapability('commands', ...)` (a platform capability, not a custom path).
- From a **bundle view** (iframe, per ADR-411) — via `window.soamView.bindCapability('commands', ...).execute(...)`.
- From the **Bundle Host** — a bundle's own code can invoke another command (often its own) via the same `commands` capability.
- From **Main** — internal platform code uses the registry directly.

Routing:

```
[caller] ──▶ commands capability ──▶ Main registry
                                       │
              ┌────────────────────────┼─────────────────────────┐
              │                        │                          │
       handler in Main          handler in Bundle Host     handler in Renderer
       (platform built-in)      (most bundles)             (rare; UI-only commands)
              │                        │                          │
              ▼                        ▼                          ▼
         run + return            IPC + run + return          IPC + run + return
```

The Renderer-side mirror is **metadata only**. Execution always goes through Main, where audit, consent, and capability gates apply. The Renderer never invokes a handler directly even when the handler ends up running in the Renderer — the call still flows through Main and back. This keeps audit unified.

### Contribution shape

A bundle contributes commands via the `commands` contribution point:

```json
// illustrative
"contributes": {
  "commands": [
    {
      "id": "audit-viewer.exportRange",
      "title": "Audit: Export Range",
      "category": "Audit",
      "icon": "$(export)",
      "when": "view.activeContainerId == 'audit'"
    },
    {
      "id": "audit-viewer.openEntry",
      "title": "Audit: Open Entry",
      "category": "Audit"
    }
  ]
}
```

The handler is registered programmatically at bundle activation:

```ts
// inside the bundle's activate()
commands.registerHandler('audit-viewer.exportRange', async (rangeSpec) => {
  // implementation
});
```

Two surfaces, one principle: metadata declared in the manifest; behaviour wired in code.

### Naming convention

Command ids are namespaced: `<bundleId>.<verb>[.<noun>]`. Examples:

- `workbench.toggleSideBar`
- `editors.save`
- `audit-viewer.exportRange`
- `ru-soam.recovery.startPairedSession`

Core-shell commands use `workbench.` or a feature-specific top-level (`editors.`, `commands.`). Bundle commands use the bundle id as the prefix. The convention is enforced by lint (Open Item O86); collisions are rejected at registry registration.

### Menus, keybindings, and the palette — all reference command ids

Three UI surfaces consume commands:

- **The command palette** — the search-anywhere overlay (Ctrl/Cmd+Shift+P by default). Reads the registry, filters by query, filters by `when` clause against the current context (ADR-407), invokes the selected command. The palette is core shell; bundles contribute commands, not palette code.
- **Menus** — top-bar menus, context menus, view header menus, editor tab menus. Each menu item references a command id and a placement (menu name + group), plus its own `when` clause. Contribution point: `menus`.
- **Keybindings** — each binding is `<key chord> + when clause → command id`. Contribution point: `keybindings`. The platform ships defaults; bundles and users add overrides.

No surface holds a function reference to a handler. All references are by id. This is the property that makes overriding behaviour clean: a third-party bundle can re-register a handler for `editors.save` and the menu / keybinding / palette pick up the new behaviour without changing.

Menu and keybinding contribution shapes are sibling contribution points; their details land in ADR-104's contribution catalogue (O7) and the menus-and-keybindings detail ADR (currently planned via ADR-407 for `when`-clauses). The command system commits *that* menus and keybindings reference commands, not their full schema.

### Activity-bar items and view-container activation are commands, optionally

An activity-bar item (ADR-405) can trigger an arbitrary command, or it can use a platform default (`workbench.activateViewContainer` with the container id as an argument). Bundles that need custom activation behaviour declare their own command; bundles that want default behaviour omit the command and let the platform handle it.

This keeps the activity-bar contribution shape flexible without forcing every bundle to define and register a command.

### Audit interplay

ADR-502 commits that **PHI-touching capability use** is audited, not capability binding. Commands and audit interact:

- The command-execution call itself is **not** audited by default. Audit attaches to the capabilities the command *uses* inside its handler. A command that does nothing but toggle a side bar is not audit-worthy; a command that calls `record.read` against a clinical record is — and the `record.read` capability call carries the audit emission.
- Some commands warrant their own ledger entry even when they don't touch PHI directly (e.g., `audit-viewer.exportRange` exports a ledger range; the export itself is a Tier-1 audit-relevant act). Such commands declare an `audit` field in their contribution that names a ledger event kind. Open Item O88 covers the exact shape.

The default is silent. The exception is declared.

### Command result types

A command handler returns either a value (for commands invoked programmatically and expecting a result) or undefined (for fire-and-forget). Promises are flattened. The result is serialisable — bundles return data, not live references.

Errors thrown by handlers are caught by Main; the caller sees a typed `CommandError` with the command id, the error message, and a stable error code. The error never crashes the workbench or the Bundle Host.

### Command argument schema

Initial design: arguments are positional, weakly typed (TypeScript `any[]`), with documentation in the manifest's command entry recommending the shape.

Stronger typing — a Zod-like argument schema in the manifest, with runtime validation at Main — is **Open Item O87**. The argument is whether the overhead of a schema is worth the cost across hundreds of commands. Strawman: schema optional; commands that take more than two simple arguments are encouraged to declare one.

### What this ADR does not commit

- The `when`-clause expression grammar and context-key vocabulary (ADR-407).
- The exact menu and keybinding contribution schemas (ADR-104 O7 + ADR-407 follow-ups).
- The command palette's ranking algorithm (recency, frequency, fuzzy-match scoring — O90).
- The exact `audit` field shape on command contributions (O88).
- A formal argument validation schema (O87).

## Consequences

### Positive

- One name space for "things the workbench can do". Menus, keybindings, palette, status-bar actions, banner actions, and bundle-to-bundle calls all reference the same ids.
- Overriding behaviour is structurally clean: re-register a handler for an existing id.
- Adding behaviour is structurally clean: register a new id; UI surfaces pick it up via their own contributions.
- Audit gates remain on the *use of capabilities*, not on the command pipe — keeps the ledger meaningful per ADR-502.
- Lazy activation is preserved: command metadata is registered at boot, handlers at first activation.

### Negative

- Every UI surface that wants to invoke a behaviour has to know a command id. Discovery falls on documentation and on the command palette. Mitigated by the palette's first-class discoverability role.
- Argument typing is weak by default (O87). Bundles relying on commands as a typed-API substitute will find rough edges; the recommendation is to use capabilities for typed APIs and commands for actions.
- A subtle audit hazard: a command can wrap a non-audited capability sequence into an audited-sounding label without the ledger seeing the underlying ops. Mitigated by ADR-502's discipline that the *capabilities* are audited, not the commands.

### Neutral

- Command ids accumulate. A workbench with many bundles has many command ids. The palette and search compensate; the alternative (per-surface bespoke handlers) is worse.

## Considered Options

- **No command system; per-surface handlers** — _Rejected_: tangled callbacks; bundles cannot override workbench behaviour; menus / keybindings / palette drift apart.
- **Commands as a thin wrapper over capabilities (everything is a capability)** — _Rejected_: capabilities are typed and live in the service layer; commands are user-facing verbs that may compose multiple capabilities. Collapsing them confuses the call sites and the audit gates.
- **Hardcoded enum of commands; no contribution** — _Rejected_: bundles cannot contribute behaviour.
- **String-id commands, registry in Main, metadata mirror in Renderer, handlers lazy at activation** _(chosen)_ — Matches VSCode; aligns with ADR-104 contribution discipline and ADR-105 lazy activation; respects ADR-410's process boundaries.

## Open Items

- **O86** — Command id naming + lint enforcement (`<bundleId>.<verb>[.<noun>]`). Collision rejection at registry registration.
- **O87** — Optional argument schema in manifest. Whether to require, encourage, or stay weak-by-default.
- **O88** — `audit` field on command contributions. Shape, allowed event kinds, interaction with capability-level audit (so a command doesn't double-emit).
- **O89** — Recent commands persistence: per workspace (per ADR-403 state) or per user globally. Privacy implications if commands carry record ids in arguments.
- **O90** — Command palette ranking: fuzzy-match scoring, recency weight, frequency weight, category boost.
