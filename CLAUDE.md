# Project Intelligence

<!--
  USAGE NOTES FOR OPUS (lead agent)
  ──────────────────────────────────
  This file is your persistent memory and the primary cache asset for the
  project. Both you and every Sonnet subagent load it on every invocation —
  so anything stable and reusable belongs here.

  After significant design decisions, append a note to the Architecture Log
  section below. This converts ephemeral conversation context into free cached
  context for all future invocations.
-->

---

## Project Overview

**Name:** ru-soam

**Purpose:** Local-first Electron workbench for mental-health practitioners. PHI never reaches the cloud in plaintext (ADR-301). VSCode-style composition shell where most features ship as bundles (capabilities + contributions) rather than core code. MVP tenancy = Individual practitioner (ADR-501); Clinic proposed (ADR-503).

**Stack:**

- Electron 42 (main + preload + renderer + bundle-host = four processes / trust zones — ADR-101, ADR-410)
- React 19 + React Compiler, TanStack Router (file-based, generated `routeTree.gen.ts`), TanStack Query
- Tailwind v4 (`@tailwindcss/vite`) with CSS class-based theming (palette × luminance × font-set axes — ADR-413)
- ProseMirror (in `@ru-soam/editor`, the RuEdit primitive)
- Vite for renderer, main, preload, and bundle-host bundles (four `vite.*.config.ts`)
- TypeScript ESNext, ESM-only, `strict`, `verbatimModuleSyntax`, `erasableSyntaxOnly`
- pnpm workspace; `just` for dev recipes; `electron-builder` for packaging

**Entry points:**

- Renderer: `apps/desktop/src/main.tsx` → `App.tsx` → `Workbench.tsx`
- Main: `apps/desktop/electron/main/index.ts`
- Preload: `apps/desktop/electron/preload/index.ts` (exposes `window.soam` — ADR-202)
- Bundle Host: `apps/desktop/electron/bundle-host/index.ts` (Node process spawned on demand — ADR-410)
- Dev: `just dev-desktop` or `pnpm --filter ru-soam-app dev`

---

## Repository Layout

```
/
├── apps/
│   ├── desktop/                   # Electron workbench (the product)
│   │   ├── electron/
│   │   │   ├── main/              # Main process: window, security, IPC, capability host
│   │   │   ├── preload/           # window.soam capability bridge (ADR-202)
│   │   │   ├── bundle-host/       # Bundle Host Node process (ADR-410)
│   │   │   └── shared/            # IPC + host protocol types (renderer↔main↔host)
│   │   ├── src/                   # Renderer (React composition shell — ADR-102)
│   │   │   ├── platform/          # services, command, context-key, keybinding,
│   │   │   │                      # theme, font, layout, statusbar, workspace, ru-edit
│   │   │   ├── workbench/         # Parts: TitleBar, Banner, Middle (5 slots), StatusBar
│   │   │   ├── routes/            # TanStack Router (file-based) + routeTree.gen.ts
│   │   │   └── styles/            # tokens.css, palette CSS, workbench.css
│   │   ├── bundles/               # First-party bundles (e.g. echo-test, echo-lazy)
│   │   └── vite.{main,preload,bundle-host,config}.ts
│   └── web/                       # Placeholder (not yet implemented)
├── packages/
│   └── editor/                    # @ru-soam/editor — ProseMirror-based RuEdit primitive
├── docs/                          # ADRs/, Proposals/, Guides/, References/, Implementation_Plan.md, Open_Items.md
├── server/                        # Placeholder
├── justfile                       # `just dev-desktop`
└── pnpm-workspace.yaml            # apps/* + packages/*
```

---

## Conventions

### Code style

- TypeScript ESNext, ESM only. `strict`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `noUnusedLocals/Parameters`, `noFallthroughCasesInSwitch`. No emit (Vite handles bundling).
- Prettier (root `.prettierrc`): 2-space indent, single quotes, semicolons, trailing comma `all`, print width `100`, `endOfLine: lf`, `bracketSpacing: true`, `arrowParens: always`. JSX uses double quotes.
- ESLint flat config (`apps/desktop/eslint.config.js`): `@eslint/js` recommended + `typescript-eslint` recommended + `eslint-plugin-react-hooks` + `eslint-plugin-react-refresh` (vite). `dist/` globally ignored.
- React 19 + React Compiler enabled via `babel-plugin-react-compiler`. Don't pre-memoize what the compiler will memoize; write idiomatic React.
- Tailwind v4 with `@theme {}` tokens in `apps/desktop/src/styles/tokens.css`. Use generated `bg-*` / `text-*` / `font-*` utilities, not inline `style={{...}}` for theme-able values.

### Naming

