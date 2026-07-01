# Bundle-view tech stack

**ID:** ADR-419
**Status:** Accepted
**Date:** 2026-06-29
**Supersedes:** —
**Superseded by:** —
**Related:** ADR-411 (view hosting — the container) **+ Am1 (real per-bundle origin + trust-tiered CSP — load-bearing for this ADR's build model)**, ADR-412 (renderer services + TanStack Query), ADR-413 (theming & icons), ADR-410/418 (Bundle/FP-Host trust), ADR-106 (base/domain), `References/View_Sandbox_Origin_And_CSP_Reasoning.md`

> **Build-model dependency:** §3 below was first written assuming the original
> opaque-origin sandbox + `'unsafe-inline'` CSP, which pushed toward single-file
> inlining. **ADR-411 Am1 (real per-bundle origin, `script-src 'self'`, no
> `'unsafe-inline'`) supersedes that assumption.** If the Am1 validation spike
> passes, view builds are **idiomatic multi-chunk** (external + shared vendor
> chunks, ES modules) and single-file inlining is only the **fallback** for the
> nonce/hash path. Read §3 with that correction.

## Context

ADR-411 fixed the **container** for bundle UI: a sandboxed
`view://<bundleId>/<viewPath>` iframe, seams injected by Main's protocol handler,
all platform access through the `window.soamView` bridge. That decision is
structural and stays. (ADR-411 **Amendment 1** later moved the iframe off the
opaque origin to a **real per-bundle `view://<bundleId>` origin** — `allow-same-origin`,
cross-origin to the shell — enabling `script-src 'self'` with no `'unsafe-inline'`;
shipped O511. This ADR's original text below says "opaque origin" in a few places —
read those as the real per-bundle origin per Am1.) ADR-411 deliberately left the **runtime inside** the
container open — §Neutral: *"The bundle-view JS framework choice is
bundle-internal. A bundle may use React, Vue, Svelte, vanilla DOM."* (Note: that
is distinct from 411's §Considered-Options rejection of *"Native React mount in
the shell's tree"* — that rejection is about running bundle code in **renderer
trust**; React **inside the sandboxed iframe** is fully consistent with 411.)

That open question never got an answer, so a de-facto stack accreted: **14
hand-authored vanilla HTML + inline-`<script>` views**, served raw from each
bundle's `view-assets/` directory, with platform seams (`__viewBoot`,
`view-bridge`/`soamView`, `view-codicons`, `view-fonts`, `__viewQuery`) injected
inline at serve time (`view-protocol.ts`). No build step exists for view assets;
the `view://` handler reads the authored `.html` off disk.

This de-facto stack has hit its ceiling:

- **No reactivity.** Every update is a hand-called imperative re-render
  (`renderCalArea()`); forgetting one leaves stale UI. The entire
  calRev / stale-classification bug class (Schedule SD-25 follow-up) is this.
- **Imperative DOM by hand.** `createElement` everywhere; PHI-safety relies on
  remembering to use `textContent` per node.
- **Silent syntax death.** A curly quote inside a `<script>` blanks the whole
  view; `compile`/`lint` never parse the `.html` (the `node --check` gotcha).
- **No componentry, no scaling.** 2000-line single-file views
  (`schedule.html`), zero reuse across bundles.
- **Two data layers.** The shell uses TanStack Query (ADR-412); views grew a
  bespoke `__viewQuery` query-core wrapper to claw back dedup/staleTime/
  invalidation — a parallel, lesser re-implementation.

This is the substance of **O496** (bundle-view UI tech stack). It gates **O497**
(rolling a data layer to the remaining views): if the stack moves to React, the
data layer is react-query, not the vanilla `__viewQuery` wrapper — so rolling the
wrapper everywhere first would be wasted work.

## Decision

**Bundle views are React applications, built per bundle, and bundled into the
sandboxed iframe.** The in-iframe stack is the **same stack the shell uses**
(ADR-412): **React 19 + React Compiler, TanStack Query, TanStack Router,
Tailwind v4.** One stack across shell and views — no second framework to learn,
shared idioms, shared component patterns.

