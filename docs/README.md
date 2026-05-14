# Documentation

Project documentation for the workbench platform.

## Structure

- `ADRs/` — Architecture Decision Records.
- `Proposals/` — Proposals under discussion or accepted as direction.
- `References/` — External case studies and internal design-reasoning references.
- `Guides/` — How-to guides derived from ADRs (e.g. feature development).

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
4. **[ADR-103](ADRs/103-capability-based-service-model.md)**, **[ADR-104](ADRs/104-contribution-model.md)**, **[ADR-105](ADRs/105-bundle-activation-lifecycle.md)** — capability + contribution + lifecycle. How features compose with the platform.
5. **[ADR-201](ADRs/201-electron-hardening-baseline.md)**, **[ADR-202](ADRs/202-narrow-preload-capability-surface.md)**, **[ADR-203](ADRs/203-brokered-networking-via-custom-protocol.md)** — security baseline that enforces the trust model at runtime.
6. **[ADR-302](ADRs/302-local-first-data-model.md)** — read/write topology. The local-first stance.
7. **[ADR-303](ADRs/303-phi-sync-and-backup-via-e2ee.md)** — how PHI is protected on the wire and at rest in the cloud (E2EE).
8. **[ADR-304](ADRs/304-credential-storage-in-os-keychain.md)**, **[ADR-305](ADRs/305-third-party-provider-credentials.md)** — credential storage and provider integration patterns.
9. **[ADR-306](ADRs/306-data-recovery-flows.md)** — what happens when things go wrong.
10. **[ADR-501](ADRs/501-tenancy-individual-mvp.md)** — tenancy model for MVP.
11. **[ADR-502](ADRs/502-audit-and-consent-ledger.md)** — audit ledger and consent records.
12. **[ADR-503](ADRs/503-tenancy-clinic-proposed.md)** _(Proposed)_ — the eventual Clinic extension. Read after MVP to see where 501 is heading.
13. **[ADR-403](ADRs/403-workspace-concept.md)** — workspace = Entity. The cross-cutting scoping concept the workbench's UI composition rests on.
14. **[ADR-410](ADRs/410-bundle-host-process-model.md)** — bundles run in a separate Node process. The fourth trust zone. Process-model commitment the rest of the workbench-UI ADRs build on.
15. **[ADR-401](ADRs/401-workbench-shell-anatomy.md)**, **[ADR-402](ADRs/402-middle-section-composition.md)** — the Part abstraction, the root layout, the five middle-section slots.
16. **[ADR-411](ADRs/411-view-hosting-for-bundles.md)** — how a bundle's UI actually renders (sandboxed iframe + bridge). Load-bearing for ADR-404 / ADR-405 / ADR-408.
17. **[ADR-404](ADRs/404-editor-model.md)**, **[ADR-405](ADRs/405-activity-bar-surfaces.md)**, **[ADR-408](ADRs/408-panel-content-model.md)**, **[ADR-409](ADRs/409-status-bar-contribution-model.md)** — what fills the slots: editors, activity-bar surfaces, panel views, status-bar entries.
18. **[ADR-406](ADRs/406-command-driven-architecture.md)**, **[ADR-407](ADRs/407-context-keys-and-when-clauses.md)** — dispatch vocabulary (commands) and conditional visibility (`when` clauses). Cross-cutting across the slot ADRs.
19. **[ADR-412](ADRs/412-services-in-renderer.md)** — renderer service registry + TanStack Query for capability data. How components consume the rest.
20. **[ADR-413](ADRs/413-theming-and-icons.md)** — themes and icons as data contributions. Zero-attack-surface visual layer.

Companion guides ([core-concepts](Guides/core-concepts.md), [feature-development](Guides/feature-development.md), [disposable-pattern](Guides/disposable-pattern.md), [data-encryption-and-recovery](Guides/data-encryption-and-recovery.md)) and references ([Local-first pattern](References/Local_First_Pattern.md), [PHI backup and encryption reasoning](References/PHI_Backup_And_Encryption_Reasoning.md), [Bundle host process reasoning](References/Bundle_Host_Process_Reasoning.md), [Core shell vs first-party bundle reasoning](References/Core_Shell_vs_First_Party_Bundle_Reasoning.md)) elaborate the operational and reasoning sides; they are best read alongside the relevant ADRs.

