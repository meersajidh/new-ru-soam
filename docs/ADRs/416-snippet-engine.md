# Snippet engine

**ID:** ADR-416
**Status:** Accepted
**Date:** 2026-05-16
**Supersedes:** —
**Superseded by:** —
**Related:** ADR-103, ADR-404, ADR-411, ADR-412, ADR-414, ADR-415

## Context

ADR-414 commits RuEdit as the platform's editor primitive built on raw ProseMirror, and lists **O128 — "SmartText engine"** as the next major feature after the RuEdit core skeleton (Phases 7.5a–7.5c).

Two issues need to be resolved before the engine can be designed:

1. **Vocabulary collision.** Epic's clinical documentation surface uses a trademarked family — *SmartPhrase*, *SmartText*, *SmartList*, *SmartLink*, *SmartTools*. In Epic's taxonomy these names already have specific, non-overlapping meanings:
   - **SmartPhrase** — a dot-prefix abbreviation (e.g. `.hpi`) that the clinician triggers mid-prose to expand into a phrase, paragraph, or short template.
   - **SmartText** — a *whole-document* default template loaded automatically when a note type opens; governed by clinical informatics.
   - **SmartList** — a picklist embedded inside a SmartPhrase or SmartText.
   - **SmartLink** — a token that pulls live chart data (vitals, meds, problem list) into the note at expansion time.

   ADR-414's O128 was labelled "SmartText engine" but in Epic's vocabulary the feature being described — clinician types `/abbrev`, snippet expands, placeholders walk on Tab — is **SmartPhrase**, not SmartText. Beyond the mislabelling, the entire `Smart*` family is Epic IP. Using any of those names in our product surface invites brand confusion at best and a trademark issue at worst.

2. **Numbering.** ADR-414 §What RuEdit owns left open whether Snippet work would land as "Phase 7.6" (preserving the existing chain) or as a renumbered "Phase 8" (shifting Crypto and everything downstream by +1). The Implementation Plan's gate before Snippet work starts is the right place to lock numbering, but the ADR needs to commit to a vocabulary so the plan can reference it without further confusion.

This ADR resolves both: a generic, copyright-clean vocabulary and the concrete engine design.

## Decision

### Vocabulary: generic, no `Smart*`

Across ADRs, the Implementation Plan, code, and product surfaces:

| Concept | Name |
|---|---|
| Dot-/slash-trigger snippet expansion engine (Epic: SmartPhrase) | **Snippet** |
| Whole-document default template per note type (Epic: SmartText) | **Template** |
| Embedded picklist field inside a Snippet or Template (Epic: SmartList) | **Picklist** |
| Chart-data binding token (Epic: SmartLink) | **DataLink** |

The `Smart*` family is Epic's. We never reuse it — neither in user-facing strings, nor in code identifiers, nor in docs except when explicitly noting the Epic-equivalent for a reader's benefit. New names introduced by future phases follow the same rule.

Phase 8 ships only the **Snippet** engine. Template, Picklist (as a Snippet placeholder type), and DataLink are described below as scope boundaries; only Picklist *placeholder* lands in Phase 8 (see §Scope). Template lands in a later phase; DataLink is a reserved placeholder type with no implementation until the chart/FHIR phase.

### Engine: a ProseMirror plugin in `@ru-soam/editor`

The Snippet engine lives inside `packages/editor` (the same package as RuEdit), as a new module:

```
packages/editor/
└── src/
    └── snippets/
        ├── registry.ts        SnippetRegistry, SnippetDef, types
        ├── trigger-plugin.ts  ProseMirror plugin: trigger detection + completion popup decoration
        ├── expand.ts          single-transaction expansion (template insert + placeholder nodes + selection)
        ├── placeholders.ts    placeholder node type, walk/finalize/abort keymap
        ├── picklist-view.ts   vanilla DOM nodeView for picklist placeholders (per ADR-415)
        └── index.ts
```

The engine integrates with RuEdit via `mountRuEdit`'s options bag — there is no second mount API, and no React inside the content (per ADR-415):

```ts
// illustrative
mountRuEdit(container, {
  initial,
  readOnly,
  onChange,
  snippets: snippetRegistry, // optional; absent = trigger detection inert
});
```

### Trigger character: `/`

