# RuEdit: platform editor primitive

**ID:** ADR-414
**Status:** Accepted
**Date:** 2026-05-16
**Supersedes:** —
**Superseded by:** —
**Related:** ADR-103, ADR-401, ADR-402, ADR-404, ADR-410, ADR-411, ADR-412, ADR-415

## Context

ADR-404 commits the Editor Area as a generic container — every editor is a "custom editor" contributed by a bundle, with no privileged platform text editor. That ADR's **Negative** consequence section explicitly flags this:

> "Generic container" means there is no privileged text editor like Monaco. Each editor type carries its own view, including text-editing concerns if any. Mitigated if bundles share a common rich-text package (likely a future first-party utility bundle).

The intervening design work for clinical documentation (vitals, allergies, ICD-10 picklists, SmartText-style snippet expansion, structured/free-prose hybrid records) makes the "each bundle ships its own rich-text engine" path untenable in practice:

- **Schema rigor**: clinical data must round-trip through a typed JSON schema (FHIR/HL7/SNOMED layers downstream). HTML or open-shape JSON is unfit; off-the-shelf editors that target Notion-style ergonomics (BlockNote, Tiptap-StarterKit) provide neither validation nor immutable structural fields.
- **UX shape**: clinicians type fast, hate mouse, expect SmartText/SmartList ergonomics (Epic). Notion-style hover toolbars and drag handles are the wrong default. We need a keyboard-first chrome we control.
- **Print fidelity**: clinical notes become signed legal records. Print-quality PDF is required; `html2pdf.js`-grade output is not acceptable. Free OSS rich-text packages either omit export entirely or paywall it (BlockNote XL is GPL-3 / commercial).
- **React integration**: ProseMirror's synchronous DOM ownership conflicts with React's two-phase async render cycle (documented in Smoores 2024, recorded as ADR-415). Choosing a wrapper that hides this mismatch from us is a long-term reliability bet against ourselves.
- **Licensing**: every paid tier in a dep chain is a future migration. The platform's "batteries-included free core" charter demands MIT/MPL deps only.

The conclusion: ru-soam needs an editor surface analogous to **Monaco-in-VSCode** — a first-party, platform-owned, workbench primitive that all clinical bundles can import and extend. We call it **RuEdit**.

RuEdit is not "yet another editor type" sitting beside the Audit Viewer. It is a **primitive** — a building block. Editor types (per ADR-404) that handle prose-bearing resources (session notes, intake narratives, discharge summaries, etc.) compose RuEdit inside their view. The Audit Viewer remains read-only with its own bespoke renderer; nothing about ADR-404's contract changes.

## Decision

### RuEdit is a workbench primitive

RuEdit ships in the platform monorepo as `@ru-soam/editor`. It is installed alongside the platform, available to every renderer module, every editor-type view (per ADR-404), and every bundle view (per ADR-411). It is **not** a bundle. It does not register a contribution. It is core, like `command`, `keybinding`, `layout`, `context-key`.

Bundles never re-implement rich text. A bundle that wants a rich-text surface imports `@ru-soam/editor` and composes it in its view code. Configuration (schema overlays, custom blocks, snippet libraries) flows through structured options passed to the mount call, not through ad-hoc DOM mutation.

### Engine: raw ProseMirror

RuEdit is built on **raw ProseMirror** (`prosemirror-model`, `prosemirror-state`, `prosemirror-view`, `prosemirror-transform`, `prosemirror-commands`, `prosemirror-keymap`, `prosemirror-history`, `prosemirror-schema-list`, `prosemirror-inputrules`). All under MIT or BSD licences. No Tiptap, no BlockNote, no Lexical, no CodeMirror.

Why raw ProseMirror, not a wrapper:

- **Schema-validated document model**: ProseMirror enforces structural invariants at the engine level (e.g., "a Vitals block contains exactly four typed cells"). Wrappers (Tiptap, BlockNote) expose this but layer their own abstractions on top; for a Monaco-equivalent we own the abstraction layer ourselves.
- **Atomic nodes and locked ranges**: first-class. SmartText placeholders, immutable template scaffolding, Vitals/Allergies/MedList cells, picklist nodes — all expressible without leaving the engine.
- **Decoration API**: in-place widgets (validation underlines, picklist chips, snippet hints) without polluting the document.
- **Transaction model**: composite operations (SmartText expansion = insert template + insert placeholders + position selection on first placeholder) are one atomic step; undo behaves correctly.
- **Licence**: MIT, no paid tier, no commercial track. Maintained by independent contributors with predictable release cadence.
- **Track record**: used in Notion, Atlassian, Substack, New York Times, ProseMirror itself. The engine is battle-proven at clinical scale.

