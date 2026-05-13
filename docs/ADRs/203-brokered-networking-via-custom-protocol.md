# Brokered networking via custom protocol

**ID:** ADR-203
**Status:** Accepted
**Date:** 2026-05-12
**Supersedes:** —
**Superseded by:** —
**Related:** ADR-101, ADR-103, ADR-201, ADR-202

## Context

The renderer must not hold long-lived tokens (ADR-101) and must not own networking authority (ADR-102). Authenticated outbound traffic must originate from the main process, which injects credentials, headers, and session state. ADR-103 already establishes capabilities as the typed-call path between renderer and main. That covers RPC-style interactions cleanly — "create note", "list patients" — but does not cover interactions that want HTTP semantics: streaming responses (AI token streams), large downloads, content-typed bodies, response headers, and other things `fetch()` gives for free.

Forcing every HTTP-flavoured interaction through typed capabilities loses the ergonomics that the platform genuinely wants for streaming and asset delivery. Allowing the renderer to call authenticated cloud endpoints with `fetch('https://...')` directly puts tokens in the renderer.

The shape that resolves this is the one VSCode and similar Electron platforms converged on: a **custom protocol** handled in the main process. The renderer calls `fetch('app://...')`; main intercepts, applies auth, performs the upstream call, streams the response back. Renderer code uses browser-native `fetch`; main owns the trust.

## Decision

The platform adopts a custom `app://` protocol, handled in the main process, for all authenticated and credential-bearing outbound traffic. Typed RPC-style interactions remain on capabilities (ADR-103). Public, anonymous, non-credentialed requests may use plain `https://` directly from the renderer under strict policy.

There are two **brokered** paths through main and one **direct** path from the renderer.

### Brokered paths (through main)

| Path                | Shape                          | When to use                                                                              |
| ------------------- | ------------------------------ | ---------------------------------------------------------------------------------------- |
| **Brokered capability** (ADR-103) | Typed call/response, RPC-flavoured | Method-style interactions: create, read, list, update. The renderer wants typed data, not a `Response`. |
| **Brokered `app://` fetch** | Browser-native `fetch` against the `app://` scheme | HTTP semantics needed: streaming, large transfer, content-typed body, response headers. |

Both brokered paths resolve in main. Main injects credentials, validates the requesting frame, and performs the upstream call. From the renderer's view, neither talks to the Cloud Backend; main does. Renderer code never sees `https://api.our-backend.example` — it sees `app://...` or a capability proxy.

### Direct path (renderer-originated)

| Path                | Shape                          | When to use                                                                              |
| ------------------- | ------------------------------ | ---------------------------------------------------------------------------------------- |
| **Direct `https://` fetch** | Plain renderer fetch, no broker | Public anonymous asset or metadata. No credentials. No user state in the request. |

Direct fetch is the exception, not the rule. It is forbidden by default and admitted only under explicit policy (see "Direct-fetch policy" below).

### Scheme registration

The platform registers `app://` as a privileged scheme via `protocol.registerSchemesAsPrivileged` with: standard, secure, fetch-enabled, streaming, CORS-eligible, supports-stream. The handler is installed in main using `protocol.handle('app', ...)`.

### What `app://` does in main

For each `app://` request, main:

1. Resolves the request's logical target (a backend endpoint, a third-party provider, a local resource).
2. Validates the requesting frame (ADR-201 §"IPC sender validation").
3. Looks up and injects credentials — session token for the Cloud Backend, user-provided API key for third-party providers (ADR-304/305 planned), or none for public-but-brokered resources.
4. Performs the upstream request.
5. Streams the response back to the renderer through the protocol handler.

Credentials never traverse the renderer at any step.

### Route registration

`app://` route handling is platform-owned. Routes are not invented inside random bundles; they are registered through a platform-defined mechanism (likely a contribution point per ADR-104, to be specified). Specific route catalogue is out of scope for this ADR.

### CSP interaction

ADR-201's CSP includes `app:` in `connect-src` so the renderer can `fetch('app://...')`. The renderer remains forbidden from `connect-src https://*.our-backend.example`; authenticated upstreams are not in the renderer's CSP at all.

### Direct-fetch policy

A direct `https://` fetch from the renderer is admitted only when **all** of the following hold:

- the request carries no credentials of any kind,
- the host is on a small, explicitly maintained CSP allowlist (ADR-201),
- the call site is annotated through a typed helper or explicit override marker that makes it auditable (see Open Item O21).

If any of those tightens, the request moves to a brokered path.

## Consequences

### Positive

- Authenticated outbound traffic is centralised at one brokered chokepoint (`app://` handler in main) with one credential-injection codepoint.
- The renderer uses standard `fetch()` and `ReadableStream` for HTTP-shaped brokered interactions. No bespoke streaming-over-IPC machinery.
- The renderer never sees Cloud Backend hostnames, tokens, or third-party endpoints. ADR-103's "renderer is ignorant of the Cloud Backend" property is preserved.
- Streaming AI responses, document downloads, and image fetches all use the same brokered path with no special-case code per interaction type.
- The "brokered" label is consistent across capability and `app://` — a useful single word in PRs and reviews ("this needs to be brokered", "is this brokered or direct?").

### Negative

- Three paths instead of one. Authors must pick. _Mitigated by a decision aid in the [feature development guide](../Guides/feature-development.md), updated alongside this ADR._
- The `app://` handler is a single brokered chokepoint; bugs there are platform-wide. Compensated by being one auditable place.
- Direct-fetch policy is multi-layer (lint + CSP + override marker). Each layer is cheap; the combination is the audit surface.

### Neutral

- The custom protocol replaces a class of bespoke IPC patterns that would otherwise accumulate (streaming-over-IPC, chunked-message handlers, etc.).

## Considered Options

- **Renderer calls Cloud Backend directly with bearer tokens** — _Rejected_: places tokens in renderer; breaks ADR-101 and ADR-102.
- **All network through typed capabilities only** — _Rejected_: typing streaming responses, content-typed bodies, and large transfers through capability contracts is awkward. Loses the fetch ergonomics the platform actually wants.
- **Localhost HTTP proxy run by main** — _Rejected_: port management, OS sandbox interactions, firewall noise. Custom protocol is purpose-built and has none of those.
- **Two brokered paths (capability + `app://`) plus a guarded direct path** _(chosen)_ — Each shape gets the path that fits it. One trust model behind both brokered paths. Direct path is the named exception, not the unstated escape hatch.

## Open Items

- **O18** — Route registration mechanism for `app://`. Likely a contribution point (ADR-104); shape to be defined. Open trade-off: bundle-registrable routes are flexible but the surface can sprawl. Platform-team-only route additions are tighter but a development bottleneck. Decide deliberately.
- **O19** — Caching policy. Browser HTTP cache, a main-managed cache, or none. Per-route override.
- **O20** — Failure model. Auth expiry, retry semantics, offline behaviour. Likely overlaps with the local-first/sync ADRs (302/303).
- **O21** — Direct-fetch enforcement. Lint rule that flags renderer `fetch('https://...')` by default, with an explicit override mechanism — annotation comment or typed helper (e.g., `directFetch('https://...')` with a literal URL allowlist). Override sites are the auditable surface. Combined with the CSP host allowlist in ADR-201, the audit is "everything the renderer can reach without going through main".
