# Plan — Migrate ru-soam onto basebench

**Status:** DRAFT — 2026-07-17. **Not urgent.** Nothing here executes until basebench can carry it.

## What this plan is

The ru-soam side of a two-repo effort: **remove the domain-agnostic base from this codebase and
re-point ru-soam at `basebench`**, keeping ru-soam fully working throughout.

Its mirror is `basebench/docs/Plans/roadmap.md`, which owns how the framework itself gets
built. The split of concerns:

| This plan (ru-soam)                                                    | basebench's plan                                        |
| ---------------------------------------------------------------------- | ------------------------------------------------------- |
| ru-soam's anatomy: what is base, what is domain, what forks             | The framework's stages, seams, and contracts            |
| Which ru-soam ADRs are base (and will migrate) vs domain (and stay)     | The ADR migration discipline + the ID mapping           |
| Rewiring ru-soam to consume basebench; migrating bundles                | basebench's own build order                             |

**Sequencing reality:** basebench absorbs proven implementations from ru-soam **gradually**, stage by
stage (its stages 2–6). ru-soam is the *source* during that period and does not change. Only when
basebench can carry the base does the rewire below actually happen. So this plan is mostly a
**standing map**, consulted when basebench comes asking, plus a rewire sequence for later.

**This is an extraction — say so.** The reference implementation of the base already exists in this
repo; basebench is being founded by extracting and generalizing it, not designed from zero. That is
the *mechanism*, not basebench's *identity*: basebench's boundary is decided on its own terms (its
ADR-001 + framework-of-one premise), and ru-soam supplies requirements and proven code as the N=1
reference — it does not get to define a seam by accident of where its files sit. basebench's own plan
states this from the framework side; this plan states the ru-soam side. Neither pretends extraction
isn't happening.

**Rung 3 taken ahead of its trigger — recorded in [ADR-106 Amendment 2](../ADRs/106-domain-agnostic-base-and-domain-layer.md#amendment-2-2026-07-17--rung-3-taken-ahead-of-its-trigger-the-goal-changed).**
The ADR-106 ladder resisted rung 3 (separate repo) until a separate team/cadence owned the base;
basebench is founded as its own repo with **rung 2 skipped and neither trigger fired**. The override
is deliberate — the goal changed from *preventing calcification* (rung 1 suffices) to *building a
reusable framework* (owning runtime + toolchain + native packaging is the point). Amendment 2 owns the
reasoning; this plan just points at it.

**How the extraction actually runs (deviation-capture ledger).** basebench is built by reviewing the
ru-soam implementation **progressively, one seam at a time** — not lifted wholesale. Each stage of
basebench's plan pulls one area across, generalizes it (PHI → `protected`, de-brand, strip domain
vocabulary), and in doing so **surfaces deviations from what ru-soam does today**: places where the
generalized base is cleaner, more correct, or differently shaped than the reference. Those deviations
are **ru-soam's to adopt on rewire** — the generalized base is the target, and ru-soam converges to it
rather than basebench bending to preserve a ru-soam quirk. This plan is the **ledger** of those
deviations: as basebench harvests each area, the divergences it produces get captured in the
[Deviation ledger](#deviation-ledger-what-basebench-changed-that-ru-soam-must-adopt) below, to be
brought into ru-soam scope when the rewire reaches that area.

## Key finding (load-bearing for both plans)

**The base was never physically modularized** (O194 rung-2 skipped). Main
(`apps/desktop/electron/main/index.ts`) is a monolith — window/security/IPC/fp-host **and** the store
ABI **and** cloud/telemetry/lock/workspace all boot in one `app.whenReady()` block. Domain coupling,
by contrast, is small and clean (one ADR-106 seam).

Consequence: separating the base is **a real strip of the Main boot sequence**, not a file-subset
move. This is the single biggest piece of work on this side.

---

## The base / domain / strip line

### BASE — leaves for basebench (harvested as basebench's stages call for it)

Renderer:

- `apps/desktop/src/{App.tsx*, main.tsx, provider.ts, index.css, electron.d.ts}` (\*forked — see Forks)
- `apps/desktop/src/platform/**` — all platform services EXCEPT the cloud/telemetry strip
- `apps/desktop/src/workbench/**` — parts, boot.ts (forked), platform-commands, command-palette,
  dev-gallery, notifications
- `apps/desktop/src/routes/**` (setup, workspaces, \_\_root, index) + `routeTree.gen.ts`
- `apps/desktop/src/styles/**`, `assets/**`

Main / preload / host:

- `electron/main/{index.ts*, security.ts, window-factory.ts}` (\*forked — strip block)
- `electron/main/{ipc, capability, credentials, crypto, lock, workspace, local-store, audit, updater, security}/**`
  — window controls, prefs cap, audit cap, commands cap, credential-broker, brokered-fetch,
  contributions, shell, platform-dev, platform-auth, view-protocol; lock/workspace/credentials;
  `local-store` (prefs + audit + the store ABI — all base)
- `electron/preload/**`, `electron/fp-host/**`, `electron/shared/**`

UI kits: `packages/basebench-ui` (`@basebench/ui`), `packages/view-kit` (`@ru-soam/view-kit`). Their
form inside basebench is that repo's call (likely internal modules with subpath exports, not scoped
packages).

