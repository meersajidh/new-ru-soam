# Feature development guide

How to build a feature on this platform without re-litigating the architecture each time.

This guide exists to absorb the up-front cost flagged in ADR-103: every feature requires designing capability contracts before UI work begins. The checklist below makes that cost predictable.

Read alongside:

- [ADR-101](../ADRs/101-three-authority-zones.md) — three authority zones.
- [ADR-102](../ADRs/102-renderer-is-composition-shell.md) — Renderer is a composition shell.
- [ADR-103](../ADRs/103-capability-based-service-model.md) — capability/service model.
- [ADR-104](../ADRs/104-contribution-model.md) — contribution model and the bundle unit.
- [ADR-301](../ADRs/301-phi-boundary-architectural-not-ux.md) — PHI boundary.

## Terminology: feature vs bundle

In product conversations a **feature** is a user-facing capability of the workbench. Architecturally, a feature is implemented as one **bundle** — or by composing several bundles. The bundle is the registrable unit (ADR-104). This guide uses "feature" when speaking about the product intent and "bundle" when speaking about the artifact you write.

## Bundle anatomy

A bundle has three sides:

- **Capabilities consumed** — typed async contracts the bundle binds to at activation (ADR-103). What the bundle takes from the platform.
- **Contributions published** — typed entries the bundle registers against platform contribution points (ADR-104). What the bundle gives back to the platform.
- **Declaration / entry** — the bundle's registration point. Exact form is deferred (Open Item O5); for now, treat it as a single module that exports a registration function.

Most bundles do both consume and publish. A pure-service bundle that only registers a service implementation (no UI surface) is valid. A pure-UI bundle that only registers views with no capability binding is rare and usually a smell — it implies hardcoded data.

## Mental model

Shared logic does not live in a bundle. Shared logic is a **capability** owned by a service.

If you find two bundles needing the same logic, the logic moves down: a service exposes it as a capability, and both bundles bind to that capability. Cross-bundle imports are not the answer.

## Checklist

### 1. Capability survey (what the bundle consumes)

- [ ] List every cross-zone thing the feature needs to do: read or write data, perform a network call, access credentials, log audit events, touch the filesystem, etc.
- [ ] For each, identify the **capability** that owns it. Is there an existing one?
- [ ] If a new capability is needed: write it down before writing UI. Name, typed contract, version, permission scope. See ADR-103 §"Capability".

### 1a. Networking: which path?

When the bundle needs to talk to the network, pick one of three paths (ADR-203):

| Need                                                                    | Path                            | Trust                                                |
| ----------------------------------------------------------------------- | ------------------------------- | ---------------------------------------------------- |
| Typed call/response (RPC-flavoured)                                     | **Brokered capability** (ADR-103) | Through main. Credentials injected by main.          |
| HTTP semantics needed: streaming, large body, content type, headers     | **Brokered `app://` fetch** (ADR-203) | Through main. Credentials injected by main.          |
| Public anonymous asset or metadata; no credentials; no user state       | **Direct `https://` fetch**     | Renderer-originated. Exception path; see below.      |

- [ ] Default to a brokered path. The two brokered paths are equally trusted; pick by interaction shape.
- [ ] Direct `https://` requires: a CSP `connect-src` allowlist entry for the host (ADR-201) **and** an explicit override marker at the call site (ADR-203, Open Item O21). No silent direct fetches.
- [ ] If credentials, tokens, or user state are involved at any point — even indirectly — the path is brokered. Always.

### 2. Placement

- [ ] Confirm the service implementing each capability lives in the correct zone (ADR-101). PHI-touching capabilities live in Main (ADR-301).
- [ ] If a capability needs Cloud Backend data, that is a Main-internal bridge, not a Renderer concern. The Renderer must not learn the Cloud Backend exists (ADR-103 §"Registry and binding — Renderer view").

### 3. Validation rules

- [ ] Identify rules that must be enforced (not just shown). Each enforced rule is declared once.
- [ ] Convenience validation in the Renderer must consume the same rule the authority enforces (ADR-102 §"Validation: convenience vs enforcement"). Renderer-only validation is theatre.

### 4. PHI and consent

- [ ] Does the feature read, write, or transmit PHI?
- [ ] If yes: confirm PHI stays in the Local Store. Confirm any clinical sharing goes through the dedicated sharing flow with explicit consent (ADR-301). Chat is not an option.
- [ ] Audit-log entries for PHI access — if applicable. (ADR-502, planned.)

### 5. Contributions (what the bundle publishes)

- [ ] List the surfaces the bundle adds to the platform: commands, views, menus, settings, validators, keybindings, etc.
- [ ] For each, identify the **contribution point** to register against (ADR-104). Is there an existing one?
- [ ] If a needed contribution point does not exist: **stop and escalate to the platform team**. Bundle authors do not invent contribution points. A missing contribution point is a platform-level change with its own design and review.
- [ ] Validation rules go here too — register the rule once; the Renderer consumes it for convenience and the authority consumes it for enforcement.

### 6. Renderer composition

- [ ] Renderer code is presentation, view state, interaction orchestration, composition. Nothing else (ADR-102).
- [ ] If a Renderer module starts to look like a business-logic owner, it belongs behind a capability instead.

### 7. Activation (when the bundle loads)

- [ ] Pick an activation trigger: `eager`, `lazy`, or `onEvent` (ADR-105). Default to `lazy` unless you have a justified reason.
- [ ] The activation function returns a single **disposable** that releases everything the bundle registered. Use `Disposable.from(...)` to aggregate. See the [Disposable pattern guide](./disposable-pattern.md).
- [ ] Activation may fail. If it does, the platform isolates the failure — but design the activation function to fail cleanly (no half-registered state).
- [ ] If the bundle depends on other bundles, declare those dependencies; do not call into them directly during activation.

### 8. Async discipline

- [ ] All capability calls are async (ADR-103). No synchronous shortcuts.
- [ ] Handle loading, error, and cancellation states explicitly in the UI.

### 9. Test doubles

- [ ] For each new capability, provide a fake implementation that registers under the same name for tests.
- [ ] Bundles can be activated against a reduced contribution set in tests; use this to isolate the bundle under test.

### 10. Documentation

- [ ] New capability → short description in the bundle's docs (until a central capability catalogue exists).
- [ ] New contribution registered → short description listing the contribution point and entry name.
- [ ] If the bundle surfaces a new architectural question, add it to the Open Items table in `docs/README.md` rather than burying it in a PR.

## Anti-patterns

- Calling `ipcRenderer.invoke('channel-name', ...)` from Renderer code. Use a capability proxy.
- Importing a Main-side module directly into Renderer code. Use a capability proxy.
- Importing a sibling bundle's internals. If shared logic is needed, push it down into a capability.
- Inventing a new contribution point inside a bundle. Contribution points are platform-owned; request one from the platform team.
- Adding a "just for this feature" generic bridge to preload. Preload must stay narrow (ADR-202, planned).
- A validation rule that only exists in the Renderer. It is not enforced; the authority must re-declare it, and the two will drift.
- A Renderer module that holds PHI in long-lived state. PHI lives in the Local Store; the Renderer reads view-scoped projections.
- Designing a feature around "the API endpoint we will call". The endpoint is a Cloud Backend detail; the bundle consumes a capability.
