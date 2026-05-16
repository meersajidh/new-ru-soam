# React / ProseMirror integration boundary

**ID:** ADR-415
**Status:** Accepted
**Date:** 2026-05-16
**Supersedes:** —
**Superseded by:** —
**Related:** ADR-401, ADR-404, ADR-411, ADR-412, ADR-414, ADR-416

## Context

ADR-414 commits ProseMirror as RuEdit's engine. The renderer's UI framework is React 19 (per the existing Workbench shell, ADR-401, ADR-412). The two systems have a documented structural mismatch.

Stephen Moore's 2024 piece, ["Why I rebuilt prosemirror-view"](https://smoores.dev/post/why_i_rebuilt_prosemirror_view/), names the failure modes precisely:

- **Architectural mismatch**: React uses a two-phase render-then-commit cycle with asynchronous scheduling. `prosemirror-view` owns its DOM directly and updates it synchronously inside transaction dispatch.
- **State tearing**: when React components participate in PM's node-view rendering, components can read the new React-state version while the DOM still holds the previous PM-state version (or vice versa). Selection drifts, cursor positions skew, child component instances re-mount unexpectedly.
- **DOM ownership conflicts**: PM expects exclusive control over the content DOM subtree; React expects exclusive control over any subtree it renders. Sharing the boundary is the source of every subtle bug.
- **Synchronicity**: `ReactDOM`'s scheduler defers commits, PM's view updates run inline; the two clocks disagree on what "now" is.

Moore's response was to rebuild PM's view layer in React entirely (`@handlewithcare/react-prosemirror`, a fork of `@nytimes/react-prosemirror`). That is one valid resolution. It is also a massive ongoing maintenance burden — the upstream PM view layer evolves, and any rebuild has to track it.

We do not want to take on that maintenance cost, and we also do not want to pay the tearing-bug cost. The third path — and the one this ADR commits — is **avoid the conflict at the boundary**: let React own the chrome, let vanilla `prosemirror-view` own the content, and don't mix them.

This decision affects only the renderer-side mounting strategy for RuEdit (ADR-414). It does not affect the engine, the schema, the codec, or any other layer.

## Decision

### React owns chrome; vanilla `prosemirror-view` owns content

The React tree and the ProseMirror content tree are **fully separated** at a single, narrow boundary: a `<div ref={...}>` element. React renders the div; React never renders anything beneath it. ProseMirror mounts its `EditorView` into the div on `useEffect`; ProseMirror controls every descendant DOM node from that point forward.

```tsx
// illustrative — actual code lands in apps/desktop/src/platform/ru-edit/
export function RuEditView({ value, readOnly, onChange }: Props): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<RuEditHandle | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const handle = mountRuEdit(ref.current, {
      initial: value,
      readOnly,
      onChange,
    });
    handleRef.current = handle;
    return () => handle.dispose();
  }, []); // intentional: mount once; React never re-mounts on prop change

  useEffect(() => {
    if (handleRef.current && value !== handleRef.current.getDoc()) {
      handleRef.current.setDoc(value); // external doc replacement only
    }
  }, [value]);

  return <div ref={ref} className="ru-edit-host" />;
}
```

The chrome — toolbars, status indicators, side panels, command palette integration — is normal React. It communicates with the editor through the `RuEditHandle` returned by `mountRuEdit`, not through React state inside the content.

### NodeViews are imperative DOM through the custom-blocks phase

ProseMirror's `NodeView` API lets the schema attach a custom DOM rendering for a node type. Through the custom atomic blocks phase (O129: Vitals, Allergies, MedList, etc.; numbering not yet locked — sequenced after Phase 8 Snippet engine per ADR-416), node views are implemented as **vanilla TypeScript / DOM**, not React components. They construct their DOM with `document.createElement`, listen for events directly, and re-render in response to PM transactions.

This is more code than rendering a React component inside a node view, but the cost is bounded: the first concrete custom block (Vitals) is a shallow form — four typed cells, a label, basic validation. The benefit is **zero React-PM boundary inside the document**, which means zero tearing surface.

### O130 decision point: at the custom-blocks phase entry

At the custom-blocks phase entry — when the first custom atomic blocks (Vitals, Allergies, MedList) start to require richer in-content UI — we re-evaluate. Two paths:

- **(a) Stay imperative.** Continue building node views as vanilla DOM. Adopt utility helpers if needed (a small DOM-builder, fine-grained state subscriptions). No React-in-content, no maintenance burden, no tearing risk. Cost: every node view is hand-rolled.
- **(b) Adopt `@handlewithcare/react-prosemirror` (or `@nytimes/react-prosemirror`).** Replace `prosemirror-view` with the React-aware fork. Gain: React components inside node views work correctly, state tearing prevented at the framework level. Cost: a non-trivial dependency, tracking upstream PM evolution at one remove, learning the fork's API for the team.

