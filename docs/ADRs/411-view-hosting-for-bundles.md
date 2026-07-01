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
- ~~**O80** — `sandbox` attribute flag set.~~ **Resolved by Amendment 1** — add `allow-same-origin` (real per-bundle origin); see Am1.
- ~~**O81** — Bundle-view CSP exact policy text.~~ **Resolved by Amendment 1** — trust-tiered, `script-src 'self'` (no `'unsafe-inline'`) for the first-party tier; see Am1.
- **O82** — Declarative-view component vocabulary and trigger criteria. Lands when first declarative-only view candidate appears.
- **O83** — A11y patterns across iframe boundaries: focus crossing, tab traversal, `aria-live` proxying, screen-reader semantics.
- **O84** — Iframe pooling / count budgeting. Memory and startup cost mitigation when many views are open.
- **O85** — WebContentsView usage policy: which exceptional cases justify it, who approves, what additional sandboxing applies.

---

## Amendment 1 — Real per-bundle origin + trust-tiered CSP

**Date:** 2026-06-29
**Status:** Accepted — **validation spike PASSED 2026-06-29** (see below); ready to implement
**Resolves:** O80 (sandbox flags), O81 (CSP text)
**Related:** ADR-418 (trust tiers / `trustClass`), ADR-419 (view tech stack), `References/View_Sandbox_Origin_And_CSP_Reasoning.md`

### Why

The original sandbox (`allow-scripts allow-forms`, **no** `allow-same-origin`)
gave each view an **opaque origin**. Opaque origins cannot reliably load
`view://` subresources (Blink same-origin scheme check), which forced every
platform seam to be injected **inline**, forced the view CSP to permit
**`'unsafe-inline'`** in `script-src`, and forced single-file bundling for any
framework build. `'unsafe-inline'` re-permits exactly the injected-script XSS the
CSP exists to stop — unacceptable for a PHI surface where view **content** is
hostile-by-default (Google event titles/bodies, contact names, patient free
text), even though view **code** is first-party. Full reasoning:
`References/View_Sandbox_Origin_And_CSP_Reasoning.md`.

### Decision

1. **Real, unique, per-bundle origin (the VS Code webview model).** The view
   iframe sandbox becomes `allow-scripts allow-forms allow-same-origin`. This
   does **not** make the view same-origin with the shell — it keeps the origin
   from the URL (`view://<bundleId>`), which is cross-origin with both the shell
   (`app://`) and every other bundle. The trust boundary (cannot reach the shell
   DOM / `window.soam` / other bundles) is preserved by the **distinct origin**,
   which was always the real isolator; opaqueness contributed nothing but the
   subresource pain. The `allow-scripts + allow-same-origin` self-de-sandbox
   escape applies only to content **same-origin with its embedder**, which view
   content is not.

