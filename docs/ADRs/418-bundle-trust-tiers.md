# Bundle trust tiers: First-Party-Host vs Bundle-Host

**ID:** ADR-418
**Status:** Accepted
**Date:** 2026-06-02
**Layer:** cross
**Supersedes:** —
**Superseded by:** —
**Related:** ADR-101 (trust zones), ADR-103 (capability model), ADR-104 (contribution model), ADR-106 (base/domain), ADR-202 (preload bridge), ADR-203 (brokered networking), ADR-301/302/307 (PHI / store / lock), ADR-405 (first-party vs third-party items), ADR-410 (bundle host process), ADR-411 (view iframe), ADR-504 (canonical record ownership), ADR-506 (CQRS module model), [Two-Axis Architecture guide](../Guides/architecture-two-axes.md)

## Context

ADR-410 commits a single **Bundle-Host** — a separately-spawned Node process, the fourth
trust zone — that runs *all* bundles. ADR-405 anticipates two populations in that zone:
**first-party** bundles (shipped by the platform team) and future **third-party** bundles,
loaded through the same mechanism but "not enjoying the same level of trust." That trust
*differential* is, today, **unbuilt**:

- **Capability binding is identity-blind.** The handler signature is `(method, args)`
  (`electron/main/capability/registry.ts`) — it never learns *which* consumer is calling.
  Any code reaching the bridge can `bindCapability(anything)` and call any method.
- **PHI enters the host as cap return values.** The "PHI never enters the Bundle Host"
  slogan is overstated: ADR-504 §2 says *"only the consumer receives the typed record"* —
  and the consumer **is** the host bundle. The Practice roster already renders client
  names (PHI) inside a host iframe today. What is genuinely Main-only is the **KEK,
  decryption, and ciphertext** (ADR-307), not PHI plaintext returns.

So PHI is protected today by **composition** (all bundles are first-party) plus
lock-state and crypto-at-rest — **not** by any structural wall between trusted and
untrusted code. Before third-party bundles load, that wall must exist, and it should be
**structural** (a property of *where code runs*) rather than a per-call policy table that
can be mis-configured.

## Decision

### 1. Split the host tier into two trust zones

The bundle tier (ADR-410) becomes two zones, named by **provenance** (the axis that
actually differentiates them — both run domain-layer code, so layer-flavoured names like
"Domain-Host" are rejected as axis-conflating; see the guide):

- **First-Party-Host** — runs **first-party** bundle logic. Trusted by provenance (we ship
  and sign it).
- **Bundle-Host** (the existing zone, = the third-party tier) — runs **untrusted
  third-party** bundle logic.

Both remain separately-spawned, crash-isolated processes (ADR-410's resilience motive is
unchanged). First-Party-Host adds a *trusted-and-isolated* tier the Renderer cannot give
(a Renderer crash kills the whole window) and the current Bundle-Host did not (isolated
but untrusted).

### 2. First-Party-Host privilege = capabilities, never keys

First-Party-Host privilege is **unrestricted capability binding, including PHI-returning
capabilities** (it may hold PHI as cap *return values*). It does **NOT** hold the **KEK,
perform decryption, or touch the ciphertext store** — decryption stays **Main-only**
(ADR-307/302/504). Granting keys here would create a *second* PHI-plaintext authority and
erode the ADR-301 minimization principle; rejected (see Alternatives).

Its PHI exposure is therefore ≈ what the Renderer and today's roster already have
(PHI-as-returns, no keys) — formalized into its own zone. **First-Party-Host and Renderer
are peer trust tiers:** both trusted, both hold PHI-returns, neither holds keys.

### 3. Bundle-Host: PHI hard-denied, non-PHI granted

Untrusted bundles **cannot bind PHI-returning capabilities — at all, structurally.** This
is a hard deny, not a per-method grant. Non-PHI capabilities are available **tiered, by
explicit request + grant**: a bundle declares the capabilities it needs (the manifest
already carries a `capabilities` field, today `[]`), and the platform grants — non-PHI
auto/consent-gated, PHI never.

This makes the slogan **true as a structural invariant** (see §6).

### 4. UI sandbox unchanged for all bundles

**Every** bundle's UI — first-party included — continues to render in a **sandboxed
`view://` iframe** (ADR-411). First-party logic gaining trust does **not** relax its UI
sandbox. Rationale: the iframe sandbox defends against **bugs** (XSS, a compromised npm
dependency), not only malice. Provenance-trust covers malice; it does **not** cover
memory-safety. The code that handles the most PHI is exactly the code we least want to
de-sandbox.