## Table of Contents

### ADRs

#### Foundation (100–199)

- [ADR-101](ADRs/101-three-authority-zones.md) — Three authority zones: Renderer / Main / Cloud Backend. _(Final)_
- [ADR-102](ADRs/102-renderer-is-composition-shell.md) — Renderer is composition shell, not authority owner. _(Final)_
- [ADR-103](ADRs/103-capability-based-service-model.md) — Capability-based service model. _(Accepted)_
- [ADR-104](ADRs/104-contribution-model.md) — Contribution model for bundle registration. _(Accepted)_
- [ADR-105](ADRs/105-bundle-activation-lifecycle.md) — Bundle activation lifecycle. _(Accepted)_

#### Security (200–299)

- [ADR-201](ADRs/201-electron-hardening-baseline.md) — Electron hardening baseline. _(Accepted)_
- [ADR-202](ADRs/202-narrow-preload-capability-surface.md) — Preload exposes narrow capability APIs only (`window.soam`). _(Accepted)_
- [ADR-203](ADRs/203-brokered-networking-via-custom-protocol.md) — Brokered networking via custom protocol (`app://`). _(Accepted)_
- ADR-204 — _(planned)_ Installer integrity and update channel.

#### Data & Secrets (300–399)

- [ADR-301](ADRs/301-phi-boundary-architectural-not-ux.md) — PHI boundary architectural, not UX. _(Final)_
- [ADR-302](ADRs/302-local-first-data-model.md) — Local-first data model: Clinical local-only, Operational cloud-readable. _(Accepted)_
- [ADR-303](ADRs/303-phi-sync-and-backup-via-e2ee.md) — Multi-device PHI sync and backup via E2EE; LAN P2P as extension. _(Accepted)_
- [ADR-304](ADRs/304-credential-storage-in-os-keychain.md) — Credential storage in OS keychain. _(Accepted)_
- [ADR-305](ADRs/305-third-party-provider-credentials.md) — Third-party provider credentials: user-provided vs app-owned. _(Accepted)_
- [ADR-306](ADRs/306-data-recovery-flows.md) — Data recovery flows (DPAPI reset, KMS loss, recovery-code loss, device loss). _(Accepted)_

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
- [ADR-413](ADRs/413-theming-and-icons.md) — Theming / icons. _(Accepted)_

#### Domain (500–599)

- [ADR-501](ADRs/501-tenancy-individual-mvp.md) — Tenancy model: Individual (MVP). _(Accepted)_
- [ADR-502](ADRs/502-audit-and-consent-ledger.md) — Audit and consent ledger. _(Accepted)_
- [ADR-503](ADRs/503-tenancy-clinic-proposed.md) — Tenancy model: Clinic. _(Proposed)_

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
- [Feature development](Guides/feature-development.md) — Checklist for adding a feature without re-litigating the architecture each time.
- [Disposable pattern](Guides/disposable-pattern.md) — Platform-wide convention for cleanup.
- [Data encryption, key management, and recovery](Guides/data-encryption-and-recovery.md) — Operational companion to ADR-302/303/304/306.

## Open Items

Architectural questions deferred for later decision. Each item names a parking lot, not a commitment.