2. **No `'unsafe-inline'`.** With a real origin, the target view CSP is
   `script-src 'self'` (+ `style-src` handling for the bundler's CSS — see the
   Tailwind open item O513). Seams become ordinary same-host `view://` files;
   bundlers build idiomatically (external + shared vendor chunks, ES modules).

   **Coexistence caveat (incremental migration).** The 13 not-yet-migrated
   vanilla views contain inline `<script>` in their bodies — `script-src 'self'`
   would break them. So the CSP is selected **per view by its runtime**, not
   flipped globally:
   - **legacy (vanilla) view** → CSP keeps `'unsafe-inline'` (transitional) +
     seams stay **inline-injected**. Unchanged behaviour, zero regression.
     `allow-same-origin` is still added (real origin is harmless to them — their
     inline scripts still run, same-host fonts load cleaner).
   - **React (built) view** → strict `script-src 'self'` (no `'unsafe-inline'`)
     + seams served as **same-host external** `<script src>` (the bridge etc.
     can't be inline under `'self'`). This is the path the spike proved.

   The per-view runtime is a manifest signal (e.g. a per-view `runtime: 'react'`
   / `csp: 'strict'` flag, defaulting to legacy). The security win lands **per
   view as each migrates**; `'unsafe-inline'` is removed from the first-party
   tier entirely once the last vanilla view is gone. Net CSP function:
   `CSP = f(trustClass, viewRuntime)` — `trustClass` (ADR-418) is always
   first-party today, so the live axis is `viewRuntime`; the `trustClass`
   parameter is threaded now so the untrusted tier (O512) layers on without
   rework.

3. **Trust-tiered CSP + sandbox.** Both the CSP and the sandbox flag set are a
   **function of the serving bundle's `trustClass`** (ADR-418). The `view://`
   protocol handler resolves the bundle → its trustClass → the matching policy.
   The **first-party** tier is defined now; the **untrusted (TP-Host)** tier is
   defined when rung-H lands (O512), and may tighten further (e.g. drop
   `allow-same-origin`, narrow `img/font/style`, no `allow-forms`).

4. **`connect-src 'none'` is retained** in every tier — views never reach the
   network directly (ADR-203); the bridge is `postMessage`, which `connect-src`
   does not govern. This amendment relaxes *origin opaqueness only*, never the
   egress posture.

5. **Fallbacks, if the spike disproves the model in Electron** (recorded so the
   no-`unsafe-inline` goal holds regardless): **(a) nonce-based** — the
   `protocol.handle` response mints a per-response random nonce, stamped into the
   CSP and each injected `<script nonce>`; **(b) hash-based** — the seams are
   static strings, so list their precomputed `sha256` in `script-src`. Both keep
   inline injection but make it XSS-safe; both are strictly worse ergonomically
   than the real-origin path, hence fallbacks.

### Validation spike (gate before rollout)

Throwaway, on the `echo-test` bundle, driven by CDP. Confirms Electron honours
the model before ADR-419's build pipeline depends on it.

**Setup:** a temporary `spike.html` view in `echo-test` that (a) loads one
**external same-host** script `view://echo-test/spike.js`, (b) loads it as an ES
`<script type="module">` doing one external `import`, (c) contains one inline
`<script>` that sets a sentinel global; serve it under a spike CSP
`default-src 'none'; script-src 'self'; connect-src 'none'; …` (no
`'unsafe-inline'`); mount it with `sandbox="allow-scripts allow-forms
allow-same-origin"`.

**Pass/fail (eval inside the iframe via raw-CDP `suppress_origin=True`):**

| # | Check | Pass = |
|---|-------|--------|
| 1 | `self.origin` in the iframe | `"view://echo-test"` (a real origin, **not** `"null"`) |
| 2 | shell isolation | `window.parent.document` **throws** a cross-origin `SecurityError` |
| 3 | external same-host script | loads + runs, **no** `"Unsafe attempt to load URL"` console violation |
| 4 | ES module + external import | resolves + runs, no violation |
| 5 | inline `<script>` under `script-src 'self'` | **blocked** (sentinel global undefined) → proves the XSS net is live |
| 6 | bridge | `view.ready` posts; a `bindQuery(...).call(...)` round-trips |
| 7 | secure context | `window.isSecureContext === true`, `crypto.subtle` defined (future-proofing) |
| 8 | cross-bundle | from `echo-test`'s frame, no script access to another bundle's view |

**On all-pass:** implement trust-tiered CSP + `allow-same-origin` in
`view-protocol.ts` (thread `trustClass` into the view registry) +
`BundleViewIframe.tsx` (sandbox attr), drop the inline-seam injection in favour
of same-host seam files, and ADR-419's pipeline uses idiomatic multi-chunk
builds. **On any fail:** fall back to nonce (5a) and keep inline seams; revisit
the failing check.

#### Spike result — 2026-06-29: ALL PASS ✅

Ran on `echo-test` (throwaway `spike.html`/`spike.js`/`spike-mod.js`/
`spike-bridge.js` + an isolated `view-protocol.ts` branch serving the strict
`script-src 'self'` CSP with no seam injection; a raw iframe with
`sandbox="allow-scripts allow-forms allow-same-origin"` injected into the shell
via CDP; results posted back to the shell). All artifacts reverted after.

| # | Check | Result |
|---|-------|--------|
| 1 | `self.origin` | `"view://echo-test"` — real origin, not `"null"` |
| 2 | shell isolation | `window.parent.document` → **`SecurityError`** (blocked) |
| 3 | same-host external **classic** `<script src>` | loaded + ran under `script-src 'self'` |
| 4 | external **ES module** + dynamic `import()` | loaded + resolved (`module-import-ok`) |
| 5 | inline `<script>` | **blocked** — console: *"Executing inline script violates … 'script-src 'self''. … blocked"* (XSS net live) |
| 6 | bridge-shaped same-host script | loaded + `postMessage` to parent received |
| 7 | secure context | `isSecureContext === true`, `crypto.subtle` defined |
| 8 | per-bundle origin | origin is bundle-host-keyed; (2) proves cross-origin isolation → cross-bundle by the same mechanism |

**Crucially, no `"Unsafe attempt to load URL"` violation** for the same-host
external/module loads — the opaque-origin subresource pain is gone. The only CSP
console entry was the *intended* inline-script block (#5). **The real-origin +
`script-src 'self'` (no `'unsafe-inline'`) model is confirmed in Electron** —
proceed to implementation (O511).

## Amendment 2 — Migration complete: single strict tier, `style-src` tightened (status coda)

*2026-07-01. Status coda to Amendment 1. No new decision — records that Am1
shipped and reached its end state.*

- **All 14 bundle views are React apps on the single strict tier.** The
  transitional `'vanilla'` tier (opaque origin + `'unsafe-inline'` + inline seam
  injection) was removed once the last vanilla view migrated (O497). No inline-script
  code path remains in `view-protocol.ts`.
- **`style-src` tightened to `'self'` (O513).** Am1 shipped `script-src 'self'` but
  left `style-src 'self' 'unsafe-inline'` transitional. O513 dropped `'unsafe-inline'`
  from `style-src` too: views author styles as **external same-host CSS** (per-bundle
  Tailwind v4 build emits external stylesheets; the maturity/fonts seams are external
  `_seam/*.css`), and React `style={{}}` sets styles via the CSSOM, which CSP `style-src`
  does not govern. The single hold-out was one inline `<style>` in the `echo-test` dev
  fixture, externalised to `echo-view.css`. Both `script-src` and `style-src` are now the
  live XSS backstop.
- **Views are Tailwind-capable.** Each bundle runs its own per-bundle Tailwind v4 build
  (ADR-419); authoring pattern + shared token entry (`@ru-soam/view-kit/theme.css`) are in
  `docs/Guides/styling-system.md` → "Tailwind in bundle views". Reference view =
  `ru-soam-sessions/meetings`.
- `trustClass` is still `'first-party'`-only; the CSP selector is `f(trustClass)` so the
  untrusted TP-Host tier (O512) layers in without rework.