The decision criteria, recorded for that phase's planning pass:

- If the Phase 8 Snippet engine (ADR-416) — including its `placeholder` atomic inline node and picklist vanilla nodeView — plus the first three custom blocks are buildable in vanilla DOM in days, not weeks → stay imperative.
- If we hit a wall where React-context-bearing components (theme tokens, command service, capability proxies) need to live inside node views and the imperative workaround feels structurally wrong → adopt the React fork.
- The decision is reversible in either direction; we don't lock ourselves out.

### No `react-prosemirror` style of integration in Phase 7.5

In Phase 7.5 — the initial RuEdit landing — there is **no React inside the editor content**. Period. The chrome is React; the content is vanilla PM. This is the simplest possible boundary, and it is the one we ship first.

### Re-render policy

`RuEditView`'s `useEffect([value])` only calls `handle.setDoc(value)` when the inbound `value` differs from the current internal doc by **reference identity**. The component does not re-mount the editor on prop changes. The editor's internal state is durable across React re-renders by virtue of being held in a ref that React never reaches into.

External callers that want to replace the document (workspace switch, undo-from-history, document-template apply) pass a new `RuEditDoc` reference; `RuEditView` notices and calls `setDoc`. Callers that just want to read or save the current document call `handle.getDoc()` synchronously — they do not need to keep `value` in sync as a controlled prop.

This pattern intentionally diverges from React's typical "controlled component" idiom. The reason is exactly the mismatch documented above: a controlled rich-text editor that round-trips its document through React state on every keystroke is a textbook tearing scenario. RuEditView is **uncontrolled** with explicit replacement, by design.

### Lifecycle and disposal

`mountRuEdit` returns a `RuEditHandle` with an explicit `dispose()`. The React wrapper's cleanup function calls it. PM allocates DOM nodes, event listeners, decoration state; dispose tears all of it down. Failure to call dispose leaks DOM and listeners and is treated as a test failure (Phase 7.5 exit criterion: dispose-safe verified via devtools heap snapshot).

### What this ADR does not commit

- The schema, codec, keymap, block library. Owned by ADR-414.
- The chrome's visual design (toolbars, status, side panels). Owned by ADR-401 / ADR-413.
- Whether RuEdit instances live inside iframe-hosted bundle views (ADR-411) or inline in workbench-shell editor-type views (ADR-404). The boundary pattern in this ADR works in both contexts — iframe-hosted RuEdit is a separate top-level React tree inside the iframe document, with the same vanilla-PM content beneath it.

## Consequences

### Positive

- Zero state-tearing surface in Phase 7.5: no React inside content means no two-clock problem.
- Implementation is simple and short: a `useRef` + two `useEffect`s.
- The decision is reversible. If the custom-blocks phase demands React-in-node-views, we adopt the React-aware fork without rewriting the engine or schema.
- The chrome side of the editor remains idiomatic React with full access to `useService`, the command palette, theme tokens, status bar — all normal patterns.
- We do not take on the maintenance cost of `@handlewithcare/react-prosemirror` (or `@nytimes/react-prosemirror`) at this stage, while keeping the door open.

### Negative

- Custom block UIs through the custom-blocks phase are vanilla DOM, not React. More code per block; less ecosystem to lean on.
- The uncontrolled-with-replacement React pattern is non-standard; reviewers and new contributors need the explanation in this ADR (and a code comment at the boundary) to avoid "fixing" the pattern into a controlled component.
- If the custom-blocks phase forces the React-fork adoption, we pay a migration cost on node views written before it (including the Phase 8 picklist nodeView from ADR-416).

### Neutral

- Both `@handlewithcare/react-prosemirror` and `@nytimes/react-prosemirror` exist and are maintained; neither is single-author-bus-factor-one. The fallback exists if we need it.

## Considered Options

- **Render the entire editor with React, controlled-component style** — _Rejected_: textbook state-tearing scenario; Moore's piece is the long-form rejection.
- **Adopt `@handlewithcare/react-prosemirror` (or `@nytimes/react-prosemirror`) from Phase 7.5** — _Rejected for Phase 7.5_: introduces a non-trivial dependency before we know whether the chrome-vs-content separation alone is sufficient. Door explicitly left open for the custom-blocks phase (O130).
- **Vanilla `prosemirror-view` for content; React for chrome; uncontrolled with explicit replacement; imperative node views through the custom-blocks phase** _(chosen)_ — Smallest possible boundary, zero tearing, reversible.

## Open Items

- **O130** — React-in-nodeView strategy revisit at the custom-blocks phase entry (O129; lands after Phase 8 Snippet engine per ADR-416, exact numbering set at that phase's gate). Criteria documented above. Outcome either "stay vanilla" or "adopt React fork" with a brief follow-up ADR amendment.
