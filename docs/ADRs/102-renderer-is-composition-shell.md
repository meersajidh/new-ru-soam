# Renderer is a composition shell, not an authority owner

**ID:** ADR-102
**Status:** Final
**Date:** 2026-05-12
**Supersedes:** —
**Superseded by:** —
**Related:** ADR-101, ADR-301

## Context

ADR-101 establishes three authority zones and labels the Renderer as the _untrusted boundary_. That label sets a trust level but does not constrain what the renderer is allowed to _do_. Two plausible interpretations remain:

1. The renderer is a normal application that happens to be untrusted at the network edge — it still owns business logic, data models, and feature behaviour internally.
2. The renderer is a composition shell whose job is to render, route, and orchestrate user interaction; meaningful capabilities live in services accessed through contracts.

The first interpretation is the default for SPAs and the default failure mode for Electron desktop apps. Features accrete in the renderer until the renderer becomes the de facto application. When PHI handling, credential access, or privileged operations later need to be added, they end up in the renderer because that is where the application "is".

VSCode's evolution is the canonical lesson: the workbench renderer became a shell — layout, composition, commands, view state — while real capabilities (filesystem, language intelligence, search, terminals, git) moved to services outside the renderer. That separation is what allowed remote development, extension isolation, and process-level performance work to land without rewriting the application.

For a mental health workbench handling PHI, the same separation is not optional. The renderer must not be the place where clinical state lives, credentials are accessed, or privileged operations originate.

## Decision

The Renderer is treated as a composition shell.

The Renderer's responsibilities are scoped to:

- **Presentation** — rendering React components, styling, layout.
- **View state** — ephemeral UI state, selection, focus, panel arrangement.
- **Interaction orchestration** — routing user input to commands and capability calls.
- **Composition** — assembling views from data and capabilities supplied by services.

The Renderer does **not**:

- Own canonical application state. Canonical state lives outside the renderer; the renderer reads projections through capability contracts. _(The specific home of canonical state is deferred — see Open Item O1.)_
- Implement business or clinical logic that must be enforced. Enforcement lives in the authority that owns the data.
- Access OS resources, the filesystem, credentials, or networking directly.
- Hold long-lived secrets, tokens, or PHI in memory beyond the lifetime of a view.

When a feature is added, the default question is _"which service owns this capability and what contract does the renderer call?"_ — not _"where in the renderer codebase does this logic go?"_.

### Validation: convenience vs enforcement

A common pushback is that "form validation is logic, and forms live in the renderer". This ADR distinguishes two roles:

- **Convenience validation** — live form feedback, inline errors, disabled-submit states. Runs in the renderer to make the UI usable.
- **Enforcement validation** — the rule that decides whether a write is accepted. Runs in the authority that owns the data (Main for local writes, Cloud Backend for synced writes).

Both must reference the **same rule**, not two copies. A rule is declared once — schema, semantics, identifier — and registered through the platform's contribution model (subject of a forthcoming ADR). The renderer consumes the registered rule to render feedback. The authority consumes the same registered rule to enforce on write. The renderer never owns the rule; it consumes it.

This is the discipline that prevents "convenience" from drifting into "authority". If a check exists only in the renderer, it is not enforced — it is theatre.

## Consequences

### Positive

- Authority cannot drift into the renderer through casual feature work; the boundary is named, not implicit.
- Future process-isolation work (utility processes, remote execution) lands behind existing capability contracts instead of forcing a rewrite.
- Renderer compromise has bounded blast radius: the attacker gets the UI, not the data store or credentials.
- The architecture matches the actual division of labour between UI engineers and platform engineers.
- Validation rules cannot quietly diverge between UI and authority — they share a registration.

### Negative

- Every new feature requires designing a capability contract before UI work can begin in earnest. Slower than "just call the API from the component".
- Renderer-side code looks thinner than developers accustomed to SPAs expect. Reviewers must resist the temptation to "just put it here for now".

### Neutral

- Cross-zone calls are async by construction. This is the intended discipline, not a regret: synchronous renderer access to authority-owned state would re-couple zones and foreclose the platform shape this ADR exists to enable. Async permits process boundaries, remote execution, lazy loading, and cancellation.

## Considered Options

- **Renderer as full application, with security wrappers** — _Rejected_: keeps authority in the renderer and tries to bolt safety on. Equivalent to the SPA default; fails the PHI boundary (ADR-301) and the trust model (ADR-101).
- **Renderer as dumb view, all logic in Main** — _Rejected as framing_: not wrong in direction, but understates the renderer's legitimate orchestration role and overloads Main with concerns that may belong in the Cloud Backend or in dedicated services. The composition-shell framing is more precise.
- **Renderer as composition shell** _(chosen)_ — Names the renderer's job positively (composition, presentation, orchestration) and negatively (no canonical state, no enforcement, no privileged access). Matches VSCode's mature shape.