This does not touch ADR-411: the container, sandbox, opaque origin, `soamView`
bridge, and Main-brokered capability routing are unchanged. ADR-419 only commits
**what runs inside the iframe** and **how it gets there**.

### 1. The runtime: React + TanStack Query + TanStack Router

- **React 19 + React Compiler.** Same as the shell (`babel-plugin-react-compiler`
  in the view build). Idiomatic React; no manual memoization. JSX replaces
  imperative DOM building.
- **TanStack Query** is the view data layer, replacing the bespoke `__viewQuery`
  wrapper. A view ships its own `QueryClient`. Query keys follow the existing
  `[capNamespace, op, ...args]` convention (the shell's `tanstack-query-keys.md`
  + the `__viewQuery` precedent). Per-iframe cache (dies on remount — same
  property `__viewQuery` had; **not** a cross-remount/O438 fix).
- **TanStack Router** is the sanctioned in-view router, **opt-in per view**.
  Most views are a single screen and use no router. Multi-step views
  (`calendar-setup` wizard, `client-migration` roster steps,
  `meeting-record`) use Router with **memory history**
  (`createMemoryHistory` — the iframe has no address bar and must not touch
  top/browser navigation, ADR-411 sandbox). "Same stack" means: when a view
  needs internal navigation, it uses TanStack Router; it is not imposed on
  trivial views.

### 2. Styling: Tailwind v4, shared tokens

Views use **Tailwind v4** (`@tailwindcss/vite`) in their build, for parity with
the shell (ADR-413 / `styling-system.md`). Theme tokens continue to arrive the
same way they do today — injected by the platform (`view-fonts`, theme CSS
variables pushed via the bridge) and applied at the document root by the view
root provider. Tailwind utilities resolve against those CSS-variable tokens, so a
view stays theme-consistent for free. Hand-written component CSS is still allowed
where Tailwind is awkward; the styling-system guide governs both.

> **Shipped (O513).** The per-bundle Tailwind build is live and exercised: views
> `@import "@ru-soam/view-kit/theme.css"` (Tailwind + a base-layer mirror of the
> shell `@theme` tokens); utilities resolve to the runtime `applyTheme` `--color-*`
> vars. Reference view = `ru-soam-sessions/meetings`. With `style-src` also tightened
> to `'self'` (no `'unsafe-inline'`), the strict single-tier CSP + per-bundle Tailwind
> model is fully in place. Authoring pattern → `styling-system.md` → "Tailwind in
> bundle views".

### 3. Build & serve pipeline (the core change)

This is the one genuinely new piece: **view assets become built output, not
authored files.**

- **Source** lives in `bundles/<id>/view-src/` (`.tsx`, one entry per view).
- **Build** = a per-bundle Vite build (multi-entry; mirrors the shell's
  `vite.config.ts`), emitting hashed JS/CSS into the bundle's served
  `view-assets/` directory alongside a generated `<view>.html` per entry.
- **Serve** is unchanged in shape: the `view://` handler serves the built
  `.html` + assets and injects the platform seams as today. CSP already permits
  it — `VIEW_CSP` is `script-src view: 'unsafe-inline'`, so **same-host**
  `view://<bundleId>/assets/*.js` script tags load (cross-host is the flaky case
  per the codicons gotcha; same-host is the norm and the design relies only on
  same-host + inline).
- **Shared vendor chunk per bundle.** React/react-dom/TanStack are emitted as a
  same-host vendor chunk (Vite `manualChunks`), loaded once per bundle, so the
  ~React runtime is not inlined N times across a bundle's views.
- **`process.env.NODE_ENV` must be stripped at build** (`mode:'production'` +
  `define`) — the opaque iframe has no `process` global; the dev-guard throw is
  silent (the query-core vendor gotcha). The view build inherits this from
  production mode; CI greps the output for `process` (must be 0), same guard as
  `gen-view-query-vendor.mjs`.
- **Dev ergonomics.** View edits now require a rebuild before iframe reload (a
  `just` recipe / Vite watch per bundle). This changes the current "edit `.html`
  → reload the iframe" loop to "edit `.tsx` → view build → reload the iframe".
  Main/FP-Host/manifest changes still need a full `just dev-desktop` restart
  (unchanged).

