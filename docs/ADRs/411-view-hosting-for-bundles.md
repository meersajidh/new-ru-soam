# View hosting for bundles

**ID:** ADR-411
**Status:** Accepted
**Date:** 2026-05-13
**Supersedes:** —
**Superseded by:** —
**Related:** ADR-101, ADR-102, ADR-201, ADR-202, ADR-203, ADR-402, ADR-404, ADR-410

## Context

A bundle's code runs in the Bundle Host process (ADR-410): a Node.js process with no DOM. A bundle's *view* — the pixels the practitioner actually sees — must render somewhere DOM-aware: the Renderer process. The two facts together create a hosting question that ADR-404, ADR-402, and ADR-405 all defer to this ADR: **how does a bundle's UI actually paint, given that the bundle's code and the rendering surface live in different processes?**

The answer determines a lot:

- The trust boundary for bundle view code (renderer-trust would defeat ADR-410's security gain).
- The communication channel between view and bundle (what API the view code can call).
- The accessibility, theming, and interaction story (focus, ARIA, drag-drop, keyboard).
- The performance ceiling (one DOM per bundle view, or one DOM shared, or one per editor instance).

VSCode's answer is "webviews": each is an iframe loaded from a custom protocol with strict CSP, communicating with the extension host via postMessage proxied through the renderer. This pattern is the platform-Electron-app industry standard at this point. Ru-soam adopts it, with the constraint from ADR-201 that `<webview>` is forbidden — iframe and `WebContentsView` are the only permitted embedding surfaces.

This ADR commits the hosting mechanism: **iframe loaded from a custom protocol, sandboxed, communicating with the Bundle Host via a postMessage bridge routed through Main**. It also names a secondary declarative path for views simple enough not to need custom JS.

## Decision

### Primary mechanism: sandboxed iframe loaded from a custom protocol

Each bundle view renders inside a sandboxed iframe. The iframe's `src` resolves to a custom protocol — `view://<bundleId>/<viewPath>` — registered by Main via `protocol.handle` (per the same machinery as `app://` in ADR-203, but a distinct scheme for view assets).

Properties:

- **Origin isolation**: each bundle's views share an origin distinct from the workbench shell's origin. Cross-bundle and bundle-vs-shell access is blocked by the same-origin policy.
- **Sandbox attribute**: the iframe is created with `sandbox="allow-scripts allow-forms allow-pointer-lock"` (`allow-pointer-lock` deferred — see O80; Phase 7 ships only `allow-scripts allow-forms`). No `allow-same-origin` with the shell, no `allow-top-navigation`, no `allow-popups`. The sandbox flags are Open Item O80.
- **CSP**: a strict CSP applies to bundle view content (no inline scripts beyond an explicit nonce, no remote script sources, restricted connect-src). The exact policy text is Open Item O81; the CSP from ADR-201 §"CSP strawman" is the starting point with bundle-specific overlays.
- **Asset source**: protocol handler resolves `view://<bundleId>/<viewPath>` to files under the installed bundle's view-asset directory. Files are immutable after install (or until an explicit bundle update). Bundles cannot inject or rewrite their view assets at runtime.
- **No `window.soam`**: the iframe document is not the shell document; it does not see the preload-exposed `window.soam`. The bundle view code cannot bind capabilities through the shell's narrow capability surface (ADR-202).

### Bridge script: `window.soamView`

The platform provides a thin **view bridge** script auto-loaded into every bundle view iframe. The bridge exposes one global, `window.soamView`, which is the view's only sanctioned communication channel.

Provisional shape:

```ts
// illustrative
interface SoamView {
  // capability calls routed through Main, attributed to the bundle
  bindCapability<T>(name: string, version: string): Promise<Disposable & T>;

  // view-lifecycle events (renderer-driven)
  events: {
    onActivate(handler: () => void): Disposable;
    onDeactivate(handler: () => void): Disposable;
    onResize(handler: (size: { w: number; h: number }) => void): Disposable;
    onThemeChange(handler: (theme: ThemeTokens) => void): Disposable;
    onResourceChange(handler: (resource: ResourceRef) => void): Disposable;
  };

  // outbound view → platform notifications
  notifyDirty(isDirty: boolean): void;
  notifyTitle(title: string): void;
  requestFocus(): void;
  requestClose(): void;

  // resource handle for the currently-bound editor / view
  resource: ResourceRef;

  // theme tokens snapshot
  theme: ThemeTokens;
}
```

`window.soamView` is **not** a richer or alternate `window.soam`. It is narrower: bundle view code cannot do *anything* the platform doesn't explicitly hand it.

Implementation: every call on `window.soamView` is implemented as a postMessage to the iframe's parent (the workbench renderer). The renderer relays to Main. Main attributes the call to the bundle owning the view, applies the bundle's declared capabilities (ADR-103/410), and routes to the Bundle Host if the capability implementation lives in a bundle. Results flow back through the reverse path.

### Trust zone

Bundle view code is **third-party-trust**, same as the bundle's Node code (ADR-410). The process model lifts the two halves of a bundle into different processes — Bundle Host (Node) for behaviour, sandboxed iframe (Renderer subprocess) for view — but both halves answer to the same trust gates:

- View can only invoke capabilities the bundle's manifest declared.
- View cannot reach the workbench shell's DOM, services, or capabilities.
- View cannot cross-talk to another bundle's view directly; the platform's postMessage relay enforces same-bundle isolation per channel.

The iframe boundary is a **structural** enforcement, not a procedural one. A buggy or malicious bundle view *cannot* read the patient list in the side bar because the same-origin policy prevents it from reaching the shell's DOM.

### Communication discipline: renderer is the relay, Main is the broker

A capability call from a bundle view:

```
view (iframe) ──postMessage──▶ workbench renderer ──IPC──▶ Main ──IPC──▶ Bundle Host
                                                                       (or Main-resident impl)
                                                  ◀────────────── result ───────────┘
view ◀──postMessage── workbench renderer ◀──IPC── Main
```

The workbench renderer is the **relay**: it forwards postMessage payloads to Main and IPC results back to the iframe. It does not interpret the payloads; it does not enforce policy. The renderer's job for bundle views is to host the iframe, mediate sizing, and pipe messages.

Policy enforcement lives in Main (capability binding, audit emission, consent gates). This keeps the trust model consistent: untrusted view → untrusted renderer → privileged Main. No new authority appears.

### Secondary mechanism: declarative views (optional, future)

Some bundle views may not need custom JS at all — a simple settings page, a static list, a structured form. For those, the platform may offer a **declarative view** path: the bundle contributes a typed UI tree (using a platform-provided component vocabulary — fields, lists, headings, action buttons, etc.) and the renderer renders the tree natively in the shell's React tree.

Declarative views:

- have **zero** third-party JS in the renderer. The bundle's contribution is data, not code.
- use the shell's component library directly — consistent look and feel by construction.
- are radically cheaper than an iframe (no extra document, no postMessage round-trip per event, no separate JS context).
- cannot express arbitrary interactions; the vocabulary limits what is possible.

The declarative path is **not in MVP**. It is named here so that bundles know their hosting choices conceptually (custom-JS-iframe or declarative-tree) before the second arrives. Open Item O82 covers the declarative-view component vocabulary and trigger criteria.

### View hosting across the slots

The same iframe-based mechanism hosts bundle views in every slot of ADR-402:

- **Primary Side Bar views** — iframe in the Primary Side Bar Part's content area.
- **Auxiliary Side Bar views** — same.
- **Panel views** — iframe in the Panel Part's content area.
- **Editor instances** — iframe in the active editor group's content area.

There is no special "editor iframe" vs "side bar iframe" distinction. The view bridge (`window.soamView`) carries the same API in every slot. The `events.onResourceChange` event fires only for editor views; side-bar / panel views don't have a per-resource binding.

### View lifecycle

```
1. Platform decides to mount view (editor.open / side bar activation / panel switch).
2. Renderer creates iframe with src = `view://<bundleId>/<viewPath>`.
3. Iframe document loads. Bridge script is injected by Main's protocol handler as part of the served asset envelope.
4. Bridge sends `view.ready` postMessage; renderer receives and forwards to Main.
5. Main signals Bundle Host that view <N> for bundle <X> is mounted.
6. Bundle Host runs the bundle's `view.activate(viewId, context)` hook, which can subscribe to capabilities and set up its model.
7. Bundle Host pushes initial data via capability calls to the view (or replies to view-initiated `bindCapability` calls).
8. View renders.
9. On unmount: iframe destroyed → bridge tears down → Main notifies Bundle Host → bundle's `view.dispose` runs → disposable chain cleans up.
```

A crashed Bundle Host (per ADR-410) leaves orphaned iframes; the renderer detects via timeout / dead-channel and shows a "view inactive" placeholder. Restart of the Bundle Host triggers fresh view activation.

### Theming and a11y

Theme tokens (CSS variables) are pushed from the workbench shell to the iframe at mount and on every theme change, via the bridge. The iframe applies the variables to its document root. A bundle view that uses the variables stays visually consistent across themes for free. A bundle view that hardcodes colours is allowed but discouraged.

Accessibility across iframe boundaries is non-trivial: ARIA trees are document-scoped, focus management is per-document, and tab order across iframe boundaries needs explicit choreography. The platform provides patterns:

- Focus enter / exit signalled via `events.onActivate` / `events.onDeactivate` and outbound `requestFocus`.
- Tab traversal: pressing Tab past the iframe's last focusable element returns focus to the shell; pressing Shift+Tab past the first element does the same on the other side. Implementation via the bridge.
- Live announcements: the bridge exposes a typed `announce(message, level)` that posts to the shell's main `aria-live` region.

Detail is Open Item O83.

### Resource binding for editor views

An editor view (ADR-404) is bound to a resource at mount time. The bridge surfaces:

- `window.soamView.resource` — the resource URI the view should display / edit.
- `window.soamView.events.onResourceChange(...)` — fired when the platform asks the view to re-bind to a different resource (uncommon; usually a new view is mounted instead).
- `window.soamView.notifyDirty(...)` and `window.soamView.requestClose()` — view-driven state callbacks.

Resource CRUD does not happen via the bridge directly; the view binds the platform's `resources` capability (per ADR-404) using `window.soamView.bindCapability('resources', ...)`. Main mediates; the bundle's manifest declares which resource schemes it can read / write.

### What this ADR does not commit

- Exact CSP text for view iframes (Open Item O81).
- Exact `sandbox` attribute flag set (O80).
- Declarative-view component vocabulary (O82).
- A11y patterns in detail (O83).
- Iframe count budgeting / pooling strategy (O84).
- WebContentsView usage. Reserved for future special cases (e.g., a bundle that needs full-page web content with cookies, or an embedded telehealth provider's UI). Not used for ordinary bundle views.

## Consequences

### Positive

- Bundle view code is structurally sandboxed. Same-origin policy and a sandboxed iframe protect the workbench shell from view code; bridge-routed-through-Main protects the rest of the platform.
- One mechanism covers all view slots — editors, side bars, panels.
- The view bridge (`window.soamView`) is narrow, typed, and the only sanctioned communication path. No shortcuts, no leaks.
- Theming and a11y are cross-cutting concerns the platform owns; bundles don't need to reinvent them.
- Reuses the protocol-handler machinery from ADR-203 for asset serving. Same audit pathway.

### Negative

- Every bundle view is a separate JS context (iframe). Memory and startup cost is real and additive. Mitigated by the declarative path for simple views, and by view pooling later if needed (O84).
- A11y across iframe boundaries needs deliberate engineering. Most apps get it wrong.
- Drag-and-drop across iframe boundaries is limited; bundles needing rich DnD against the shell's surfaces may need platform-provided handles.
- Bundle authors who are used to "drop into the React tree" workflows need to learn the bridge model. Mitigated by scaffolding and a starter bundle template.

### Neutral

- The bundle-view JS framework choice is bundle-internal. A bundle may use React, Vue, Svelte, vanilla DOM — the iframe is just a document. The platform does not impose a framework.

## Considered Options

- **Native React mount in the shell's tree** — _Rejected_: bundle view code would run in renderer-trust, defeating ADR-410's security boundary. Bundle JS would have direct DOM access and could read the workbench shell's state.
- **WebContentsView per bundle view** — _Rejected as default_, _kept as exception_: heavier than iframe, harder to embed in flexible layout, more memory baseline. Reserved for special cases (embedded telehealth UI, full-web-app bundles) when justified.
- **`<webview>` element** — _Rejected_: forbidden by ADR-201.
- **Declarative-only views** — _Rejected as default_: vocabulary limits creative UI; bundles ship product features and need expressiveness. Kept as secondary path (O82).
- **Sandboxed iframe + custom-protocol asset serve + postMessage bridge to Bundle Host via Main** _(chosen)_ — Industry-standard pattern for plugin-host apps; matches VSCode webviews; reuses ADR-203's protocol machinery; structural enforcement of the trust model.

## Open Items

- ~~O78 — View asset protocol scheme~~ **Resolved Phase 7** — `view://<bundleId>/<path>`; `_platform_` reserved host; registered as a privileged scheme (`standard, secure, corsEnabled`) in `apps/desktop/electron/main/index.ts` `registerSchemesAsPrivileged`.
- **O79** — `window.soamView` exact API shape. Initial shape illustrated here; refine as the first view-using bundle ships.
- **O80** — `sandbox` attribute flag set. `allow-scripts`, `allow-forms`, `allow-pointer-lock` are likely; `allow-modals`, `allow-presentation` need a case-by-case call.
- **O81** — Bundle-view CSP exact policy text. Starting point from ADR-201; bundle-specific overlays for asset paths.
- **O82** — Declarative-view component vocabulary and trigger criteria. Lands when first declarative-only view candidate appears.
- **O83** — A11y patterns across iframe boundaries: focus crossing, tab traversal, `aria-live` proxying, screen-reader semantics.
- **O84** — Iframe pooling / count budgeting. Memory and startup cost mitigation when many views are open.
- **O85** — WebContentsView usage policy: which exceptional cases justify it, who approves, what additional sandboxing applies.
