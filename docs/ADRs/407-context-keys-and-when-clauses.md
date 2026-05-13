# Context keys and when-clauses

**ID:** ADR-407
**Status:** Accepted
**Date:** 2026-05-13
**Supersedes:** —
**Superseded by:** —
**Related:** ADR-102, ADR-104, ADR-402, ADR-403, ADR-404, ADR-406, ADR-410, ADR-411

## Context

A contribution-driven workbench fills up fast. With every bundle registering commands, menu items, keybindings, and views, the palette and menus would devolve into noise unless every contribution carries a **visibility predicate** — a way of saying "show this only when X is true". The same mechanism gates whether a keybinding fires.

VSCode's answer is the **context key service**: a live dictionary of platform state (hundreds of keys: `editorLangId`, `editorHasSelection`, `resourceExtname`, `inDebugMode`, etc.) paired with a **when-clause** expression grammar (`editorLangId == 'python' && !inDebugMode`). Every contribution that can be conditionally visible carries a `when` clause; the platform re-evaluates clauses as keys change and updates UI accordingly.

This is what keeps the palette uncluttered even with fifty extensions installed.

Ru-soam adopts the same mechanism. ADR-403's active-scope vocabulary (`workspace.entityId`, `record.activeKind`, `patient.activeId`, etc.) and the planned use of `when` in commands (ADR-406), activity-bar items (ADR-405), and editors (ADR-404) all rely on this ADR landing. This document commits the context-key model, the expression grammar, the namespace discipline, and the runtime behaviour.

## Decision

### Context key service

A renderer-internal **ContextKeyService** owns a live dictionary of key → value. Keys are strings (dotted paths); values are primitive (string, number, boolean) or simple structures (arrays of primitives for `in` membership tests).

The service:

- exposes `get(key)`, `set(key, value)`, `delete(key)`, `onDidChange(keys, handler)`.
- batches change notifications: multiple `set` calls within the same tick produce one notification with the union of changed keys.
- caches expression evaluations and invalidates only the cached evaluations whose AST references a changed key.

The service lives in the **Renderer** because most consumers (menu rendering, palette filtering, keybinding dispatch) run in the Renderer. Platform-managed keys originating from Main (sync state, KEK lock state, etc.) are pushed to the Renderer via IPC events and applied to the service.

This placement is consistent with ADR-102: the renderer owns view state, and "what is currently in focus / selected / visible" is view state.

### Key sources

Three sources contribute keys:

1. **Platform-published keys** — written by the workbench shell and the core services. The platform owns specific namespaces.
2. **Bundle-published keys** — written by bundles, scoped to a bundle-id prefix.
3. **Configuration-derived keys** — every setting under `config.<key>` is implicitly available as a context key, evaluated against the current configuration value. (Mechanism in O92.)

### Reserved namespaces

The platform reserves the following top-level key prefixes; bundles may not write keys under them:

| Prefix         | Owner         | Example                                   |
| -------------- | ------------- | ----------------------------------------- |
| `workspace.`   | Platform      | `workspace.entityId`, `workspace.entityType` |
| `view.`        | Platform      | `view.activeContainerId`, `view.sideBarVisible` |
| `editor.`      | Platform      | `editor.activeResource`, `editor.isDirty`, `editor.readOnly` |
| `record.`      | Platform      | `record.activeKind`, `record.activeId`    |
| `patient.`     | Platform      | `patient.activeId` (set when active record has patient context) |
| `panel.`       | Platform      | `panel.visible`, `panel.activeViewId`     |
| `sideBar.`     | Platform      | `sideBar.visible`, `sideBar.activeContainerId` |
| `auxSideBar.`  | Platform      | `auxSideBar.visible`                      |
| `commandPalette.`| Platform    | `commandPalette.open`                     |
| `bundle.`      | Platform      | `bundle.<bundleId>.active` (read-only by bundles) |
| `consent.`     | Platform      | `consent.<kind>.granted`                  |
| `kek.`         | Platform      | `kek.unlocked`                            |
| `sync.`        | Platform      | `sync.state` ∈ {`offline`,`syncing`,`idle`,`error`} |
| `config.`      | Platform      | `config.<key>` derived from configuration |