Snippets are triggered by the user typing `/` followed by the abbreviation, ended by `Tab` (or `Enter`, or by clicking a completion entry).

`/` is chosen over `.` and `;`:

- `.` collides with sentence punctuation. In a prose-first clinical surface the trigger fires constantly on sentence ends; suppression heuristics add complexity for no gain.
- `;` is rare in English clinical prose but visually indistinguishable from punctuation at glance; clinicians coming from Epic muscle-memory `.hpi` find it less natural.
- `/` matches the trigger most modern surfaces (VSCode command palette, Slack/Discord slash commands, Notion's slash menu) already use. Clinicians lose Epic's `.hpi` reflex but the trigger is unambiguous inside prose.

Epic-trained clinicians will need vocabulary retraining for `Snippet` and trigger retraining for `/`. The platform is not an Epic clone; the cost is paid once.

### Registry shape

A `SnippetRegistry` is an in-memory store passed in by the mounter. Persistence, sharing, authoring UI, and capability surface (`snippets` capability for bundles to contribute) are out of scope for Phase 8 (see §Open items).

```ts
// illustrative
export interface SnippetRegistry {
  get(abbrev: string): SnippetDef | undefined;
  list(): SnippetDef[];
  // mutation not part of the runtime contract — Phase 8 seeds via developer command
}

export interface SnippetDef {
  id: string;                   // stable identifier (UUID)
  abbrev: string;               // trigger text after '/' (e.g. "hpi")
  label: string;                // display in completion popup
  body: SnippetBody;            // RuEdit doc fragment with placeholder markers
  placeholders: SnippetPlaceholder[];
}

export type SnippetBody =
  | { kind: "doc"; fragment: ProseMirrorNodeJSON };  // structured fragment of doc nodes

export type SnippetPlaceholder =
  | { name: string; type: "text"; default?: string }
  | { name: string; type: "picklist"; options: string[]; default?: string };
// 'number' | 'date' are reserved type names but not implemented in Phase 8 (O416a).
// 'datalink' is reserved (O416d).
```

`body` is a structured RuEdit document fragment, not a string. Placeholders inside the fragment are represented as `placeholder` nodes — first-class atomic inline nodes in the schema, addressed below.

### Schema v1 → v2

The codec gains a schema version bump:

- Schema v1 (Phase 7.5): paragraph, heading 1-3, bullet/ordered lists, blockquote, hr, hard_break; marks strong/em/underline/code.
- Schema v2 (Phase 8): all of the above, plus a single new inline atomic node `placeholder` with attributes `{ name: string; type: "text" | "picklist"; default?: string; options?: string[]; value?: string }`.

The `placeholder` node is **atomic** (`atom: true`) and **inline** (`inline: true`). It cannot be split, partially selected, or directly typed into; it is replaced as a unit. This is exactly the kind of atomic node ADR-414 §Engine cites as the reason for raw ProseMirror.

Codec migration v1 → v2 is a no-op for documents that contain no placeholders, which is every document persisted before Phase 8. Schema-version mismatch in the opposite direction (v2 doc into a v1 codec) raises the named recoverable error per ADR-414.

### Expansion: single transaction

When the user types `/hpi`+Tab (or selects "hpi" from the completion popup):

1. The plugin removes the trigger text (`/hpi`) from the document.
2. At the same position, it inserts the snippet `body` fragment, with placeholder nodes for each placeholder slot.
3. Selection is set to span the first placeholder.

All three steps are one ProseMirror transaction — one history step. `Ctrl+Z` immediately after expansion reverses the whole expansion, restoring the typed trigger text. This is exactly the composite-transaction example ADR-414 §Engine cites.

### Placeholder walk

While at least one placeholder remains in the document (in document order, scanning from the cursor):

- `Tab` — finalize current placeholder, advance to next.
- `Shift+Tab` — finalize current placeholder, retreat to previous.
- `Enter` on the last placeholder — finalize current placeholder; if no more remain, expansion is complete.
- `Esc` — **abort**: revert the document to its pre-expansion state via the history step (single undo). Selection returns to the original cursor position.

"Finalize" a `text` placeholder means: the placeholder node is replaced by a text node carrying the typed content (or its `default` if untouched). "Finalize" a `picklist` placeholder means: the placeholder node is replaced by a text node carrying the selected option (or its `default` if untouched). Once all placeholders are finalized the document contains zero `placeholder` nodes — the snippet has decayed into ordinary structured content.

Walking stops when the cursor leaves the snippet via any non-Tab/Esc input that is not directly editing the current placeholder. The remaining placeholders persist in the doc, finalize-on-Tab still works if the cursor lands in or after them, and the doc round-trips through the codec with placeholders intact.

### Picklist placeholder rendering

`picklist` placeholders render via a **vanilla DOM `NodeView`** (ADR-415 §NodeViews are imperative DOM through Phase 9). When the placeholder receives focus the nodeView opens an inline dropdown built with `document.createElement`; arrow keys + Enter select, Tab advances (firing the placeholder-walk keymap), Esc closes the dropdown without selection. The nodeView reads `options` and `default` from the node's attrs; the dropdown has no React.

### `ISnippetService`

The renderer's service registry (per ADR-412) gains a new identifier:

```ts
// illustrative
export interface ISnippetService {
  registry(): SnippetRegistry;
  // mutation API (register / unregister / seed) lands when the capability surface lands (O416c).
}
```

`SnippetServiceId` is registered in `boot.ts`, sibling to `RuEditServiceId`. The scratch RuEdit instance pulls `registry()` from the service and passes it into `mountRuEdit`'s `snippets` option.

In Phase 8 the registry is in-memory and populated by a single developer command (`developer.snippets.seed`) with three fixed test entries — one plain-text snippet, one with a `text` placeholder, one with a `picklist` placeholder.

### Context keys

A new context key set surfaces snippet state to commands and keybindings:

- `snippet.active` — `true` when at least one unfinalized placeholder exists in the current RuEdit instance and the cursor is inside the active snippet's range.
- `snippet.placeholder.type` — `text` or `picklist`, only set when `snippet.active`.

These mirror the `ruEdit.activeInstance` context key landed in 7.5b; they let future command-palette commands target "next placeholder" / "abort snippet" without a global handler.

### What this ADR does not commit

- **Persistent snippet storage.** Phase 8 holds the registry in renderer memory only. Persistence layer (clinician's snippet library on disk, encryption alignment with PHI) lands with the Local Store phase (renumbered Phase 9) or with a workspace-settings phase.
- **Snippet authoring UI.** Original O122 (was: "Template authoring UI"); renamed to **O416c — Snippet authoring UI**. Long-range.
- **Capability surface for bundles to contribute snippets.** Bundles will eventually contribute via a `snippets` capability per ADR-103 / ADR-104. Phase 8 has no bundle integration; only the developer-command seed exists.
- **Type-constrained validators (`number`, `date`).** Reserved type names in the type union, no runtime handling. Lands with the first clinical consumer that needs them (O416a).
- **DataLink placeholder type.** Reserved type name, no implementation. Lands with the chart/FHIR phase.
- **Templates** (Epic-equivalent of "SmartText" — whole-doc default per note type). Distinct phase, distinct ADR, after the first concrete editor-type view requires a default scaffold.
- **Snippet recursion.** A snippet body containing a `/abbrev` that re-triggers expansion. Phase 8 treats placeholder finalize as plain-text replacement; recursion is explicitly out (O416d).
- **Shared / clinic-level registries.** All snippets in Phase 8 are workspace-local. Sharing lands with Phase 11+ (sync) or workspace settings (O416b).
- **React-in-nodeView strategy.** Owned by ADR-415's O130 at Phase 10 (renumbered) entry. Picklist nodeView is vanilla per that ADR until O130 resolves.

## Consequences

### Positive

- Clinicians get keyboard-first snippet expansion — the single most-cited efficiency feature of Epic — without any Epic-trademarked vocabulary.
- The engine is local to `@ru-soam/editor`; no new package, no new mount API. RuEdit's existing render path is unchanged except for the new schema version and the optional `snippets` mount option.
- Composite-transaction expansion gives single-step undo for free, matching ADR-414's stated reason for raw ProseMirror.
- Schema v2's `placeholder` node is the first atomic inline node we ship. It exercises the codec migration path before O129's heavier atomic blocks (Vitals etc.), de-risking that future phase.
- Picklist nodeView lands as vanilla DOM, in line with ADR-415; the O130 decision at the renumbered Phase 10 stays unconstrained.

### Negative

- The Snippet placeholder model carries forward through every later phase that touches the editor — including the eventual O130 React-fork decision. If O130 chooses the React fork, the picklist nodeView is rewritten.
- `/` as the trigger character costs Epic-trained clinicians a small retraining moment. Suppression of `/` in casual prose (URL paths, ratios) isn't a real issue inside a clinical note but could surprise on first use.
- Schema v2 means every persisted RuEdit doc going forward declares `schemaVersion: 2`. Phase 7.5 docs (none persisted beyond sessionStorage demos) require no migration; future docs do.
- Snippets without persistence in Phase 8 means a hard restart wipes the seeded registry. The developer command re-seeds, but this is plainly an interim state.

### Neutral

- Vocabulary policy ("no `Smart*`") is enforced by review; there's no automated check. Costs nothing while the team is small.

## Considered Options

- **Reuse `SmartText` / `SmartPhrase` names as in Epic** — _Rejected_: Epic trademarks. Brand confusion for clinicians arriving from Epic, IP risk regardless.
- **Use `Ru*` prefixed names (RuPhrase, RuPick, RuLink) consistent with RuEdit** — _Rejected_ in favour of generic vocabulary: distinctive but cosmetic; the editor primitive earns the brand prefix, the user-facing features don't need it. Generic vocabulary scans naturally in clinician-facing copy.
- **Defer trigger character to a workspace setting** — _Rejected for Phase 8_: settings infrastructure isn't load-bearing for this phase, and the engine needs a default. Workspace-setting override of trigger character is a long-range nicety, not a constraint on the engine.
- **Render placeholders with React-fork (`@handlewithcare/react-prosemirror`) nodeViews now** — _Rejected_: ADR-415 explicitly defers this to the first phase that requires it. The picklist UI in Phase 8 is shallow enough that vanilla DOM is sufficient.
- **Single-package decision: split snippets into a new package `@ru-soam/snippets`** — _Rejected_: snippet expansion is a ProseMirror plugin against the same schema RuEdit owns. Splitting introduces a circular-or-redundant dep with no payoff while the schema and codec live in `@ru-soam/editor`.
- **Trigger on `.`** — _Rejected_: sentence-end collision.
- **Trigger on `;`** — _Rejected_: visually weak; `/` matches modern surfaces.
- **`/`-prefix slash trigger + atomic placeholder nodes + vanilla picklist nodeView, in `@ru-soam/editor`** _(chosen)_ — Smallest engine, single undo step, lines up with ADR-414 / ADR-415, leaves the door open to every deferred item.

## Open Items

- **O416a** — Type-constrained placeholders. Beyond `text` and `picklist`: `number` (numeric-only input + range validation), `date` (date picker or constrained text), free-text with regex validators. Lands when the first clinical consumer needs them.
- **O416b** — Shared / clinic-level snippet registries + persistence. Local-workspace persistence lands when Local Store ships; multi-clinician sharing aligns with the sync phase. Both downstream of the renumbered Phase 9 / 11.
- **O416c** — Snippet authoring UI. Clinician edits own snippet library inside ru-soam. Originally tracked as ADR-414 O122 ("Template authoring UI"); renamed and re-scoped here. Long-range; lives in a product phase.
- **O416d** — Snippet recursion / nested expansion. A snippet body that contains a `/abbrev` re-triggering on finalize. Defer until a use case exists.
- **O416e** — DataLink placeholder type (Epic-equivalent of SmartLink). Reserved type name only in Phase 8; full implementation requires a chart/FHIR phase with capability-mediated data access.
- **O416f** — Template phase (Epic-equivalent of SmartText): whole-document default scaffolds per note type. Distinct ADR; sequenced when editor-type views with note-typed resources land (first clinical editor-type phase). May reuse the `placeholder` node from schema v2.
- **O416g** — Trigger-character override per workspace setting. Long-range; default `/` is committed.
- **O416h** — Completion popup UX (filter, ordering, recent-first, descriptions). Phase 8 ships a minimal list; richer UX once snippet libraries grow.

## Closes

- **O128** (ADR-414) — superseded by this ADR. The phrase "SmartText engine" is retired; the work it described is the Snippet engine specified here.
