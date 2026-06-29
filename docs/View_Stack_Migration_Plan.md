# View-stack migration plan (A7 / O497) — build note

**Decision basis:** ADR-419 (bundle views = React apps on the shell stack) +
ADR-411 Am1 (real per-bundle origin + per-view-runtime CSP, **O511 — BUILT +
dogfood-verified 2026-06-29**). This note is the execution plan for the build
work that ADR-419 spawned. Survives `/compact`.

**STATUS: A7 groundwork COMPLETE + DOGFOOD-VERIFIED 2026-06-30 (uncommitted).**
`@ru-soam/view-kit` built (compiles) + per-bundle Vite view-build + pilot
`meetings.html` → React all landed. Live CDP dogfood: meetings view renders at
real origin `view://ru-soam-sessions` under STRICT CSP — React mounted, 27 live
meetings via `useCapQuery` bridge round-trip, `<Icon>` inline-SVG, theme/fonts
applied, console clean, inline-script BLOCKED (XSS backstop live), visual parity
with the vanilla original. Pipeline proven end-to-end.

## Where we are

- **O511 done** (the platform foundation): view iframes have a real per-bundle
  origin (`sandbox="allow-scripts allow-forms allow-same-origin"`); CSP is
  selected per view by manifest `runtime` (`vanilla` → `LEGACY_VIEW_CSP` with
  `'unsafe-inline'` + inline seams, unchanged; `react` → `STRICT_VIEW_CSP`
  `script-src 'self'` + same-host external seams under `view://<id>/_seam/<name>`).
  `viewCsp(trustClass, runtime)` in `view-protocol.ts`; `SEAM_ASSETS` serves
  bridge/bootstrap/fonts/maturity. Proven via `echo-test` `react-smoke` fixture.
- **Coexistence is temporary.** All 13 vanilla views migrate to React over time;
  when the last flips, `'unsafe-inline'` is dropped from the first-party tier →
  single strict CSP. No new vanilla views.

## A7 groundwork — two pieces + a pilot

### 1. `@ru-soam/view-kit` (new workspace package, `packages/`, base-layer ADR-106)

The React adapter over the injected seams. Precedent: `packages/editor`
(`@ru-soam/editor`), `type: module`, `main/types: src/index.ts`, `tsc -b`.

API surface:
- **`<ViewRoot>`** — mandatory root. Awaits bridge readiness
  (`window.soamView.ready` / `__viewBoot.awaitBridge()`), provides a
  `QueryClient`, exposes the bridge `context`-message entityId via React context,
  wires `soamView.events.onStoreChange → queryClient.invalidateQueries`. **Theme
  is auto-applied by the bridge** to `documentElement` (do NOT re-apply); Tailwind
  reads those CSS vars. Render children only once the bridge is ready.
- **`useSoamView()`** — typed accessor for the bridge verbs (`openInEditor`,
  `setActiveEvent`, `openExternal`, `openActivity`, `setTabDescription`,
  `focusAspect`, `requestContextMenu`, …).
- **`useViewContext()`** — entityId / context payload (+ change subscription).
- **`useCapQuery(capId, version, method, ...args)`** — `soamView.bindQuery` +
  TanStack Query. Key convention `[capId, method, ...args]` (mirrors shell
  `tanstack-query-keys.md` + the retired `__viewQuery`). `.call` is POSITIONAL.
- **`useCapMutation(capId, version, method)`** — `bindCommand` + mutation +
  `invalidateQueries`.
- **`<Icon name size>`** — inline-SVG codicon component (reuse the platform
  codicon source / `view-codicons` mapping), replacing `data-codicon`.

