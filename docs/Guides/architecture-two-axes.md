# The Two-Axis Architecture: Trust Zones × Layers

**Status:** Living guide (synthesizes accepted ADRs; decides nothing new)
**Audience:** Anyone reasoning about where code lives, what it may touch, and why.
**Source ADRs:** 101 (trust zones), 106 (base/domain layers), 103 (capability model),
104 (contributions), 202 (preload bridge), 203 (brokered networking), 301/302/307 (PHI /
store / lock), 405 (activity-bar surfaces), 410 (bundle host), 411 (view iframe), 504
(canonical record ownership).

---

## 0. The one idea

Every piece of this product has **two independent coordinates**, not one:

1. **Trust zone** — *how privileged is it / how close to the keys?* (the security gradient)
2. **Layer** — *is it generic platform, or specific product?* (the OS-vs-app split)

These axes are **orthogonal**. You cannot infer a thing's zone from its layer, or its
layer from its zone. Most confusion in this codebase comes from collapsing them into one.

A useful starting analogy — **and the trap it sets:**

> Linux fuses two ideas into the single word *kernel*: **most-trusted** *and*
> **most-generic**. Userspace is **least-trusted** *and* **most-specific**. Linux gets
> away with one axis because privilege and genericness happen to line up.

**We deliberately unfuse them.** In our architecture a thing can be:

- generic **but** unprivileged (the renderer theme engine — base, but in a sandboxed-ish UI zone),
- specific **but** privileged (`core-domain` — domain product code, but Main-resident, key-adjacent).

So keep the Linux *intuition* for the **trust gradient** (syscalls, least-privilege,
userspace delegating to kernel) — but bind that intuition to the **zone** axis, never to
the base/domain layer.

---

## 1. Axis 1 — Trust zones (the privilege gradient)

Four zones, most-trusted to least (ADR-101):

```
Main  →  Preload  →  Renderer  →  Bundle-Host
(keys, PHI,        (the ABI)    (our UI shell)   (bundles: 3rd-party trust zone)
 decrypt, store)
```

### Why the gradient exists — threat model, not framework

Electron **provides the mechanism** (a multi-process model: Node `main`, Chromium
`renderer`, a `preload` contextBridge). We *add* two more boundaries on top: the
Bundle-Host as a **separately spawned Node process** (ADR-410, not an Electron default)
and bundle UIs as **sandboxed `view://` iframes** (ADR-411, web-platform). So the
boundaries are a mix — some Electron-native, some ours.

But the framework is not the *reason*. The gradient exists because of **two threats**,
both our decisions:

1. **PHI confidentiality** (ADR-301/302/307) — minimize the set of processes that touch
   plaintext or hold keys. Keys live in the OS keychain; decryption happens in **Main
   only**.
2. **Untrusted third-party code** (ADR-410) — extensions must run where they cannot reach
   PHI or the keys.

The **ordering** (Main most-trusted, Host least) is *ours*, not Electron's: it falls out
of *who holds the keys* (Main) and *who runs untrusted code* (Host, farthest out).

**Counterfactual:** with no PHI and no third-party extensions, you would not need four
zones — everything could sit in the renderer. Electron *enables* the gradient; the threat
model is *why* we pay for it.

### Contrast: VS Code's extension host

VS Code's extension host (`extHost`) is also a separate Node process — but it is a
**resilience/performance boundary, not a security wall**:

| | VS Code extHost | Our Bundle-Host |
|---|---|---|
| Process split | ✓ resilience + perf (keep extensions off the UI thread; crash isolation) | ✓ same resilience motive (ADR-410: "host crash must not take down the renderer") |
| Extension privilege | **full Node + filesystem + network** | **brokered only** — data via capabilities; no raw store/fs access |
| UI | brokered API (no DOM), full Node *beneath* — for portability/stability, **not** security | **sandboxed `view://` iframe** (ADR-411) — no Node, no fs, opaque origin |
| PHI | extension can read any file | **never decrypts in host**; reaches plaintext only as authorized cap returns |
| Trust stance | **trust installed extensions** | **treat bundles as untrusted** |

**Same mechanism (a process boundary), extra purpose.** VS Code = resilience boundary over
*trusted* code. Ours = resilience boundary **+** a capability-brokered **trust boundary**
over *untrusted* code. The threat model is the whole fork.

---

## 2. The capability seam (how zones talk)

Consumers in lower-trust zones reach higher-trust resources through **capabilities**
(ADR-103): `window.soam.bindCapability(name, version)` returns a proxy; `proxy.call(method,
…args)` routes over IPC to a Main-side handler and returns a typed result.

