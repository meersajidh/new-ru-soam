# Documentation

Project documentation for the workbench platform.

## Structure

- `ADRs/` — Architecture Decision Records.
- `Proposals/` — Proposals under discussion or accepted as direction.
- `References/` — External case studies and internal design-reasoning references.
- `Guides/` — How-to guides derived from ADRs (e.g. feature development).
- `Product/` — Product-scope docs (first-party Activity catalogue). Domain-layer (`ru-soam`), product-owned.

## ADR Number Ranges

ADRs are grouped by topic. Within each range, IDs are assigned sequentially. Three-digit IDs.

| Range     | Topic                              |
| --------- | ---------------------------------- |
| 100–199   | Foundation / authority model       |
| 200–299   | Security baseline                  |
| 300–399   | Data & secrets                     |
| 400–499   | Workbench / UI composition         |
| 500–599   | Domain (mental health specifics)   |

## ADR Status

Each ADR carries a `Status` field:

- **Draft** — under discussion, not yet committed.
- **Accepted** — agreed direction.
- **Final** — frozen; changes require a new ADR that supersedes it.
- **Superseded** — replaced by a later ADR (referenced in `Superseded by`).

## Reading Order

The ADRs are layered: later ones rest on earlier ones. A newcomer should read in the following order, not numeric.

1. **[ADR-301](ADRs/301-phi-boundary-architectural-not-ux.md)** — the first principle. PHI never reaches the cloud in plaintext, enforced structurally. Everything else exists in service of this.
2. **[ADR-101](ADRs/101-three-authority-zones.md)** — trust vocabulary. Renderer / Main / Cloud Backend. The whole architecture references these names.
3. **[ADR-102](ADRs/102-renderer-is-composition-shell.md)** — what the Renderer is allowed to be.
4. **[ADR-103](ADRs/103-capability-based-service-model.md)**, **[ADR-104](ADRs/104-contribution-model.md)**, **[ADR-105](ADRs/105-bundle-activation-lifecycle.md)** — capability + contribution + lifecycle. How features compose with the platform. **[ADR-106](ADRs/106-domain-agnostic-base-and-domain-layer.md)** then draws the base/domain boundary (`basebench` platform vs `ru-soam` product) that the whole composition sits inside.
5. **[ADR-201](ADRs/201-electron-hardening-baseline.md)**, **[ADR-202](ADRs/202-narrow-preload-capability-surface.md)**, **[ADR-203](ADRs/203-brokered-networking-via-custom-protocol.md)** — security baseline that enforces the trust model at runtime.
6. **[ADR-302](ADRs/302-local-first-data-model.md)** — read/write topology. The local-first stance.
7. **[ADR-303](ADRs/303-phi-sync-and-backup-via-e2ee.md)** — how PHI is protected on the wire and at rest in the cloud (E2EE).
8. **[ADR-304](ADRs/304-credential-storage-in-os-keychain.md)**, **[ADR-305](ADRs/305-third-party-provider-credentials.md)** — credential storage and provider integration patterns.
9. **[ADR-306](ADRs/306-data-recovery-flows.md)** — what happens when things go wrong.
10. **[ADR-307](ADRs/307-app-level-kek-passphrase-and-auto-lock.md)** — endpoint trust gate: app-level passphrase wraps the KEK; inactivity auto-lock makes "locked" mean something. Closes the walk-up gap left by ADR-303's original keychain-only runtime model.
10b. **[ADR-309](ADRs/309-cloud-identity-and-authentication.md)** / **[ADR-310](ADRs/310-google-calendar-provider-integration.md)** / **[ADR-311](ADRs/311-cloud-backend-identity-service.md)** — cloud identity (client OAuth in Main) / Google Calendar as a node-direct provider plugin / the Cloud Backend identity service (verify ID-token + issue session JWT + usage telemetry). ADR-311 draws the load-bearing line: the node is self-sufficient for all Google connectivity (identity + every provider plugin); the server is a thin verifier + later sync backbone, never in the provider path.
11. **[ADR-501](ADRs/501-tenancy-individual-mvp.md)** — tenancy model for MVP.
12. **[ADR-502](ADRs/502-audit-and-consent-ledger.md)** — audit ledger and consent records.
13. **[ADR-503](ADRs/503-tenancy-clinic-proposed.md)** _(Proposed)_ — the eventual Clinic extension. Read after MVP to see where 501 is heading.
14. **[ADR-403](ADRs/403-workspace-concept.md)** — workspace = Entity. The cross-cutting scoping concept the workbench's UI composition rests on.
15. **[ADR-410](ADRs/410-bundle-host-process-model.md)** — bundles run in a separate Node process. The fourth trust zone. Process-model commitment the rest of the workbench-UI ADRs build on.
16. **[ADR-401](ADRs/401-workbench-shell-anatomy.md)**, **[ADR-402](ADRs/402-middle-section-composition.md)** — the Part abstraction, the root layout, the five middle-section slots.
17. **[ADR-411](ADRs/411-view-hosting-for-bundles.md)** — how a bundle's UI actually renders (sandboxed iframe + bridge). Load-bearing for ADR-404 / ADR-405 / ADR-408.
18. **[ADR-404](ADRs/404-editor-model.md)**, **[ADR-405](ADRs/405-activity-bar-surfaces.md)**, **[ADR-408](ADRs/408-panel-content-model.md)**, **[ADR-409](ADRs/409-status-bar-contribution-model.md)** — what fills the slots: editors, activity-bar surfaces, panel views, status-bar entries.
19. **[ADR-406](ADRs/406-command-driven-architecture.md)**, **[ADR-407](ADRs/407-context-keys-and-when-clauses.md)** — dispatch vocabulary (commands) and conditional visibility (`when` clauses). Cross-cutting across the slot ADRs.
20. **[ADR-412](ADRs/412-services-in-renderer.md)** — renderer service registry + TanStack Query for capability data. How components consume the rest.
21. **[ADR-413](ADRs/413-theming-and-icons.md)** — themes and icons as data contributions. Zero-attack-surface visual layer.
22. **[ADR-414](ADRs/414-ru-edit-platform-editor-primitive.md)** — RuEdit, the platform's first-party rich-text editor primitive on raw ProseMirror. Monaco-in-VSCode analogue; every prose-bearing editor type composes it.
23. **[ADR-415](ADRs/415-react-prosemirror-integration-boundary.md)** — how React and ProseMirror coexist inside RuEdit: React owns chrome, vanilla `prosemirror-view` owns content, the two never overlap. Avoids the documented state-tearing failure modes.
24. **[ADR-416](ADRs/416-snippet-engine.md)** — Snippet engine: `/`-trigger expansion with placeholder walk, atomic placeholder nodes, vanilla-DOM picklist nodeView. Generic vocabulary policy ("no `Smart*`") committed here.

