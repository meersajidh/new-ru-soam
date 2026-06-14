# Cloud identity and authentication (Google OAuth + cloud session)

**ID:** ADR-309
**Status:** Draft
**Date:** 2026-05-26
**Supersedes:** —
**Superseded by:** —
**Related:** ADR-101, ADR-103, ADR-202, ADR-203, ADR-304, ADR-305, ADR-307, ADR-501, ADR-502, ADR-310 _(proposed: calendar provider)_, ADR-311 _(Part B taken up: Cloud Backend identity service)_

## Status note

This ADR is **Draft**. It has two parts with different commitment levels:

- **Part A — Client identity (committed, lands now).** Real Google OAuth in Main replacing the Phase-9 mock (`src/platform/auth/mock-oauth.ts`), the `cloud-session-token` storage decomposition, and workspace-scoped identity binding. This is the work tracked by Open Item **O307g**.
- **Part B — Cloud Backend identity service (TAKEN UP → [ADR-311](311-cloud-backend-identity-service.md), 2026-06-14).** Server-side ID-token verification, account auto-registration, server JWT issuance, and usage telemetry. The direction recorded here is now committed by **ADR-311** as the Phase-11a identity slice (Open Item O309a resolved). Note ADR-311 **corrects** one detail this section left open: token-exchange stays in **Main** (node-direct, for offline-self-sufficiency), so the "client-secret removal" option is N/A. Subscription/licensing (O309b) remains deferred to its own ADR.

A working reference implementation of the whole flow exists in the **old repository** (`~/Repos/msh/ru-soam`). It is treated as a **salvage source**, not a lift-and-shift target — see §"Salvage inventory".

## Context

The platform needs cloud identity for the user's account: who owns a workspace's Entity (ADR-501), and the session token that authenticates that Entity to the Cloud Backend once cloud sync lands (ADR-303). ADR-307 already captures an **email at workspace creation** via a mocked OAuth dialog (`{ email, googleId: "mock-<uuid>" }`); ADR-304 reserves a `cloud-session-token` credential type (currently unimplemented — catalogue is `local-store-db-key` only); O307g reserves real OAuth for a later phase.

The old `ru-soam` shipped a complete Google-OAuth identity stack. Its shape was sound and most of it is directly reusable, but it was written before this repo's zone, capability, credential-store, and workspace ADRs and therefore conflicts with them in specific, enumerable ways. This ADR commits the client-side identity model that honours those ADRs and records the deferred backend posture.

### What the old implementation did (factual)

- **Main owns OAuth.** PKCE + ephemeral loopback listener (`127.0.0.1:<os-port>/callback`, `state`-validated). Main exchanges the authorization code directly with Google (`client_id` + bundled `client_secret` + PKCE verifier). Renderer never sees any token. _(`electron/main/auth/{oauth,loopback,pkce}.ts`.)_
- **Server verifies the ID token only** — never participates in code exchange. Auto-registers new practitioners (progressive registration, old ADR-0015), issues RS256 server JWT + refresh + license JWT. _(Go modular monolith, `apps/server/internal/subsystems/identityaccess/auth/`.)_
- **Single `safeStorage` blob** (`auth.bin`) held everything: Google refresh token, `sub`/name/email/picture, server refresh token, license JWT, `calendarGranted`, `dpdpAcknowledgedAt`.
- **Raw `ipcMain.handle('auth:*')` channels** for signin / getSession / updateProfile / acknowledgeDpdp / logout / hasCalendarAccess.
- **Subscription/licensing** (old ADR-0013): server JWT (~15 min) + long-lived license JWT for offline feature gating; plan as a string claim; grace-period semantics on server unreachability.

## Decision

### Part A — Client identity (committed)

**A1. OAuth runs in Main.** Keep the old PKCE + loopback design — it already satisfies ADR-101 (Main is the local-privileged broker; renderer untrusted) and ADR-203 (renderer never holds tokens). The PKCE/loopback/state logic from the old repo is reusable near-verbatim.

**A2. Renderer reaches it through a capability, not raw IPC.** Per ADR-202/103 the auth surface is an `AuthService` capability behind `window.soam`, with a branded `ServiceId`, not ad-hoc `ipcMain.handle('auth:*')` channels. The renderer asks for operations (sign-in, sign-out, "am I signed in") and receives only safe derived state — never tokens (ADR-304 §"renderer never sees credentials").