A capability is **API-shaped**, with two upgrades that matter:

1. **It's a typed RPC across a trust boundary** — async, structured-clone-serialized, **no
   shared memory**, typed errors, timeouts. Treat host↔Main like a network call.
2. **It is the consumer's *complete* authority** — there is **no ambient power** behind it
   (no fs, no net, no PHI). The door *is* the only door. This is the **object-capability
   (ocap)** model: a capability both *names* a resource and *grants* the right to use it;
   you cannot reach what you do not hold a binding to.

> An API is a *calling convention*. A capability is a calling convention **+ the authority
> model**.

`bindCapability` is a **generic multiplexer**: one dispatch that routes to any registered
capability by name (ioctl-like). This is why a new capability (`record.patient`,
`record.note`, a future Risk cap) needs **zero new bridge surface** — register the handler
in Main, bind through the same fixed bridge. The preload ABI is closed and domain-blind by
design (see §4).

### Where we are vs full ocap

True ocap means *possession of a binding is the (scoped) permission*. **Today, binding is
identity-blind:** the handler signature is `(method, args)` — it never learns *which*
consumer is calling. So any code that reaches the bridge can bind any capability and call
any method. We currently have **"API-shaped RPC with no ambient power, but no per-consumer
gate."** Closing that gate is **Fork C** (see §5).

---

## 3. Axis 2 — Layers (generic vs specific)

Two layers (ADR-106), one-way dependency, **lint-enforced**:

- **`basebench`** (base) — the domain-agnostic platform: mechanisms, engines, primitives.
  Store, crypto, capability registry, the composition shell, theme/keybinding/menu/font
  engines, the preload bridge.
- **`ru-soam`** (domain) — the mental-health product: PHI schema, clinical bundles,
  tenancy, brand/copy, `patient.*` / `record.*` namespaces.

**The one-way rule:** base never imports domain. Domain depends on base for all low-level
access. (Analogous to your Linux intuition — *userspace delegates to the kernel* — but
note this is the **layer** dependency, not the zone gradient; they coincide only
sometimes.)

---

## 4. Orthogonality — the crux

The two axes are independent. The proof is two diagonal cases:

| Thing | Layer | Zone | Why it breaks "generic = privileged" |
|---|---|---|---|
| `core-domain` (record vault) | **domain** | **Main** | Specific product code, yet most-privileged — the deliberate ADR-504 exception |
| Theme / keybinding / menu / font engines | **base** | **Renderer** | Fully generic, yet *not* in Main — they run in the UI zone (ADR-412) |

So the "drivers" intuition ("DB, themes, keybindings as kernel drivers") **misplaces
half of them**: the store/crypto drivers are in Main, but the theme/menu/font "drivers"
run in the **Renderer**. *Genericness does not imply privilege here.*

### Layers span the gradient (with one asymmetry)

Neither layer is confined to a zone:

- **base** is present in **all four** zones — Main (store/crypto/registry), Preload
  (`window.soam`), Renderer (shell + engines), Host (the bundle runtime).
- **domain** is present in **three** — Main (`core-domain`), Renderer (`src/domain`
  composition seam), Host (Activity bundles).

**The asymmetry: domain has no Preload piece — by design, and load-bearing.** Preload is
the **syscall ABI** (ADR-202): a thin, trust-critical contextBridge that exposes
`window.soam.*`. It is deliberately **generic and closed**:

- It's the most trust-sensitive surface (code there runs with bridge privileges) — keep it
  minimal and auditable.
- `bindCapability` being a generic multiplexer means new capabilities are discovered by
  *name*; the ABI never grows per feature.
- Domain extends the **two ends** — handler *implementations* in Main, *callers* in
  Renderer/Host — both riding the fixed ABI in the middle. Putting domain code in preload
  would both **widen the trust chokepoint** and **break the one-way rule** (base importing
  domain).

> Mapped to Linux: **Preload = the stable syscall ABI** (a libc-thin shim). **Main =
> kernel-side syscall implementations.** **Renderer/Host = userspace callers.** Domain has
> no reason — and no right — to touch the ABI.

---

## 5. Fork C — full ocap (where the axes meet)

The gate that turns capability binding from identity-blind into scoped lives **on the
trust-zone axis** (the seam is the Host↔Main zone boundary). But it is the single
chokepoint where policies from **both axes** get teeth:

1. **Provenance policy (trust axis):** *"a third-party bundle may not bind `record.patient`
   at all."* Differentiating consumers by how much we trust them.
