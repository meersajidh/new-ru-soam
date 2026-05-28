# Canonical domain record ownership: `core-domain` Main-resident service

**ID:** ADR-504
**Status:** Draft
**Date:** 2026-05-28
**Layer:** cross
**Supersedes:** —
**Superseded by:** —
**Related:** ADR-405 (deferred O69 here), ADR-103 (capability model), ADR-104 (contribution model), ADR-105 (lifecycle / failure isolation), ADR-106 (base / domain), ADR-301 (PHI boundary), ADR-302 (local-first store), ADR-307 (PHI lock-gate), ADR-407 (context keys), ADR-410 (bundle host), ADR-502 (audit ledger), [Product Scope](../Product/Product_Scope.md)

## Context

The MVP Activity catalogue ([Product Scope](../Product/Product_Scope.md)) commits six
Activities — Practice, Sessions, Schedule, Assessments, Planner, Audit Viewer — plus
the Documents Aspect. All but Catalog reference the **Client/Patient record**.
Cross-surface record sharing is therefore pervasive from MVP day one. This meets the
condition ADR-405 §"Cross-bundle data sharing" set for **O69** ("the first first-party
bundle that consumes a record owned by another bundle"), which it left open. O69 is now
triggered and this ADR ratifies the model the Product Scope recommended.

Without a committed model, each surface re-declares the record type and reads or writes
the canonical store table directly. That produces the failure ADR-104/106 exist to
prevent: no single site for validation, invariants, or audit-on-write; a reference
tangle across bundles; and an undefined degraded state when whichever surface "owns" the
record is unavailable (**O70**).

Two facts constrain the answer:

- **The record is domain PHI on a base store.** Per ADR-106 the Client/Patient *schema*
  is domain (`ru-soam`); the encrypted Local Store it sits in is a *base* capability
  (ADR-302). The two layers are orthogonal to the ADR-101 trust zones, and they cross.
- **PHI authority is Main.** ADR-301/302 put the Local Store, the decryption key
  (ADR-307, OS keychain), and decryption itself in the Main process; the Renderer and
  bundles reach PHI only through capabilities. The Bundle Host (ADR-410) is the
  third-party-trust zone — first-party bundles run there too, but it is the widest
  exposure surface in the client.

So "who owns the canonical record" has both a layer dimension (base vs domain) and a
trust-zone dimension (which process holds the implementation). ADR-405 deferred both.

## Decision

### 1. One canonical owner — `ru-soam.core-domain`

A single foundational domain component, `ru-soam.core-domain`, owns the canonical
Client/Patient record (and further shared domain record types as they appear). No other
surface re-declares the type or writes the canonical table. Activity and Aspect surfaces
**consume** the record through a capability; they never own a second copy of it.

### 2. Main-resident, not Bundle-Host

`core-domain`'s record capability implementation runs in **Main**, registered through the
existing base capability registry (`registerCapability`, `apps/desktop/electron/main/
capability/registry.ts`) and **PHI-flagged** so the ADR-307 lock-gate applies. PHI
plaintext **never enters the Bundle Host**: the record decrypts and is assembled in Main,
and only the consumer receives the typed record.

This is a deliberate **refinement of ADR-106's "domain ships as bundles" default**, not a
contradiction of it. The default governs domain *feature surfaces* (UI Activities,
Aspects), which still ship as Bundle-Host bundles. Domain **PHI data-authority** is the
named exception: it is Main-resident, for the same reason the base Local Store capability
is — minimizing the set of processes that touch PHI plaintext (ADR-301/302). The
base/domain axis (ADR-106) does not forbid domain code in Main; it forbids only **base
importing domain**. A domain service in Main that *consumes* the base store capability is
domain → base, which the one-way rule permits.

### 3. The base seam already exists — none is invented

The "domain-agnostic interface the base exposes, which the domain implements" is already
present and is reused as-is:

- **Capability registry** (`registerCapability(name, version, handler, { phi })`) — a
  generic, domain-agnostic Main-side registration API. Base services (`prefs`,
  `platform.shell`, `platform.auth`) register through it; the `phi` flag + lock-gate path
  is exercised by the `phi-demo-echo` stub today. `core-domain` registers through the
  same API with no new mechanism.
- **Composition-root domain bootstrap** — the renderer already establishes the pattern in
  `src/domain/bootstrap.ts` (ADR-106 Phase A): a single file, imported **only** by the
  composition root (`src/App.tsx`), that wires domain values into base injection points
  so base never imports domain.

`core-domain` adds the **Main-side mirror** of that pattern: a domain bootstrap
(`apps/desktop/electron/main/domain/bootstrap.ts`) imported **only** by the Main
composition root (`electron/main/index.ts`), which registers the record capability. This
is the **first domain code in the Main process**. The base library remains domain-free —
the composition root is the app's wiring point, not a base module, exactly as in the
renderer. The one-way import boundary (ADR-106, lint-enforced) is unchanged.

### 4. Three artefacts of `core-domain`

- **Shared record types** — a compile-time domain module holding the canonical
  Client/Patient TypeScript types. Imported by Main, the Renderer, and consumer bundles
  as a **contract only**; importing the types grants no data access.
- **Record capability** `record.patient@1.0` — PHI-flagged, Main-resident, implemented on
  the base Local Store engine (ADR-302). The record is **Clinical class** (ADR-301/302):
  local-only, envelope-encryptable for sync (ADR-303), never plaintext to cloud.
- **Registration** — via the Main-side domain bootstrap (§3).

### 5. Consumption rule

Every Activity/Aspect that needs the record **binds the `record.*` capability**. No
bundle re-declares the canonical type and no bundle writes the canonical table directly.
Validation, invariants, and audit-on-write (ADR-502) live in `core-domain` — one site,
behind the capability — not scattered across consumers.

### 6. Namespace

`core-domain` owns the capability namespace **`record.*`**; the first member is
`record.patient`. The reserved domain context-key namespaces `patient.*` / `record.*`
(ADR-407, corrected to domain in ADR-106) are unchanged. The configurable Client/Patient
label (Product Scope §"Terminology") is **UI copy only** — the capability name, the type,
and the namespace use the stable `patient` / `record` vocabulary regardless of the
displayed label.

### 7. Method catalogue deferred

The concrete methods of `record.patient` (read, list-roster, subscribe, write, validate,
…) are `core-domain`'s own design, scoped per consuming surface ahead of building it
(**O197**). Per ADR-103, the capability *model* does not commit the method list; this ADR
commits ownership, host, and namespace only.

## Consequences

### Positive

- One canonical owner; consumers bind a capability instead of re-declaring a type — the
  cross-bundle reference tangle does not form.
- PHI plaintext is confined to Renderer + Main. The Bundle Host never holds it,
  tightening the ADR-301/302/307 exposure surface rather than widening it.
- **O70's hard case dissolves.** The pervasive shared dependency (the record) is
  Main-resident and always present once a workspace is unlocked — not a disable-able peer
  bundle — so "owning bundle disabled while dependents hold references" cannot occur for
  the record. The residual is cross-Activity *projection* references (e.g. "this client's
  sessions" rendered on Practice), which fall back to ADR-105 failure isolation (empty
  result or typed error), tracked under O197.
- Validation, invariants, and audit-on-write are centralized at the capability boundary.
- Establishes a reusable **Main-side domain composition seam** — any future Main-resident
  domain service (e.g. domain identity *proofing*, ADR-106) registers the same way.

### Negative

- Main is no longer domain-free. The boundary is preserved by *shape*, not by absence:
  domain code in Main is admitted **only** through the composition-root bootstrap; base
  library modules still must not import domain (ADR-106 lint). The seam is a narrow door,
  not a blanket license — review must hold that line.
- A foundational always-on capability adds a small registration cost at workspace unlock.
  Acceptable; it mirrors `prefs`.
- Consumers couple to the `record.*` contract version; capability versioning policy (O3)
  applies when the contract changes.

### Neutral

- `core-domain` is a domain **component**, not a Bundle-Host bundle — this corrects the
  Product Scope's "foundational domain bundle" wording. Its user-facing roster UI is the
  separate **Practice** Activity (a Bundle-Host bundle), which consumes the same
  capability rather than owning the record.
- This ADR commits ownership + host + namespace. The method catalogue and per-surface
  consumption scope live in O197 and in `core-domain`'s own design pass.

## Considered Options

- **A — foundational `core-domain` owns the record and exposes a capability** _(chosen
  model)_. Sub-question is the host:
  - **A1 — Main-resident** _(chosen)_. PHI authority stays in Main; the Bundle Host stays
    PHI-free; reuses the existing registry seam.
  - **A2 — Bundle-Host bundle** — _Rejected_: uniform with ADR-106's default, but routes
    PHI plaintext through the third-party-trust process (Main would hand decrypted PHI to
    the host), widening exposure for no benefit.
- **B — the Practice Activity owns the record** — _Rejected_: couples every other Activity
  to the Practice *UI* bundle; the canonical record would die if Practice is disabled or
  replaced (first-party bundles are replaceable, ADR-405); recreates O70's hard case.
  Practice is the primary *editor* of the record, not its *owner*.
- **C — shared types package, no runtime owner; bundles use the base store directly** —
  _Rejected_: no encapsulation — every bundle can write (and corrupt) the canonical
  record; validation, invariants, and audit-on-write become diffuse. This is the
  write-side reference tangle the decision exists to prevent.
- **D — the base owns a generic "entity record" capability** — _Rejected_: the base would
  have to know the Patient schema, violating ADR-106's one-way rule (base must not import
  domain).

## Open Items

- **O69** — resolved by this ADR.
- **O70** — resolved by design for the canonical record (Main-resident, always-on).
  Residual: cross-Activity projection fallbacks, folded into O197.
- **O197** — `record.*` method catalogue and per-surface consumption scope; the
  per-Activity projection Aspects and their degraded-state UX.
- **O3** — capability versioning policy applies to `record.*` when the contract changes.

> The implementation (the `core-domain` types module, the `record.patient` capability, and
> the Main-side domain bootstrap) is a later phase with its own brief; this ADR commits the
> decision only.