Companion guides ([core-concepts](Guides/core-concepts.md), [feature-development](Guides/feature-development.md), [disposable-pattern](Guides/disposable-pattern.md), [data-encryption-and-recovery](Guides/data-encryption-and-recovery.md)) and references ([Local-first pattern](References/Local_First_Pattern.md), [PHI backup and encryption reasoning](References/PHI_Backup_And_Encryption_Reasoning.md), [Bundle host process reasoning](References/Bundle_Host_Process_Reasoning.md), [Core shell vs first-party bundle reasoning](References/Core_Shell_vs_First_Party_Bundle_Reasoning.md)) elaborate the operational and reasoning sides; they are best read alongside the relevant ADRs.

## Table of Contents

### ADRs

#### Foundation (100–199)

- [ADR-101](ADRs/101-three-authority-zones.md) — Three authority zones: Renderer / Main / Cloud Backend. _(Final)_
- [ADR-102](ADRs/102-renderer-is-composition-shell.md) — Renderer is composition shell, not authority owner. _(Final)_
- [ADR-103](ADRs/103-capability-based-service-model.md) — Capability-based service model. _(Accepted)_
- [ADR-104](ADRs/104-contribution-model.md) — Contribution model for bundle registration. _(Accepted)_
- [ADR-105](ADRs/105-bundle-activation-lifecycle.md) — Bundle activation lifecycle. _(Accepted)_
- [ADR-106](ADRs/106-domain-agnostic-base-and-domain-layer.md) — Two-layer architecture: domain-agnostic base (`basebench`) + domain layer (`ru-soam`). _(Accepted)_

#### Security (200–299)

- [ADR-201](ADRs/201-electron-hardening-baseline.md) — Electron hardening baseline. _(Accepted)_
- [ADR-202](ADRs/202-narrow-preload-capability-surface.md) — Preload exposes narrow capability APIs only (`window.soam`). _(Accepted)_
- [ADR-203](ADRs/203-brokered-networking-via-custom-protocol.md) — Brokered networking via custom protocol (`app://`). _(Accepted)_
- [ADR-204](ADRs/204-installer-integrity-and-update-channel.md) — Installer integrity and update channel. _(Accepted)_

#### Data & Secrets (300–399)

