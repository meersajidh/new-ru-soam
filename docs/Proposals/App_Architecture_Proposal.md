# Networking & Authority Architecture for Electron Desktop Platform

**Status:** Proposed

---

## Context

The application is a desktop platform built using:

- Electron
- TypeScript
- React SPA renderer

The application must interact with:

1. First-party backend services
2. Third-party APIs
3. User-provided API keys

The key architectural challenge is determining:

- where authority should reside,
- how networking should be performed,
- how secrets should be managed,
- and how Electron security boundaries should be enforced.

---

## Architectural Principle

The platform adopts the principle of:

### “Authority Zones”

```text
Renderer
    ↓
Main Process
    ↓
Remote Backend
```

Each layer owns distinct responsibilities and trust boundaries.

---

## Authority Zone Definitions

### 1. Renderer

The renderer is the UI capability layer.

Responsibilities:

- React UI
- state management
- views/editors/panels
- user interaction
- presentation logic

Security assumptions:

- semi-trusted
- sandboxed
- compromise-resistant but not fully trusted
- should not own privileged authority

The renderer, similar to a browser tab, should not be considered a secure authority boundary.

---

### 2. Main Process

The main process is the local privileged runtime authority.

It is NOT considered a backend server.

Responsibilities:

- OS integrations
- IPC routing
- protocol handling
- secure networking mediation
- credential storage access
- extension/runtime orchestration
- permission enforcement

The main process acts as:

- local authority layer
- desktop desktop kernel / capability broker
- security mediation layer
- network governance layer

---

### 3. Remote Backend

The backend refers to cloud/server infrastructure.

Responsibilities:

- account systems
- billing
- quotas/rate limiting
- synchronization
- app-owned secrets
- third-party provider secrets

The backend is the only environment suitable for storing application-owned secrets.

---

## Core Security Principle

### Renderer Is Not Trusted With Authority

The architecture assumes eventual renderer compromise is possible.

The renderer:

- runs untrusted-by-default content (web technologies)
- carries browser-like attack surfaces
- is the most exposed process in the application

Therefore:

- secrets must not be renderer-owned
- renderer should not directly access privileged APIs
- renderer should operate through constrained capabilities

---

## Decisions

The platform will adopt:

### Capability-Brokered Architecture

```text
Renderer (UI)
    ↓
Preload (minimal bridge)
    ↓
Main Process (authority broker)
    ↓
Remote Services / APIs
```

---

### Networking: Public/Anonymous APIs

Renderer may call directly using HTTP/fetch when:

- no secrets are involved
- requests are public
- compromise impact is low

Examples:

- CDN assets
- public metadata
- anonymous content

---

### Networking: Authenticated APIs

Authenticated or sensitive requests must NOT originate directly from renderer.

Recommended flow:

```text
Renderer
   → privileged API request
      → Main process broker
         → remote API
```

The main process injects:

- auth tokens
- headers
- provider credentials
- session state

Renderer never directly owns persisted credentials.

---

### Third-Party API Key Strategy

#### User-Provided Third-Party API Keys

The application supports user-provided API keys.

Recommended flow:

```text
Renderer
	→ request operation
		→ Main Process
			→ retrieve secure credential
			→ perform provider request
			→ stream/sanitize result
```

API keys should be stored using:

- OS keychain
- Electron safe storage
- encrypted local credential store

The renderer:

- does not persist keys
- does not own credential storage
- does not directly manage secret lifecycle

The main process:

- stores credentials securely
- injects credentials into outbound requests
- governs provider access

#### App-Owned Third-Party Credentials

Mandatory architecture:

```text
Renderer
	→ request operation
		→ Main Process
			→ Remote Backend
				→ Third-Party Provider
```

App-owned provider credentials must never:

- exist in renderer
- exist in preload
- exist in main process
- ship inside the desktop binary

---

## Preferred Networking Mechanism

### Brokered Networking

The primary architectural motivations are:

| Concern                    | Benefit                                   |
| -------------------------- | ----------------------------------------- |
| Capability governance      | Centralized authority                     |
| Extension isolation        | Safer plugin ecosystems                   |
| Trust partitioning         | Different surfaces, different permissions |
| Network policy enforcement | Domain allowlists, restrictions           |
| Session management         | Unified auth lifecycle                    |
| Observability              | Logging/tracing                           |
| Retry/caching policies     | Desktop UX improvements                   |
| Future extensibility       | Cleaner platform evolution                |

---

It basically involves:

#### Privileged Protocol + Minimal IPC

Example:

```ts
fetch('app://api/chat');
```

handled via:

```ts
protocol.handle(...)
```

Advantages:

- browser-native fetch semantics
- streaming support
- centralized auth injection
- centralized auditing/logging
- reduced IPC surface
- simpler security enforcement

---

#### Preload Philosophy

The preload layer must remain intentionally minimal.

Good preload examples:

```ts
openExternal();
selectFile();
showSaveDialog();
```

Bad preload examples:

```ts
database.query();
network.fetch();
executeAnything();
```

Preload APIs should expose:

- narrow capabilities
- strongly typed contracts
- explicit permissions

not unrestricted system access.

---

## Electron Security Baseline

The application will enforce:

```ts
contextIsolation: true;
sandbox: true; // To be verified for ESM
nodeIntegration: false;
```

Additionally:

- strict Content Security Policy
- IPC sender validation
- isolated worlds
- minimized preload surface
- no unrestricted remote module usage

---

### Preferred Modern Electron Pattern

#### Avoid Large Generic Bridges

Avoid:

```ts
window.api.network.fetch();
window.api.fs.executeAnything();
```

Prefer:

- narrow capability APIs
- protocol-based networking
- explicit permission boundaries

---

#### Recommended Networking Pattern

Preferred:

```text
Renderer
   -> fetch(app://backend/...)
```

Handled by:

- Electron protocol handlers
- main process broker
- controlled outbound networking layer

This preserves:

- browser-like fetch ergonomics
- streaming support
- centralized authority

while improving:

- governance
- isolation
- long-term maintainability

---

#### Threat Model Assumptions

The architecture assumes:

- renderer compromise is possible eventually
- attack surface expands as new capabilities are added
- long-lived desktop sessions require stricter authority boundaries

Therefore:

- renderer is not treated as a privileged authority
- authority is centralized in brokered/local service layers

---

## Rationale

This architecture provides:

### Security

- minimizes credential exposure
- isolates privileged authority
- reduces renderer attack impact

### Extensibility

Allows new capabilities to be added behind capability contracts without major architectural rewrites.

### Maintainability

Separates:

- UI concerns
- local platform concerns
- cloud/business concerns

into clear authority boundaries.

### Scalability

Allows independent evolution of:

- renderer UI platform
- desktop runtime
- backend services

---

## Consequences

### Positive

- stronger security posture
- clean privilege boundaries
- future-proof extensibility
- easier auditing and observability
- safer plugin architecture

### Negative

- additional architectural complexity
- more IPC/protocol infrastructure
- increased abstraction layers
- more deliberate API design required

These tradeoffs are considered acceptable for a platform-oriented desktop application.

---

## Final Architectural Position

The application adopts the following principle:

### “Renderer is a UI capability layer, not the authority layer.”

Authority resides in:

- Main process (local privileged authority)
- Backend services (global/cloud authority)

not inside renderer-owned application logic.

### Recommended Architecture

```text
[ Renderer ]
- React SPA
- sandboxed
- no persistent secrets
- capability-oriented APIs

        |
        v

[ Main Process Broker ]
- secure credential access
- protocol handlers
- network governance
- capability enforcement
- user-owned third-party provider orchestration
- extension/runtime isolation

        |
        v

[ Remote Backend ]
- business authority
- app-owned secrets
- billing/quotas
- app-owned third-party provider orchestration
```

---
