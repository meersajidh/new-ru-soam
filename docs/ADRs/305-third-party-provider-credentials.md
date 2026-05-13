# Third-party provider credentials: user-provided vs app-owned

**ID:** ADR-305
**Status:** Accepted
**Date:** 2026-05-13
**Supersedes:** —
**Superseded by:** —
**Related:** ADR-101, ADR-103, ADR-104, ADR-203, ADR-303, ADR-304, ADR-501, ADR-503 _(proposed: clinic tenancy)_

## Context

The platform integrates with third-party services: AI providers (LLMs, embeddings, transcription), KMS providers (Google Cloud KMS, AWS KMS, Azure Key Vault — per ADR-303), potentially analytics or scheduling integrations later. Each integration needs credentials.

There are two coherent ownership models for those credentials, and they need separate flows:

1. **User-provided** — the user brings their own account with the third party (their OpenAI key, their AWS KMS account). The platform never pays the bill or holds the master credential; the user does. Mental health practitioners may already have provider accounts; teams may want spend control.
2. **App-owned** — the platform pays for the service, hides the credential, and exposes the integration as part of the product. The user never sees the credential.

The two models have different threat profiles, different storage homes, and different code paths. Conflating them — by, say, storing app-owned credentials the same way user-provided ones are stored — leaks the app credential to every install. Conflating in the other direction — sending the user's KMS credentials to the Cloud Backend — gives the platform access to the user's third-party account, violating the user-managed-key principle of ADR-303.

This ADR commits to the two flows and the rule that **every provider integration declares which model it uses, and only that one**.

## Decision

### Two flows

#### Flow A — User-provided credentials

The platform holds and uses credentials the user supplies. The credentials never leave the user's device in plaintext.

- **Storage**: OS keychain via the CredentialStore service (ADR-304), keyed by provider identifier (`third-party-api-key` with `ref = <provider-id>`).
- **Entry path**: A provider plugin (a bundle, per ADR-104) declares the credential schema (`apiKey`, `apiKey + orgId`, `accessKey + secretKey + region`, etc.) and contributes a credential-entry UI. The renderer collects the values and submits them through a capability that lands them directly in CredentialStore on the main side. The values do not return to the renderer after submission in plaintext. A **masked tail** (e.g., the last four characters) may be returned to the renderer for UX confirmation — "your key is `sk-...8a3f`". The masked tail is not sensitive on its own.
- **Outbound calls**: The renderer reaches the provider through brokered networking (`app://provider/<provider-id>/...` per ADR-203 or a typed capability). Main looks up the credentials from CredentialStore, injects them into the outbound request, performs the upstream call, streams the response back.
- **Visibility to the platform**: The platform's main process holds the credential while in use. The Cloud Backend does not see it; the renderer does not see the plaintext after submission; it lives in the OS keychain at rest.

Examples: user's OpenAI key, user's KMS account credentials (ADR-303 Strategy A), user's Anthropic key.

#### Flow B — App-owned credentials

The platform pays for the third-party service. Credentials live in the Cloud Backend exclusively.

- **Storage**: in the Cloud Backend's secrets infrastructure. Never in the client binary, never in main, never in the renderer.
- **Outbound calls**: the renderer asks a capability for an operation; the capability dispatches through main; main calls the Cloud Backend; the Cloud Backend uses the app-owned credential to call the third party; the result streams back through main to the renderer. The credential is never visible client-side at any step.
- **Failure mode if violated**: an app-owned credential that appears anywhere in the client (binary, log, dev tools, source repo) is a leaked credential affecting every install. This is treated as a security incident, not a bug.

**Current Cloud Backend status:** the Cloud Backend is stubbed (ADR-101). Flow B is therefore non-functional at present — no provider plugin can ship as `app-owned` until the Cloud Backend lands the secrets infrastructure that backs it. The shape is committed; the implementation arrives with the Cloud Backend.

Examples (illustrative, not yet shipping): a platform-paid speech-to-text service, platform-paid analytics endpoints.

### Per-provider model declaration

Every provider plugin declares its credential model at registration, and that model is **immutable for the provider's lifetime**:

```ts
// illustrative
registerProviderPlugin({
  id: 'openai',
  credentialModel: 'user-provided',
  credentialSchema: { apiKey: 'string', orgId: 'string?' },
  // ...
});

registerProviderPlugin({
  id: 'platform-transcription',
  credentialModel: 'app-owned',
  // no schema — credentials live in the Cloud Backend
  // ...
});
```

A provider ID has exactly one credential model. If a service might run under either model, it registers as **two providers** with distinct IDs — for example `openai` (user-provided) and `platform-openai` (app-owned). Shared outbound-request logic can be factored out and reused by both plugins, but the registered provider entries are distinct.

This rule avoids a class of complexity: there is no "switching credential model" path, no per-call resolution that might pick one or the other, no version-bump migration on a single plugin. The choice is made at provider-ID level. Renderer code that wants to fall back from one provider to another implements that fallback explicitly, against two different provider IDs, and the fallback intent is visible at the call site.

