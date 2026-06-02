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
- **First-Party-Host process granularity** — one shared process for all first-party
  bundles vs one-per-bundle (resilience vs overhead). ADR-410 spawns on demand today.
- **Non-PHI capability tiering + grant/consent model** for Bundle-Host.
- **Renderer-relay enforcement point** — the `soamView` relay must enforce the PHI
  hard-deny for untrusted iframe-originated binds; confirm it as the single chokepoint.