2. **Domain-role policy (layer/domain axis — this is Fork A's sole-writer rule):** *"only
   Sessions may call `record.note.write`; Practice gets read methods only."* Here Sessions
   and Practice are **equally trusted** (both first-party); the split is a **domain
   CRUD-ownership** decision, merely *enforced through the same gate*.

So **Fork C (the mechanism) and Fork A (a policy it enforces) couple here.** Today both are
**convention**; full ocap turns both into enforced policy at one point.

### What full ocap concretely needs

1. **Caller identity at the seam** — thread the calling `bundleId` into `invokeCapability`
   → the gate (the handler currently gets only `(method, args)`).
2. **A policy table** — `bundleId → { cap@version → allowed methods }`.
3. **A declaration + grant model** — bundles *request* capabilities in their manifest
   (Android/web-permission style; the manifest already has a `capabilities` field, today
   `[]`); first-party auto-granted, third-party gated.

---

## 6. The honest PHI invariant

The slogan *"PHI never enters the Bundle Host"* is **overstated.** The precise, two-tier
truth:

- **Never in the host (hard, Main-only):** the **KEK**, the **decryption**, and the
  **ciphertext store**. These never leave Main (ADR-307). Solid.
- **Enters the host as cap return values:** PHI **plaintext** flows into the host **whenever
  a host bundle binds a PHI-returning capability while the workspace is unlocked.** ADR-504
  §2 says exactly this — *"only the consumer receives the typed record"* — and the consumer
  **is** the host bundle.

**This already happens today:** `roster.html` runs in a host iframe, binds `record.patient`,
calls `list()`, and renders **client names** — PHI, in the host, right now. To *render* PHI,
the rendering zone must hold it; that is irreducible.

### What the renderer-domain-command pattern buys (and doesn't)

For **writes**, PHI-touching bundle actions are routed as **renderer-domain commands**
(e.g. `ru-soam-practice.lifecycle.setStage`): the host iframe forwards a `clientId` + a
**command id**; the actual `bindCapability('record.patient').setStage(…)` executes in
**`src/domain` (Renderer)** — the *more-trusted* zone (our `app://` shell, not a sandbox).
So the host **never holds the write capability**; even a malicious host bundle could only
invoke a named renderer command with a `clientId`, not author arbitrary PHI writes. This is
a **partial pre-figuring of ocap**, achieved by indirection before per-consumer scoping
exists.

But **reads-for-display have no such indirection** — showing a name requires the name in
the rendering zone. So:

- **Writes** — host never holds the write cap (renderer-command indirection).
- **Reads** — PHI genuinely enters the host iframe by necessity; the only gate is
  **lock-state + first-party composition**, not identity.

### The real guarantee, stated once

> **Keys, decryption, and ciphertext never leave Main. PHI plaintext enters a lower-trust
> zone only as the return value of a capability that zone is authorized to bind. Today
> "authorized" means "first-party by composition"; Fork C is what makes it
> "authorized by the gate."**

Until Fork C lands, every host bundle — including the roster — reads PHI **by being
trusted, not by being authorized.** That is safe *only* because the MVP loads first-party
bundles exclusively.

---

## 7. Quick reference

- **Two axes, always:** *zone* (privilege) and *layer* (generic vs specific). Orthogonal.
- **Linux intuition** (syscalls, least-privilege) → the **zone** axis only.
- **Gradient reason** = threat model (PHI + untrusted extensions), not Electron.
- **vs VS Code:** they isolate trusted extensions for resilience; we isolate *untrusted*
  bundles for resilience **and** security.
- **Capability** = typed RPC + the consumer's complete authority (ocap intent), today
  **unscoped** (identity-blind binding).
- **base** spans all 4 zones; **domain** spans 3 (skips Preload — the generic, closed ABI).
- **`core-domain`** = domain layer, Main zone — the diagonal that proves the axes are
  independent.
- **Fork C** = the ocap gate; enforces *both* provenance (trust axis) and sole-writer
  (domain axis) policies.
- **PHI invariant** = keys/decrypt/ciphertext Main-only; plaintext enters lower zones only
  as authorized cap returns; today "authorized" = "first-party by composition."

---

## 8. Architecture evolution — host trust tiers + CQRS module model

*(Added 2026-06-02. Direction set in ADR-418 + ADR-506; §1–§7 above describe the
as-built single-host model and remain the baseline. This section is the agreed
*target*. MVP does not build the second host yet — it ships first-party only.)*

### 8.1 The host tier splits by trust (ADR-418)

The single Bundle-Host (§1, the fourth zone) becomes **two**, named by **provenance**
(the axis that actually splits them — both run domain code, so a layer-flavoured name
like "Domain-Host" is rejected as axis-conflating):

```
Main           keys · decrypt · ciphertext · PHI authority      (sole plaintext source)
  │
Preload        generic ABI
  │
Renderer       app:// trusted shell                            ─┐ peer trust tiers:
  │                                                              │ PHI-as-returns OK,
  ├─ First-Party-Host   first-party logic; binds any cap        ─┘ NO keys
  │                     (incl. PHI returns); NO keys; UI sandboxed
  │
  └─ Bundle-Host        untrusted 3rd-party; PHI caps HARD-DENIED;
                        non-PHI granted+tiered; UI sandboxed
```

- **First-Party-Host privilege = caps, never keys.** Holds PHI as cap *returns*; never
  the KEK/decrypt/store. Peer to the Renderer in trust; process-isolated for resilience.
- **Bundle-Host = the untrusted tier.** PHI-returning caps are **structurally** denied;
  non-PHI caps are granted per declared request.
- **UI sandbox unchanged for all bundles** — provenance-trust covers malice, not bugs
  (XSS, supply-chain), so even first-party UI stays in the `view://` iframe.
- **Coarse trust-class identity** (`bundleId → first-party | third-party`) is checked at
  both cap-binding chokepoints (host bridge + the renderer `soamView` relay). This is the
  *light residue of full ocap* — the per-method gate (Fork C) is no longer needed for the
  PHI/untrusted case.

This makes the §6 invariant **structurally true**: *PHI plaintext enters only Renderer +
First-Party-Host; the untrusted Bundle-Host never receives it.*

### 8.2 Pure-base Main; a bundle is a CQRS vertical slice (ADR-506, supersedes ADR-504)

**Main loads no domain code.** It is entirely `basebench`: keys, crypto, the encrypted
store, the audit ledger, plus a **generic ownership-scoped CRUD** capability (writes), a
**declared-query executor** (reads), and a **migration executor + dependency validator**.
`core-domain` is **retired** — the canonical record is a first-party **bundle** like any
other.

Domain modules follow **CQRS**:

- **Command** (write) — one owning Activity per record type (sole writer). Command *logic*
  runs in **First-Party-Host**; persistence goes through Main's generic write cap, which
  encrypts + audits.
- **Query** (read) — many consumers. A query is a **declared SQL / read-model spec** Main's
  generic engine executes and returns. Never mutates.
- **Overlay** — a consumer's command side on its *own* tables (never the owner's).

