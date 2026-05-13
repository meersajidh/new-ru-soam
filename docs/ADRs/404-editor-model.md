# Editor model: generic container for clinical artefacts

**ID:** ADR-404
**Status:** Accepted
**Date:** 2026-05-13
**Supersedes:** —
**Superseded by:** —
**Related:** ADR-104, ADR-302, ADR-402, ADR-403, ADR-410, ADR-411

## Context

ADR-402's Editor Area is the central work surface. It is **generic** — it does not know about session notes, patient profiles, forms, or any specific artefact kind. The artefact-kind logic lives in contributions: a session-note editor is a contribution, a patient-profile editor is another contribution, a form editor is a third, and each is a sibling of the others.

VSCode's parallel is Monaco-as-default-editor plus a "custom editor" contribution that lets extensions register their own editor types per resource scheme. Ru-soam has no Monaco — there is no privileged text editor — so the contract starts cleaner: **every editor is a custom editor**.

This ADR commits the Editor contract (what an editor *is*), the Editor Area's behaviour around tabs / splits / restoration / dirty tracking, and the resource model that ties an editor instance to the record it edits. It does not commit *how a bundle's view actually paints pixels* — that is the renderer-side hosting decision, owned by ADR-411. The two ADRs are deliberately separable: 404 says "an Editor is a typed contribution with this contract"; 411 says "a bundle's view is rendered via this mechanism".

## Decision

### Editor type as contribution

An **Editor type** is contributed by a bundle (ADR-104) through the `editors` contribution point. The declaration:

```json
// illustrative
"contributes": {
  "editors": [
    {
      "id": "ru-soam.audit-viewer.entry",
      "displayName": "Audit Entry",
      "handles": [
        { "scheme": "audit", "pathPattern": "entry/*" }
      ],
      "capabilities": ["record.read", "audit.read"],
      "readOnly": true,
      "view": "ru-soam.audit-viewer/views/entry"
    }
  ]
}
```

Each editor type declares:

- `id` — unique within the bundle.
- `displayName` — user-facing label (used in "Open With" pickers, tab tooltips).
- `handles` — one or more resource patterns it can open.
- `capabilities` — the capability names this editor binds (ADR-103). The platform can pre-grant or prompt for consent at registration time.
- `readOnly` — declares non-editing intent. Editor Area will not show save controls, dirty markers, etc.
- `view` — opaque identifier referencing the view module ADR-411 will render. The shape of this identifier is ADR-411's concern.

### Resource model

An open editor instance is bound to a **resource** — a URI-like identifier:

```
<scheme>://<entityId>/<recordPath>[?<query>]
```

Examples (illustrative):

- `session://<entityId>/2026-05-13T10-00-00/notes`
- `patient://<entityId>/p-7f3a/profile`
- `audit://<entityId>/entry/e-9a21`
- `form://<entityId>/template/intake-cbt`

Schemes are bundle-owned (the Audit Viewer registers the `audit:` scheme; a session bundle would register `session:`). Each scheme has one **owner** bundle; multiple bundles can register editor *types* that `handles` the same scheme. The owner controls record CRUD; consumers render views.

The platform exposes a `resources` capability for resolving, watching, and mutating resources. Each bundle's owned scheme is backed by its data layer (per ADR-302's local-first model). Resource resolution is an IPC call through Main; bundles never address each other's data stores directly.

### Editor Area mechanics

The Editor Area composes:

- **Editor groups** — vertical and horizontal splits forming a nested grid. Each split is an editor group.
- **Tabs** — each editor group has a tab strip; each tab is an open editor instance.
- **Active editor** — at most one editor is active per group; the workbench has at most one **active editor area editor** (the focused one across groups). Active state surfaces as a context key (`editor.activeResource`, `record.activeKind`, etc., per ADR-407).

Splits are user-driven (drag-tab-to-split, command palette, keybindings). Two splits showing the same resource have independent editor instances pointing at the shared resource; edits are visible across both via resource change events.

### Open mechanics

A request to open a resource flows:

1. The user (or a command, or another bundle) invokes `editors.open(resource)`.
2. The platform consults the registry for editor types whose `handles` matches the resource.
3. If one type matches, it is used.
4. If multiple types match, the user's last-used choice for that resource (or scheme) wins; otherwise the platform's default for the scheme; otherwise an "Open With" prompt appears.
5. The resolved editor type's `view` is instantiated in the target group (active group by default; explicit target if specified).

`editors.open(resource)` is a renderer-internal call on the EditorService (a counterpart of the LayoutService introduced in ADR-401). The service is the only path; bundles do not reach into the Editor Area's component tree.

### Dirty state and save

A non-readonly editor has a `dirty` state: true when local edits diverge from the last-persisted record, false otherwise. Dirty state:

- is **per editor instance**, surfaced as `editor.isDirty` context key (per ADR-407).
- is reported by the editor's view through a typed callback (ADR-411 will specify the renderer ↔ view contract for this).
- is reflected on the tab (visual marker), on the editor area's overall dirty count, and in workspace-level "do you want to save?" prompts on workspace close.

Save flow:

- **Local-first save** (per ADR-302): a save commits the change to the Local Store first; sync queue handles cloud propagation in the background.
- Save is **explicit** by default (Ctrl/Cmd+S, command palette, save action). Autosave is a per-editor-type setting (default off; can be opted in by the editor type's manifest or by user setting). Mental-health workflow benefits from explicit save points — a session note shouldn't autosave a half-formed sentence mid-thought.
- Save invokes the editor's `save` capability; the editor's view is responsible for serialising its working state and handing it to the resource owner via the platform's `resources` capability.
- A failed save leaves the editor dirty; the platform surfaces the failure as a banner (ADR-401) and lets the user retry.

Open Item O74 covers the autosave default and the per-editor-type override mechanism.

### Read-only editors

Editor types may declare `readOnly: true`. The Editor Area:

- Hides save controls and dirty markers.
- Routes write attempts (paste, drag-drop, command) to a "read-only" no-op.
- Allows the view to render selection / annotation state if relevant (e.g., the Audit Viewer can let the user select a span for export without that being an "edit").

The Audit Viewer is the canonical read-only editor.

### Editor restoration

The Editor Area persists, to workspace state (ADR-403):

- **Editor descriptors**: which resources are open, in which groups, in which order. Just enough to re-open the same set after workspace close / reload.
- **Active editor**: which one had focus when closed.
- **Group layout**: split topology and sizes.

The Editor Area does **not** persist editor *contents* — the records themselves live in the Local Store via the owning bundle. Restoration is "re-open these resources in these positions", not "re-hydrate this in-memory state".

A bundle that owns the editor type may opt into deeper restoration by serialising additional view state into a typed payload (cursor position, scroll, filter state, etc.). The shape and storage of this payload is Open Item O76; the platform-level guarantee is that the descriptor restoration always works regardless of bundle cooperation.

### Editor type uniqueness and the "Open With" surface

Multiple editor types can `handles` the same resource. The Editor Area resolves which to use on open per the rules above. The user can also **explicitly open with** a specific editor type from a command or context menu.

For an empty Editor Area (no resources open), the Editor Area renders a platform-provided placeholder — a welcome surface that the Onboarding item (ADR-405) populates, or a "no record open" hint when the workspace has loaded but nothing is in focus.

### Editor lifecycle and disposable

An editor instance follows the [disposable pattern](../Guides/disposable-pattern.md):

- Created via `editors.open(resource)`.
- Owns its view's lifecycle (created when opened, destroyed when the tab closes).
- The owning bundle is notified of close via a typed event.
- Dispose runs the view's cleanup *and* releases the resource reference (so the resource owner can drop watchers).

A bundle's Bundle Host process holding the editor type can be torn down (per ADR-410); the renderer-side view persists transiently and shows a "bundle inactive" state until restart. This split — view alive, model dead — is the natural failure surface and the renderer reflects it without crashing.

### What this ADR does not commit

- How a bundle's view actually renders. Lives in ADR-411 (iframe / WebContentsView / native React mount / declarative tree — TBD).
- The renderer ↔ view contract for dirty-state callbacks, scroll restoration, focus, etc. ADR-411.
- The `resources` capability schema (CRUD, watching). Touches ADR-302's local-first read model; lands when the first resource-owning bundle ships.
- Specific resource scheme registrations (other than the illustrative ones used here).
- The set of editor types beyond the Audit Viewer's read-only entry editor.

## Consequences

### Positive

- Every artefact kind in the workbench is an editor type — sibling, not subclass. New kinds add a contribution, not a code branch.
- The Editor Area's mechanics (tabs, splits, restoration, dirty tracking) are domain-agnostic and reusable.
- The resource model gives the platform a uniform addressing scheme across bundles.
- Read-only editors are a first-class category; the Audit Viewer has a sensible home.
- Save discipline (local-first, explicit by default) matches the mental-health workflow.

### Negative

- "Generic container" means there is no privileged text editor like Monaco. Each editor type carries its own view, including text-editing concerns if any. Mitigated if bundles share a common rich-text package (likely a future first-party utility bundle).
- The split between ADR-404 (editor model) and ADR-411 (view hosting) means a complete picture of "how editors work" requires reading both. Documented explicitly here.
- Save-on-close prompts can multiply with many dirty editors. The platform needs an aggregate "save N changes?" surface.

### Neutral

- Tabs and splits are familiar from VSCode and most modern IDEs. The mental-health workbench inherits the muscle memory.

## Considered Options

- **Editor Area is the session-note editor; everything else is a side bar / panel** — _Rejected_: locks the workbench's centre to one artefact kind; forces patient profiles and forms into navigation surfaces, distorting the spatial vocabulary.
- **Editor Area is multi-kind but kinds are hardcoded in core** — _Rejected_: bundles cannot ship new kinds; first-party-bundle discipline (ADR-405) breaks at the editor level.
- **Editor types as bundle contributions, resource-URI model, local-first save, view hosting deferred to ADR-411** _(chosen)_ — Matches the contribution model; keeps the Editor Area generic; leaves the view-hosting decision separable.

## Open Items

- **O73** — Resource URI scheme registry. Bundle-scoped naming, format constraints, conflict resolution if two bundles try to register the same scheme.
- **O74** — Autosave default and per-editor-type override. Mental-health-workflow argues for explicit-save default; some artefact kinds (a quick note draft, a calendar event) may want autosave. Settings-shape question.
- **O75** — Save failure UX. Banner kind, retry policy, queue-the-write semantics, interaction with sync queue (ADR-302).
- **O76** — Editor view-state serialisation depth. Beyond descriptors (resource + group), how much of view state (cursor, scroll, filters, expansion) the platform persists, and the schema for the bundle-owned payload.
- **O77** — "Save N changes?" aggregate prompt design. Triggers on workspace close, on KEK re-lock, on update apply. Whether to allow per-editor save/discard or all-or-nothing.