### DOMAIN — stays in ru-soam

- `apps/desktop/bundles/**` (echo-test, echo-lazy, ru-soam-practice, ru-soam-schedule, ru-soam-sessions)
- `apps/desktop/src/domain/**` (bootstrap, product, tenancy, ClientEraseDialog + state)
- `packages/domain` (`@ru-soam/domain`) — imported only by the unused
  `electron/main/domain/lifecycle-stages.ts`; drop both
- All clinical/PHI/Activity/Product docs

### PRODUCT-SUPPLIED — domain-agnostic in nature, but ru-soam's to own and ship

- **Cloud + telemetry** → become **product-supplied capabilities** (see below), not part of basebench:
  `electron/main/cloud/**`, its `index.ts` wiring (`cloudSessionService.init`,
  `telemetryService.init`), renderer `src/platform/cloud/**`, `src/platform/telemetry/**` + boot.ts
  wiring, `SettingsMenu.tsx` cloud/telemetry sections, `anchored-ids.ts` telemetry entry.
- **Editor / RuEdit → `bbedit`** — re-added as a bundle + toggle rather than living in the base. Base
  usage today = 2 dev commands + 1 EditorGroup tab-branch. **Fully renamed RuEdit → bbedit/BbEdit on
  re-add** (`@ru-soam/editor` → `bbedit`; `packages/editor/` → `packages/bbedit/`;
  `src/platform/ru-edit/` → `src/platform/bbedit/`; `RuEditView`/`RuEditToolbar`/`RuEditService`/
  `RuEditServiceId` → `BbEdit*`; protocol `ru-edit-scratch:` → `bbedit-scratch:`; context key
  `ruEdit.activeInstance` → `bbedit.activeInstance`). Surface to detach:
  - `packages/editor`, `src/platform/ru-edit/**`, `src/platform/snippet/**`,
    `src/workbench/middle/ScratchRuEdit.tsx`
  - `src/workbench/boot.ts` — `RuEditService`/`SnippetService` registration + the
    focused-tab→ruEdit/snippet sync block (~L263–304) + imports
  - `src/platform/services/ids.ts` — `RuEditServiceId`, `SnippetServiceId`
  - `src/workbench/platform-commands.ts` — `snippets` param + `developer.editor.openScratch` +
    `developer.snippets.seed`
  - `src/workbench/middle/EditorGroup.tsx` — `ScratchRuEdit` import + the `ru-edit-scratch:` branch
    (~L126–127)
  - `basebench-ui` + `view-kit` have no editor dep → unaffected

> **Note on the store ABI.** An earlier draft listed it as "deferred/stripped." That was a sequencing
> artifact, not a boundary claim: basebench ADR-001 §3 rests on basebench owning the storage layer, so
> `store-write-cap` / `store-query-cap` / `blob-cap` are **base** and go with it.

---

## Forks needed (when the base is removed)

1. **`src/App.tsx`** — drop `domainBootstrap(reg)` + `<ClientEraseDialog/>`. The ADR-106 seam is
   designed for exactly this: base composes cleanly with a no-op domain layer.
