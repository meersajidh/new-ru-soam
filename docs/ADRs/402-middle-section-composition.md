# Middle section composition

**ID:** ADR-402
**Status:** Accepted
**Date:** 2026-05-13
**Supersedes:** —
**Superseded by:** —
**Related:** ADR-104, ADR-401, ADR-403, ADR-404, ADR-405, ADR-408

## Context

The Middle Section is the visually dominant region of the workbench window (ADR-401). It is where the practitioner spends almost all their time. Its composition has the biggest impact on perceived shape of the product — a workbench whose middle section is "one big editor" feels like a document editor; one with prominent navigation pillars feels like a console; one with a heavyweight panel feels like an IDE. Choosing the composition and committing to it lets every subsequent UI decision rest on a stable spatial vocabulary.

VSCode's middle section is a five-slot composition: Activity Bar, Primary Side Bar, Editor Part, Auxiliary Side Bar, and Panel (with the Panel sitting at the bottom of the central column). Slots are configurable in position — the Activity Bar can sit left or top, the Panel can dock right, side bars can swap sides — without changing the *shape* of the contributions that land in them. That separation of *slot* from *content* is what lets the contribution model (ADR-104) stay clean.

The ru-soam workbench borrows the same five-slot shape. The slots map cleanly onto the mental-health workbench's actual surfaces: top-level navigation (Activity Bar), entity-scoped lists (Primary Side Bar), the artefact in focus (Editor Area), context / inspector (Auxiliary Side Bar), and cross-cutting work (Panel). This ADR commits the slots, their default placement, their contribution shape, and the rules that keep the slots compositional.

## Decision

### Five slots

The Middle Section is composed of five Part slots:

```
┌──────┬──────────────────┬──────────────────────────┬─────────────────┐
│      │                  │                          │                 │
│  A   │     Primary      │                          │   Auxiliary     │
│  c   │     Side Bar     │       Editor Area        │   Side Bar      │
│  t   │                  │                          │                 │
│  i   │   (lists,        │  (generic container —    │   (inspector,   │
│  v   │    trees,        │   notes, forms,          │    properties,  │
│  i   │    nav)          │   timelines, ...)        │    references) │
│  t   │                  │                          │                 │
│  y   │                  │                          │                 │
│      │                  ├──────────────────────────┤                 │
│  B   │                  │                          │                 │
│  a   │                  │          Panel           │                 │
│  r   │                  │   (tasks, alerts,        │                 │
│      │                  │    audit stream, ...)    │                 │
│      │                  │                          │                 │
└──────┴──────────────────┴──────────────────────────┴─────────────────┘
```

Default placement:

- **Activity Bar** — leftmost vertical strip.
- **Primary Side Bar** — left of editor.
- **Editor Area** — center, always present.
- **Panel** — bottom of editor column.
- **Auxiliary Side Bar** — rightmost.

Slot positions are user-configurable (see Configurability below). Defaults align with VSCode for familiarity.

### Slot purposes

| Slot                 | Purpose                                                                                                   | Typical contribution kind            |
| -------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Activity Bar         | Top-level navigation. One item per first-party surface (Patients, Sessions, Calendar, ...) and a handful of platform items (Settings, Recovery). | `activityBar.items`                  |
| Primary Side Bar     | Entity-scoped lists and trees. The active Activity Bar item determines what the Primary Side Bar shows.   | `views` mounted into a `viewContainer` |
| Editor Area          | Whatever is in focus — a session note, a patient profile, a form, a timeline. Generic container.          | `editors` (typed per artefact kind)  |
| Auxiliary Side Bar   | Secondary context for the focused editor: inspector, related records, AI assistant, references.           | `views` mounted into a `viewContainer` |
| Panel                | Cross-cutting work not bound to a single editor: task list, alerts, audit stream, transcript output.      | `panel.views`                        |