### 5. Coarse trust-class identity (not full ocap)

Bundle identity carries a **`trustClass`** (`first-party | third-party`). It is checked at
**both** capability-binding chokepoints, because a bundle binds caps from two places:

- its **host logic process** (the host capability bridge), and
- its **UI iframe**, via the `window.soamView` relay through the Renderer
  (`BundleViewIframe`).

Both chokepoints consult `trustClass` before forwarding a PHI cap bind. This is **coarse
caller-identity** (`bundleId → trustClass`) — deliberately *not* full per-method
object-capability scoping (`bundleId → {cap → methods}`). The finer **domain-role /
sole-writer** policy ("only Sessions may write notes") stays **convention among trusted
peers** and is owned by ADR-506; full ocap is thereby **deferrable**, possibly
indefinitely.

### 6. The honest PHI invariant (restated, now structurally true)

> **Keys, decryption, and ciphertext never leave Main. PHI plaintext returns enter only
> the Renderer and the First-Party-Host. The Bundle-Host (third-party) NEVER receives PHI
> plaintext.**

This is what the original "PHI never enters the host" slogan was reaching for; it is true
once the trust split exists. PHI *does* enter the trusted First-Party-Host (and Renderer)
by necessity — to render a name, the rendering zone must hold it.

## Phasing (MVP)

The MVP loads **first-party bundles only**, so the second host is not built now (nothing
untrusted to isolate). What is required *now*, to avoid painting into a corner:

- Treat the **existing Bundle-Host as the First-Party-Host** conceptually.
- Attach **`trustClass` to bundle identity** even while everything is `first-party` —
  cheap now, load-bearing later.
- Keep the PHI cap-binding paths (**host bridge + `soamView` relay**) **centralized**, so a
  future `trustClass` check is a single chokepoint per path.

## Consequences

- The "PHI never enters the untrusted host" guarantee becomes a **true structural
  invariant**, not a composition accident.
- **Fork C reduces to coarse trust-class enforcement.** Per-consumer, per-method ocap is no
  longer required for the high-stakes (PHI / untrusted) case; only the low-stakes
  sole-writer-among-trusted case remains, as convention (ADR-506).
- First-party bundles may run **privileged logic** in First-Party-Host — including the
  **command (write) logic** for PHI records, holding PHI as cap returns. ADR-506 builds on
  this: **Main stays pure-base** (no domain code; `core-domain` retired); a bundle's
  command logic runs in First-Party-Host and persists via a generic, **ownership-scoped**
  base store capability that encrypts + audits. Third-party bundles get none of this — no
  PHI caps, no owned PHI tables.
- Keeping data-authority logic in First-Party-Host (not Main) preserves Main as the small,
  domain-free trusted core; the hard invariants stay Main-enforced as **declarative schema
  constraints** (ADR-506 §5), not loaded code.

## Alternatives considered

- **Pure per-consumer ocap within one host (the original Fork C).** Rejected as the
  *primary* mechanism: a runtime policy table can be mis-granted; a structural zone is a
  stronger guarantee for the PHI hard-deny. (Coarse trust-class identity is still needed,
  as a lighter residue — §5.)
- **Co-resident decrypt in First-Party-Host.** Rejected: a second PHI-plaintext authority
  erodes ADR-301/302/504 minimization and widens the key-exposure surface.
- **Relax the UI sandbox for trusted bundles.** Rejected: provenance-trust ≠
  memory-safety; de-sandboxing the most-PHI-adjacent code trades away XSS/supply-chain
  containment.

## Open items

- **Trust-class assignment** — how a bundle is classified `first-party` vs `third-party`
  (code signing / install source / a platform registry). Provenance mechanism.
  **Tiered (Amendment 1):** MVP = platform-assigned by load provenance + optional
  load-time hash fingerprint; full publisher-key authN = rung H. See Amendment 1.
- **First-Party-Host process granularity** — one shared process for all first-party
  bundles vs one-per-bundle (resilience vs overhead). ADR-410 spawns on demand today.
- **Non-PHI capability tiering + grant/consent model** for Bundle-Host.
- **Renderer-relay enforcement point** — the `soamView` relay must enforce the PHI
  hard-deny for untrusted iframe-originated binds; confirm it as the single chokepoint.

## Amendment 1 — FP-Host is MVP + capable; provenance authN tiered (2026-06-03)