2. **`src/workbench/boot.ts`** — remove cloud-session + telemetry registrations, sync-state /
   telemetry status-bar wiring, `cloudReconnect` command, disconnect notification.
3. **`electron/main/index.ts`** — the monolith untangle: separate the base boot sequence
   (credentials/lock/workspace/local-store/view-protocol/window/IPC/fp-host) from
   `cloudSessionService.init`, `telemetryService.init`, and the bundle discovery/migration/
   query-template registration that threads through it.

**Subtlety:** `src/platform/view-mode/` holds **schedule-domain** state services
(`ScheduleViewState`, `ScheduleCounts`, `ActiveEvent`, `ScheduleRefresh/Display`,
`MeetingProviders`) — self-contained state holders (no domain imports) but registered in base
boot.ts. They must **not** travel to basebench: they are domain state wearing a platform coat.
Decide whether they move into the Schedule bundle or become a base-supported pattern.
_(User wants to discuss before this happens.)_

---

## cloud/telemetry → capability refactor (design; build deferred)

Records the intent so the separation is intentional, not lossy.

- **Today (to undo):** `main/index.ts` imports `cloudSessionService`/`telemetryService` singletons and
  calls `.init(...)` inside `whenReady()`; renderer holds `CloudSessionService` as a boot-registered
  platform service reading `window.soam.lock`/events.
- **Target:** register via `registerCapability(name, ver, handler, {protected, kind})` — e.g.
  `cloud.session@1.0` (verbs `state`/`reconnect`/`accessToken`), `telemetry@1.0`. Consumers bind them
  like any other cap instead of a boot-baked singleton. Removes cloud from the Main boot monolith and
  makes it discoverable/optional.
- **Open:** cloud session needs a live KEK provider + emits `cloud.session.changed`; as a
  product-supplied cap, how does it get the lock/KEK getter (today injected in `whenReady`)? This is
  a **seam basebench must expose** — flag it to that plan rather than solving it here.

---

## Which ru-soam ADRs are base

basebench numbers its ADRs **sequentially from 001** in its own space and migrates them **as the code
they govern lands** — reviewed, generalized, renumbered, cross-refs rewritten. That discipline and
the ID mapping live in basebench's plan. What lives *here* is which of **our** ADRs are in scope:

- **Base — will migrate:** 101–106, 201–204, 304/306/308, 401–413, 417/419/420/421, plus 302/307/418
  below.
- **Base, but must be generalized on migration** (they carry PHI vocabulary the base cannot have):
  - **418** (trust tiers) — restate the invariant over **protected data**
  - **302** (local-first) — Class-1 "Clinical (PHI)" → **Protected** residency; Class-2 unchanged
  - **307** (KEK/passphrase/lock) — drop the PHI framing; it is a generic vault lock
- **Domain — stays here:** 301/303 (PHI policy), 305 + 309–314 (cloud/provider/telemetry), 414–416
  (editor → travels with `bbedit`), 501–509.

**The PHI → protected seam** (why the split is clean): basebench has **no PHI vocabulary**. It
provides the generic protected-data layer — trust tiers, keys/decrypt/ciphertext confined to the most
privileged process, a `protected:true` capability flag (renamed from `phi:true`), `protected` /
`operational` residency, KEK/lock/keychain/crypto/recovery. **ru-soam supplies the clinical meaning** —
"clinical = PHI = protected" — and declares which caps/tables are protected. One-way domain→base
dependency.

ru-soam's ADRs are **untouched until their code migrates**. Deleting the base ones here is a
rewire-step concern, not a now concern.

> **Withdrawn:** an earlier revision bulk-copied 33 base ADRs into basebench keeping ru-soam's IDs and
> banner-marked the sources. It was executed and then **fully rolled back** (basebench reset;
> `git restore docs/ADRs/`). Nothing of it stands.

## De-brand

- `@ru-soam/*` package scopes → basebench's own naming, on migration. (May be moot: if basebench folds
  the kits into subpath exports, there are no scoped packages.)