### Consistent bundle shape

Provider plugins are bundles (ADR-104), even when the early ones look thin (a single capability call, a credential schema, a tiny entry form). The consistency is deliberate: the platform speaks one language for provider integration, and the first two integrations exercise the same shape that the twentieth will use. Open Item O37 covers scaffolding to keep the per-plugin authoring cost low.

### Renderer view

The renderer asks for an operation, not for a credential, in both flows. The flow difference is invisible to the renderer beyond the masked-tail confirmation noted above: the same capability call pattern works whether the credential is user-provided (resolved in main) or app-owned (forwarded to Cloud Backend). The renderer is not told which flow handled its call.

This preserves ADR-103's "renderer is ignorant of the Cloud Backend" property: it does not know whether a provider call required a Cloud Backend hop.

### Credential validation at setup

When a user enters Flow A credentials, the plugin may run a validation call against the provider's introspection endpoint (or a no-op endpoint that confirms credentials work). Validation runs in main, against the provider's real API, before storing. This catches typos and bad-permission cases early. Validation is a plugin-defined hook; the platform does not assume a uniform shape.

### Removal and rotation

A user removing a Flow A provider triggers `CredentialStore.delete(...)` for the corresponding entry. The plugin contributes a rotation flow if its provider requires periodic rotation; the platform does not impose rotation policy on Flow A credentials beyond what the provider mandates.

Flow B rotation is the Cloud Backend's problem. Clients never participate.

### Per-entity (clinic) credential sharing

A clinic may want all practitioners to share access to one set of provider credentials (e.g., a clinic-paid AI subscription using a single key). This is a tenancy-level decision (ADR-503, Proposed) and likely involves sharing Flow A credentials across the clinic's practitioners through clinic-scoped storage in the Cloud Backend. The mechanics are deferred; this ADR commits only to the two-flow split. The MVP scope (ADR-501) is Individual tenancy only — clinic-shared credentials are out of scope until ADR-503 advances.

## Consequences

### Positive

- App-owned credentials are structurally impossible to leak through the client. They are not present client-side at any step.
- User-provided credentials are structurally impossible for the platform to access. The Cloud Backend never sees them.
- The decision per provider is named at plugin registration, not buried in call-site code, and cannot drift at runtime.
- Plugins are self-contained: a new provider integration is a bundle, with its credential schema, validation hook, and outbound request shape.
- The pattern composes with ADR-303 cleanly — KMS providers fall into Flow A naturally.
- Switching strategies on a service (e.g., adding a platform-paid alternative) is additive (a new provider ID) rather than a migration on the existing plugin.

### Negative

- Provider plugins are a real surface to design and maintain. A simple integration looks more involved than "just call the API". Mitigated by scaffolding (O37).
- Flow B is non-functional until the Cloud Backend lands.
- "Two providers for one service" can feel like duplication. The duplication is intentional and shallow if shared logic is factored well; that factoring is plugin-author work, not platform machinery.

### Neutral

- The renderer treats both flows identically (beyond the masked tail). From the renderer's view this is one capability surface for "talk to a third-party provider".

## Considered Options

- **Single credential store, mixed app-owned and user-provided** — _Rejected_: app-owned credentials in the client binary or local store are leaked to every install. Conflating the two is unsafe in both directions.
- **App-owned only (the platform pays for everything)** — _Rejected_: cannot satisfy practitioners or clinics who already have provider accounts, want spend control, or have BYO-key compliance requirements. KMS providers (ADR-303) are inherently user-owned; there is no app-owned KMS path.
- **User-provided only (every integration is BYO-key)** — _Rejected_: forecloses platform-bundled value-adds. The product is allowed to subsidise a few integrations.
- **Per-provider model flag that switches at runtime / version-bumps** — _Rejected_: introduces a "current mode" concept on a single provider, with a migration story. Unnecessary coupling.
- **Two flows, one immutable model per provider ID, multiple providers when a service spans both models** _(chosen)_ — Each model gets the safety properties it needs. Switching is additive at the provider-ID level. Plugins declare which they use, and it does not move.

## Open Items

- **O33** — Provider plugin registration mechanism. Likely a contribution point under ADR-104. Shape: schema declaration + credential model + outbound-request adapter + validation hook + UI contribution.
- **O34** — Credential validation hook shape and platform contract. What plugins must implement; what the platform calls; how errors are surfaced.
- **O35** — Per-provider rate-limit and quota tracking. Where the counters live (Main? Cloud Backend?) and how they surface to the user.
- **O36** — Clinic-shared Flow A credentials. Mechanics for sharing a user-provided credential across multiple practitioners in an entity. Defer to ADR-503 (Proposed); out of MVP scope per ADR-501.
- **O37** — Provider-plugin scaffolding and authoring automation. CLI/wizard that generates the bundle skeleton (schema, capability, outbound adapter, validation hook, credential-entry form) so the consistent shape is cheap to author. Worth doing once the first two provider plugins land, to absorb the patterns observed.