Why not the alternatives:

- **Tiptap** — friendly wrapper on ProseMirror; saves a week, costs control forever. Adds an abstraction we don't need and a Pro tier we won't buy.
- **Lexical** — Meta-controlled, weaker schema model, painful for atomic embedded forms.
- **BlockNote** — opinionated Notion-style UX (wrong default for clinicians), `@blocknote/xl-*` paywall on PDF/DOCX exports, locks us into Mantine.
- **CodeMirror 6** — fastest typing engine but single-document model fights embedded React forms.

### Package shape

```
packages/editor/                        @ru-soam/editor
├── src/
│   ├── core/                           prosemirror-* re-exports + glue
│   ├── schema/                         clinical-document schema v1 (paragraphs, lists, headings, blockquote, hr; marks: strong/em/underline/code)
│   ├── codec/                          { schemaVersion, doc } envelope; toJSON / fromJSON
│   ├── ids/                            stable per-block IDs (assigned via appendTransaction plugin)
│   ├── keymap/                         default keymap (undo/redo, list nav, marks, headings, hard-break)
│   ├── mount/                          mountRuEdit(container, options) -> RuEditHandle  (vanilla; no React inside content)
│   └── index.ts
└── package.json
```

The platform-side React chrome (`RuEditView` wrapper, `IRuEditService` registration) lives in `apps/desktop/src/platform/ru-edit/` and consumes `@ru-soam/editor`. The editor package itself stays React-free — the React boundary is per ADR-415.

### Workbench primitive: `IRuEditService`

The renderer service registry (per ADR-412) gains a new identifier:

```ts
// illustrative
export interface IRuEditService {
  mount(container: HTMLElement, options: RuEditMountOptions): RuEditHandle;
}

export interface RuEditMountOptions {
  initial?: RuEditDoc;
  readOnly?: boolean;
  onChange?: (doc: RuEditDoc) => void;
}

export interface RuEditHandle {
  getDoc(): RuEditDoc;
  setDoc(doc: RuEditDoc): void;
  focus(): void;
  dispose(): void;
}
```

`RuEditServiceId` is registered in `boot.ts`, sibling to `EditorServiceId` (note the name distinction: `EditorService` per ADR-404 owns tabs / groups / splits; `RuEditService` owns rich-text instances). Editor-type views consume `useService(RuEditServiceId)`.

### Document JSON shape

RuEdit's persisted format is a versioned envelope:

```jsonc
{
  "schemaVersion": 1,
  "doc": { /* ProseMirror node JSON, recursive */ }
}
```

Every block node carries a stable `_id` attribute (UUID v4 in Phase 7.5; revisit UUID v7 in O131 when revisions land). IDs survive serialisation, edits, undo/redo, save/restore cycles. Diffing and per-block revision history at higher phases use these IDs as identity. The codec validates `schemaVersion`; mismatches raise a named, recoverable error rather than silent coercion.

### What RuEdit owns

In Phase 7.5 (initial landing):

- the schema (paragraphs, headings 1-3, bullet / ordered lists, blockquote, horizontal rule, hard break; strong / em / underline / code marks)
- the keymap (history, list nav, marks, headings, hard break)
- the JSON codec
- the imperative `mountRuEdit` API
- the `IRuEditService` registration
- one developer scratch command for verification

In later phases (numbering deferred — either renumber the existing Phase 8+ chain by +1 to give SmartText "Phase 8", or interleave as Phase 7.6 / 7.7 / 7.8 and preserve the existing chain; decision lives in the Implementation Plan gate before SmartText work starts):

- **SmartText engine** (O128) — trigger character, phrase registry capability, placeholder navigation, abort / finalize.
- **Custom atomic blocks** (O129) — Vitals as first concrete block, schema validation via Zod, SmartList picklist node, ICD-10 mock registry.
- **Print pipeline** (O132) — Puppeteer-in-Main capability, JSON-to-print-React, page template, signature block.
- **Voice dictation adapter** (O120), **multi-clinician collab** (O121, deferred indefinite), **template authoring UI** (O122).

### What RuEdit does not own