**A3. Storage decomposes into the typed CredentialStore + Local Store + consent ledger.** The single `auth.bin` blob is dissolved:

| Old blob field | New home | Rationale |
|---|---|---|
| Google refresh token | CredentialStore, new type (e.g. `google-oauth-refresh`), **kek-wrapped** | High walk-up impact; ADR-304/307 O307f |
| server refresh token / session | CredentialStore `cloud-session-token`, **kek-wrapped** | Reserved by ADR-304; O307f |
| `sub`/`googleId`, email | per-workspace `identity.envelope` (KEK-encrypted) | ADR-501/307 identity binding |
| name / picture / profile fields | Local Store (operational data) | ADR-304: operational data is not a keychain tenant |
| `dpdpAcknowledgedAt` / consents | Consent ledger (ADR-502) | Consent records have their own home |
| license JWT | deferred (Part B) | no licensing until backend lands |

Exact credential-type names and per-type wrap policy are settled at implementation under O307f/O307g.

**A4. Identity is workspace-scoped.** Old auth was a single global account. Here identity binds to the active workspace's Entity (ADR-501): email/`googleId` land in that workspace's `identity.envelope`; CredentialStore keys are `workspaceId`-namespaced (ADR-304). Switching workspaces is sign-out + sign-in (ADR-403). The stable `{ email, googleId }` interface of `mock-oauth.ts` is the seam real OAuth slots into.

**A5. Thin first slice.** The committed slice is **identity only** — obtain a verified `{ email, googleId }`, bind it to the workspace, replace the mock. No refresh/access token storage (no consumer yet, and no workspaceId/KEK exists at the point OAuth fires), no server round-trip, no calendar, no licensing. Those are deferred (Part B; ADR-310; O309a).

**A6. Credential delivery (dev vs prod).** The flow needs a Google OAuth `client_id` and (for "Desktop app" clients) a `client_secret`, read by Main from `process.env`.

- **`client_id` is not secret** — it appears in the authorization URL and is safe to ship.
- **The Desktop-app `client_secret` is a pseudo-secret.** Per Google's installed-app model, a desktop client cannot keep a secret confidential; security rests on **PKCE + loopback**, not on the secret. Shipping it in a desktop binary is accepted practice, but a leaked `client_id`+`client_secret` lets a third party impersonate this OAuth client (phishing under the app's identity) — a bounded but real risk for a PHI product.

Delivery by environment:

- **Dev (committed):** credentials live in a **repo-root `.env`** loaded by the `justfile`'s `set dotenv-load`, inherited by `cd apps/desktop && pnpm run dev` into Main's runtime `process.env`. **Not** `apps/desktop/.env` — Vite's `loadEnv` only injects `import.meta.env.VITE_*`, never `process.env.GOOGLE_*` into Main, and inlining the secret via Vite `define` would bake it into the production bundle. A root `.env.example` documents the contract. `.env` is gitignored. When Main reads an empty `client_id`, the `platform.auth` capability returns `not-configured` and the renderer falls back to the mock dialog.
- **Prod (partial — O309c):** the packaged app has no `just` and no `.env`; runtime `process.env` is empty, so the dev mechanism does not carry over. Prod credential delivery is **intentionally unsolved here** and coupled to Part B (O309a), because (1) real identity OAuth has no prod consumer until cloud sync lands (Phase 11/12), and (2) the correct prod shape ships **no** secret — the Cloud Backend performs the code exchange, the client carries only `client_id`. A pre-backend prod build that needs identity is the only case requiring the stopgap: build-time injection of `client_id`+`client_secret` into the Main bundle (a small code path, since packaged runtime `process.env` is empty), accepting the desktop pseudo-secret caveat above. **Stopgap now implemented:** Vite `define` in `vite.main.config.ts` bakes `OAUTH_BUILD_CLIENT_ID` / `OAUTH_BUILD_CLIENT_SECRET` (set in the packaging environment only, distinct from the dev `GOOGLE_*` runtime vars) into `__OAUTH_CLIENT_ID__` / `__OAUTH_CLIENT_SECRET__`; `oauth.ts` falls back to these after `process.env` — empty baked string still yields `not-configured`.

