# New-Project Scaffold: How `apps/desktop` Is Wired

**Status:** Living guide (documents the existing setup; decides nothing new)
**Audience:** Anyone who wants to understand — or reproduce — how this Electron app is
scaffolded, built, and packaged, and how it differs from the off-the-shelf frameworks.
**Source configs:** `apps/desktop/vite.config.ts`, `vite.{main,preload,fp-host}.config.ts`,
`scripts/dev.mjs`, `scripts/rebuild-natives.mjs`, `electron-builder.yml`,
`electron/main/window-factory.ts`.
**Related:** ADR-101 (trust zones), ADR-201/202 (sandbox + preload bridge), ADR-203
(brokered networking / `app://`), ADR-204 Am2/Am3 (pnpm-hoisted native packaging),
ADR-410/418 (fp-host).

---

## 0. The one-line answer

This app is **a plain Vite + React project with `electron` added as a devDependency** — not
`electron-vite`, not `electron-forge`. The glue those frameworks would give you (multi-process
builds, dev-server + electron spawn, native rebuild) is **hand-rolled** in a small Node
orchestrator so the repo keeps full control over its four trust zones (main, preload, renderer,
fp-host — ADR-101) and its pnpm-hoisted native packaging.

If you are scaffolding a *new, simpler* app, most of the exotic parts here are optional. This
guide flags what is **base scaffold** vs what is **this-repo-specific** so you can copy the
right subset.

---

## 1. The starting point (yes, the assumption is correct)

```bash
pnpm create vite@latest myapp -- --template react-ts
cd myapp
pnpm add -D electron
```

`package.json` essentials:

```jsonc
{
  "type": "module",
  "main": "dist/main/index.mjs"   // compiled main entry, not a source file
}
```

That's the whole "add electron as a dependency" story. Everything below is the machinery that
turns *four separate process bundles* into a running, then packaged, app.

---

## 2. Four processes → four Vite configs

Electron is multi-process. This app has **four trust zones** (ADR-101), so it has four Vite
configs, each an independent build:

| Config | Entry | Output format | Runs in |
|---|---|---|---|
| `vite.config.ts` | `index.html` | renderer (browser) | Renderer — the React app |
| `vite.main.config.ts` | `electron/main/index.ts` | **ESM** lib | Main process (Node + electron) |
| `vite.preload.config.ts` | `electron/preload/index.ts` | **CJS** lib | Preload (sandboxed bridge) |
| `vite.fp-host.config.ts` | `electron/fp-host/index.ts` | **ESM** lib | First-Party Host (ADR-410/418) |

The fp-host is **this-repo-specific** (an extra Node subprocess trust zone). A minimal app has
just the first three — the classic main/preload/renderer triad.

### 2a. The renderer config is an ordinary web build

`vite.config.ts` is a normal browser build. It bundles *everything* (React, deps) because the
renderer runs in a browser context with no Node. Nothing special about electron here.

### 2b. Main and preload are *library* builds, not web builds

Main/preload use `build.lib` + `rollupOptions.external`. That `external` list is the load-bearing
part — see §5.

### 2c. Preload must be CJS when the renderer is sandboxed

`vite.preload.config.ts` forces `formats: ['cjs']`, `fileName: 'index.cjs'`. This is **not
legacy** — it is current through Electron 41:

> "Sandboxed preload scripts are run as plain JavaScript without an ESM context."
> — [Electron ESM docs](https://www.electronjs.org/docs/latest/tutorial/esm)

Electron *did* gain ESM support for main and preload in Electron 28 (late 2023), but **ESM
preload works only when `sandbox: false`** (`.mjs` extension, `contextIsolation` for dynamic
node imports). This app keeps `sandbox: true` (ADR-201, non-negotiable for PHI), so the preload
stays bundled CJS. Electron's own recommendation for a sandboxed preload that needs modules is
"use a bundler" — which is exactly what `vite.preload.config.ts` does. (Bonus reason: even
unsandboxed ESM preload has a documented timing bug where it can run *after* page load,
[electron#40777](https://github.com/electron/electron/issues/40777).)

**Rule of thumb:** sandbox on → CJS preload. Sandbox off → ESM preload allowed. Don't fight it.

### 2d. The ESM-main `createRequire` gotcha

`vite.main.config.ts` injects a Rollup output `banner`:

```js
banner: "import { createRequire } from 'node:module';\nconst require = createRequire(import.meta.url);"
```

Why: the main bundle is ESM, but it externalizes CJS deps (electron-updater, native modules)
whose internal `require('fs')` compiles to a `__require` helper. ESM has no `require` → the
helper throws at startup. `createRequire` hands those externals a real `require` at runtime.
**Do not "solve" this by switching main to CJS** — keep it ESM + banner.

---

## 3. Development: the hand-rolled orchestrator

There is no dev server that "just knows" about electron. `scripts/dev.mjs` is the conductor
(`pnpm dev` / `just dev-desktop`). What it does, in order:

1. `createServer()` — start the **renderer** Vite dev server, grab its local URL.
2. `build({ build: { watch: {} } })` the **preload** and **fp-host** in watch mode.
3. Build all bundle **views** once (this-repo-specific; `scripts/build-views.mjs`), then watch.
4. `build({ build: { watch: {} } })` the **main** process; on each rebuild's `closeBundle`
   hook, **kill and respawn electron** with `env.VITE_DEV_SERVER_URL = <renderer url>`.

The main process reads that env var and decides where to load the renderer from (see §4).
Linux dev adds `--ozone-platform=x11 --no-sandbox` flags (Ubuntu 22+ AppArmor workaround —
dev only) and `--remote-debugging-port=9333` for CDP dogfooding.

**Key mental model:** the orchestrator *is* what `electron-vite dev` would do for you. Renderer
gets live HMR; main/preload/fp-host changes trigger an electron respawn (HMR can't hot-swap a
Node process). See the "full restart required after Main/FP-Host changes" gotcha in `CLAUDE.md`.

---

## 4. Production: no orchestrator, no dev server

`pnpm build` runs the four Vite builds + view build → static files under
`dist/{main,preload,renderer,fp-host}`. Then `electron-builder` packs `dist/**` into
`app.asar`. That's it — the orchestrator never runs in prod.

The dev-vs-prod switch lives in the **main process**, gated on `app.isPackaged`
(`electron/main/index.ts`), and resolved in `window-factory.ts`:

```ts
// dev  → live Vite dev server
void win.loadURL(opts.devServerUrl);          // VITE_DEV_SERVER_URL
// prod → static files off disk, via a custom scheme (ADR-203)
void win.loadURL('app://app/index.html');
```

Note prod uses a custom `app://` protocol, **not** `file://` — for origin/CSP control (ADR-203).
A vanilla app would `loadFile('dist/renderer/index.html')` instead; the `app://` scheme is
this-repo-specific hardening.

`electron-builder.yml` file globs:

```yaml
files:
  - dist/main/**
  - dist/preload/**
  - dist/renderer/**
  - dist/fp-host/**
```

---

## 5. Why main/preload *externalize* node & electron (instead of bundling them)

The `external` list in `vite.main.config.ts` / `vite.preload.config.ts`:

```ts
external: ['electron', ...builtinModules, ...builtinModules.map(m => `node:${m}`),
           /^@node-rs\//, /^better-sqlite3$/]
```

This is the most-asked-about line, so here is the model in full.

**"Bundle" for main/preload means: concatenate your app code + pure-JS npm deps into one
file. It does *not* mean bundle the runtime.** Two categories must stay external:

- **Runtime-provided** — `electron` and node builtins (`fs`, `path`, `crypto`, …) are baked into
  the electron binary. You *cannot* bundle the electron API or native `fs` into a JS file; they
  only exist at runtime. `external` = "leave `import 'electron'` / `require('fs')` as literal
  references; electron resolves them when the process runs."
- **Native modules** — `better-sqlite3`, `@node-rs/argon2` ship compiled `.node` binaries. A
  `.node` is a machine-code file, not JS — impossible to inline. It must be loaded from
  `node_modules` on disk at runtime (and unpacked from asar — §6).

Contrast the **renderer**: browser context, no Node, so Vite bundles everything and there are
no externals. The split is the whole game:

> **Renderer = a web app → bundle all. Main/preload = a Node app → bundle your code,
> externalize the runtime.**

Every framework enforces this exact split; they just hide the `external` list. `electron-vite`
auto-externalizes `electron` + all builtins + your `package.json` dependencies via its
`externalizeDepsPlugin`. `electron-forge`'s Vite plugin does the same. This repo writes the list
explicitly instead of leaning on a plugin.

---

## 6. Native modules: ABI rebuild (where this repo diverges hard)

Two separate concerns, often conflated:

### 6a. Keep them external (setup fact — §5)
Required, universal. `.node` binaries can't be bundled.

### 6b. Rebuild them for the Electron ABI (required concept, **custom method here**)

npm installs prebuilt `.node` files compiled against **Node's** V8 ABI. Electron ships a
**different** V8 ABI. Load a Node-ABI binary under electron and you get
`Module did not self-register` at startup. The binary must be recompiled against electron's
headers.

**The standard way** (what the frameworks recommend, and what works under npm/yarn):
- electron-builder: `npmRebuild: true` (default) or `electron-builder install-app-deps`.
- Or `@electron/rebuild` directly.
- electron-forge bundles `@electron/rebuild` and runs it on `package`.
- electron-vite doesn't rebuild — it delegates to your packager.

All of the above wrap **`@electron/rebuild`**.

**What this repo actually does** (`electron-builder.yml: npmRebuild: false` +
`scripts/rebuild-natives.mjs` as a `postinstall`): it invokes **`node-gyp rebuild` directly,
once per physical module dir**, with `npm_config_runtime=electron` and electron's `disturl`.
It bypasses `@electron/rebuild` on purpose, for two pnpm-hoisted reasons documented in the
script (ADR-204 Am2/Am3, O191):

1. Under pnpm `nodeLinker: hoisted`, `@electron/rebuild`'s module discovery **silently finds
   nothing** — it prints success while leaving the Node-ABI binary in place → runtime crash.
2. `better-sqlite3` exists as **two hardlinked physical dirs** (the real package and the
   `npm:better-sqlite3-multiple-ciphers` alias the app actually `require()`s). They share a
   pnpm-store inode, so a fresh compile must run in **each** dir — rebuild one and the other
   stays stale.

`@node-rs/argon2` is Node-API (ABI-stable) → never rebuilt. Native `.node` files are also
`asarUnpack`ed (`**/*.node`) because V8 can't `dlopen` from inside an asar.

**Takeaway for a new project:** on **npm/yarn**, the standard `install-app-deps` /
forge auto-rebuild path just works — use it. Only if you adopt **pnpm-hoisted with an aliased
native dep** should you expect to hand-roll node-gyp like this repo.

> **Future simplification (revisit, don't action):** the custom `node-gyp` script exists
> *only* because `@electron/rebuild`'s module discovery silently no-ops under pnpm
> `nodeLinker: hoisted` (§6b). The Electron ABI rebuild itself is unavoidable in any package
> manager — that part never goes away. But if a future `@electron/rebuild` learns to discover
> modules under pnpm-hoisted (or pnpm changes hoisted-linker layout to match), `scripts/rebuild-natives.mjs`
> becomes deletable and this repo can move back to `npmRebuild: true` / `install-app-deps`.
> This is a bounded, one-time script, not a standing tax — chosen deliberately over losing
> pnpm's catalogs + run-scripts-off-by-default security (see §8 and the package-manager
> comparison). Worth a periodic check on `@electron/rebuild` releases; nothing to do until then.

---

## 7. The `optimizeDeps.entries` wart (multi-HTML only)

`vite.config.ts` pins the dep scanner:

```ts
optimizeDeps: { entries: ['index.html'] }
```

You only need this if your app has **HTML entry points beyond the renderer's `index.html`**.
On dev boot, Vite's esbuild dep-scanner crawls HTML files to find bare imports to pre-bundle.
This repo has `bundles/*/view-src/*.html` (sandboxed bundle views) whose imports use an alias
(`@ru-soam/view-kit`) that only the *per-bundle* config knows — the shell config can't resolve
it, so the scanner logs `Failed to run dependency scan`. Pinning `entries` to just the shell's
`index.html` scopes the scan; the views are built separately (`scripts/build-views.mjs`) and
never served by this dev server.

**A plain single-window app never sees this.** It's a symptom of this repo's multi-view
architecture, not part of the base scaffold.

---

## 8. How the off-the-shelf frameworks compare

| Concern | This repo | electron-vite | electron-forge (Vite) |
|---|---|---|---|
| Multi-process build | 4 hand-written `vite.*.config.ts` | one `electron.vite.config.ts` with `main`/`preload`/`renderer` keys | `forge.config.ts` + vite plugin |
| Dev (server + spawn) | `scripts/dev.mjs` | `electron-vite dev` | `electron-forge start` |
| Prod build | `pnpm build` → `dist/**` | `electron-vite build` → `out/**` | forge lifecycle |
| Packaging | electron-builder (separate) | bring your own (usually electron-builder) | built-in makers |
| Externalize runtime | explicit `external` list | `externalizeDepsPlugin` (auto) | auto |
| Native rebuild | custom `node-gyp` per-dir | delegates to packager | bundled `@electron/rebuild` |
| Scope | dev + build | dev + build only | build + package + publish suite |

The repo is essentially **"electron-vite done by hand + electron-builder for packaging"**. It
pays that cost to own two things the frameworks assume away: a fourth trust zone (fp-host) and
pnpm-hoisted native packaging with an aliased SQLCipher build.

---

## 9. If you are scaffolding a *new, minimal* app

Copy this subset; skip the rest:

- **Do** copy: the three-config split (§2), the CJS-preload rule (§2c), the ESM-main
  `createRequire` banner (§2d), the `external` policy (§5), a dev orchestrator or just use
  `electron-vite`.
- **Skip** unless you need them: the fp-host config, `app://` prod scheme, `optimizeDeps.entries`
  pin, the custom `node-gyp` rebuild (use `install-app-deps` on npm/yarn), bundle views.
- **Decide early:** sandbox on/off (drives preload format), and package manager (drives native
  rebuild strategy). Both are painful to change later.

---

## Appendix A: the load-bearing gotchas, one-liners

- Sandboxed preload → **CJS**, always (Electron 41, unchanged).
- ESM main → needs the `createRequire` banner or externalized CJS deps throw at startup.
- Native `.node` → external + ABI-rebuilt + `asarUnpack`ed.
- pnpm-hoisted breaks `@electron/rebuild` → drive `node-gyp` per physical dir.
- Dev = live server + `loadURL(devServerUrl)`; prod = static `dist/**` + `loadURL('app://…')`.
- Main/preload/fp-host changes need an electron **respawn** (no HMR for Node processes).

---

## Appendix B: Why pnpm

The package manager is a load-bearing choice for this repo, not a default. It is chosen
deliberately, and the one cost it carries (§6b native-rebuild script) is a bounded, one-time
trade against everything below. Ranked by how much they matter *here*:

1. **Catalogs (`catalog:`) — the decisive one.** Dependency versions are defined **once** in
   `pnpm-workspace.yaml` and referenced as `catalog:` / `catalog:<name>` across every package
   (`"react": "catalog:"`, `"@tanstack/*": "catalog:router"`). One place to bump a version for
   the whole monorepo; zero version drift between `apps/desktop` and `packages/*`. **npm has no
   equivalent**, and yarn's nearest options (`resolutions` overrides, or the heavier
   `yarn constraints` engine) are blunter or far more complex. For a multi-package repo this is
   the standout maintenance lever.

2. **Run-scripts off by default (supply-chain).** pnpm (v10+) does **not** execute
   `postinstall`/build scripts automatically — packages that need to build are opted in via an
   allowlist (`onlyBuiltDependencies` / `allowBuilds` in `pnpm-workspace.yaml`). This directly
   blunts the malicious-`postinstall` attack class. **npm still runs install scripts by
   default.** This edge is *current*, not historical — registry provenance/attestations
   equalized elsewhere, but the run-scripts default did not.

3. **Strict, non-flat `node_modules` — no phantom dependencies.** You can only import packages
   you actually declared. This is correctness first (no accidental reliance on a transitive
   dep) and a supply-chain narrowing second. npm's flat tree lets phantom deps resolve silently.

4. **Content-addressed global store.** One copy of each package version per machine, hardlinked
   into each project → faster installs (cold and warm) **and** real disk savings across all
   your repos, not just this one.

5. **`workspace:*` protocol + configurable `nodeLinker`.** Internal packages resolve via
   `workspace:*` (rewritten to real versions on publish). And crucially, pnpm lets us **choose**
   the linker: we set `nodeLinker: hoisted` (ADR-204 Am3) to get the flat real-dir `node_modules`
   electron-builder needs for correct Windows native packaging — while *keeping* catalogs, the
   workspace protocol, and the store. npm can't opt into a strict linker at all; pnpm lets us
   pick the layout per need.

**The one cost:** under `nodeLinker: hoisted` with an aliased native dep, `@electron/rebuild`'s
discovery silently no-ops, so native ABI rebuild is hand-rolled (§6, `scripts/rebuild-natives.mjs`).
That is ~40 lines, written once, documented, and deletable if upstream ever fixes hoisted-linker
discovery. Weighed against losing catalogs + run-scripts security, it is a clearly favorable
trade — pnpm remains the right choice for this repo.