- **Tab / group / split management.** Owned by `EditorService` per ADR-404. RuEdit instances mount inside an editor-type view's DOM; the editor-type view is the unit the Editor Area tracks.
- **Resource I/O.** RuEdit consumes and emits `RuEditDoc` JSON; persistence and resource resolution go through the `resources` capability surface (per ADR-404's open items O73-O77).
- **Print rendering.** RuEdit emits JSON; the print pipeline (Phase 10) is a separate Main-side capability.
- **Voice input.** Deferred to O120.
- **Multi-user awareness.** Deferred to O121.

### Phase ordering

RuEdit lands as **Phase 7.5 — RuEdit core skeleton** (matching the existing X.5 follow-on convention). It comes *after* Phase 6.5 (Bundle Host hardening) and Phase 7 (view hosting), because:

- A misbehaving editor instance should not crash the workbench; Phase 6.5 hardens the host that future editor-bearing bundles will sit in.
- Editor-type views (per ADR-404) that compose RuEdit may live inside iframe-hosted bundle views (per ADR-411); the view-hosting mechanism must exist before we can dogfood that path.

RuEdit itself is renderer-trust code in the workbench shell, not Bundle Host code, so neither dependency is strictly load-bearing for the *first* RuEdit demo. Both are load-bearing for the *first clinical* use, which is the right bar.

## Consequences

### Positive

- One canonical, owned, MIT-licensed rich-text surface for the whole platform. No per-bundle reinvention.
- Schema-validated JSON at the engine level — clinical structural fields, SmartText placeholders, picklist chips, all expressible without DSL.
- Long-term flexibility: every editor-related UX decision (keymap, validation, print, voice) lands in one package we control.
- Bundles benefit from RuEdit without depending on a paid tier or a Notion-style abstraction they have to fight.
- Reverses ADR-404's "no Monaco" stance for prose-bearing editor types; the Audit Viewer remains read-only and bespoke, unaffected.

### Negative

- Platform team owns an editor surface forever. ProseMirror is stable but the integration layer (schema, keymap, blocks, codec) is ours to maintain and evolve.
- Initial bring-up is non-trivial — multiple phases of work before the editor is feature-competitive with a generic Notion-style alternative. Scope discipline (one phase, one feature group) mitigates.
- We carry an extra workspace package and an extra service in the registry.

### Neutral

- ProseMirror's API surface is large; engineers new to the codebase need to learn the document/state/view triad. Documentation is the mitigation; the upstream guide is the source of truth.

## Considered Options

- **Reuse ADR-404's "every editor is a custom editor" status quo; each bundle ships its own engine** — _Rejected_: cost multiplies per bundle, no canonical clinical schema emerges, version drift across bundles, no shared SmartText / picklist primitives. Worst possible outcome for an EMR workbench.
- **Adopt BlockNote as the de facto editor; ship it inside the first clinical bundle** — _Rejected_: Notion UX wrong for clinicians; XL paywall on exports; locks us into Mantine and BlockNote's release cadence; React-PM mismatch hidden behind the wrapper, not solved.
- **Adopt Tiptap as a managed ProseMirror layer** — _Rejected_: adds an abstraction the platform doesn't need; Tiptap Pro tier exists and would tempt future features into a paid tier.
- **Adopt Lexical (Meta) for "React-native" reasons** — _Rejected_: schema model weaker than ProseMirror's; atomic embedded forms harder; Meta-controlled cadence.
- **Build RuEdit on raw ProseMirror, ship it as `@ru-soam/editor`, expose `IRuEditService` as a workbench primitive** _(chosen)_ — Matches Monaco-in-VSCode's role; owns the engine boundary; MIT-only; aligns with ADR-412's service registry; defers React boundary to ADR-415.

## Open Items

- **O128** — SmartText engine. Trigger character, phrase registry capability surface, placeholder navigation (Tab / Shift+Tab / Esc / Enter), type-constrained placeholders (number, date, picklist). Lands in the phase immediately after RuEdit core (Phase 7.5).
- **O129** — Custom atomic blocks. Vitals as first concrete block; Allergies, MedList, picklist node follow. Schema validation via Zod layer between editor doc and persistence.
- **O130** — React-in-nodeView strategy. At the custom-block phase's entry, decide between (a) imperative DOM nodeViews or (b) adopting `@handlewithcare/react-prosemirror` (or `@nytimes/react-prosemirror`). Per ADR-415.
- **O131** — Stable ID strategy revisit. Phase 7.5 uses UUID v4. Revisit UUID v7 (time-ordered) when per-block revision history lands.
- **O132** — Print pipeline. JSON-to-print-React, Puppeteer-in-Main capability, page templates (header / footer / signature line / page numbers / encounter watermark), per-organization theming. Lands after custom blocks.
- **O120** — Voice dictation adapter. Engine-agnostic interface; Web Speech for free-tier, Dragon / Deepgram Medical for paid. Deferred long-range.
- **O121** — Multi-clinician collab via Yjs + Cloud Backend awareness. Deferred indefinite; single-clinician-per-record is the assumption through the foreseeable phases.
- **O122** — Template authoring UI. Clinicians edit their own SmartText library inside ru-soam; clinic-level shared templates land later. Deferred to a product phase.
