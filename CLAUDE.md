# Project Intelligence

<!--
  USAGE NOTES FOR OPUS (lead agent)
  ──────────────────────────────────
  This file is your persistent memory and the primary cache asset for the
  project. Both you and every Sonnet subagent load it on every invocation —
  so anything stable and reusable belongs here.

  After a significant design decision, add a one-line entry to the
  Architecture Log below — decisions only, not per-task or per-PR narrative.
  If nothing durable was decided, no entry. Conventions, code, and ADRs
  already capture implementation detail.
-->

---

## Project Overview

**Name:** ru-soam

**Purpose:** Local-first Electron workbench for mental-health practitioners. PHI never reach cloud in plaintext (ADR-301). VSCode-style composition shell — most features ship as bundles (capabilities + contributions) not core code. MVP tenancy = Individual practitioner (ADR-501); Clinic proposed (ADR-503).

**Stack:**

- Electron 41 (main + preload + renderer + bundle-host = four processes / trust zones — ADR-101, ADR-410). Pinned at 41 in Phase 10a — `better-sqlite3-multiple-ciphers@12.9.0` no compile against Electron 42 V8 14 API. Bump re-evaluated when SQLCipher lands in 10b.
- React 19 + React Compiler, TanStack Router (file-based, generated `routeTree.gen.ts`), TanStack Query
- Tailwind v4 (`@tailwindcss/vite`) with CSS class-based theming (palette × luminance × font-set axes — ADR-413)
- ProseMirror (in `@ru-soam/editor`, RuEdit primitive)
- Vite for renderer, main, preload, bundle-host bundles (four `vite.*.config.ts`)
- TypeScript ESNext, ESM-only, `strict`, `verbatimModuleSyntax`, `erasableSyntaxOnly`
- npm workspaces; `just` for dev recipes; `electron-builder` for packaging (migrated off pnpm — ADR-204 Amendment 2; npm's flat node_modules is required for correct native-module packaging on Windows)

**Entry points:**

- Renderer: `apps/desktop/src/main.tsx` → `App.tsx` → `Workbench.tsx`
- Main: `apps/desktop/electron/main/index.ts`
- Preload: `apps/desktop/electron/preload/index.ts` (exposes `window.soam` — ADR-202)
- Bundle Host: `apps/desktop/electron/bundle-host/index.ts` (Node process spawned on demand — ADR-410)
- Dev: `just dev-desktop` or `npm run dev -w ru-soam`

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
└── package.json                   # npm workspaces: apps/* + packages/*
```

---

## Conventions

> **ADR-first.** Before any design, architecture, or planning activity,
> check `docs/ADRs/` for relevant decisions (ranges in `docs/README.md`).
> ADRs are the source of truth for specific designs — this file holds only
> the top-level invariants needed at all times.

### Code style

- TypeScript ESNext, ESM only. `strict`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `noUnusedLocals/Parameters`, `noFallthroughCasesInSwitch`. No emit (Vite handle bundling).
- Prettier (root `.prettierrc`): 2-space indent, single quotes, semicolons, trailing comma `all`, print width `100`, `endOfLine: lf`, `bracketSpacing: true`, `arrowParens: always`. JSX use double quotes.
- ESLint flat config (`apps/desktop/eslint.config.js`): `@eslint/js` recommended + `typescript-eslint` recommended + `eslint-plugin-react-hooks` + `eslint-plugin-react-refresh` (vite). `dist/` globally ignored.
- React 19 + React Compiler enabled via `babel-plugin-react-compiler`. No pre-memoize what compiler memoize; write idiomatic React.
- Tailwind v4 with `@theme {}` tokens in `apps/desktop/src/styles/tokens.css`. Use generated `bg-*` / `text-*` / `font-*` utilities, not inline `style={{...}}` for theme-able values.

### Naming

- File names: `kebab-case.ts` for modules, `PascalCase.tsx` for React components. Test files (when exist): `*.test.ts`.
- Service identifiers: branded `ServiceId<T> = { readonly _t: T; readonly id: string }` (O96 resolved Phase 2). Suffix DI tokens with `ServiceId` (e.g. `ThemeServiceId`, `FontServiceId`).
- Command ids: `<bundleId>.<verb>[.<noun>]` (platform commands use `workbench.*` namespace — ADR-406).
- Context keys: dotted, lowercase. Platform-reserved namespaces (`workbench.*`, `editor.*`, `patient.*`, `record.*`) — bundles may not write to them.
- ADR files: `ADRs/NNN-kebab-case-title.md`; ranges defined in `docs/README.md`.

### Error handling

- Renderer is composition shell, not authority owner (ADR-102). Errors from capabilities surface as typed rejections through `window.soam.*` — propagate to TanStack Query / calling Part; no swallow.
- Bundle Host crash must NOT take down Renderer (ADR-410, Phase 1 exit). Treat host calls as remote: timeouts, typed errors, no shared memory assumptions.
- Disposable pattern (`docs/Guides/disposable-pattern.md`) is cleanup convention across platform — return `IDisposable` from anything subscribe / register / spawn.

### Imports / module boundaries

- **Renderer must never import `electron`** or any node built-in. Cross-zone access go through `window.soam.*` capabilities only (ADR-202).
- **No `<webview>` and no direct `BrowserWindow`** outside `electron/main/window-factory.ts` (ADR-201). Bundle UIs render through sandboxed iframe + `view://` bridge (ADR-411).
- **Brokered networking only** — no direct `fetch` from Renderer to third-party origins; use `app://` protocol or capability wrapping it (ADR-203).
- Workspace package imports: use `@ru-soam/editor` (alias from `packages/editor` via npm workspace), not relative paths into `packages/*`.
- TanStack Router: file-based routes in `apps/desktop/src/routes/`. Regenerate with `npm run route-gen -w ru-soam` after add/rename routes. No hand-edit `routeTree.gen.ts`.
- Any architectural change (new trust-zone crossing, new contribution point, new protocol scheme, new persisted shape) requires ADR or Open Item entry — see `docs/README.md` and `docs/Open_Items.md`.

### UI / styling

- UI/UX work: invoke the **`frontend-design`** skill.
- All styling rules (layer order, tokens, type scale, `@apply` policy,
  `@reference` target, BEM naming, review checklist) live in
  `docs/Guides/styling-system.md`. Follow it.
- Architectural changes to the styling system require an ADR.

---

## Test Command

No automated test suite yet. Verify changes with type-check + lint:

```bash
# Type-check the whole workspace (project references via tsc -b)
npm run compile -w ru-soam && npm run compile -w @ru-soam/editor

# Lint the desktop app
npm run lint -w ru-soam

# Smoke-run the app (dogfood verification — Implementation_Plan.md uses
# "you can open the app and see X work" as the exit criterion for each phase)
just dev-desktop
```

---

## Skills & search-tool selection

### Always-on skills (main thread)

- **caveman** — keep output terse; drop articles, filler, pleasantries.
- **agent-browser** — reach when task needs Electron/browser
  automation or dogfooding.

### On-demand skills

- **frontend-design** — invoke only when scope touches UI components, pages,
  visual design.
- **ast-grep** — invoke per search-tool decision rule below.

### Search tool selection — `grep` vs `ast-grep`

Choose by query shape, not habit:

- **Use `grep`** for literal-string matches: known identifiers, error
  messages, import paths, file names, URL fragments. Anything paste
  between quotes.
- **Use `ast-grep`** moment query depends on code structure:
  - "all calls to X with N+ args" / "X called as second arg of Y"
  - "every `useState<T>(...)` where T is non-primitive"
  - "all `ipcMain.handle` registrations" (handlers may be registered via
    helpers, dynamic strings, chained calls `grep` will miss)
  - "every `switch` statement missing `default` case"
  - any rename or refactor where AST node type matters

If answer to "would `grep` match wrong things or miss syntactic
variants" is yes, `ast-grep` is correct tool. Default to `grep` for
speed; reach for `ast-grep` deliberately when query crosses
structural-vs-textual line above.

### Subagent dispatch

Use `subagent_type: implementer` (defined at `~/.claude/agents/implementer.md`)
for all implementation delegation. Agent system prompt bakes in
skill-activation rules above, so briefs no need repeat them — pass
only task-specific Goal / Scope / Constraints / Success criteria.

## Architecture Log

<!--
  Top-level, always-relevant decisions only. Specific/detailed designs
  belong in ADRs (`docs/ADRs/`) — link from here when needed. One line per
  decision. No entry per task, per PR, or per day.
-->

- Orchestration: Opus plans + reviews; Sonnet implements. Briefs thin (intent + scope + success criteria); implementer reads context from codebase.
- Electron pinned `^41.2.2` — `better-sqlite3-multiple-ciphers` does not compile against Electron 42 V8-14 API (O157 open). Revisit when BSMC supports V8-14.
- Styling system policy lives in **Conventions → Styling system**. Architectural changes to it require an ADR.
- Release & update channel (ADR-204) + update-time data integrity (ADR-308) accepted. Auto-update via `electron-updater` from Main; NSIS (Win) + `.deb` (Linux) targets; roll-forward only; staging via prerelease semver tags (`allowPrerelease=false` hides them from stable).
- **ADR-204 Amendment 1 (2026-05-24): artefact host = Cloudflare R2, not GitHub Releases.** Source repo is private → public GH release assets 404 for anon (breaks website downloads AND shipped `electron-updater` feed). Pivot: `electron-updater` `provider: generic` reading `latest*.yml` from a public R2 bucket URL. R2 is download-only for generic, so CI builds `--publish never` then uploads `release/*.{exe,deb,yml,blockmap}` to R2 over the S3 API (endpoint `https://<acct>.r2.cloudflarestorage.com`, region `auto`). No GitHub Release created; website is the changelog surface. Prerelease = channel manifest `beta.yml` (from `-beta.N` tag), not a GH prerelease flag. Website shows SHA-512 from the manifest (not SHA-256). **Feed URL bakes into `app-update.yml` → must be fixed before first R2 release; v0.1.0 (GH provider) has a dead updater, first R2 release is the working baseline.** New open items O186 (public-access surface), O187 (retention), O188 (upload integrity). Needs R2 S3 creds as GH secrets (`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`/`R2_BUCKET`/`R2_PUBLIC_URL`) — separate from the Pages `CLOUDFLARE_API_TOKEN`.
- Phase 10b migration runner must resolve O182 before wiring `schema-gate.ts`: migrations use a `_schema_version` table, but ADR-308 / `schema-gate.ts` assume `PRAGMA user_version` (reads 0 today). Pick one source of truth. `createPreMigrationBackup` + `quiesceForUpdate` helpers exist but are not yet wired into the live migration path.
- ESM main + bundle-host bundles need a `createRequire` banner. Vite 8/Rolldown bundles CJS deps (electron-updater, @scure/bip39, zxcvbn, lucide) whose internal `require('fs')` compiles to a `__require` helper that throws in ESM (`require` undefined) — packaged app crashed at startup with "Calling require for fs in an environment that doesn't expose the require function". Fix: `rollupOptions.output.banner` injecting `import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);` in `vite.main.config.ts` + `vite.bundle-host.config.ts`. Rolldown then routes all CJS requires through the real require (no `__require` helper emitted). Preserves ESM-only convention; preload already CJS so unaffected. Do NOT switch main to CJS.
- **Package manager = npm (npm workspaces), NOT pnpm — required for correct native-module packaging (ADR-204 Amendment 2).** (Full pnpm post-mortem in ADR-204 Am.2: symlinked/junction layout not packed on Windows + the `node-linker=hoisted` wrong-ABI dead end; v0.1.0–0.1.3 burned.) **Do NOT reintroduce pnpm or `node-linker=hoisted`.** npm fixes it structurally: **flat real-dir `node_modules`** → the only packed modules are the two natives (no junctions), and `postinstall: node scripts/rebuild-natives.mjs` rebuilds them to the **Electron ABI (145)**. **Do NOT use `electron-builder install-app-deps` in postinstall — under npm workspaces it re-enters `npm install`, which re-fires postinstall → unbounded recursion (fork-bomb; ~150 stacked procs).** `rebuild-natives.mjs` calls `@electron/rebuild` (devDep `^4.0.4`) directly with **`buildPath=apps/desktop`** (dep discovery — root `package.json` doesn't list `better-sqlite3`) **+ `projectRootPath`=repo root** (locates the hoisted natives). BOTH args required: the flat hoist splits where the dep is *declared* (app) from where it physically *lives* (root `node_modules`); a single `buildPath` makes discovery and location disagree and the rebuild silently no-ops (reports "REBUILD DONE", touches nothing — verify via `.node` mtime + `ELECTRON_RUN_AS_NODE` ABI check, not the tool's exit code). `force:true`; `onlyModules` = `better-sqlite3` + its `better-sqlite3-multiple-ciphers` alias (both ship a `.node`, both rebuilt). `@node-rs/argon2` is napi/Node-API (ABI-stable) → intentionally NOT rebuilt. Packaging is plain `electron-builder --config electron-builder.yml` (no deploy hack); `electron-builder.yml` keeps `asarUnpack` (`**/*.node` + the two native pkgs) + `npmRebuild: false`. `@ru-soam/editor` is renderer-only (Vite-bundled into `dist/`), never packed. Commands: `npm ci`, `npm run <script> -w ru-soam`. Lockfile = committed `package-lock.json`. Dependency cooldown (npm has no install-time `minimumReleaseAge`): **Renovate** (`renovate.json`, `minimumReleaseAge: 7 days`) + **Dependabot** (`.github/dependabot.yml`, `cooldown.default-days: 7`) gate updates; npm runs all install scripts (no `allowBuilds` gate — O191). Verification gate before tagging a release: **launch the packaged binary** + `ELECTRON_RUN_AS_NODE` check that the packed `.node` loads under Electron (ABI 145). First working baseline = v0.1.4 (0.1.2/0.1.3 burned).
- **Windows native-dep packaging — two cross-platform traps beyond ABI (ADR-204 Am.2).** **(1) npm #4828:** a lockfile generated on Linux records NO win32 package nodes for *transitive* optional natives → `npm ci`/`npm install` can't install them on Windows. Build-time bindings (`@rolldown/binding`, `lightningcss`, `@tailwindcss/oxide`) → the Windows CI leg installs them `--no-save` (build-only, never packed). The *runtime* native `@node-rs/argon2` (must be packed) → declare its platform pkgs in `apps/desktop` **`optionalDependencies`** (`@node-rs/argon2-{linux-x64-gnu,win32-x64-msvc}`); **direct** optional deps DO get os-gated lock nodes (#4828 prunes only *transitive*), so `npm ci` installs the right one per-platform + electron-builder packs it. **(2) VC++ runtime:** the argon2 win32 `.node` imports `vcruntime140.dll`, NOT part of Windows (only the Universal CRT is). Node's `dlopen` uses `LOAD_WITH_ALTERED_SEARCH_PATH` → a `.node`'s dependent DLLs resolve from the **`.node`'s own dir, NOT the exe dir** — so app-root/`extraFiles` placement does nothing. Fix: a Windows-only CI step copies `vcruntime140.dll`+`vcruntime140_1.dll`+`msvcp140.dll` from `System32` **into `node_modules/@node-rs/argon2-win32-x64-msvc/`** (beside the `.node`); `asarUnpack: node_modules/@node-rs/argon2*/**` then ships them with it. `*.dll` is gitignored (build-env input, not vendored). better-sqlite3 is statically linked → needs none. Symptom of either gap: `Failed to load native binding` / `ERR_DLOPEN_FAILED: The specified module could not be found`. **Local packaging** needs the same `cp` into the argon2 dir before `electron-builder`. Verify on a VM with the VC++ redist UNINSTALLED (clean-client sim).

---

## Orchestration Protocol (Opus must follow this)

### My role

I am lead agent. I think, plan, delegate, verify. I do not implement.

### Workflow per task

**1. Plan**
Reason through full requirement. Identify:

- What needs change and why
- Which modules / files in scope (names only, no read contents)
- Edge cases and constraints
- Success criteria (how know it's correct?)

**2. Delegate**
Spawn implementer agent via `Agent` with `subagent_type: implementer`
(defined at `~/.claude/agents/implementer.md`). Brief contains:

- **Goal** — one sentence
- **Scope** — list of file paths or directories in scope
- **Key constraints** — conventions, must-not-break interfaces, etc.
- **Success criteria** — what passing tests / behaviour looks like
- **Priority flags** — anything tricky to watch out for

Do NOT include file contents in handoff. Do NOT include full design
rationale. Do NOT repeat skill-activation rules — agent file owns those.
Keep brief to what implementer needs to act on — reads rest
from CLAUDE.md and codebase.

**3. Review**
After receiving handoff summary:

- Read changed files (read now, not before)
- Verify logic against plan and conventions
- Check test results reported
- If something wrong, produce correction brief and re-delegate
- When satisfied, summarise outcome for user and append any
  architectural decisions to Architecture Log above

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

- After each task cycle, consider whether any decision warrants entry in
  Architecture Log. If yes, write it before moving on.
- Keep conversational context lean. Stable knowledge belongs in this file,
  not in chat.