| ID  | Topic                          | Surfaced in | Status   | Notes                                                                                                  |
| --- | ------------------------------ | ----------- | -------- | ------------------------------------------------------------------------------------------------------ |
| O1  | Canonical state placement      | ADR-102     | Deferred | Renderer does not own canonical state. Where it lives (Main, Cloud Backend, per-domain) TBD.           |
| O2  | Capability registry mechanism  | ADR-103     | Deferred | Native `Proxy` + IPC, existing RPC framework (Comlink, tRPC, gRPC-web), or custom dispatch.            |
| O3  | Capability versioning policy   | ADR-103     | Deferred | Semver-on-name, side-by-side majors, or single-version-with-deprecation.                               |
| O4  | Permission scope model         | ADR-103     | Deferred | Static per-capability scope vs. dynamic context-object scope. Affects per-consent enforcement.         |
| O5  | Contribution declaration form  | ADR-104     | Deferred | Programmatic `register()` calls, declarative manifest, or hybrid.                                      |
| O7  | Contribution point catalogue   | ADR-104     | Deferred | Initial set of contribution points and the criteria for adding new ones.                               |
| O6  | Default activation trigger     | ADR-105     | Deferred | Likely `lazy` by default with `eager` by justification; selection criteria not yet committed.          |
| O8  | Bundle dependency declaration  | ADR-105     | Deferred | Manifest vs code form for declaring inter-bundle dependencies.                                         |
| O9  | Bundle hot reload in dev       | ADR-105     | Deferred | Not required for production; valuable for DX. No DX ADR yet — owned here until one exists.             |
| O10 | CSP exact policy text          | ADR-201     | Deferred | Strawman in ADR-201; tighten as styling solution and asset pipeline land.                              |
| O11 | Sandbox + ESM preload compat   | ADR-201     | Deferred | Verify on targeted Electron version; record findings.                                                  |
| O12 | IPC sender-validation helper   | ADR-201     | Deferred | Utility or handler-registration wrapper. Pick one shape.                                               |
| O13 | Lint rules for hardening       | ADR-201     | Deferred | No direct `BrowserWindow`, no `<webview>`, no direct `electron` imports outside platform.              |
| O14 | `Soam` interface exact shape   | ADR-202     | Deferred | Starting point in ADR-202 §"Name and shape"; refine as registry and event needs settle.                |
| O15 | Preload module format          | ADR-202     | Deferred | CJS vs ESM vs platform-specific bundling under `sandbox: true`. Overlaps with O11.                     |
| O16 | Preload event channel surface  | ADR-202     | Deferred | Which platform events live on `window.soam.events` vs. ride a capability.                              |
| O17 | Events on bridge vs capability | ADR-202     | Deferred | Revisit folding `window.soam.events` into a `platform.events` capability once catalogue matures.       |
| O18 | `app://` route registration    | ADR-203     | Deferred | Bundle-registrable routes (flexible, possible sprawl) vs platform-team-only (tighter, bottleneck).     |
| O19 | Brokered networking caching    | ADR-203     | Deferred | Browser HTTP cache, main-managed cache, or none. Per-route override.                                   |
| O20 | Brokered networking failures   | ADR-203     | Deferred | Auth expiry, retry, offline. Overlaps with local-first/sync ADRs (302/303).                            |
| O21 | Direct-fetch enforcement       | ADR-203     | Deferred | Lint rule + override marker (annotation or typed helper); override sites + CSP allowlist = audit set.  |
| O22 | Local Store wrapper choice     | ADR-302     | Partial  | Direction set: SQLite + transparent at-rest encryption + key from OS keychain. Specific wrapper TBD.   |
| O23 | Operational sync conflict res. | ADR-302     | Deferred | CRDT, OT, snapshotted LWW, or custom. Depends on collaboration semantics for clinic-level features.    |
| O24 | PHI export/import flow shape   | ADR-302     | Deferred | Likely absorbed into ADR-306 (data recovery) as one of the recovery/transfer paths.                    |
| O25 | Operational side-door policy   | ADR-302     | Deferred | Enforcement policy depends on user terms-of-service and consent framing. Re-open when those land.      |
| O26 | KEK rotation policy            | ADR-303     | Deferred | KMS rotation cadence + re-encryption; equivalent for recovery-code-bound KEKs.                         |
| O27 | Backup cadence and granularity | ADR-303     | Deferred | Per-change upload vs periodic snapshot vs both. RPO vs storage-cost trade-off.                         |
| O28 | Crash-dump PHI scrubbing       | ADR-303     | Deferred | PHI may be in memory at crash. Scrubbing required before any dump leaves the device.                   |
| O29 | Same KEK/DEK for sync + backup | ADR-303     | Deferred | Strawman: same. Verify when implementing.                                                              |
| O30 | Linux keychain backend policy  | ADR-304     | Deferred | `libsecret` / KWallet / headless setups. Define fallback when no backend present.                      |
| O31 | Hardware-bound credential keys | ADR-304     | Deferred | Secure Enclave / TPM / HSM where available. Pilot in later phase.                                      |
| O33 | Provider plugin registration   | ADR-305     | Deferred | Contribution point under ADR-104. Schema + model + outbound adapter + validation hook + UI.            |
| O34 | Credential validation hook     | ADR-305     | Deferred | Plugin-defined contract for setup-time validation calls.                                               |
| O35 | Per-provider rate-limit/quota  | ADR-305     | Deferred | Counter location (Main / Cloud Backend) and user-facing surfacing.                                     |
| O36 | Clinic-shared Flow A creds     | ADR-305     | Deferred | Sharing user-provided credentials across practitioners in an entity. Defer to ADR-503 (Proposed).      |
| O37 | Provider-plugin scaffolding    | ADR-305     | Deferred | CLI/wizard generating plugin skeleton. Land once first two plugins exist; capture observed pattern.    |
| O38 | Local backup file format       | ADR-306     | Deferred | Envelope schema version, manifest signing. Lock when first export ships.                               |
| O39 | DPAPI loss detection heuristic | ADR-306     | Deferred | Balance false positives (unneeded reinit) against false negatives (silent failure).                    |
| O40 | KMS access loss UX             | ADR-306     | Deferred | Handle the case where the user expects KMS access to come back.                                        |
| O41 | Cloud ciphertext deletion API  | ADR-306     | Deferred | Single-call delete vs tombstone-with-grace-period. Affects scenario 5 and migration recovery.          |
| O42 | Passphrase-wrapped backup ext  | ADR-306     | Deferred | Optional plugin on top of core export. Low priority; lands if user demand surfaces.                    |
| O48 | Hash-chain mechanism           | ADR-502     | Deferred | Linked hashes, Merkle per anchor, or signed-batch. Performance vs verifiability.                       |
| O49 | Retention policy per event     | ADR-502     | Deferred | Sampling/aggregation for high-frequency events; full retention for clinical-access events.             |
| O50 | Ledger export format           | ADR-502     | Deferred | JSON / JSON-LD / domain schema. Must round-trip through external compliance reviewers.                 |
| O51 | Audit emission lint            | ADR-502     | Deferred | Catch PHI-touching capability handlers that omit ledger emission.                                      |
| O52 | Consent UI text hashing        | ADR-502     | Deferred | Mechanism (rendered-text hash vs source-template hash) and storage location.                           |
| O53 | Multi-Entity workspace switcher| ADR-403     | Deferred | In-shell switcher vs new window. Defer until ADR-503 advances.                                         |
| O54 | Workspace-scoped bundle enable | ADR-403     | Deferred | Clinic admin disables a bundle for whole Entity. Settings shape question for ADR-407 follow-ups.       |
| O55 | Workspace settings sync policy | ADR-403     | Deferred | Layout / recents / explicit settings: which are Operational (cloud-mirrored) vs device-local-only.      |
| O56 | Workspace setting trust prompt | ADR-403     | Deferred | Bundle settings pointing to external endpoints — VSCode-workspace-trust analogue, post-MVP only.        |
| O57 | Window chrome (native/custom)  | ADR-401     | Deferred | Native title bar vs frameless custom chrome. UX call; title-bar Part shape unaffected.                 |
| O58 | Grid engine / library          | ADR-401     | Deferred | Custom SerializableGrid analogue, `allotment`, plain CSS grid, or other.                                |
| O59 | Banner contribution scope      | ADR-401     | Deferred | Platform-only at first; consider opening to bundles. Overlaps with ADR-104 O7 catalogue.                |
| O60 | Aux Side Bar nav strip         | ADR-402     | Deferred | Whether Auxiliary Side Bar grows its own Activity-Bar-equivalent. Default: no, stays context-driven.    |
| O61 | Narrow-window side-bar behav   | ADR-402     | Deferred | Overlay / collapse / hide threshold for narrow windows.                                                 |
| O62 | Activity Bar top-position      | ADR-402     | Deferred | Where Activity Bar renders when position = `top`. Likely above Primary Side Bar.                        |
| O63 | Panel-or-Aux dual contribution | ADR-402     | Deferred | Whether a view can target both Panel and Auxiliary Side Bar. Defer until first-party panel views exist. |
| O64 | Bundle Host implementation     | ADR-410     | Deferred | Electron `utilityProcess` / `child_process.fork` / vm-isolation. Affects sandbox fidelity and memory.   |
| O65 | Bundle Host isolation granular | ADR-410     | Deferred | Single process for all bundles vs one-per-bundle vs per-publisher grouping. Start single.              |
| O66 | Bundle debugging mechanism     | ADR-410     | Deferred | Node inspector port, platform "Inspect bundle" command, Output channel for stdout/stderr.              |
| O67 | Native module policy           | ADR-410     | Deferred | Default deny; explicit contribution declaration for legitimate needs (codecs etc.) with team review.    |
| O68 | Bundle Host hibernation        | ADR-410     | Deferred | Terminate idle Bundle Host. Not in MVP; revisit when memory pressure observed.                          |
| O69 | Canonical domain ownership     | ADR-405     | Deferred | Foundational `ru-soam.core-domain` vs per-UI-bundle ownership of Patient/Session/Task records.          |
| O70 | Disabled-bundle degraded state | ADR-405     | Deferred | Task references a Patient when Patients bundle off: render-as-id, hide link, block disable, or other.   |
| O71 | Platform item discoverability  | ADR-405     | Deferred | Ensure Bundles / Settings / Recovery surface in multiple paths (activity bar + palette + menu).         |
| O72 | Product-scope doc location     | ADR-405     | Deferred | Where first-party bundle catalogue lives, who owns it, how downstream bundle ADRs link back.            |
| O73 | Resource URI scheme registry   | ADR-404     | Deferred | Bundle-scoped naming, format constraints, conflict resolution between schemes.                          |
| O74 | Autosave default + override    | ADR-404     | Deferred | Explicit-save default for session notes; per-editor-type override for kinds that want autosave.         |
| O75 | Save failure UX                | ADR-404     | Deferred | Banner, retry policy, sync-queue interaction.                                                           |
| O76 | View-state serialisation depth | ADR-404     | Deferred | Beyond descriptors: cursor / scroll / filter state. Schema for bundle-owned payload.                    |
| O77 | Aggregate save prompt          | ADR-404     | Deferred | "Save N changes?" on workspace close / re-lock / update apply. Per-editor vs all-or-nothing.            |
| O78 | View asset protocol scheme     | ADR-411     | Deferred | `view://` vs `app://view/...`. Affects CSP and protocol handler registration.                           |
| O79 | `soamView` exact API           | ADR-411     | Deferred | Refine bridge surface as first view-using bundle ships.                                                 |
| O80 | View iframe sandbox flags      | ADR-411     | Deferred | `allow-scripts` + `allow-forms` + `allow-pointer-lock`; case-by-case for `allow-modals` etc.            |
| O81 | Bundle-view CSP text           | ADR-411     | Deferred | Starting point from ADR-201; bundle-specific overlays.                                                   |
| O82 | Declarative-view vocabulary    | ADR-411     | Deferred | Component vocabulary + trigger criteria for declarative-only views.                                     |
| O83 | A11y across iframe             | ADR-411     | Deferred | Focus crossing, tab traversal, `aria-live` proxy, screen-reader semantics.                              |
| O84 | Iframe pooling / count budget  | ADR-411     | Deferred | Memory + startup mitigation when many views open.                                                       |
| O85 | WebContentsView usage policy   | ADR-411     | Deferred | Exceptional-case approval, sandboxing, who decides.                                                     |
| O86 | Command id naming + lint       | ADR-406     | Deferred | `<bundleId>.<verb>[.<noun>]`; collision rejection at registry registration.                              |
| O87 | Command argument schema        | ADR-406     | Deferred | Optional manifest schema for argument validation; weak-by-default vs encouraged vs required.            |
| O88 | Command audit field            | ADR-406     | Deferred | Shape of `audit` on command contributions; interaction with capability-level audit to avoid double-emit. |
| O89 | Recent commands persistence    | ADR-406     | Deferred | Per workspace vs per user. Privacy if arguments carry record ids.                                       |
| O90 | Palette ranking algorithm      | ADR-406     | Deferred | Fuzzy-match scoring + recency + frequency + category boost.                                             |
| O91 | Context-key namespace enforce  | ADR-407     | Deferred | Lint rule + runtime check on reserved-namespace writes.                                                  |
| O92 | Config-derived context-key     | ADR-407     | Deferred | Mirror mechanism: type coercion, default-value handling, change propagation.                            |
| O93 | Bundle context-key authority   | ADR-407     | Deferred | Rate limit on `set` calls; quota on declared keys per bundle.                                           |
| O94 | PHI-adjacent context-key priv  | ADR-407     | Deferred | Crash-dump scrub, telemetry redaction, consent-gated bridge propagation for `patient.*` / `record.*`.    |
| O95 | Expression evaluator perf      | ADR-407     | Deferred | Per-re-evaluation cost budget under realistic clause counts (hundreds to low thousands).                 |
| O96 | Service id mechanism           | ADR-412     | Deferred | `Symbol` vs branded string vs class-as-key. Affects bundling, tree-shaking, collision.                   |
| O97 | TanStack Query key convention  | ADR-412     | Deferred | Per-capability prefix; per-resource invalidation scope; key versioning when capability evolves.          |
| O98 | Workspace lifecycle reset matrix | ADR-412   | Deferred | Definitive list: which services reset on close, which persist, which partial.                            |
| O99 | Suspense / loading discipline  | ADR-412     | Deferred | When to use `<Suspense>` vs skeletons; default UX for slow capability calls.                              |
| O100 | Change-event capability shape  | ADR-412     | Deferred | Watch primitives over Local Store driving TanStack Query invalidation.                                    |
| O101 | Output channel routing         | ADR-408     | Deferred | Bundle stdout/stderr routed to core-shell Output Panel view per channel.                                |
| O102 | Panel view persistence depth   | ADR-408     | Deferred | Active tab + size known; scroll/filter/search per view TBD.                                            |
| O103 | Auto-reveal rate-limit         | ADR-408     | Deferred | Rules for Panel views requesting reveal too often; demotion policy.                                     |
| O104 | Status-bar priority scheme     | ADR-409     | Deferred | Free-form integers vs banded ranges (core / first-party / third-party).                                  |
| O105 | Status-bar update rate-limit   | ADR-409     | Deferred | Default 4/s; per-entry override case.                                                                   |
| O106 | Status-bar context menu        | ADR-409     | Deferred | Right-click menu: hide-entry, show-all, configure.                                                      |
| O107 | Theme token catalogue          | ADR-413     | Deferred | Full list, types, intended use. Lands as reference doc; updated as new platform surfaces appear.        |
| O108 | Icon rendering mechanism       | ADR-413     | Deferred | Inline SVG vs sprite vs font. Affects bundle-author asset format and bundle size.                       |
| O109 | A11y theme contrast budget     | ADR-413     | Deferred | WCAG AA minimum starting point; per-surface tuning.                                                     |
| O110 | Theme propagation cost         | ADR-413     | Deferred | Push to many active iframes on theme switch; verify no perceptible flicker.                              |

## Writing a New ADR

1. Pick the smallest free ID within the appropriate range.
2. Create `ADRs/NNN-kebab-case-title.md` using the template shape from `ADRs/301-phi-boundary-architectural-not-ux.md`.
3. Required fields: `ID`, `Status`, `Date`, `Supersedes`, `Superseded by`, `Related`.
4. Required sections: `Context`, `Decision`, `Consequences` (Positive / Negative), `Considered Options`.
5. Start with `Status: Draft`. Add `Related:` links to prior ADRs that motivate or constrain the decision.
6. Add an entry to the Table of Contents above.
