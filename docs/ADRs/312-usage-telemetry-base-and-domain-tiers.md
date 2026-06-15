# Usage telemetry: base mechanism + domain vocabulary, PHI-free by construction

**ID:** ADR-312
**Status:** Accepted
**Date:** 2026-06-15
**Supersedes:** —
**Superseded by:** —
**Related:** ADR-101, ADR-106, ADR-203, ADR-301, ADR-302, ADR-311, ADR-417, ADR-502, ADR-506

## Status note

This ADR **consolidates** the usage-telemetry policy that was previously split between ADR-311 §7 (the *mechanism* — server `session_events` store, `/v1/events` channel) and Open Item **O468** (the *policy* — consent, retention, classification). It promotes that policy into an Accepted ADR because telemetry is a persisted operational-data class with a DPDP consent model that is about to ship *enabled*, and the existing coverage lacked (a) a single owning record and (b) the **two-tier base/domain model** below. The base tier is **built and prod-verified** (Phase 11a.6); the domain tier is **decided here but deferred-build** (no domain events exist yet).

O468 is retained as the **retention-enforcement task** (the 90-day purge job); the *policy* it carried now lives here.

## Context

The app emits operational usage signal so we can ascertain how it is used. ADR-311 §7 stood up the first surface — server-recorded session lifecycle events (`login`/`refresh`/`signout`) — and 11a.5b added the client channel (`telemetryService` → `POST /v1/events` behind `requireSession`) plus a three-mode consent setting. That surface is now live on Cloud Run (11a.6).

Two forces shape where telemetry belongs and how it must be constrained:

1. **The base/domain split (ADR-106).** `basebench` provides domain-agnostic mechanisms; `ru-soam` first-party bundles provide domain vocabulary; the dependency is one-way (`base ← domain`). Every other cross-cutting capability already obeys this — the store (ADR-506: base mechanism, domain owns tables/queries), commands (ADR-417: base dispatch, domain commands), context keys (ADR-106: base-reserved vs domain-reserved namespaces). Telemetry is no different and must be split the same way.

2. **The PHI boundary (ADR-301), structurally.** Telemetry must be PHI-free *by construction*, not by inspection. Session lifecycle events trivially satisfy this. Domain feature-usage events do **not** get this for free: even a column-PHI-free counter can leak clinically by *inference* (frequency of `risk_event.added`, timing correlated to a single open record, etc.). The domain tier therefore needs a stricter rule than the base tier, not the same one.

**Where the current telemetry sits:** the live events are `login`/`refresh`/`signout` — pure session/identity lifecycle, with **zero `ru-soam` clinical or practice vocabulary**. They live in `electron/main/cloud` and the base identity server. This is **base-level telemetry**, correctly. The channel, consent gate, classification invariant, and retention are all generic, reusable, domain-agnostic — base mechanisms.

## Decision

### 1. Telemetry is two-tier, on the ADR-106 axis

| Tier | Owns | Examples | Home |
| --- | --- | --- | --- |
| **Base (`basebench`)** | The **mechanism** (channel, consent gate, classification enforcement, retention/purge) **and** generic lifecycle/workbench events | `session.login`, `session.refresh`, `session.signout` | `electron/main/cloud/telemetry.ts`, base identity server `/v1/events` |
| **Domain (`ru-soam`)** | **Event vocabulary only**, emitted *through* the base channel under the same invariant + gate | feature-usage counters, e.g. `practice.record.opened` | first-party bundles, via a base-provided emit seam |

The base tier provides the pipe and the rules; the domain tier provides *what to count*, and nothing else. Domain telemetry **never** introduces its own channel, its own consent gate, or its own server endpoint — it rides the base mechanism, exactly as domain stores ride `store.write` (ADR-506) and domain commands ride the base dispatcher (ADR-417).

### 2. Base tier — built (11a.6)

The base instantiation is ADR-311 §7 as shipped: server `session_events` (closed enum `login|refresh|signout`, `device_id` install-UUID, `app_version`, server-stamped `created_at`; no IP, no location), the `telemetryService` client channel, `POST /v1/events` behind the `requireSession` RS256 middleware (`account_id` taken from the JWT, never the body). This tier is PHI-free trivially — session lifecycle carries no content.

### 3. Domain tier — decided, deferred-build, with a stricter invariant

When a first-party bundle needs to record feature usage, it emits through a **base-provided emit seam** (analogous to how a bundle obtains `store.write`). The domain tier is bound by all base rules **plus**:

- **No per-entity linkage.** A domain event MUST NOT carry, or be joinable to, any patient/record/entity identifier. Aggregate or counter only.
- **No re-identifying timing or granularity.** No payload (or emission cadence) that could single out one subject or expose clinical sensitivity by inference.
- **Closed vocabulary, no free text.** Event names come from a declared, namespaced enum (§7); payloads are bounded primitives/counts, never free-form strings.
- **Stricter review gate.** A domain telemetry event requires explicit review against the inferential-leakage rule above — a higher bar than base, where PHI-freedom is structural.

Because **no domain events exist today**, the domain tier is **not built now**. It is stood up when the first domain event is genuinely needed (the same "until module #2" discipline as O445 / the ABI-increment pattern). This ADR fixes the model and the constraints so the first domain event is authored correctly.

### 4. Consent — one gate, three modes, default off (DPDP opt-in)

Telemetry (both tiers) is gated by a single per-account operational pref `cloud.telemetryMode`:

- **Off** (default) — never capture. DPDP opt-in posture: nothing is collected until the user chooses.
- **Online only** — emit when online, drop when not; no durable queue.
- **On** — durable queue (FIFO, capped, operational/non-PHI) + flush on reconnect.

The consent notice (Settings → "Usage analytics") states what is collected, the explicit "no PHI ever sent" guarantee, the per-mode meaning, the default-off stance, and the retention period. There is exactly **one** consent surface for all telemetry; the domain tier does not add a second toggle.

### 5. Classification invariant

Telemetry is **operational-class** data, distinct from the ADR-502 clinical audit ledger (which is PHI-domain, Main-origin, client-side). It is **PHI-free by construction** — base trivially, domain by the §3 rules. This is enforced structurally (closed enums, no free-text payload, no entity linkage), mirroring the schema-level `schema_phi_test.go` denylist already guarding `session_events`.

### 6. Retention — 90 days rolling

Raw telemetry rows older than **90 days** are deleted. Enforcement = a **Cloud Run Job + Cloud Scheduler** running a daily `DELETE … WHERE created_at < now() - interval '90 days'` (chosen over an in-process ticker because the Cloud Run service scales to zero). This is the last gate before telemetry may ship *enabled* in a release. Implementation tracked by **O468**.

### 7. Namespaces

Event names are dotted and namespaced, on the ADR-106 reserved-namespace pattern (as for context keys and commands):

- **Base-reserved:** `session.*`, `workbench.*`.
- **Domain:** first-party bundles use their own namespaces (e.g. `practice.*`). Bundles MUST NOT emit into base-reserved namespaces.

### 8. Data shape / ABI

The current `session_events` table (closed enum) is the base instantiation and is left as-is. The domain tier will require either a generalized namespaced `usage_events` shape or a sibling table; this is a **deferred ABI increment** to be designed when the first domain event lands, behind the same `requireSession` channel (no new endpoint). The increment must preserve the structural PHI-free guarantees of §5.

## Consequences

- **Positive.** One owning record for telemetry policy; the base/domain split is explicit and consistent with store/commands/context-keys; the domain tier has a clear, stricter contract *before* anyone writes the first feature-usage event (the riskiest moment); consent and retention are unified and DPDP-aligned.
- **Cost.** The domain emit seam + generalized data shape are real future work (deferred). Until then, only base lifecycle telemetry exists — feature-level usage is unmeasured.
- **Risk guarded.** The single biggest risk is a future domain event leaking clinical signal by inference; §3 makes that a named review gate rather than an accident waiting to happen.

## Considered options

- **Single-tier (base only), domain telemetry ad hoc later.** Rejected: it would let the first domain event be authored without the inferential-leakage rule, i.e. invent the gate under pressure. The whole point is to fix the constraint before the risky code exists.
- **Separate domain channel / consent / endpoint.** Rejected: violates ADR-106 (domain re-implementing a base mechanism) and would give the user two consent toggles for one concept.
- **Leave policy in O468 (no ADR).** Rejected: an Open Item is too weak a home for a DPDP-relevant persisted data class that is about to ship enabled.

## Open items

- **O468** — 90-day purge job (Cloud Run Job + Scheduler). Last gate before telemetry ships enabled.
- **Domain tier build** (new, deferred) — emit seam + generalized `usage_events` shape + first domain event, authored under §3. Stand up when the first first-party bundle needs feature-usage telemetry.
- **O472 / O473 / O474** — client telemetry-flow gaps surfaced during 11a.6 verify (`login` opt-in timing, signout-orphan re-link UX, pre-unlock pref-read noise). Flow/UX, not classification.