- [ADR-301](ADRs/301-phi-boundary-architectural-not-ux.md) — PHI boundary architectural, not UX. _(Final)_
- [ADR-302](ADRs/302-local-first-data-model.md) — Local-first data model: Clinical local-only, Operational cloud-readable. _(Accepted)_
- [ADR-303](ADRs/303-phi-sync-and-backup-via-e2ee.md) — Multi-device PHI sync and backup via E2EE; LAN P2P as extension. _(Accepted)_
- [ADR-304](ADRs/304-credential-storage-in-os-keychain.md) — Credential storage in OS keychain. _(Accepted)_
- [ADR-305](ADRs/305-third-party-provider-credentials.md) — Third-party provider credentials: user-provided vs app-owned. _(Accepted)_
- [ADR-306](ADRs/306-data-recovery-flows.md) — Data recovery flows (DPAPI reset, KMS loss, recovery-code loss, device loss). _(Accepted)_
- [ADR-307](ADRs/307-app-level-kek-passphrase-and-auto-lock.md) — App-level KEK passphrase + inactivity auto-lock + endpoint threat model. _(Accepted)_
- [ADR-308](ADRs/308-update-time-data-integrity.md) — Update-time data integrity (pre-migration backup, transactional DDL, schema gates). _(Accepted)_
- [ADR-309](ADRs/309-cloud-identity-and-authentication.md) — Cloud identity and authentication (Google OAuth + cloud session). _(Draft)_
- [ADR-310](ADRs/310-google-calendar-provider-integration.md) — Google Calendar provider integration. _(Proposed)_
- [ADR-311](ADRs/311-cloud-backend-identity-service.md) — Cloud Backend identity service (verify ID-token + session JWT + usage telemetry). _(Accepted)_
- [ADR-312](ADRs/312-usage-telemetry-base-and-domain-tiers.md) — Usage telemetry: base mechanism + domain vocabulary, PHI-free by construction. _(Accepted)_
- [ADR-313](ADRs/313-phi-egress-to-user-controlled-providers.md) — PHI egress to user-controlled providers: the consented, audited, default-off, score-driven **interim** gradient + the PHI Safety Score. Refines ADR-301 (narrows one carve-out; 301's core invariant against *our* cloud stays Final). _(Accepted)_
- [ADR-314](ADRs/314-multi-account-provider-credentials.md) — Multi-account provider credentials: account-keyed (`{providerType, accountId}`) grants, Main-only, broker-discovered identity; System A (identity) vs System B (provider) stay separate. Realizes the keying ADR-507 §10 specified. _(Draft)_

#### Workbench / UI composition (400–499)

- [ADR-401](ADRs/401-workbench-shell-anatomy.md) — Workbench shell anatomy (Part abstraction, root grid). _(Accepted)_
- [ADR-402](ADRs/402-middle-section-composition.md) — Middle section composition (activity bar, side bars, editor area, panel). _(Accepted)_
- [ADR-403](ADRs/403-workspace-concept.md) — Workspace concept: workspace = Entity. _(Accepted)_
- [ADR-404](ADRs/404-editor-model.md) — Editor model as generic container for clinical artefacts. _(Accepted)_
- [ADR-405](ADRs/405-activity-bar-surfaces.md) — Activity-bar surfaces: mechanism and core items (first-party catalogue deferred to product scope). _(Accepted)_
- [ADR-406](ADRs/406-command-driven-architecture.md) — Command-driven architecture. _(Accepted)_
- [ADR-407](ADRs/407-context-keys-and-when-clauses.md) — Context keys and when-clauses. _(Accepted)_
- [ADR-408](ADRs/408-panel-content-model.md) — Panel area content model. _(Accepted)_
- [ADR-409](ADRs/409-status-bar-contribution-model.md) — Status-bar contribution model. _(Accepted)_
- [ADR-410](ADRs/410-bundle-host-process-model.md) — Bundle host process model (separate Node process). _(Accepted)_
- [ADR-411](ADRs/411-view-hosting-for-bundles.md) — View / webview hosting for bundles (sandboxed iframe + `view://` protocol + bridge). _(Accepted)_
- [ADR-412](ADRs/412-services-in-renderer.md) — DI / services in renderer (TanStack Query + service registry). _(Accepted)_
- [ADR-413](ADRs/413-theming-and-icons.md) — Theming / icons. _(Accepted; Am1 2026-06-01: built-in set = Codicons, O108 resolved)_
- [ADR-414](ADRs/414-ru-edit-platform-editor-primitive.md) — RuEdit: platform editor primitive. _(Accepted)_
- [ADR-415](ADRs/415-react-prosemirror-integration-boundary.md) — React / ProseMirror integration boundary. _(Accepted)_
- [ADR-416](ADRs/416-snippet-engine.md) — Snippet engine. _(Accepted)_
- [ADR-417](ADRs/417-menu-and-keybinding-contributions.md) — Menu + keybinding contributions, context-menu primitive, renderer↔view action channel. _(Accepted)_
- [ADR-418](ADRs/418-bundle-trust-tiers.md) — Bundle trust tiers: First-Party-Host vs Bundle-Host (structural PHI hard-deny for untrusted code). _(Accepted)_

#### Domain (500–599)

- [ADR-501](ADRs/501-tenancy-individual-mvp.md) — Tenancy model: Individual (MVP). _(Accepted)_
- [ADR-502](ADRs/502-audit-and-consent-ledger.md) — Audit and consent ledger. _(Accepted)_
- [ADR-503](ADRs/503-tenancy-clinic-proposed.md) — Tenancy model: Clinic. _(Proposed)_
- [ADR-504](ADRs/504-canonical-domain-record-ownership.md) — Canonical domain record ownership: `core-domain` Main-resident service (resolves O69). _(Superseded by ADR-506)_
- [ADR-505](ADRs/505-practice-activity.md) — Practice Activity: roster + Client/Patient record management (first per-Activity pass, O197). _(Draft)_
- [ADR-506](ADRs/506-domain-module-cqrs-and-ownership.md) — Domain module model: **pure-base Main** + CQRS bundle-owned records (retires `core-domain`; command logic in First-Party-Host; hybrid validation; declared deps; base/domain/extensions tiers). _(Accepted)_
- [ADR-507](ADRs/507-schedule-activity.md) — Schedule Activity: a **storeless UI over calendar providers** (`CalendarProvider` port, Google Flow-A adapter, provider = master of events; derived classification tags). Takes up ADR-310. _(Draft)_
- [ADR-508](ADRs/508-sessions-client-meeting.md) — Sessions: the **Client Meeting** (persisted clinical subset of the calendar) — dual-origin, field-partitioned sync, identity-resolution seam, `MeetingProvider` port (Meet/Zoom). The only store in the Schedule/Sessions pair. _(Draft)_

### Proposals

- [App Architecture Proposal](Proposals/App_Architecture_Proposal.md) — Networking and authority architecture overview.

### References

- [VSCode Architecture Case Study](References/VSCode_Architecture_Case_Study.md) — Lessons applied to platform design.
- [Local-first pattern](References/Local_First_Pattern.md) — Read/write topology adopted in ADR-302.
- [PHI backup and encryption reasoning](References/PHI_Backup_And_Encryption_Reasoning.md) — Analysis behind ADR-303's commitments.
- [Bundle host process reasoning](References/Bundle_Host_Process_Reasoning.md) — Why bundle code runs in its own Node process (ADR-410, planned).
- [Core shell vs first-party bundle reasoning](References/Core_Shell_vs_First_Party_Bundle_Reasoning.md) — Why most platform features ship as bundles (ADRs 401, 402, 405, planned).

### Guides

- [Core concepts: Capability, Bundle, Contribution](Guides/core-concepts.md) — First-principles primer on the three load-bearing concepts. Read before `feature-development.md`.
- [The Two-Axis Architecture: Trust Zones × Layers](Guides/architecture-two-axes.md) — Why zone (privilege) and layer (base/domain) are orthogonal; the capability seam; the honest PHI invariant; the First-Party-Host + CQRS evolution (ADR-418/506).
- [Feature development](Guides/feature-development.md) — Checklist for adding a feature without re-litigating the architecture each time.
- [Disposable pattern](Guides/disposable-pattern.md) — Platform-wide convention for cleanup.
- [Data encryption, key management, and recovery](Guides/data-encryption-and-recovery.md) — Operational companion to ADR-302/303/304/306.

### Product

- [Product Scope](Product/Product_Scope.md) — first-party **Activity** catalogue (the surfaces ADR-405 deferred). Domain-layer, product-owned source of truth; per-Activity design lives in 500-series bundle ADRs.

## Open Items

Architectural questions deferred for later decision. Each item names a parking lot, not a commitment.

The Open Items registry has moved to [`Open_Items.md`](Open_Items.md) — the single source of truth across ADRs and the Implementation Plan. The legacy table that lived here covered only O1–O110 and is no longer maintained.

## Writing a New ADR

1. Pick the smallest free ID within the appropriate range.
2. Create `ADRs/NNN-kebab-case-title.md` using the template shape from `ADRs/301-phi-boundary-architectural-not-ux.md`.
3. Required fields: `ID`, `Status`, `Date`, `Supersedes`, `Superseded by`, `Related`.
4. Required sections: `Context`, `Decision`, `Consequences` (Positive / Negative), `Considered Options`.
5. Start with `Status: Draft`. Add `Related:` links to prior ADRs that motivate or constrain the decision.
6. Add an entry to the Table of Contents above.