Bundle-owned keys live under `<bundleId>.*`. Registering a key under a reserved prefix is rejected at contribution-registration time.

### Initial platform-key catalogue (illustrative)

Not exhaustive; this is the starting set the workbench commits to maintaining:

```
workspace.entityId        : string | null
workspace.entityType      : 'individual' | 'clinic' | null
view.activeContainerId    : string | null
sideBar.visible           : boolean
sideBar.activeContainerId : string | null
auxSideBar.visible        : boolean
panel.visible             : boolean
panel.activeViewId        : string | null
editor.activeResource     : string | null         // resource URI
editor.scheme             : string | null         // resource scheme
editor.activeGroupId      : string | null
editor.isDirty            : boolean
editor.readOnly           : boolean
editor.dirtyCount         : number
record.activeKind         : string | null
record.activeId           : string | null
patient.activeId          : string | null
commandPalette.open       : boolean
bundle.<id>.active        : boolean (one per installed bundle)
kek.unlocked              : boolean
sync.state                : 'offline' | 'syncing' | 'idle' | 'error'
consent.<kind>.granted    : boolean (one per consent kind)
config.<key>              : value of configuration <key>
```

The catalogue grows as new platform features land. Adding a platform key is a small follow-up; removing or renaming one is a breaking change for downstream `when`-clauses.

### Bundle-published keys

A bundle declares the keys it intends to write in its manifest:

```json
"contributes": {
  "contextKeys": [
    { "id": "audit-viewer.hasRangeSelection", "type": "boolean", "initial": false }
  ]
}
```

At runtime, the bundle updates its key via the `contextKeys` capability:

```ts
// inside bundle code (Bundle Host) or view code (iframe via soamView)
contextKeys.set('audit-viewer.hasRangeSelection', true);
```

The capability enforces:

- the key prefix matches the bundle id (no cross-bundle key writes).
- the key was declared in the manifest (no ad-hoc keys).
- the value type matches the declaration.

### Expression grammar (when-clauses)

A when-clause is a boolean expression over context keys. The grammar:

```
expr     := orExpr
orExpr   := andExpr ( '||' andExpr )*
andExpr  := unary ( '&&' unary )*
unary    := '!' unary
          | primary
primary  := identifier
          | identifier op value
          | identifier 'in' arrayLit
          | identifier '=~' regexLit
          | '(' expr ')'
op       := '==' | '!=' | '<' | '<=' | '>' | '>='
value    := stringLit | numberLit | boolLit
arrayLit := '[' value (',' value)* ']'
regexLit := /pattern/flags
identifier := dottedName
```

Examples:

```
workspace.entityId                              // truthy
record.activeKind == 'session-note'
editor.isDirty && !editor.readOnly
view.activeContainerId == 'audit-viewer' && audit-viewer.hasRangeSelection
sync.state in ['idle', 'syncing']
config.featureX.enabled == true
editor.scheme =~ /^session/
```

A bare identifier (`workspace.entityId`) evaluates as a truthiness test: non-empty string, non-zero number, true boolean.

Unknown keys evaluate to `undefined`, which is falsy.

### Re-evaluation

Each registered `when`-clause is parsed once at contribution registration and compiled to an AST. The AST is indexed by the set of keys it references. When a key changes:

- the service notifies all consumers (palette, menus, keybindings) that referenced clauses may have changed.
- consumers re-evaluate only the clauses indexed against the changed key.

This makes the visibility surface live without polling. A clause referencing N keys is re-evaluated at most when one of those N keys changes.

### Where when-clauses appear

In contribution manifests:

- **commands** — `when` gates palette visibility and command-invocability via menus / keybindings.
- **menus** — `when` gates each menu item independently.
- **keybindings** — `when` gates whether the binding fires when the chord is pressed (allows multiple commands per chord, disambiguated by `when`).
- **views** — `when` gates whether the view is mounted into its view container.
- **activityBar.items** — `when` gates whether the activity-bar icon appears.
- **statusBar items** (ADR-409 planned) — same.