A **bundle = a multi-zone vertical slice** — UI (Renderer iframe) + logic (First-Party-Host)
+ declared schema/migrations/queries/deps. **No part runs in Main:**

> **Logical ownership ≠ execution residency.** "Sessions owns notes" = Sessions ships the
> `record.note` schema + migrations + command logic (logic in **First-Party-Host**, *not*
> Main) and is sole writer; Practice binds the **query** only. Persistence is a base
> capability call; Main holds the bytes, never the domain logic.

**Validation is hybrid:** hard, un-violatable invariants are **declarative schema
constraints in Main** (`CHECK`/`FK`/trigger — Main-enforced, *no domain code*); soft/UX
validation is First-Party-Host; the audit hash-chain is Main-owned (a command may *name* its
event, never skip it). **Sole-writer is Main-enforced** via declared table ownership
(`callerBundleId == owner(table)`), not convention.

The preload ABI expresses CQRS too — a **query bridge** and a **command bridge** (or one
bridge with command/query method-classes; O447) — so read-only consumers (and untrusted
bundles) can be handed the query side only.

One physical store per workspace; ownership is **logical** over a shared DB, so cross-module
FKs and erasure cascades are real, and the **dependency graph (FK/caps/bundles) is validated
before load**.

### 8.3 Three-tier layering: base · domain · extensions

ADR-106's base/domain refines to **three tiers** (a layer concept, not a zone): **base**
(platform, spans all zones), **domain** (first-party bundles), **extensions** (third-party
bundles). Provenance → `trustClass` → host is a **policy mapping** — domain →
First-Party-Host, extensions → Bundle-Host — **not** an axis collapse: `base` still spans all
zones, and trust ⟂ layer still holds.

### 8.4 What this resolved

- The first-party/third-party **trust differential** is **structural** (a zone), not a
  runtime policy table.
- **Main stays domain-free** — the smallest, most-audited trusted core. ADR-504's
  domain-in-Main exception is gone.
- **Full per-method ocap (Fork C) deferrable**; sole-writer is now Main-enforced via
  ownership.
- The **CRUD forks (A/B/D/E)** get a governing pattern: distributed bundle-ownership (A),
  command/query split (B), Overview as a declared read-model (D), erasure as a cascading
  command (E).