### 4. Seam coexistence — a platform view-kit

The injected seams stay (they are framework-agnostic), but React views consume
them through a small **platform React adapter** (a shared package, e.g.
`@ru-soam/view-kit`, base-layer per ADR-106) rather than touching globals
directly:

- **`<ViewRoot>`** — the mandatory root provider. Awaits `__viewBoot` bridge
  readiness, applies theme tokens + codicons + fonts, parses the query string
  (`parseQuery(window.location.search)` — must pass the search arg, the known
  bug), and provides the `QueryClient`. Renders children only once the bridge is
  ready, so no view component races the bridge.
- **`useSoamView()`** — typed hook over `window.soamView` (the bridge verbs:
  `openInEditor`, `focusAspect`, `setActiveEvent`, `openExternal`,
  `setTabDescription`, …).
- **`<Icon>`** — inline-SVG codicon component (mirrors the shell's `<Icon>`,
  ADR-413 Am1), replacing the injected `window.codicon` helper for React views.
- **`useCalRev()` / view-state channel hooks** — bridge channels (calRev,
  ScheduleViewState, ActiveEvent, …) surfaced as React state /
  `queryClient.invalidateQueries` triggers, since iframes get no
  `store.changed`.
- **`__viewQuery` + the query-core vendor injection are superseded for React
  views** (react-query subsumes them). They keep being injected only while any
  vanilla view remains; injection is removed when the last vanilla view migrates
  (see §6).

### 5. PHI-safety

JSX text children are **auto-escaped**, so the manual `textContent` discipline
becomes the default — strictly safer than today's hand-rolled views.
`dangerouslySetInnerHTML` is **banned** (ESLint `react/no-danger` = error in the
view config). No remote subresources (CSP unchanged; the build emits same-host
assets only). PHI plaintext still lives only in the iframe + FP-Host (ADR-418);
nothing about this decision moves where PHI renders — it stays in the sandbox.

### 6. Migration path — incremental coexistence

- **Vanilla and React views coexist.** Each view is independent; the `view://`
  handler serves whatever a bundle's `view-assets/` contains (built React output
  or a legacy authored `.html`). No big-bang.
- **New views are React.** No new vanilla views.
- **Existing 14 views migrate opportunistically**, smallest/highest-churn first:
  1. **`meetings.html`** (Sessions) — small list; proves build + react-query +
     bridge + theme + `<Icon>` end-to-end. *Pilot.*
  2. **`calendar-setup.html`** (Schedule) — wizard; proves Router (memory
     history) + forms + mutations.
  3. Remaining Practice/Schedule/Sessions views; the two large views
     (`schedule.html`, `event-detail.html`) last, after the pattern is proven.
- **O497 is redefined**: it is now *"migrate hand-rolled views to React +
  react-query"*, not *"roll the vanilla `__viewQuery` wrapper to remaining
  views."* The vanilla wrapper is end-of-life.
- The query-core vendor + `__viewQuery` injection is **removed from
  `view-protocol.ts`** once the last vanilla view is gone (cleanup, tracked).

### What this ADR does not commit

- The exact view-kit package name / location (`@ru-soam/view-kit` is
  illustrative; base-layer placement per ADR-106 is the only constraint).