A planning pass on the ADR-506 migration surfaced a **mis-reading** worth correcting in
the record: that "the First-Party-Host is MVP-deferred." It is **not.** The *Phasing (MVP)*
section above already says *"treat the existing Bundle-Host as the First-Party-Host"* — the
zone that is deferred is the **second, untrusted third-party / extensions host**, the one
with nothing to run until extensions ship. This amendment makes that explicit and commits
the **capable** (not merely conceptual) promotion, plus a tiered provenance-authN model.

### A1.1 The single existing host is promoted to the First-Party-Host

`electron/bundle-host/` (one separately-spawned process) **is the First-Party-Host.** Every
MVP bundle is first-party (domain) → all run here, per ADR-506 §9 (`domain → FP-Host`). The
untrusted **Bundle-Host (third-party / extensions tier)** is **not spawned in MVP** — nothing
untrusted to isolate. It lands with the extensions tier (rung H below).

Consequences:

- **"Pure-base Main" (ADR-506) is an MVP target, not deferred.** Domain command logic moves
  *into* the FP-Host, which exists. (Earlier migration notes that listed "move command
  logic out of Main" as post-MVP were wrong on that point.)
- The current host's **weak sandbox** ("defense-in-depth, not airtight"; O137) stops being a
  liability once the host is labelled trusted — that sandbox existed to contain *untrusted*
  code (§4 still keeps the UI iframe sandbox for bug-containment regardless). The
  airtight-process-sandbox requirement **transfers to the future Bundle-Host**, the deferred
  zone — the hard constraint is parked with the work that needs it.

### A1.2 Promotion is capable, not a label — the Host→Main consumer seam

For the FP-Host to run command logic that persists via the generic base store capability
(ADR-506 §6), a host bundle must be able to **consume** Main capabilities. Today the host
can only **provide** caps (it receives `host.cap.invoke`); there is **no Host→Main consumer
channel**, and the capability registry dispatch is **identity-blind** (`(method, args)` —
§5's noted gap). Promotion therefore requires wiring, now, so the future Bundle-Host is
**purely additive**:

- a **Host→Main capability-consumer channel** (`ctx.bindCapability` in the host → a new
  host-protocol request direction → Main dispatch);
- **caller identity** (`bundleId` + `trustClass`) threaded into registry dispatch (closes
  the §5 identity-blind gap);
- the **PHI gate keyed on `trustClass`** at that chokepoint (`phi && trustClass !==
  'first-party' → deny`) — dormant while all bundles are first-party, structurally present
  so adding a `third-party` bundle later flips no policy, just registers a trustClass.

Tracked as **O449** (the capable-promotion seam).

### A1.3 Provenance authN, tiered (refines the Trust-class-assignment open item, O439)

`trustClass` is **platform-assigned by provenance, never self-declared** (a manifest
`trustClass` field would let a bundle claim its own trust):

- **MVP (first-party only):** a bundle residing in the app's **signed package**
  (`resourcesPath/bundles`) is assigned `first-party`. **Root of trust = OS app-code-signing**
  (ADR-204/308) — the whole package is already signed. An **optional load-time content-hash
  fingerprint check** (sha256 of entry + view-assets vs a pinned `fingerprints.json` shipped
  in-package) adds tamper detection; toggleable (off in dev), **not** the primary trust root.
- **Rung H (third-party tier):** full **publisher-key authN** — bundles installed from
  *outside* the signed package carry a **signature verified against a publisher public key**;
  `trustClass` derives from signature validity. This is the real provenance crypto, and is
  only load-bearing once untrusted bundles load from outside the package.

### A1.4 Naming hazard

The dir `electron/bundle-host/` now hosts the *First-Party*-Host, inverting the ADR-410/418
convention "Bundle-Host = the untrusted tier." Reconcile: rename → `electron/fp-host/`
(O196-class brand churn) **or** document the mismatch loudly at the seam. Tracked as **O450**.

### A1.5 Rung ladder (ADR-506 migration, corrected)

`0` FP-Host capable promotion (this amendment, O449) → `A` CQRS-explicit authoring (O442) →
`B` per-bundle migrations (O444) → `C` generic ownership-scoped store cap (O446) → `D` move
record command logic Main→FP-Host (consumes C; *this* is "pure-base Main") → `E` CQRS preload
bridge split (O447) → `F` dep-graph validation (O445) → `G` hard invariants → schema (O448).
Spine = `0 → C → D`. **Rung H (deferred, post-MVP):** spawn the 2nd untrusted Bundle-Host,
`trustClass: 'third-party'`, full publisher-key authN — PHI deny falls out structurally.