- App-level `soam` identifiers — `window.soam` preload bridge, `ServiceId` strings, `view://` origin
  ids, `ru-soam-*` bundle ids — travel with harvested code. basebench ADR-001 §6 obliges keeping
  runtime-specific vocabulary out of product-facing contracts, which eventually reaches `window.soam`.
  Whether that rename happens per-stage or in one pass is basebench's call (its fork F-E).

## What "can carry the base" means — six contracts that do not exist yet

The rewire below opens with *once basebench can carry the base*. This section says what that
sentence is waiting on, because the answer is much larger than it looks from basebench's side.

**basebench is already enough to build a product — just not this one.** Its five Drafts
(ADR-001…005) cover a complete vertical path: entry → boot → config → UI registry → transport →
store. A first product can be a thin vertical slice — one activity, one sidebar, one editor, one
host call, one table, one migration — and it exercises all five against reality. The unlock is
basebench ADR-005 §2, which makes protection a feature switch rather than a security dial: a
product with no sensitive data skips the lock, key, and unlock ceremony entirely, so **key custody
— the largest unspecified piece — is not on the critical path for a first running app.**

None of that relief applies to ru-soam, which needs protection on from the first boot and uses in
production six contracts basebench has not written:

1. **Key custody** — derivation, wrapping, rotation, recovery codes, the lock/unlock lifecycle
   (basebench ADR-005 OI-2, currently a single Open Item standing in for all of ADR-307).
2. **Workspace mechanism** — the registry, multi-account, per-workspace store paths. basebench's
   store contract is single-store; ru-soam's paths are per-workspace.
3. **Blob storage** — ru-soam's documents are protected files outside the database
   (basebench ADR-005 OI-3).
4. **Audit placement** — *resolved*, not merely narrowed as OI-1 leaves it. DPDP obligations ride
   on where capture happens (ADR-502).
5. **Commands, keybindings, and menus** (basebench ADR-003 OI-5), plus the **context-key tier**,
   which is a separate seam and is basebench's next slice (1.5b / its ADR-006). ru-soam uses all
   of it heavily (ADR-406, ADR-417).
6. **Credential broker and brokered networking** — OAuth and Google Calendar depend on it.
   basebench's premises keep the broker as an infrastructure SPI, but no contract states it.

**Two scope questions are undecided rather than missing.** This plan puts the editor primitive in
the product column (`bbedit` as a bundle, above); basebench has not ruled on it. And theming plus
`@basebench/ui` need to become a *contract* rather than a package that happens to exist.

