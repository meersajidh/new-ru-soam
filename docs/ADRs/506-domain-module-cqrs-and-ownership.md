# Domain module model: pure-base Main + CQRS bundle-owned records

**ID:** ADR-506
**Status:** Accepted
**Date:** 2026-06-02
**Layer:** cross
**Supersedes:** ADR-504 (retires `core-domain` as a Main-resident service)
**Superseded by:** —
**Related:** ADR-104 (contribution model), ADR-105 (lifecycle / dependency activation), ADR-106 (base/domain — extended to a base/domain/extensions tier here), ADR-301/302/307 (PHI / store / lock), ADR-410 (bundle host), ADR-418 (bundle trust tiers), ADR-502 (audit ledger), ADR-505 (Practice activity), [Two-Axis Architecture guide](../Guides/architecture-two-axes.md)

## Context

ADR-504 resolved O69 ("who owns the canonical record") by making `core-domain` a
**Main-resident** domain service — domain code loaded into the Main process. That was
*expedient* (it reused `registerCapability` + a Main bootstrap), **not forced.** A
step-back analysis (2026-06-02) established that **nothing domain-specific must be
code-in-Main**: keys, crypto, the store engine, and the audit ledger are all generic
(base); domain validation can be either declarative (DB constraints) or run in the trusted
**First-Party-Host** (ADR-418, which holds PHI returns but no keys); domain queries are
declarable SQL a generic engine can execute; migrations are declared by a module and
executed by Main.

This ADR commits the cleaner model: **Main stays pure-base, `core-domain` is retired, and
the canonical record becomes a first-party bundle like any other.** It supersedes ADR-504's
"Main-resident domain service" decision while keeping its answer to O69 (one canonical
owner, consumed via capabilities, validation/audit at one site).

## Decision

### 1. Pure-base Main — no domain code loaded into Main

The Main process loads and runs **no domain code.** It is entirely `basebench`:

- keys (OS keychain, ADR-307), encryption/decryption, the per-workspace encrypted store
  (ADR-302), the audit ledger (ADR-502);
- a **generic, ownership-scoped CRUD capability** (writes — §6);
- a **generic declared-query executor** (reads — §6);
- a **migration executor** + **schema/dependency validator** (§8).

Main is the smallest, most-audited zone; keeping it domain-free maximises that property and
removes ADR-504's "deliberate domain-in-Main exception."

### 2. `core-domain` retired — the record is a first-party bundle

There is no Main-resident `core-domain` service. The canonical Client/Patient record is
owned by a **first-party bundle** (a `record` bundle, or folded into Practice) that, like
any module, declares its tables + migrations + query specs and runs its command logic in
the First-Party-Host. O69's answer stands — one canonical owner, no surface re-declares the
type — but the owner is a bundle, not Main code.

### 3. CQRS is the governing module pattern

- **Command (write)** — one owning Activity per record type (sole writer). Command *logic*
  (validation, invariants) runs in **First-Party-Host**; persistence goes through Main's
  generic ownership-scoped write cap (§6), which encrypts + audits.
- **Query (read)** — many consumers. A query is a **declared SQL / read-model spec** that
  Main's generic engine executes against the decrypted store and returns to the consumer.
  Queries never mutate.
- **Overlay** — a consumer's command side on its **own** tables (journal 0010), never the
  owner's.

This gives the journal vocabulary precise meaning: *projection* = a query; *owner-write* /
*minor command* = commands; *overlay* = a command on one's own tables.

### 4. A bundle is a multi-zone vertical slice — none of it in Main

A first-party bundle declares and owns a vertical slice:

- **schema + migrations** (executed by Main, §8);
- **command logic** (runs in First-Party-Host);
- **query specs** (declared SQL, executed by Main's generic engine);
- **UI** (sandboxed `view://` iframe, ADR-411);
- **declared dependencies** (§8).

Its parts live in **Renderer (UI iframe) + First-Party-Host (logic)** only; **persistence
is via base capabilities** — **no part of a bundle runs in Main.** (Contrast ADR-504/the
earlier 506 draft, where PHI handlers ran in Main.)

### 5. Hybrid validation

Validation splits by criticality. The governing line (refined per O448, 2026-06-03) is
**structural/referential integrity vs domain value-vocabulary**:

- **Structural / referential integrity → declarative constraints in Main**
  (`FK` / `NOT NULL` / `PRIMARY KEY` / `UNIQUE`, and `CHECK` only where the rule is
  *structural* — e.g. `CHECK(amount >= 0)` — not a domain value-set). These guarantee
  integrity *independent of domain meaning*: Main/SQLite enforces "references a real parent",
  "not null", "unique" without knowing what the record *is*. They are **data** (the
  manifest-declared schema), not loaded logic — pure-base Main holds. A compromised
  First-Party-Host bundle still cannot violate them.
- **Domain value-vocabulary + soft/UX validation → First-Party-Host** (enum membership like
  `status ∈ {…}` / `stage ∈ {…}`, trimming, required-field UX, cross-field hints, transition
  affordances). Enum sets are domain knowledge that evolves with the domain; encoding them as
  DB `CHECK` duplicates the valid-set in two places (FP-Host + schema) that drift and couples
  every vocabulary change to a migration. They live single-sourced in the owner bundle.
- **Audit integrity → Main-owned** regardless: the append-only hash-chained ledger
  (ADR-502) is base; a command *declares* its semantic event + detail, but cannot skip,
  forge, or reorder the ledger.

**Why FP-Host enforcement of value-rules is sufficient (no DB-CHECK backstop needed):** the
sole-writer ownership gate (`store.write` enforces `callerBundleId == tableOwner`) means the
*only* writer to a record's tables is its owner FP-Host bundle, whose only write path runs the
validated command logic. There is no generic-bypass writer to defend against — so a value-set
`CHECK` would buy drift-risk + migration-coupling to guard a path that does not exist. The
defense-in-depth argument applies to *structural* integrity (which can be corrupted by a
logic bug regardless of writer identity), not to domain vocabulary.

So the un-violatable **structural** guarantees live in the small trusted core (schema
constraints + the audit chain); **domain value-rules** live single-sourced in the owner
bundle. The test, applied per record type: *structural integrity independent of domain
vocabulary* → schema; *a domain value-set* → First-Party-Host.

### 6. The generic store capability (design constraints)

Main exposes generic persistence, not domain handlers. To stay safe it is:

- **Ownership-scoped.** Migrations declare *bundle X owns tables {T}*; Main records
  ownership and enforces `callerBundleId == owner(table)` on every write. This makes
  **sole-writer Main-enforced** — derived from declarations, **no domain code** (an upgrade
  over "sole-writer = convention"). Requires `bundleId` identity at the seam (ADR-418 §5).
- **Audit-tagged.** A command passes a declared semantic event + detail with each write;
  Main records it in the ledger (ADR-502). The command can *name* the event, never *omit*
  it.
- **Not a raw-SQL surface.** Writes are **parameterized CRUD primitives** on owned tables;
  reads are **pre-declared, load-validated query templates**. A First-Party-Host bundle
  never ships arbitrary SQL into Main.

### 7. Preload command/query bridge split (CQRS at the ABI)

The preload ABI (ADR-202) expresses CQRS: **a query bridge and a command bridge**, so the
read/write distinction is structural at the syscall level — queries are read-only,
cacheable, idempotent; commands are audited and serialized. It is also a **complementary
enforcement lever**: an untrusted bundle can be handed the **query bridge (non-PHI) only**,
structurally unable to command.

**Open shape (O447):** two ABI multiplexers (`bindQuery` / `bindCommand`) vs one bridge with
command/query *method-classes*. Two multiplexers give stronger structural separation; one
bridge is less ABI surface. Decide when the read path first diverges (caching / read-models
/ read-only consumers).

### 8. Declared dependencies, validated before load

A bundle declares its dependencies, and Main validates the whole graph **before running any
migration or activating the bundle** (ADR-104/105):

- **Schema / FK deps** — its tables may `FK` another module's tables → that module must be
  present, and migration order must satisfy the graph.
- **Capability deps** — the queries/commands/base caps it binds must exist.
- **Bundle deps** — other modules it requires.

Invalid graph (dangling FK, missing dependency, cycle) → **refuse to load.** One physical
store per workspace (ADR-302) makes cross-module FKs real; ownership is **logical** over the
shared DB, so referential integrity and erasure cascade use real constraints.

### 9. Three-tier layering: base · domain · extensions

ADR-106's base/domain split refines to **three tiers** (a layer concept, not a zone):

- **base** (`basebench`) — the platform. Spans all zones.
- **domain** (`ru-soam`) — first-party product bundles.
- **extensions** — third-party bundles.

Provenance → `trustClass` → host is a **policy mapping** (ADR-418): **domain →
First-Party-Host**, **extensions → Bundle-Host** (the third-party / "extensions" host).
This correlation is the trustClass policy, **not** an axis collapse — `base` still spans all
zones, and trust ⟂ layer still holds (a thing's *tier* is "whose code"; its *zone* is "how
privileged"). *(ADR-106 to be amended to formalise the extensions tier.)*

## Fork directions (set by this model)

- **A — ownership → distributed.** Each first-party bundle owns its slice; **no
  `core-domain`**. Sole-writer is now **Main-enforced via declared ownership** (§6) — an
  upgrade over convention.
- **B — capability granularity → command/query split** (§3/§7), per aggregate. Method
  catalogue per module (O442 — **resolved rung A: SEPARATE CAPS** per module, not one cap
  with method-classes; cap identity = CQRS class. `record.patient` retrofitted to
  `record.patient` (command) + `record.patient.query` (query)).
- **D — Overview read → a declared read-model query** (§3) executed by Main's generic
  engine; per-projection degraded-state preserved (a missing module degrades its card).
  Materialization strategy: O443.
- **E — erasure → an `ErasePatient` command** with FK `ON DELETE CASCADE` (real, shared
  store) + composite audit (ADR-502).

## Phasing / current state

**Current state (2026-06-03): this model is REACHED for the patient record — spine `0→A→B→C→D` complete; Main is pure-base.** The incremental ladder landed: rung 0 FP-Host capable seam (O449), A separate command/query caps (O442), B per-owner `MigrationSet`s (O444), C generic `store.write` + `store.query` (O446), D record command + query logic relocated to the ru-soam-practice FP-Host bundle (`record-patient-cap.ts` deleted; Main registers no domain logic). Sole-writer is Main-enforced via declared `ownedTables` + the `callerBundleId == owner` gate in `store.write`. Remaining rungs (decouple from "pure-base", refine): ~~E CQRS preload bridge split (O447)~~ **DONE 2026-06-03** (two multiplexers `bindQuery`/`bindCommand` on preload `window.soam` + `soamView` view bridge; `expectKind` on the wire; Main `cap.kind_mismatch` gate vs `entry.kind`; 8 record bind sites migrated), ~~F dep-graph validation (O445)~~ **PARTIALLY DONE 2026-06-03** (data-relocation half: migrations + query templates moved from Main-compiled `domain/practice-*.ts` into ru-soam-practice manifest as SQL-string data, executed by new base `fp-host/bundle-schema.ts`; `domain/practice-migrations.ts`/`practice-queries.ts`/`bootstrap.ts` DELETED → **pure-base Main now also at the DATA level**; + live `validateCapabilityDependencies` cap-dep check. FK/cross-module/ordering graph DEFERRED until a 2nd domain module — O445 stays open), ~~G hard-invariants→schema constraints (O448)~~ **RESOLVED 2026-06-03 as a principle, no code** (§5 amended: structural/referential integrity → schema [FK+NOT NULL already declarative for the patient record]; domain value-vocabulary [enums] → FP-Host, single-sourced; sole-writer gate makes a value-set DB-CHECK unnecessary. No enum CHECK added; FP-Host validation stays).

(Historical: the **superseded M1** had `core-domain` running in Main (`record-patient-cap.ts`), `record.patient` mixing command + query, and a single central `migrations.ts`. Migration was **incremental, not big-bang**: extract the generic base store engine, move record logic into the First-Party-Host, convert to per-bundle migrations.)
**New modules (e.g. Risk/Safety, O419) author to this model from the start.**

### Phasing correction (2026-06-03) — FP-Host is MVP; "pure-base Main" is an MVP target

A planning pass clarified a sequencing point: the **First-Party-Host is part of MVP**, not
deferred. ADR-418 Amendment 1 promotes the single existing host (`electron/bundle-host/`) to
the **capable** First-Party-Host; the zone genuinely deferred is the **second, untrusted
third-party/extensions host** (rung H). Therefore §4's "no part of a bundle runs in Main" and
the retirement of `core-domain` are **reachable in MVP** — the record's command logic has a
non-Main, PHI-capable home (the FP-Host) to move into.

The incremental ladder (ADR-418 Am1 §A1.5), spine `0 → C → D`:

- **Rung 0** — FP-Host **capable promotion**: the Host→Main capability-consumer seam +
  caller `bundleId`/`trustClass` identity in registry dispatch + PHI-gate-by-trustClass.
  Foundational; everything below consumes it. **O449** (+ trust-class assignment O439,
  dir/name reconciliation O450).
- **A** CQRS-explicit authoring (O442 — **DONE 2026-06-03**: separate command/query caps;
  `record.patient` split; dormant `kind` on `registerCapability`) · **B** per-bundle migrations
  (O444 — **DONE 2026-06-03**: per-owner `MigrationSet` registry; `_schema_version` per-owner;
  owner = bundleId; patient tables → `domain/practice-migrations.ts`; sets register before
  store open) · **C** generic ownership-scoped store cap (O446 — **DONE 2026-06-03**:
  `ownedTables`+`tableOwner`; `store.write@1.0` ownership-gated parameterized CRUD + PRAGMA
  column validation + audit-tagged; `store.query@1.0` declared SELECT templates + `stmt.readonly`
  guard + named params; both PHI-gated, both unconsumed until D) ·
  **C** generic ownership-scoped store cap + declared-query executor (O446) ·
  **D ✅ DONE 2026-06-03 — PURE-BASE MAIN REACHED.** Both record caps relocated to the
  ru-soam-practice FP-Host bundle (D1: `record.patient.query`→`store.query`; D2:
  `record.patient` command→`store.write` + `store.query` read-backs); `record-patient-cap.ts`
  DELETED; `registerDomainCapabilities` is a no-op stub. Main now registers NO domain logic —
  only base mechanisms + data declarations (migration sets, query templates). Enabler:
  manifest cap `phi`/`kind` → loader threads to the routing registry. ·
  **E** CQRS preload bridge split (O447) · **F** dep-graph validation (O445) ·
  **G** hard invariants → schema constraints (O448).
- **Rung H (deferred, post-MVP)** — spawn the 2nd untrusted Bundle-Host
  (`trustClass: 'third-party'`), full publisher-key authN; the PHI hard-deny falls out of
  the trustClass gate built at rung 0, no retrofit.

Until rungs C/D land, a *new* module (Risk/Safety) authors **CQRS-explicit** (clean
command/query method split, own migration set once B lands, hard invariants as `CHECK`/`FK`)
but may physically register as a Main cap as a stopgap — same residency as `record.patient`
today — refactoring into the FP-Host when the seam + store cap exist.

## Open items

- **O442** — per-record command/query method catalogue (couples O197). **RESOLVED rung A
  (2026-06-03):** separate caps per module (cap = CQRS class), not method-classes within one
  cap; command path → FP-Host (rung D), query path → generic query executor (rung C). See
  Open_Items O442.
- **O443** — read-model materialization (computed views vs materialized) for Overview + lens
  memberships.
- **O444** — per-bundle migration declaration format + Main-side execution + cross-module
  ordering (today central `migrations.ts`).
- **O445** — dependency declaration (FK / caps / bundles) + graph validation + activation
  ordering (ADR-105).
- **O446** — the generic store capability design: ownership-scoping enforcement,
  audit-tagging, parameterized-CRUD + declared-query-template validation. *(Replaces the
  earlier "per-domain Main-handler seam" framing — there are no Main handlers now.)*
- **O447** — preload command/query bridge shape (two multiplexers vs one bridge with
  method-classes).
- **O448** — expressing hard/safety/legal invariants as declarative schema constraints
  (what's expressible as `CHECK`/`FK`/trigger vs what must stay First-Party-Host logic).
