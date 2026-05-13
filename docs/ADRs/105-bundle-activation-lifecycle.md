# Bundle activation lifecycle

**ID:** ADR-105
**Status:** Accepted
**Date:** 2026-05-12
**Supersedes:** —
**Superseded by:** —
**Related:** ADR-103, ADR-104

## Context

ADR-104 defines bundles as the registrable unit and contribution points as the slots they fill. It does not say when a bundle's code runs, when its contributions become visible to consumers, or what happens when one fails. Loading every bundle at boot is wasteful; loading none is broken. A defined lifecycle is required so that bundle authors and the shell agree on when registration is valid, when it is torn down, and how failures are contained.

## Decision

Each bundle declares an **activation trigger** and exposes an **activation function**. The platform owns the lifecycle.

### Triggers

A bundle declares one of:

- **`eager`** — activate at platform boot. Reserved for bundles the shell cannot start without (e.g., command palette, settings substrate).
- **`lazy`** — activate on first consumer touch (first command invocation, first view mount, first capability bind). Default for most bundles.
- **`onEvent`** — activate when a named platform event fires (e.g., opening a specific document type). Used when "first touch" is too coarse.

### Activation function

A bundle exports a single activation function. It registers contributions, binds capabilities, and returns a **disposable** — a single value the platform calls to tear the bundle down. Anything the activation function created and registered is released through that disposable.

The activation function is async. It may fail.

### Disposable convention

The platform adopts a uniform **disposable** convention. Every registration in the platform — contribution registration, capability binding, event subscription — returns a value with a single, idempotent `dispose()` operation that releases what it holds. Disposables are composable: a bundle accumulates them during activation and returns one aggregate disposable to the platform, which calls it on deactivation.

This is the cleanup idiom across the platform, not a lifecycle-only mechanism. A bundle author who learns it once knows the shape of teardown everywhere.

For elaboration and examples, see the [Disposable pattern guide](../Guides/disposable-pattern.md).

### Ordering and dependencies

A bundle may declare dependencies on other bundles. The platform activates dependencies first. Cycles are rejected at registration; this is a development-time error, not a runtime one.

### Failure isolation

If a bundle's activation function throws, the platform:

- does not register any of that bundle's contributions,
- emits a user-visible error scoped to that bundle,
- continues activating other bundles. A failed bundle does not bring down the shell.

Consumers of contributions that never registered see an empty contribution set, not a crash.

### Idempotency

Within a session, activation is idempotent. Re-requesting activation of an already-active bundle is a no-op. Deactivation followed by activation is allowed; both run their full work.

### Deactivation

Deactivation invokes the disposable returned by activation. The shell must tolerate bundles arriving and leaving without restart. Deactivation is not a routine production event but is required for tests and for any future dynamic-loading story.

## Consequences

### Positive

- Boot cost stays proportional to eager bundles only.
- Bundles fail in isolation; one bad bundle does not break the shell.
- Tests activate a reduced bundle set deterministically.
- The platform retains the right to move activation policy (e.g., from lazy to eager for performance) without bundle author cooperation.
- A single disposable idiom across the codebase reduces ad-hoc cleanup patterns and makes leaks visible at the registration site.

### Negative

- Bundle authors must think about activation triggers, not just code. _Mitigated by the [feature development guide](../Guides/feature-development.md), which adds activation-trigger selection to the checklist._
- Async activation forces shell consumers to tolerate empty contribution sets transiently. The shell's iteration code must handle this; iteration-time crashes on missing entries would defeat failure isolation.

### Neutral

- Disposables become a uniform pattern across the platform. Worth standardising once, used everywhere.

## Considered Options

- **All-eager** — _Rejected_: boot cost grows linearly with bundles; no isolation; one slow bundle blocks startup.
- **All-lazy via plain `import()`** — _Rejected_: no deactivation, no dependency ordering, no failure isolation. Reduces the lifecycle to side effects.
- **Author-controlled lifecycle (each bundle wires its own loader)** — _Rejected_: lifecycle leaks into bundle code; platform loses the ability to enforce isolation, ordering, idempotency.
- **Platform-owned lifecycle with declared triggers and disposables** _(chosen)_ — Bundles state intent (trigger), the platform runs the machinery (ordering, isolation, idempotency, teardown).

## Open Items

- **O6** — Default trigger and selection criteria. Lean toward `lazy` as default with `eager` only by justification; criteria not yet committed.
- **O8** — Dependency declaration form (manifest vs code).
- **O9** — Hot reload of bundles in development. Not required for production but valuable for developer experience.
