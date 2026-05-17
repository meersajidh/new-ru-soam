# Contribution model for bundle registration

**ID:** ADR-104
**Status:** Accepted _(amended 2026-05-16 — manifests are read by Main; Renderer receives the contribution registry as a data payload per ADR-410)_
**Date:** 2026-05-12
**Supersedes:** —
**Superseded by:** —
**Related:** ADR-102, ADR-103, ADR-105, ADR-410

## Context

ADR-103 establishes capabilities (typed contracts) and services (implementations). That handles how a unit of work **consumes** behaviour from the rest of the platform. It does not address the inverse direction: how a unit **publishes** its own UI surfaces, commands, settings, validators, and other registrable entries back into the platform shell.

Without a defined mechanism, the Renderer shell ends up hardcoded against each unit: menu strings live in the shell, command IDs live in the shell, validators are imported at the shell, settings panels are wired in by hand. The shell becomes a registry-by-accident, and every new unit requires editing shell code. This is the failure mode VSCode avoided by formalising **contribution points** (`contributes.commands`, `contributes.menus`, `contributes.configuration`, `contributes.jsonValidation`, and so on). Even with no third-party extensions, contribution points keep internal modules decoupled from the workbench shell. The same modularity is needed here.

The mental-health workbench will accumulate registrable surfaces at the same rate any platform does — clinical note types, assessment tools, scheduling surfaces, exports, audit views. Each needs a defined way to surface itself without modifying the shell.

A separate concern is validation. ADR-102 commits to "the same rule, consumed at the Renderer for convenience and at the authority for enforcement". That rule has to live somewhere registrable. Contributions are the natural home.

## Decision

The platform adopts a **contribution model**. The registrable unit is the **bundle**.

### Terminology

- **Bundle** — the architectural unit of registration. A bundle bundles the capabilities it consumes (per ADR-103) and the contributions it publishes (this ADR).
- **Feature** (product term) — a user-facing capability of the product. A feature is implemented as one bundle, or by composing multiple bundles. The term "feature" is used freely in product conversations; architecturally, the registrable unit is the bundle.

### Contribution point

A **contribution point** is a typed slot in the platform that a bundle may register against. Each contribution point has:

- a **name** (e.g., `commands`, `views`, `settings`, `validators`, `menus`),
- a **typed schema** for entries,
- a **consumer** — the shell module or other bundle that iterates registered entries and acts on them.

Contribution points are owned by the platform. Bundles do not invent contribution points casually; a new contribution point is a platform-level change.

Contribution point names above are illustrative. The concrete catalogue will grow as the platform is built; this ADR does not commit to that catalogue.

### Capabilities vs contributions

The two concepts are duals:

- **Capabilities** are what a bundle **consumes** from the platform — contracts the bundle does not own.
- **Contributions** are what a bundle **publishes** to the platform — entries the platform does not own.

Most bundles do both.

### Validation as a contribution

Validation rules are first-class contributions. A rule is declared once, registered through the appropriate contribution point, and consumed at two sites:

- the Renderer, for convenience UX (live feedback, inline errors),
- the authority that owns the data, for enforcement on write.

This concretises ADR-102 §"Validation: convenience vs enforcement". There is no second copy of the rule; both sites read from the same contribution registry.

### Activation and declaration form

The lifecycle that governs when a bundle is loaded, when its contributions go live, and when they are torn down, is the subject of ADR-105. The shape in which contributions are declared (programmatic, manifest, hybrid) is also deferred — see Open Items.

### Manifest read site

Per ADR-410, bundle **manifests are read by Main at boot**, not by Renderer-side import. Main parses each manifest as data, populates the platform-side contribution registry, and sends a snapshot of the registry to the Renderer over IPC. The Renderer never imports or executes bundle code in order to know what a bundle contributes; menus, commands, view-container entries, and other manifest-declared contributions are populated from the snapshot. Bundle code itself runs only later, in the Bundle Host, when activation fires (per ADR-105 / ADR-410).

> **Amendment (2026-05-16, per ADR-410):** the boot path is now concretely landed. Main reads `manifest.json` for every bundle directory at boot; capabilities and views are registered eagerly into the contribution registry; bundle code is loaded lazily into the Bundle Host on activation. The manifest reader lives at `apps/desktop/electron/main/bundle-host/manifest.ts`.

## Consequences

### Positive

- The shell does not need to know about individual bundles. It iterates contributions.
- Bundles compose by addition. New surfaces (a new menu, a new view) do not require editing the shell.
- Validation rules cannot diverge between Renderer and authority — both consume the same contribution.
- Future extensibility (third-party bundles, if and when desired) drops in behind the same model. No retrofit.
- Test environments can register a reduced contribution set to isolate bundles under test.

### Negative

- Designing a contribution point is platform-level work. A bundle that "just needs a small new surface" may surface a missing contribution point first. _Mitigated by an escalation note in the [feature development guide](../Guides/feature-development.md): bundle authors do not invent contribution points; they request them from the platform team._
- Two concepts (capabilities, contributions) instead of one. Bundle authors must learn the distinction. _Mitigated by the bundle anatomy section of the [feature development guide](../Guides/feature-development.md), which structures the design walk-through so the two concepts are encountered in order._

### Neutral

- The contribution registry is platform code with similar trust weight to the capability registry. It is reviewed with the same care.

## Considered Options

- **Hardcoded shell with feature flags** — _Rejected_: every unit edits the shell. The shell becomes the bottleneck and the registry-by-accident this ADR exists to avoid.
- **Contribution model only for third-party extensions** — _Rejected_: punts internal modularity until extensions land, then forces a costly retrofit. VSCode's experience is the cautionary tale.
- **Single fused "module" concept covering both consumption and publication** — _Rejected_: capabilities (consumed contracts) and contributions (published entries) have different lifecycles, different ownership, and different trust implications. Fusing them obscures both.
- **Typed contribution points, registrable per bundle** _(chosen)_ — Mirrors VSCode's mature shape and decouples the shell from bundle code without coupling the model to an extension story.

## Open Items

- **O5** — Declaration form: programmatic `register()` calls, declarative manifest (JSON/TS literal), or hybrid (manifest for static surfaces, code for dynamic).
- **O7** — Contribution point catalogue: initial set of contribution points the platform commits to (commands, views, settings, validators, menus, keybindings, …) and the criteria for adding new ones.
