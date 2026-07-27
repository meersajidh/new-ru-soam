# Plan — Architecture Refactor: Single-Trust-Tier + Infra-Capability Platform

**Status:** DRAFT — 2026-07-18. **Direction agreed, not yet promoted to ADRs.** This plan is the
holding document; each part promotes to an ADR (or amendment) in steps — see _Promotion ladder_ at
the end. Nothing is executed until the owning ADR lands.

## What this plan is

A decision to **drop the untrusted-code trust model** (third-party bundles / marketplace / runtime
`trustClass` grading) and re-shape the architecture around a **single trust tier**: all code is
either `basebench` or product-repo, proven trusted by the build. The security machinery built to
police code we didn't write is removed; the parts that give `basebench` its **platform** identity
(process isolation, infra-capability broker, base/domain split) are kept and, in places, strengthened.

**It reverses several committed decisions** — principally the trust-tier split (ADR-418) and the
sandboxed cross-origin per-bundle view cage (ADR-411 Am1 / ADR-419). It does **not** touch the PHI
guarantee, which never depended on the bundle architecture.

**Relationship to [migrate-onto-basebench](./migrate-onto-basebench.md):** that plan re-points ru-soam
at `basebench` and maps base-vs-domain. This plan changes _what the base is_ — it simplifies the
runtime model the base carries. **Sequence: this refactor's shape should be settled before basebench
freezes the corresponding seams**, so basebench harvests the _simplified_ contracts, not the
trust-tier ones. Where the two plans touch the same ADRs (418/411/419/106), this plan is upstream.

---

## The forcing insight

Four constraints forced the current architecture (see conversation of 2026-07-18). Three still hold;
**one was dropped by decision**:

| Constraint | Status | Consequence |
| --- | --- | --- |
| PHI must never leak (ADR-301) | **holds** | Main = sole key/decrypt/DB holder; brokered egress. Untouched. |
| Renderer will be attacked (web RCE) | **holds** | Powerless renderer + preload bridge + document CSP. Kept. |
| Broker must stay domain-agnostic (reuse) | **holds** | Capability model kept — reframed as infra SPI. |
| **Untrusted extensions will run** | **DROPPED** | Everything downstream of this collapses. |

Dropping the fourth is a **product bet**: ru-soam ships all clinical features itself; no third-party
bundles, no marketplace. Provenance is guaranteed by _the build_, not policed at runtime. The
untrusted-Bundle-Host (rung-H) has been "deferred" across every roadmap entry — persistent deferral
is the signal its threat was never going to be live. We make the drop explicit instead of carrying
the cage for a threat that isn't coming.

**What the drop does NOT cost:** zero on the core PHI promise. All PHI protection lives in
Main-custody + brokered-egress + at-rest layers, none of which were about bundles.

---

## Target architecture (high-level)

**Processes**

- **Main** — keys, DB, Data Protection, File Vault, Cloud, egress broker, **capability registry**.
  The only authority. PHI decrypt Main-only.
- **Preload** — the `window.soam` bridge. Unchanged in role.
- **Renderer** — single-origin `app://` React: composition shell **+ domain UI as plain components**,
  under a **document-level strict CSP**. No `view://`, no per-bundle iframes.
- **FP-Host(s)** — trusted domain logic, process-isolated. **Retained** — for crash isolation,
  resource partitioning, and keeping Main lean; **not** for security. Consume infra via a lightweight
  host wire. Deny-guards **kept** as a cheap hard module-boundary wall (see below).

**Trust model** — single tier. All code first-party, proven by **code-signing signature + no
off-bundle load + monorepo one-way dep (product → basebench)**. No runtime `trustClass`, no
per-module privilege grading. Provenance = the build.

**Capabilities** — retained as **infrastructure SPI + service registry + module-boundary enforcer**,
_not_ a sandbox gate. Capabilities are infra: DB, Data Protection, File Vault, Cloud Integration,
**Untrusted Content Surface** (below), P2P (future). Domain modules consume via **injected capability
handles only** — no ambient globals, no direct infra access, no cross-module data reach. This is the
VSCode-services / Eclipse-RCP / OSGi model: platform provides services, products provide modules that
consume them.

**base/domain split (ADR-106)** — retained, **orthogonal to trust**. It is a code-organization +
reuse boundary, not a runtime-trust boundary; dropping the cage doesn't touch it. `basebench` =
platform framework + CLI + infra capabilities + composition shell. Domain products = modules on top.

**PHI invariant** — **unchanged.** Keys/decrypt Main-only; plaintext in Renderer + FP-Hosts;
brokered egress (`apiHosts` allow-list); protected/operational store split; closed-on-lock.

