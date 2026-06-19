# Multi-account provider credentials: account-keyed grants

**ID:** ADR-314
**Status:** Draft
**Date:** 2026-06-19
**Layer:** base (Main credential mechanism) + domain (provider-account model)
**Supersedes:** —
**Superseded by:** —
**Amends:** ADR-507 §10 (realizes the `{provider, account, scopes}` keying it already specified)
**Related:** ADR-304 (OS-keychain credential storage), ADR-305 (Flow-A user-provided credentials), ADR-311 (+Am1 — node-first; "System A" identity vs "System B" provider tokens), ADR-307 (KEK / lock gate), ADR-418 (trust tiers — keys are Main-only), ADR-507 (Schedule = UI over providers), ADR-508 (Sessions link key — cross-bundle impact), ADR-506 (domain-module store contract). **Spec:** [`docs/Activities/schedule/schedule-multical-spec.md`](../Activities/schedule/schedule-multical-spec.md).

## Context

The MVP credential broker (`electron/main/capability/credential-broker.ts`, the `credential.broker@1.0`
base cap from ADR-507 P1 slice-1) is **provider-keyed**: `credKey('google-calendar') →
'google-calendar-token'`, with `status({ provider })`, `grant({ provider, … })`, `revoke({ provider })`.
That is exactly **one grant per provider type** — one Google account, ever.

The Schedule Activity now needs **multiple accounts of the same provider** (e.g. a clinical Google
account and a personal one), each surfacing its own calendars. ADR-507 §10 already named the target
key — *"a generic, provider-agnostic credential broker keyed by `{provider, account, scopes}`"* — but
the implementation only realized the `provider` dimension. This ADR makes the **account** dimension real.

Two distinctions must stay sharp:

1. **System A (identity) ≠ System B (provider) — ADR-311 Am1.** The workspace/identity account (our
   Cloud Run identity, the Google sign-in at signup) is **not** a calendar provider account. Even when
   the user's calendar Google address equals their identity Google address, they are **separate records
   and separate grants with separate scopes**. The broker must never reuse the identity grant for
   calendar scopes, nor vice-versa. This ADR governs **System B only**.
2. **Provider type vs account.** A *provider* has a **type** (`google` | `microsoft` | `apple` |
   `caldav`), a **collection of accounts**, and a **grant per account**. The account is the unit that
   owns a grant; the provider type is the unit that owns the adapter (ADR-507 §2).

## Decision

### 1. Credentials are keyed by `{providerType, accountId}` — Main-only, unchanged trust posture

The broker storage key becomes `'<providerType>:<externalAccountId>'` (e.g.
`'google-calendar:106…sub'`), where `externalAccountId` is the provider's stable account identifier
(Google `sub` / account email). Tokens remain **Main-only** — KEK-wrapped at rest (O307f), never handed
to the FP-Host bundle or the renderer; only the short-lived access token is injected inside Main's
brokered-fetch (ADR-507 §10, ADR-418). **No trust-zone change** — only the key gains a dimension.

### 2. Broker verbs become account-aware

| Verb | Was | Now |
|---|---|---|
| `grant` | `grant({ provider, authUrl, … }) → { ok }` | `grant({ provider, scopes, … }) → { ok, account: { externalId, email, displayName } }` — runs Flow-A, **discovers the account identity** (a provider userinfo/primary-calendar call), stores the token under `{provider, externalId}`, and returns the account metadata so the caller can persist a `provider_account` row. |
| `status` | `status({ provider }) → { connected }` | `status({ provider, accountId }) → { connected }` |
| `revoke` | `revoke({ provider })` | `revoke({ provider, accountId })` |
| `getValidAccessToken` (internal) | `(provider) → token \| null` | `(provider, accountId) → token \| null` |

`net.brokeredFetch@1.0` gains an `accountId` so Main injects the right account's token.

### 3. Account identity is broker-discovered, never bundle-asserted

The FP-Host adapter does **not** tell Main which account it is — Main learns the `externalAccountId`
from the OAuth result itself (the token's `id_token`/`userinfo`/primary-calendar id), the same
unspoofable-provenance rule as ADR-311's `account_id` (never client-asserted). The bundle receives the
account metadata back from `grant`; it cannot mint accounts.

### 4. Migration of the existing single grant

A user connected under the old provider-keyed scheme has a `'google-calendar-token'` entry with no
`externalAccountId`. On first post-upgrade use, the broker resolves the account identity from the live
token (userinfo/primary-calendar) and **re-keys** the stored grant to `'google-calendar:<externalId>'`,
then seeds a `provider_account` row (ADR-507 Am1). No re-auth if the refresh token is still valid;
fall back to a one-time re-grant if identity can't be resolved. (Second such migration; slice-1 already
did a stale-token migration — same pattern.)

## Consequences

**Positive:** multiple accounts per provider; additional provider *types* stay cheap (the key is already
generic); identity remains unspoofable and Main-only; System A/B separation is explicit and enforced.

**Negative:** an account-discovery round-trip is now part of `grant`; a migration path for the existing
single grant; brokered-fetch callers must thread `accountId`.

## Considered Options

- **Provider-keyed (status quo)** — _Rejected_: structurally one account per provider.
- **Account-keyed grants, account model in Schedule** _(chosen)_ — minimal trust change, realizes the
  key ADR-507 §10 already specified.
- **Store account metadata in the broker** — _Rejected_: the broker is a base mechanism (no domain
  state); the `provider_account` table is domain and lives in the Schedule bundle (ADR-506 / ADR-507 Am1).

## Open Items

- **O492** — broker account-keying implementation + single-grant migration (build slice 1).
- **O493 (cross-bundle)** — Sessions link key (`provider_event_id`) must be qualified by account +
  calendar so links don't collide across accounts; coordinate with ADR-508 + O490 (erase cascade). See
  the multi-cal spec §"Event identity".
- Microsoft / Apple / CalDAV grants reuse this keying — additive, no broker change (O486).