- The precise Vite multi-entry config and `just` recipe shape (implementation
  detail; mirror the shell's `vite.config.ts`).
- Whether RuEdit (ADR-414, ProseMirror) embeds in a React view via a wrapper —
  out of scope here; RuEdit already has its React boundary (ADR-415).
- Iframe pooling / count budgeting (still ADR-411 O84) — React per view does not
  change that ledger materially; revisit if startup cost bites.

## Consequences

### Positive

- **One stack, shell and views.** React + TanStack Query + Router + Tailwind
  everywhere; shared idioms, shared component patterns, one mental model.
- **Reactivity by default** kills the manual-re-render bug class (calRev /
  stale-classification).
- **Type-checked, lint-checked views.** `.tsx` is compiled — the silent
  curly-quote-blank-view failure mode disappears.
- **PHI-safer by construction** (JSX auto-escape; `no-danger`).
- **One data layer.** react-query replaces the bespoke `__viewQuery`; query-key
  and invalidation conventions carry straight over.

### Negative

- **A build step per bundle** where none existed — new Vite config, a dev watch
  recipe, and a changed inner-loop (edit `.tsx` → rebuild → reload, no longer
  edit-`.html`-reload). Real ergonomic cost until the watcher is smooth.
- **Runtime bytes in the iframe.** React + TanStack per bundle (one shared
  vendor chunk per bundle mitigates; opaque-iframe startup cost is additive,
  ADR-411 §Negative already flags this).
- **Migration is 14 views of work**, spread over time; coexistence means two
  patterns live simultaneously during the transition.
- **Opaque-origin subresource caveat.** The design leans on **same-host**
  `view://` chunk loading; the codicons incident showed *cross-host* `view://`
  subresources are flaky. Same-host is the norm, but the pilot must verify a
  same-host vendor chunk loads deterministically (else fall back to inlining the
  vendor — fatter but race-free).

### Neutral

- ADR-411's container, bridge, trust zone, and Main-brokered routing are
  untouched. ADR-419 sits strictly *inside* the boundary 411 drew.
- The O82 declarative-view path (zero bundle JS, render in shell React) is **not**
  chosen — it would move PHI rendering into shell trust, against ADR-411/418. It
  remains a named, unused alternative.

## Considered Options

- **Stay vanilla (ratify the status quo).** _Rejected_: does not scale; the
  manual-render bug class, silent syntax failures, and 2000-line single-file
  views are intrinsic to it.
- **Declarative typed-UI-tree rendered in shell React (O82).** _Rejected_: zero
  bundle JS is attractive, but PHI would render in the shell's renderer tree,
  reopening the trust-zone isolation ADR-411/418 exist to enforce; and a fixed
  widget vocabulary can't express the product's views.
- **Solid (or Preact) as the single stack for shell *and* views.** _Rejected_:
  evaluated explicitly under the "one stack, no two" constraint (so this means
  re-platforming the **shell**, not just the views). Solid's merits are real —
  fine-grained signals (no VDOM), a ~7kb runtime that would materially help the
  iframe byte-budget (§Negative), and no memoization gymnastics. But the cost is
  wildly asymmetric: the shell is already deep React — React 19 + **React
  Compiler** (which already neutralizes most of React's re-render cost, shrinking
  Solid's perf edge for us), TanStack **Router** + **Query** (React bindings;
  Solid equivalents differ), and **RuEdit = React + ProseMirror (ADR-414/415)**,
  a whole integration-boundary ADR pair that would be redone. Solid's benefit ≈
  smaller iframe runtime + marginal perf (both already blunted by React Compiler
  + a shared-vendor-chunk-per-bundle); its cost ≈ re-platform the entire shell +
  RuEdit. Greenfield, Solid would be a legitimate contender on the iframe-byte
  angle; we are not greenfield. (A framework *only* in the iframe, different from
  the shell, is the two-stacks outcome the whole ADR exists to avoid.)
- **React + TanStack Query + TanStack Router, self-bundled per bundle into the
  iframe** _(chosen)_ — one stack with the shell; reactivity, type-safety, and
  PHI-safety by construction; react-query subsumes the proven `__viewQuery`
  seam; consistent with ADR-411's bundle-internal-framework allowance.

## Open Items

- **O496** — *(this ADR — resolves the tech-stack question; mark resolved on
  acceptance.)*
- **O497** — redefined: migrate hand-rolled views to React + react-query
  (no longer the vanilla-wrapper rollout). Pilot = `meetings.html`.
- **O-new (view-kit)** — define `@ru-soam/view-kit`: `<ViewRoot>`,
  `useSoamView()`, `<Icon>`, channel hooks, the shared `QueryClient`.
- **O-new (view build)** — per-bundle Vite multi-entry build + `just` watch
  recipe + CI `process`-strip guard for view output.
- **O-new (seam cleanup)** — remove `__viewQuery` + query-core vendor injection
  from `view-protocol.ts` once the last vanilla view migrates.
- Inherited from ADR-411: O80 (sandbox flags), O81 (CSP text), O84 (iframe
  pooling) — unaffected but adjacent.