**Untrusted Content Surface (base-owned capability, DECIDED 2026-07-18)** — the sandboxed
cross-origin iframe is **not** an ad-hoc escape hatch; it is a **first-class `basebench` capability**
that domain modules request when — and only when — they must render **genuinely-untrusted content**
(imported document/file preview; a future embedded third-party widget). basebench owns the surface
(sandbox config, origin, CSP, the postMessage relay); the domain names it and hands it content.
Scoped to that surface — **never** the default UI substrate (which is plain components under document
CSP). Data-flow rule: the surface is fed **exactly the one item being rendered and nothing else** —
no infra handles, no other records — so malicious content cannot escape to exfiltrate other protected
data or reach capabilities. When the content _is_ protected data (e.g. previewing a decrypted vault
file), that one protected plaintext item may enter the surface; the isolation protects the rest of the
app _from the content_, it does not withhold the item being viewed.

---

## Key design calls (the reasoning, so promotion is faithful)

1. **"Prove our code" = load-time integrity, not a runtime tier.** Mechanism = signed single
   artifact + no dynamic import off-bundle + monorepo. Provenance collapses from "grade each module
   at runtime" to "the build is the proof." A _policy_, not a subsystem. Consequence to accept:
   updates ship as whole-app updates (already true via electron-updater); no independent hot-load of
   domain modules.

2. **Retain FP-Host(s) without the security argument.** Justified by crash isolation (module bug
   kills its host, Main + window survive, host restarts), resource partitioning (one module's sync
   storm doesn't starve another), keeping Main responsive, and a smaller PHI-key surface (decrypt
   stays in Main; hosts get plaintext on demand). **Consciously retained cost:** the host-IPC wire +
   capability transport stay. That wire gets _lighter_ — drop `trustClass` resolution; keep transport.