In code: the `contextKeys.evaluate(expr)` capability lets bundle handlers check an expression at runtime (e.g., "is the editor dirty before I save?").

### Privacy of context keys

Some context keys carry **PHI-adjacent identifiers** — `patient.activeId`, `record.activeId`. These keys are:

- **In renderer memory only.** They are never persisted to disk by the context-key service.
- **Never serialised into audit ledger payloads.** Audit (ADR-502) captures the operation, not the renderer's full context-keys snapshot.
- **Never logged.** Crash dumps, error reports, and telemetry must scrub these keys before transmission (overlaps with ADR-303 O28 on crash-dump scrubbing).
- **Visible only across the trust boundary appropriately.** The platform pushes them to Bundle Host views via the bridge (ADR-411) only for bundles that have declared dependency on them and have consent.

Open Item O94 covers the scrub-and-consent discipline in detail; this ADR commits the principle.

### Configuration-derived context keys

Every configuration key under the `configuration` contribution point (ADR-104 catalogue) is mirrored into the context-key service as `config.<key>`. Updating a configuration value updates the corresponding context key. This lets `when`-clauses gate on user settings without each bundle having to write a watcher.

Mechanism details (when the mirror updates, type coercion, default-value handling) are Open Item O92.

### What this ADR does not commit

- The full menu and keybinding contribution schemas (overlaps with ADR-104 O7 follow-ups).
- The configuration contribution shape and storage (ADR-104 + planned settings ADR).
- The exact privacy / scrub mechanism for PHI-adjacent keys in crash dumps and telemetry (O94).
- The expression evaluator's performance budget (O95).
- Migration policy when the platform renames or removes a platform-published key (Open Item).

## Consequences

### Positive

- Every contribution can be conditionally visible by referencing a small, declared vocabulary. Palette and menus stay legible.
- One grammar; one service; one indexed re-evaluation path. Live UI without polling.
- Namespacing keeps platform and bundle keys cleanly separated. Bundles cannot pollute or spoof platform state.
- PHI-adjacent keys have an explicit privacy stance from the start, not an afterthought.
- Configuration-as-context-key gives `when`-clauses free access to user settings.

### Negative

- Context-keys discipline is real work for bundle authors. Each new "where should this menu item appear?" question is a clause to write and a key to publish.
- The catalogue grows over time. Documentation must keep pace; the platform should ship a "Developer: List Context Keys" command for introspection (proposed implicitly; not yet contributed).
- Expression evaluation correctness is critical — a buggy evaluator hides commands or shows them inappropriately. Test coverage on the parser is load-bearing.

### Neutral

- VSCode's grammar is the standard reference; bundle authors familiar with VSCode pick up the syntax immediately.

## Considered Options

- **No conditional visibility; every contribution always visible** — _Rejected_: palette and menus drown in noise as the bundle count grows.
- **Imperative visibility (each bundle subscribes to events and toggles its own contributions)** — _Rejected_: bundles can't toggle each other's contributions; cross-cutting visibility (e.g., gate every PHI-touching command on `kek.unlocked`) requires every bundle to know about every condition.
- **TypeScript-typed predicate functions in code, not strings in manifests** — _Rejected_: predicates are then bundled with bundle code; the platform cannot evaluate them at manifest-load time, breaking the lazy-activation discipline.
- **String expression grammar over a typed key service, declared in manifest** _(chosen)_ — Matches VSCode; allows static evaluation against current state; cheap to re-evaluate on changes.

## Open Items

- **O91** — Reserved-namespace enforcement at registration time. Lint rule + runtime check.
- **O92** — Configuration-derived context-key mirror mechanism. Type coercion, default-value handling, change propagation.
- **O93** — Bundle-pushed context-key authority limits. Rate limit on `set` calls? Quota on number of declared keys per bundle?
- **O94** — Privacy / scrub discipline for PHI-adjacent context keys (`patient.activeId`, `record.activeId`). Crash-dump scrubbing, telemetry redaction, consent-gated bridge propagation.
- **O95** — Expression evaluator performance budget. Acceptable cost per re-evaluation under realistic clause counts (hundreds to low thousands).
