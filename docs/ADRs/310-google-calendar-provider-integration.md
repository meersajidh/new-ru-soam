# Google Calendar provider integration (deferred)

**ID:** ADR-310
**Status:** Proposed
**Date:** 2026-05-26
**Supersedes:** —
**Superseded by:** —
**Related:** ADR-104, ADR-203, ADR-305, ADR-309

## Status note

This ADR is **Proposed** and **deferred**. It records a direction so that ADR-309 (cloud identity) does not absorb calendar concerns by default, and so the eventual scheduling feature has a committed shape to build against. No implementation lands until a scheduling/calendar feature is actually scoped (post-MVP).

## Context

The old `ru-soam` bundled Google **Calendar** scopes (`calendar.readonly`, `calendar.events`) into the **sign-in** OAuth grant, and tracked a `calendarGranted` flag in the same `safeStorage` blob as identity. One consent screen covered both "who are you" and "may we read your calendar".

This conflicts with this repo's ADR-305, which models every third-party provider integration as a **bundle** (ADR-104) declaring exactly one credential model (Flow A user-provided / Flow B app-owned), with credentials in the CredentialStore (ADR-304) and outbound calls brokered through Main (ADR-203). Conflating an identity grant with a provider-capability grant means the identity flow carries scope it does not need, and the provider integration cannot be reasoned about (or revoked) independently.

## Decision

**Google Calendar is a separate ADR-305 provider plugin, not part of the identity OAuth.**

- **Credential model: Flow A (user-provided).** The practitioner's own Google account grants calendar access; the platform does not own a calendar credential. Stored in CredentialStore keyed by provider id; never returned to the renderer in plaintext (ADR-304/305).
- **Separate, incremental consent.** Calendar scope is requested at the scheduling feature's entry point, not at sign-in — a focused consent the user can grant or decline without affecting identity (matches the old ADR-0015 "feature gates replace the registration wall" intent, expressed through the new provider model).
- **Brokered outbound calls.** Calendar API calls go through Main (`app://provider/google-calendar/...` or a typed capability per ADR-203/305); Main injects the credential; the renderer asks for operations, not tokens.
- **Bundle shape.** The integration is a bundle even if thin (ADR-305 §"Consistent bundle shape"): credential schema/grant + outbound adapter + the calendar capability it contributes.

The `calendarGranted` boolean from the old blob does not survive as identity state; calendar access presence is a property of the calendar provider plugin, queried through its capability.

## Consequences

### Positive

- Identity OAuth (ADR-309) stays minimal — `openid email profile` only; no calendar scope riding along.
- Calendar access is independently grantable and revocable, and reasoned about as one provider among many.
- Reuses the ADR-305 provider machinery rather than special-casing Google in the identity path.

### Negative

- Two Google consent moments (identity at workspace creation, calendar at scheduling entry) instead of one. Accepted: it is the correct separation and avoids over-scoping the identity grant.
- A Google-Calendar Flow-A plugin via the same `accounts.google.com` OAuth as identity needs care so the two grants do not collide in token storage — handled by distinct CredentialStore entries.

## Considered Options

- **Keep calendar scopes in the identity grant (old behaviour)** — _Rejected_: over-scopes identity, conflicts with ADR-305 per-provider model, hard to revoke independently.
- **Drop calendar permanently** — _Rejected_: scheduling is a known roadmap feature; only the timing is deferred.
- **Calendar as a deferred ADR-305 Flow-A provider plugin** _(chosen)_ — correct separation, reuses provider machinery, defers cost until scheduling is scoped.

## Open Items

- **O310a** — Calendar provider plugin design: scope set, incremental-grant UX, CredentialStore entry vs the identity Google grant, capability contract for scheduling. Lands when scheduling is scoped (post-MVP).