3. **Broker is more than convention — it's a structural boundary.** Even among trusted modules:
   infra reached only through capability handles (swappable, testable, centrally enforces
   sole-writer / audit / residency); no module reaches another's data. Threat-model demoted (no
   longer adversarial); structural role kept and strengthened. **Leverage:** because FP-Host
   processes are retained (#2), the existing **deny-guards** (`Module._load` patch, neutered globals)
   can stay almost free — upgrading the module boundary from lint-discipline to a **hard runtime
   wall** even for trusted code. Keep the guards; drop only the trust-grading.

4. **Frontend: CSP ≠ iframes.** A document-level strict CSP protects the whole renderer page against
   content-XSS (malicious calendar titles, contact names) with **zero iframes**. The complexity in
   the current view stack came from **cross-origin + sandbox + per-bundle-origin**, not from CSP.
   There is **no cheap middle**: same-origin iframe + CSP buys near-zero isolation for real iframe
   overhead; real isolation needs cross-origin/sandbox and re-inherits every gotcha. Therefore:
   **domain UI = plain components under document CSP; no iframes as substrate.** The sandboxed iframe
   survives only as the **base-owned Untrusted Content Surface** capability (above), requested by
   domain for genuinely-untrusted content — not as an ad-hoc pattern.

5. **basebench's identity gets _stronger_, not weaker.** Reframing capabilities from "security
   allow-list" to "infra SPI" yields a cleaner, more marketable framework story: "local-first,
   PHI-grade infrastructure services + composition shell for domain desktop apps." The CLI scaffolds
   a new domain product (à la `create-*` / Rails `new`).

---

## What gets deleted vs kept (impact map)

**Deleted / collapsed**

- Trust tiers: FP-Host-vs-Bundle-Host split, `trustClass`-by-provenance, rung-H untrusted host.
- The entire `view://` cross-origin view stack: per-bundle origins, sandbox-per-iframe, seam
  injection, `__viewBoot`, `view-focus-bus` cross-iframe nav, `openInEditor` cross-bundle
  resolution, per-bundle Tailwind builds, `__viewQuery` interim layer + query-core-in-iframe
  vendoring — **and all associated opaque-origin gotchas** (subresource blocks, StrictMode ×2,
  drag-shield, `document.body` race, `canDisplay` noise).
- Manifest-as-security-contract → demoted to manifest-as-registration + infra-dependency declaration.

**Kept (unchanged or strengthened)**

- Main = sole key/decrypt/DB holder; protected/operational store split; KEK-wrap; closed-on-lock.
- Renderer as separate powerless process + preload bridge — including the hardened
  `RENDERER_WEB_PREFERENCES` verbatim (`sandbox` / `contextIsolation` / `nodeIntegration:false`,
  `electron/main/security.ts`). These bound what *injected or compromised* code can reach, which is
  orthogonal to who authored the code, so single-trust-tier gives back none of them. `sandbox:true`
  in particular stays non-negotiable (ADR-201).
- Brokered egress + `apiHosts` allow-list.
- Strict CSP (now document-level rather than per-iframe).
- Process isolation via FP-Host(s) — retained for resilience/perf, guards kept as hard boundary.
- Capability broker — retained as infra SPI + registry + module-boundary enforcer.
- base/domain split (ADR-106) — retained, orthogonal.
- Two-token systems (identity vs provider), cloud backend — untouched.

**Net effect on ru-soam:** large deletion in the frontend view stack + trust machinery; daily cost of
building a domain feature drops (no `bindCapability` sandbox dance for UI, no iframe app per view,
interactions drop from 3–4 hops to 1–2 for UI reads). basebench emerges as a leaner, more legible
infra-services platform.

---

## Explicitly forfeited (one-way-door — accept consciously)

- **Cannot run code we didn't write without rebuilding the cage.** Clinic-custom bundles, a
  marketplace, partner integrations would each require re-introducing isolation — and retrofitting
  into a shipped app is far harder than having it from day one. This is the cost of the product bet.
  The base-owned Untrusted Content Surface (call 4) covers _content_ embeds, not arbitrary _code_ modules.
- **Slightly less defense-in-depth against our own supply chain.** A compromised dep in domain UI
  now runs in the renderer rather than caged. Judged low ROI vs the complexity it cost.

  **What still bounds it, precisely — because this is the bullet a later reader will quote when
  arguing to relax something.** The bound is the process hardening plus Main custody:
  `nodeIntegration:false` denies it `require`, `sandbox:true` filters its syscalls at the OS, and
  keys never leave Main, so it cannot read plaintext at rest. CSP's contribution is **egress, not
  execution** — `connect-src 'self' app:` stops it POSTing PHI to an attacker origin, but
  `script-src 'self'` permits it outright, since a bundled dep is same-origin first-party code.
  Whatever else this refactor collapses, `RENDERER_WEB_PREFERENCES` is load-bearing against a
  threat that has nothing to do with third-party bundles, and does not relax with the trust model.

---

## Open questions (resolve during promotion, not now)

- **OQ1** — FP-Host granularity: one shared host for all domain modules, or one per module? (Affects
  resource partitioning vs process overhead. Current = one shared.)
- **OQ2** — Do the deny-guards stay verbatim, or slim down now that code is trusted? (Cheap to keep;
  decide per hardening ROI.)
- **OQ3** — Document-CSP exact policy for a single-origin renderer that now hosts domain UI directly
  (font/style/img sources; was previously split across shell + per-view CSP).
- **OQ4** — Migration order of the view stack: can domain views convert component-by-component, or is
  it a single cutover? (Prefer incremental; needs a shim period where both substrates coexist.)
- **OQ5** — Fate of the cross-bundle action bus (`openInEditor` targetBundleId, `view-focus-bus`):
  with single-origin components, is it plain in-renderer routing? (Almost certainly yes → delete bus.)
- **OQ6** — Coordination with migrate-onto-basebench: which seams basebench must _not_ freeze until
  this lands.

---

## Promotion ladder (plan → ADRs, in steps)

Promote in dependency order; each step is an ADR or amendment, landed only when its predecessor is
settled. No step executes code before its ADR lands.

1. **Trust model** — supersede/amend **ADR-418**: single trust tier, provenance-by-build,
   drop `trustClass` + rung-H. (Foundational — everything else references it.)
2. **Frontend substrate** — supersede **ADR-411 Am1 + ADR-419**: single-origin renderer, domain UI as
   components under document CSP, drop `view://` cage; define the base-owned **Untrusted Content
   Surface** capability (sandbox/origin/CSP/relay owned by base, requested by domain).
3. **Capability model** — amend the capability/host ADRs (ADR-506 family): capabilities as infra SPI +
   module-boundary enforcer; FP-Host retained for resilience; deny-guards as hard boundary; wire
   lightened.
4. **base/domain reaffirm** — light amendment to **ADR-106**: confirm split is orthogonal to trust
   and survives; adjust any language that tied it to the trust tier.
5. **Reconcile** with [migrate-onto-basebench](./migrate-onto-basebench.md): update its ADR base/domain
   mapping to the simplified contracts before basebench harvests them.

**Do not** write these ADRs yet. This plan is the shared understanding; promotion happens when we
decide to start, step by step.