Activity Bar and Side Bars are **navigation surfaces**; Editor and Panel are **work surfaces**. The distinction matters for `when`-clause rules later (ADR-407): commands that operate on the active editor key off the Editor Area's active record; commands that operate on a list selection key off the Primary Side Bar's active view.

### Editor Area is a generic container

Per ADR-403 / earlier shaping, the Editor Area is **not** specific to one artefact kind. It is a tabbed, splittable container that hosts an open set of **Editor** instances. An Editor is a typed contribution (kind + open contract + render); a session note Editor and a form Editor are siblings, not subclasses. ADR-404 commits the Editor contract.

The Editor Area's internal layout is its own nested grid: vertical and horizontal splits, each split hosting its own tab strip and active Editor. This matches VSCode's `EditorPart` shape. Splits are how a practitioner views two records side-by-side (e.g., a session note next to the patient's profile).

The Panel sits **below the Editor Area in the central column**, not below the whole Middle Section. With this placement, hiding the side bars widens the editor and the panel together; the panel never extends under the side bars. (VSCode behaves this way too.)

### Panel is in MVP

Per earlier shaping (Q4), the Panel ships in MVP. Its contribution shape is committed here; the *content* of MVP Panel views — what tasks / alerts / audit-stream views actually do — is the subject of ADR-408 and the relevant bundle ADRs (audit-viewer, tasks).

The Panel can host **multiple views** (like the side bars). Switching among them is via a tab strip in the Panel header. A bundle contributes a Panel view through the contribution system; activation gates loading per ADR-105.

### Activity Bar drives the Primary Side Bar

The Activity Bar selects the active **view container** for the Primary Side Bar. Clicking the "Patients" Activity Bar item swaps the Primary Side Bar's contents to the Patients view container. Each Activity Bar item is bound to one Primary Side Bar view container.

This binding is a contribution-time declaration (a bundle's manifest names the view container it contributes and the Activity Bar item that activates it). It is not a runtime decision. The user does not separately bind activity items to side bar contents.

The Auxiliary Side Bar is **not** Activity-Bar-driven by default. It hosts contributions chosen by the active editor (e.g., editing a session note can light up an "Assessment Tools" view in the Auxiliary Side Bar) or by user pinning. This is the asymmetry: Primary = top-down navigation, Auxiliary = bottom-up context. Open Item O60 covers whether the Auxiliary Side Bar grows its own Activity-Bar-equivalent later.

### Visibility and configurability

Each of the five slots has independent visibility:

- The Primary Side Bar can be hidden (default keybinding to toggle; user-configurable).
- The Auxiliary Side Bar is **hidden by default**; the user reveals it when needed. Most workflows do not need a constant secondary side bar.
- The Panel can be hidden, expanded, or maximised.
- The Activity Bar can be hidden (rare; included for completeness — power users may want a Command-Palette-only workflow).
- The Editor Area is **always visible**. A workbench window without an Editor Area is not coherent.

Slot positions are user-configurable through workspace settings (per ADR-403):

- Activity Bar position: `left` (default), `right`, `top`, `hidden`.
- Primary Side Bar position: `left` (default), `right`. Swaps the Auxiliary Side Bar to the opposite side.
- Panel position: `bottom` (default), `right`, `left`. When the Panel is on the right, it sits between the Editor and the Auxiliary Side Bar.

VSCode supports all of these and the user's preference here is strong enough that ru-soam should not impose a different layout. The Parts framework (ADR-401) already supports `moveToSlot` so the underlying machinery is the same.

### Contribution shape

Bundles contribute to the Middle Section through declared contribution points (subject to ADR-104's catalogue):

- `activityBar.items` — top-level Activity Bar entries. Each item declares an icon, a label, a `viewContainer.id` to activate, and (later) a `when` clause.
- `viewContainers` — named view-container slots in the Primary Side Bar (and, optionally, Auxiliary Side Bar). Each Activity Bar item targets one.
- `views` — individual views that mount into a `viewContainer`. A bundle can register multiple views into the same container.
- `panel.views` — Panel views, with the Panel's own tab strip.
- `editors` — Editor types (ADR-404 details).

Bundles do not contribute to the *layout* itself — they only contribute *into slots*. The layout's responsibility is to render the slots; the contributions' responsibility is to provide the content.

### Empty / narrow states

A workbench with no active workspace (per ADR-403 empty-workspace state) renders:

- Activity Bar with only platform items.
- Primary and Auxiliary Side Bars hidden.
- Editor Area showing onboarding / unlock surface.
- Panel hidden.

A workbench in a narrow window: side bars collapse to overlays rather than push the editor area to an unusable width. Threshold and behaviour are Open Item O61.

### What this ADR does not commit

- The set of first-party Activity Bar items (Patients, Sessions, Calendar, etc.). Lives in ADR-405.
- The Editor contract (open / dispose / dirty / serialise). Lives in ADR-404.
- The set of Panel views in MVP. Lives in ADR-408.
- The styling of slot dividers and resize handles. Visual design, not architecture.
- The IPC surface for activity / view switching. Same renderer-internal LayoutService that hosts the Part registry (ADR-401).

## Consequences

### Positive

- The middle section is named in five stable slots. Contributions land in known places; the layout has known dimensions.
- The Editor Area's "generic container" stance keeps the workbench domain-agnostic at its centre — adding a new artefact kind (forms, timelines, video sessions later) is a new Editor type, not a layout change.
- The Activity-Bar-drives-Primary-Side-Bar binding makes the navigation model legible. A practitioner who switches activities knows what changes (the side bar swaps) and what does not (the editors stay open).
- The Auxiliary Side Bar's asymmetric role (context-driven, not nav-driven) gives the workbench somewhere to put inspector-style content without crowding the Primary Side Bar.
- Slot configurability matches VSCode's user expectations; learned behaviour transfers in.

### Negative

- Five slots is a lot of UI to design well. A casual user may feel the workbench is heavyweight; the default visibility of slots (Panel collapsed, Auxiliary hidden) mitigates but doesn't eliminate this.
- The Activity Bar / Primary Side Bar binding can confuse new contributors who expect the Side Bar to be freely composable. Documented in the contribution catalogue when ADR-104 O7 expands.
- The Panel's bottom-of-editor-column placement means it never spans under side bars — different from some other apps where a bottom drawer spans the whole window. Trade-off worth taking for editor-width consistency.

### Neutral

- Slot positions are user preferences; the platform's spatial vocabulary stays constant regardless.

## Considered Options

- **No middle-section structure; the workbench is one editor with optional drawers** — _Rejected_: collapses the navigation and inspector surfaces into the editor or into ad-hoc menus. Doesn't compose with the contribution model.
- **Three slots only (Side Bar, Editor, Panel); no Activity Bar, no Auxiliary Side Bar** — _Rejected_: forces all navigation into one Side Bar, which gets crowded fast once Patients / Sessions / Calendar / Tasks all want top-level homes. No Auxiliary Side Bar means inspectors live in the Panel, which conflates work and context surfaces.
- **VSCode-shaped five slots, Editor as generic container, configurable positions** _(chosen)_ — Reuses the abstraction that solved this problem at scale; maps cleanly onto the mental-health workbench's actual surfaces; absorbs new artefact kinds and contributions additively.

## Open Items

- **O60** — Whether the Auxiliary Side Bar grows an Activity-Bar-equivalent (a secondary navigation strip) once enough contributions land there. Defaults to "no, it stays context-driven".
- **O61** — Narrow-window behaviour for side bars (overlay vs collapse vs hide). UX threshold and breakpoint.
- **O62** — Default slot visibility for the Activity Bar position `top` configuration: where does the Activity Bar render when there's no left strip? Likely above the Primary Side Bar.
- **O63** — Whether Panel views can also appear in the Auxiliary Side Bar (a contribution targeting either / both). Some VSCode views support this; usefulness for ru-soam unclear until first-party Panel views exist.