- File names: `kebab-case.ts` for modules, `PascalCase.tsx` for React components. Test files (when they exist): `*.test.ts`.
- Service identifiers: branded `ServiceId<T> = { readonly _t: T; readonly id: string }` (O96 resolved Phase 2). Suffix DI tokens with `ServiceId` (e.g. `ThemeServiceId`, `FontServiceId`).
- Command ids: `<bundleId>.<verb>[.<noun>]` (platform commands use the `workbench.*` namespace — ADR-406).
- Context keys: dotted, lowercase. Platform-reserved namespaces (`workbench.*`, `editor.*`, `patient.*`, `record.*`) — bundles may not write to them.
- ADR files: `ADRs/NNN-kebab-case-title.md`; ranges defined in `docs/README.md`.

### Error handling

- Renderer is a composition shell, not an authority owner (ADR-102). Errors from capabilities surface as typed rejections through `window.soam.*` — propagate to TanStack Query / the calling Part; do not swallow.
- Bundle Host crash must NOT take down the Renderer (ADR-410, Phase 1 exit). Treat host calls as remote: timeouts, typed errors, no shared memory assumptions.
- Disposable pattern (`docs/Guides/disposable-pattern.md`) is the cleanup convention across the platform — return `IDisposable` from anything that subscribes / registers / spawns.

### Imports / module boundaries

- **Renderer must never import `electron`** or any node built-in. Cross-zone access goes through `window.soam.*` capabilities only (ADR-202).
- **No `<webview>` and no direct `BrowserWindow`** outside `electron/main/window-factory.ts` (ADR-201). Bundle UIs render through the sandboxed iframe + `view://` bridge (ADR-411).
- **Brokered networking only** — no direct `fetch` from the Renderer to third-party origins; use the `app://` protocol or a capability that wraps it (ADR-203).
- Workspace package imports: use `@ru-soam/editor` (alias from `packages/editor` via pnpm workspace), not relative paths into `packages/*`.
- TanStack Router: file-based routes in `apps/desktop/src/routes/`. Regenerate with `pnpm --filter ru-soam-app route-gen` after adding/renaming routes. Don't hand-edit `routeTree.gen.ts`.
- Any architectural change (new trust-zone crossing, new contribution point, new protocol scheme, new persisted shape) requires an ADR or an Open Item entry — see `docs/README.md` and `docs/Open_Items.md`.

---

## Test Command

No automated test suite yet. Verify changes with type-check + lint:

```bash
# Type-check the whole workspace (project references via tsc -b)
pnpm --filter ru-soam-app compile && pnpm --filter @ru-soam/editor compile

# Lint the desktop app
pnpm --filter ru-soam-app lint

# Smoke-run the app (dogfood verification — Implementation_Plan.md uses
# "you can open the app and see X work" as the exit criterion for each phase)
just dev-desktop
```

When a test framework lands, replace this block with the actual command.

---

## Architecture Log

<!--
  Opus appends here after every significant design decision.
  Format each entry as shown. This is what prevents Opus from having to
  re-derive decisions from conversation history — it's all in the cache.
-->

### 17 May 2026 — Initial setup

- Multi-agent orchestration: Opus plans and reviews; Sonnet 4.6 implements.
- Handoffs are thin briefs (intent + scope + success criteria). Sonnet reads
  its own execution context from the codebase.
- All stable decisions live in this file to maximise cache reuse.

### 17 May 2026 — Review comments and fixes

- Bundle Host = fourth trust zone now canonical in ADR-101/103/104/105

---

## Orchestration Protocol (Opus must follow this)

### My role

I am the lead agent. I think, plan, delegate, and verify. I do not implement.

### Workflow per task

**1. Plan**
Reason through the full requirement. Identify:

- What needs to change and why
- Which modules / files are in scope (names only, do not read contents)
- Edge cases and constraints
- Success criteria (how will I know it's correct?)

**2. Delegate**
Invoke `@agent-implementer` with a brief containing:

- **Goal** — one sentence
- **Scope** — list of file paths or directories in scope
- **Key constraints** — conventions, must-not-break interfaces, etc.
- **Success criteria** — what passing tests / behaviour looks like
- **Priority flags** — anything tricky to watch out for

Do NOT include file contents in the handoff. Do NOT include the full design
rationale. Keep the brief to what Sonnet needs to act — it will read the rest.

**3. Review**
After receiving the handoff summary:

- Read the changed files (I read them now, not before)
- Verify logic against the plan and conventions
- Check the test results reported
- If something is wrong, produce a correction brief and re-delegate
- When satisfied, summarise the outcome for the user and append any
  architectural decisions to the Architecture Log above

### What makes a good brief (template)

```
Goal: <one sentence>

Scope:
- src/module/foo.ts  (add X)
- src/module/bar.ts  (update Y to support X)
- tests/module/foo.test.ts  (add tests for X)

Constraints:
- Must not change the public API of Bar
- Follow the error-handling pattern in src/utils/errors.ts
- All new functions need JSDoc

Success criteria:
- `npm test` passes with no new failures
- X is callable from Bar with the signature: foo(a: string): Result<T>

Watch out for:
- Bar has a caching layer — make sure X invalidates it correctly
```

### Context hygiene

- After each task cycle, consider whether any decision warrants an entry in
  the Architecture Log. If yes, write it before moving on.
- Keep my conversational context lean. Stable knowledge belongs in this file,
  not in the chat.