**One live conflict.** basebench defers the server plugin as not an immediate concern. ru-soam has
a shipped identity service (ADR-311) and cannot retrofit onto a basebench with no server-plugin
mechanism. Either that gets designed before retrofit, or ru-soam keeps its cloud code outside the
framework during the transition — which is workable, and is the direction the
[cloud/telemetry capability refactor](#cloudtelemetry--capability-refactor-design-build-deferred)
already points, but it should be a decision rather than a surprise.

**And the migration work dwarfs the contracts.** Fourteen views to convert from iframes to
components, five bundles collapsing into host modules, manifest-declared SQL to Kysely, and the
whole `view://` cage removed — which is why the next section matters more than this one.

## Sequencing — ru-soam is not the first consumer

**Do not make ru-soam basebench's first consumer.** Retrofitting a shipping clinical application
onto an unproven framework is the highest-risk move available: every basebench bug arrives dressed
as a ru-soam regression, and there is no way to tell which layer is wrong.

Prove basebench on something small and disposable first. That is also the only honest test of its
own premises §6 (the second-product test), which concedes that until a second product exists the
seam discriminator is a thought experiment — a second product is what turns N=1 into evidence.

Meanwhile, run **ru-soam's [single-trust-tier refactor](architecture-refactor-single-trust-tier.md)
independently**. It removes the `view://` cage, the iframes, and the trust tiers, which is most of
the retrofit delta, and it is worth doing for ru-soam on its own merits regardless of basebench's
schedule.

Run those two in parallel and the eventual retrofit stops being a rewrite and becomes a
re-pointing. That is this plan's whole thesis, and this is the sequence that earns it.

## The rewire (the actual end state)

Once basebench can carry the base:

1. ru-soam becomes **config + bundles + domain code** — no process entry files, no build configs, no
   packaging config (basebench ADR-001 §2).
2. Delete the base from this repo; add the `basebench` dependency; author `basebench.config.ts`.
3. Delete the migrated base ADRs here (they now live in basebench, renumbered).
4. Re-add cloud/telemetry as **product-supplied caps** and the editor as the **`bbedit`** bundle.
5. Migrate domain bundles part by part — **dropping the ones we don't want**.

## Found by comparison — ru-soam fixes that do not wait for the rewire

Working basebench's tsconfig layout (its stage 1.5e) meant reading ru-soam's for contrast, and two
things turned up here. Neither is a migration item: both are defects in this repo today, worth
fixing on their own. They are coupled, though — the fix for the first is the detector for the second.

**1. `tsc -b` is not incremental. Every `pnpm compile` re-checks all eight projects.** Verified by
`tsc -b apps/desktop --dry --verbose` immediately after a clean successful build:

```
'tsconfig.app.json'     is out of date because output file 'apps/desktop/src/App.js' does not exist
'tsconfig.main.json'    … 'electron/main/index.js' does not exist
'tsconfig.preload.json' … 'electron/preload/index.js' does not exist
… all eight, every run
```

Those outputs can never exist — `tsconfig.base.json:14` sets `noEmit: true`, correctly, because Vite
compiles and `tsc` only checks. But without `composite`, build mode judges freshness by comparing
inputs against *emitted outputs*, so every project is permanently stale. The `.tsbuildinfo` files are
written and never read. Nothing looks wrong: `tsc -b` exits 0, and only `--verbose` shows it.

Fix is one field — `"composite": true` in `tsconfig.base.json`, inherited by all eight. Verified
against TypeScript 6.0.3 that `composite` with `noEmit` is accepted and does **not** require
`declaration`; the implication only bites for projects that emit, and none of these do.

**2. `src/electron.d.ts` imports across a zone boundary, and nothing can currently see it.**

```
tsconfig.app.json      include: ["src", "electron/shared"]
tsconfig.preload.json  include: ["electron/preload", "electron/shared"]

src/electron.d.ts:3    import type { Soam } from '../electron/preload/soam';
```

`electron/preload` is not in the app project's `include`, so that file is dragged into the app
program by the import alone — `include` seeds roots, imports pull in the rest. **Turning on
`composite` for finding 1 makes this an error (TS6307) immediately**, so expect it and fix it in the
same change rather than being surprised by it.

Not a runtime violation: `verbatimModuleSyntax` is on and it is written `import type`, so it erases
and no renderer code reaches preload at runtime (ADR-202 holds). It is a structural one, and the
right fix is the one the layout already implies — `Soam` describes a contract both sides agree on,
so it belongs in `electron/shared/`, the directory that exists for exactly that and which both
projects already include.

Worth re-running the `--dry --verbose` check after the move: composite may name other crossings that
have been invisible for the same reason.

## Deviation ledger — what basebench changed that ru-soam must adopt

As basebench harvests each area (its stages 2–6), the generalized base will diverge from what ru-soam
does today. The generalized base is the **target**; ru-soam **converges to it** on rewire rather than
basebench preserving a ru-soam quirk. Each row is a deviation to fold into ru-soam scope when the
rewire reaches that area. **Empty until basebench's first harvest lands** — populated as it goes, one
seam at a time.

| basebench stage / area | What basebench did differently | Why | ru-soam adoption action | Status |
| ---------------------- | ------------------------------ | --- | ----------------------- | ------ |
| _(none yet)_           | —                              | —   | —                       | —      |

## Risks

- **The Main `whenReady()` untangle** is the hard part; boot ordering is implicit. Bundle
  discovery/migration calls thread through the middle of it.
- **ru-soam must keep working** throughout. It is the reference implementation *and* the shipping
  product; it cannot be held hostage to basebench's schedule.
- **The rewire is a big-bang moment** by nature — the base cannot be half-removed. Worth designing a
  rehearsal (a branch that rewires and boots) before committing.
- `routeTree.gen.ts` — regenerate once domain routes are the only ones left.
- **Divergence risk:** the longer basebench harvests gradually, the longer two copies of base code
  exist. Fixes landing here must be checked against what basebench has already absorbed.