React views do NOT receive the `_seam` codicons / query-vendor / `__viewQuery`
(view-kit's `<Icon>` + react-query supersede them). They DO get
`_seam/bridge.js` + `bootstrap.js` + `fonts.css` + `maturity.*` (already wired in
`injectReactSeams`).

### 2. Per-bundle Vite view-build

- One config per bundle (e.g. `bundles/<id>/vite.views.config.ts`), **mirror the
  shell** (`apps/desktop/vite.config.ts`): `@vitejs/plugin-react`,
  `@rolldown/plugin-babel` with `reactCompilerPreset()`, `@tailwindcss/vite`.
  (TanStack Router plugin only when a multi-step view needs it — pilot doesn't.)
- **Idiomatic multi-chunk** (NOT single-file — the real origin makes same-host
  external chunks safe; spike + O511 proved no "Unsafe attempt to load URL").
  Shared vendor chunk per bundle (`manualChunks`) so React/TanStack load once.
- **Mode FOLLOWS watch** (CORRECTED — see dogfood lesson below): dev watch =
  `'development'`, packaged `build:views` = `'production'`. Vite statically
  replaces `process.env.NODE_ENV` per mode itself, so NO manual `define` is
  needed. The earlier "mode:production always" instruction was wrong: under a
  development (watch) build, `@vitejs/plugin-react` emits the dev JSX runtime
  (`jsxDEV`), but a forced `process.env.NODE_ENV='production'` define bundles
  production React (no working `jsxDEV`) → `TypeError: jsxDEV is not a function`
  at first render → blank view. Let mode drive both so the JSX transform and the
  React runtime stay consistent. (The `process`-undefined throw that motivated
  "production always" was specific to the gen-view-query IIFE which had NO Vite
  `define`; a normal Vite app build always replaces `process.env.NODE_ENV`.)
- **Source** in `bundles/<id>/view-src/<view>.tsx` (+ an HTML entry per view).
  **Output INTO `view-assets/`** (manifest `path` unchanged; `viewAssetsDir` is
  hardcoded `bundleDir/view-assets`; electron-builder copies `bundles/`
  wholesale). Built `view-assets/*.html|js|css` for migrated views = **gitignored**
  per-bundle; the 13 legacy authored `.html` stay committed.
- **Asset base** so URLs resolve under `view://<id>/` (relative `./` — the html
  is served at `view://<id>/<name>.html`, assets at `view://<id>/assets/*`).
- **Wire** into `just dev-desktop` (view build --watch) + a prepackage step
  before `electron-builder`. Inner loop changes: edit `.tsx` → rebuild → reload
  iframe (no longer edit-`.html`-reload).

### 3. Pilot — `meetings.html` (Sessions)

- Move to `bundles/ru-soam-sessions/view-src/meetings.tsx`; set manifest view
  `runtime: 'react'`; build → `view-assets/meetings.html`.
- Behaviour parity: caps `sessions.meeting.query` (`listUpcoming`),
  `record.patient.query` (`list`/`get`), `sessions.meeting` (`sync` cmd); verb
  `openInEditor` (row → meeting-record); events `onActivate`, `onStoreChange`;
  `data-codicon` → `<Icon>`.
- Dogfood: list renders, sync works, store-change refresh, row open, theme
  applies, **strict CSP** (origin real, external chunks load, any stray inline
  blocked).

**2nd view DONE + dogfood-verified 2026-06-30:** `projections.html` (Practice
"Notes" panel view, context-following). Validated `useViewContext`, `enabled`-gated
`useCapQuery`, the multi-bundle build glob, and local React toggle state. Surfaced
+ fixed a real bridge/view-kit gap (below).

**3rd view DONE + dogfood-verified 2026-06-30:** `intake.html` (Practice "Intake
Checklist", URL-`?id=` pinned editor tab). Validated the 3rd entity-delivery path
(URL query, not the 'context' channel) via a new view-kit **`useViewQuery()`** hook
(`useMemo(() => __viewBoot.parseQuery(location.search), [])`); a SECOND React view in
the same bundle (multi-view `rollupOptions.input` → Vite emits a shared vendor chunk +
per-view entry); and a best-effort CROSS-BUNDLE view-bind (`sessions.meeting.query`
from a Practice view → the derived "First appointment scheduled" 11th item). Added
the `circle-large-outline` codicon. Dogfood (CDP, MS Hussain via `openInEditor('intake',
{query:'id=…'})`): tab URL carries `?id=`, renders "Intake — 1/11 complete", 11 rows,
cross-bundle 11th item resolved, console clean. **Entity-delivery paths now all
covered: standalone (meetings) · 'context' channel (projections, useViewContext) ·
URL `?id=` (intake, useViewQuery).**

**CONTEXT-DELIVERY FIX (applies to EVERY context-following React view):** a React
view's 'context' listener lives in ViewRoot's post-`awaitBridge` effect, which
attaches AFTER the bridge already delivered the initial 'context' (and its
readyState-gated DOMContentLoaded replay already fired) — so the entity id is
MISSED on initial mount (name/data never loads until the user switches entity,
which pushes a fresh live message). The standalone meetings pilot couldn't surface
this (no context). FIX = the bridge (`view-bridge.ts`) now exposes
`soamView.currentContext()` returning the buffered last 'context' message;
`ViewRoot` reads it on mount to seed `entityId`, then keeps the live listener for
updates. `useCapQuery` gained `(args[], { enabled, staleTime })` so the gated
fetch waits for entityId. Any future context-following view gets this for free via
view-kit.

Then migrate the rest smallest/highest-churn first; large views
(`schedule.html`, `event-detail.html`) last. When the last vanilla view is gone:
drop `'unsafe-inline'` from the first-party tier + remove the legacy inline-seam
injection path from `view-protocol.ts`.

## Watch-outs / open questions

- **Vite `<script type="module" crossorigin>` under the real origin** — RESOLVED
  in the pilot: the emitted `<script type="module" crossorigin src="./assets/…">`
  and `<link rel="stylesheet" crossorigin>` load CLEAN under `script-src 'self'` /
  `style-src 'self'` at `view://<bundleId>/`. No strip needed (same-origin; the
  protocol handler's `Cross-Origin-Resource-Policy: cross-origin` suffices). Do
  not add a crossorigin-stripping plugin.
- **Tailwind CSP (O513)** — `STRICT_VIEW_CSP` currently has
  `style-src 'self' 'unsafe-inline'`. The pilot used PLAIN ported CSS (no Tailwind
  utilities) — it loads as an external same-host `<link>` and works, but the
  `'unsafe-inline'` is still there. O513 = wire Tailwind utilities + drop
  `'unsafe-inline'` from style-src. Aim: external same-host CSS under
  `style-src 'self'`. Tokens' VALUES arrive at runtime via the bridge `applyTheme`
  (CSS vars on `documentElement`); the build only needs the `@theme` token
  DECLARATIONS present so the right utilities generate (tree-shake gotcha:
  utilities emit when seen; raw `var()` in hand-CSS does not). NOT exercised in
  the pilot — resolve when a migrated view actually uses utilities.
- **Shell dev-server optimizeDeps scanner** — RESOLVED: the shell `vite.config.ts`
  now sets `optimizeDeps.entries: ['index.html']`. Without it the shell dep
  scanner crawls `bundles/*/view-src/*.html`, hits their `@ru-soam/view-kit`
  import (aliased only in the per-bundle config), and logs "Failed to run
  dependency scan". The views are built separately + served pre-built, never by
  the dev server.
- **`vite-env.d.ts` per view-src** — each react bundle's `view-src/` needs a
  `vite-env.d.ts` (`/// <reference types="vite/client" />` + `declare module
  '*.css';`) so the `import './x.css'` side-effect import type-checks (the bundle
  tsconfig sets `types: []`).
- **view-kit not a formal `apps/desktop` dep** — the pilot resolves
  `@ru-soam/view-kit` via a Vite ALIAS in the per-bundle config (→
  `packages/view-kit/src/index.ts`). Works for the build. If a future `pnpm
  install` re-links, add `"@ru-soam/view-kit": "workspace:*"` to
  `apps/desktop/package.json` and the alias can be dropped.
- **emptyOutDir:false stale assets** — watch rebuilds accumulate old-hash files in
  `view-assets/assets/` (gitignored, harmless; the HTML references only the new
  hash). Add a per-build clean of `assets/` later if it bothers.
- **`'unsafe-inline'` removal end-state** — tracked; happens when the last
  vanilla view migrates.
- Full `just dev-desktop` restart after any manifest `runtime` flip / build-script
  change (dev.mjs imports build-views.mjs as a boot singleton — config/script
  edits are NOT hot-picked-up; this bit during the pilot).

## Related open items

- **O497** — this migration track (redefined by ADR-419).
- **O511** — real-origin + tiered CSP (done).
- **O512** — untrusted (TP-Host) view CSP tier (deferred to rung-H).
- **O513** — Tailwind-in-view CSP/build handling (resolve in pilot).