### Part B — Cloud Backend identity service (deferred, Proposed direction)

When the Cloud Backend zone (ADR-101, stubbed today) lands its identity service in Phase 11/12:

- **Posture: rebuild aligned to current zone contracts, retrofit salvageable pieces from the old Go server.** Not a lift-and-shift. The new design starts from ADR-101/203/303/501 and pulls in old code only where it already fits.
- **Token-exchange home is reopened.** The old client bundles a Google `client_secret` in Main (a desktop "public client" — tolerable with PKCE but a flagged anti-pattern). When the backend exists, moving code exchange server-side removes the bundled secret. Decide at build time (trade: extra hop vs no client secret).
- **ID-token-only verification** boundary is retained: the backend verifies a Google ID token and never participates in code exchange.
- **Progressive registration** (old ADR-0015): verify auto-registers a minimal account; profile completed later. Re-home profile to Local Store + Cloud Backend operational sync, not a signup wall.
- **Subscription/licensing** (old ADR-0013): server JWT + offline license JWT, plan-as-claim, grace-period semantics. This is a substantial surface and gets its **own ADR** when taken up; recorded here only as a pointer.

### Salvage inventory (old `~/Repos/msh/ru-soam`)

Reusable with light adaptation: `electron/main/auth/{oauth,loopback,pkce,token}.ts` (PKCE/loopback/state, in-memory access-token refresh). Reusable as **design reference** for the backend rebuild: `apps/server/internal/subsystems/identityaccess/auth/` (verify, RS256 JWT, refresh rotation, progressive-registration handler), old ADR-0013 (subscription/license model) and ADR-0015 (progressive registration). **Must not** be ported as-is: `safe-store.ts` (single blob), `ipc/identityaccess.ts` (raw channels), combined calendar+identity scopes (→ ADR-310).

## Consequences

### Positive

- The Phase-9 mock seam (`mock-oauth.ts`) means real OAuth drops in behind a stable interface with no UI churn.
- Storage decomposition aligns identity secrets with the existing CredentialStore + KEK-wrap discipline; secrets become walk-up-resistant for free (ADR-307).
- Recording the backend posture now lets Part A bind to a known contract without committing backend mechanism prematurely.

### Negative

- Decomposing one blob into three homes (keychain / Local Store / consent ledger) is more moving parts than the old single file.
- Deferring the backend means the thin slice has no server-side verification — `googleId` is client-asserted until Part B lands. Acceptable for local-only identity capture (consistent with ADR-501 "no anonymous workspaces, identity capture ≠ sync transport").

### Neutral

- The old Go server remains a private reference; nothing in this repo depends on it.

## Considered Options

- **Lift-and-shift the old desktop + Go server** — _Rejected_: conflicts with ADR-202/203/304/307/501 (raw IPC, single-blob storage, global non-workspace identity).
- **Build full identity + backend + subscription now** — _Rejected_: scope; backend is gated on the Cloud Backend zone and cloud sync (Phase 11/12).
- **Client identity now (Part A), backend deferred as rebuild-with-retrofit (Part B)** _(chosen)_ — smallest committed surface, honours the existing O307g seam, records the deferred direction.

## Open Items

- **O307g** — Real Google OAuth integration (Part A). Now scoped by this ADR: PKCE+loopback in Main, capability surface, storage decomposition, workspace binding.
- **O307f** — Per-credential wrap policy; settles `google-oauth-refresh` / `cloud-session-token` raw-vs-kek-wrapped.
- **O309a** — Cloud Backend identity service design (Part B): verification, JWT, refresh rotation, token-exchange home (Main vs backend / client-secret removal). Own ADR when taken up. Phase 11/12.
- **O309c** — Prod OAuth credential delivery (§A6). Dev uses root `.env`; packaged builds have no `.env`/`just`, runtime `process.env` is empty. End state: Cloud Backend does the exchange, client ships only `client_id` (folds into O309a). Stopgap if a pre-backend prod identity build is needed: build-time inject `client_id`+`client_secret` into the Main bundle. Gated on Part B unless a prod identity build is forced earlier.
- **O309b** — Subscription & licensing model (old ADR-0013 successor): server JWT + offline license JWT, plan-as-claim, grace period. Own ADR. Gated on Part B.
