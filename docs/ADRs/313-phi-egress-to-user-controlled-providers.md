# PHI egress to user-controlled providers: the consented gradient + PHI Safety Score

**ID:** ADR-313
**Status:** Accepted
**Date:** 2026-06-16
**Layer:** domain-policy (rests on base mechanisms)
**Supersedes:** —
**Superseded by:** —
**Refines:** ADR-301 (does not supersede — narrows one carve-out; 301's core invariant stays Final)
**Related:** ADR-301 (PHI boundary), ADR-303 (PHI sync/backup E2EE), ADR-305 (third-party provider credentials), ADR-507 (Schedule), ADR-508 (Sessions / Client Meeting), ADR-502 (audit ledger)

## Context

ADR-301 (Final) makes "PHI reaching the cloud" **structurally impossible** — the wrong thing
can't happen, not merely discouraged. That invariant is correct and stays.

But mental-health practitioners today live almost entirely inside **provider-hosted calendars**
(Google, and via tools like Calendly / SimplePractice). Client-identifying appointment data is
**already in those providers**, trusted by the practitioner or their institution. A product that
demands a hard PHI wall from first launch (a) cannot meet users where they are, (b) reads as a
lock-in tactic (without us, they lose access to their own data), and (c) cannot wean them off
PHI-permissive tools.

The key distinction ADR-301 never had to draw: **PHI → *our* backend** (which we host, ADR-303)
is categorically different from **PHI → the *user's own* third-party account** (which they already
control, where we act as their *agent over their own data*, not as a custodian shipping PHI to us).
ADR-301's structural prohibition is really about the former. The latter needs its own, narrower,
honest treatment. ADR-313 supplies it.

## Decision

The PHI boundary splits into **two scopes**, governed differently:

### 1. PHI → our backend / sync cloud (ADR-303): never. Absolute. Structural. Unchanged.

This is ADR-301 proper. No consent toggle, no gradient. Frozen.

### 2. PHI → the user's own third-party provider: a bounded, audited, default-off, *interim* gradient

The app may exchange PHI with a provider the **user themselves controls**, under tight conditions:

- **Default-off.** Out of the box the app does **no PHI read and no PHI write** to any provider.
- **Two separate, explicit opt-ins** — **PHI-read** (ingest existing provider PHI) and **PHI-write**
  (write client-identifying detail to the provider) — each its own consent step, each with its own
  distinct impact on the PHI Safety Score (§3).
- **Interim, not a resting place.** The end state is full ADR-301 (PHI custody fully local; the
  provider holds only PHI-free scheduling substrate). The gradient exists to be *driven to zero*.
- **Honesty rule (binding on all downstream docs/UX).** Writing PHI to a provider — even consented
  and audited — is **the app originating a PHI egress**. Audit makes it **accountable, not
  compliant**. We state it as: *"301-compliant against our cloud (absolute); a recorded, user-owned,
  actively-closing deviation against the user's own provider."* We never relabel "audited" as
  "compliant."
- **Every PHI read/write to a provider is recorded in the audit ledger (ADR-502).**

### 3. PHI Safety Score — first-class concept, and the *engine*

A score (scale TBD — O483) measures how much of the practitioner's PHI exposure still rides on
providers. It is **not a passive dashboard** — it is the mechanism that nudges users toward the end
state: tracks progress in numbers, flags deviation, and each PHI-bearing opt-in moves it. The score
is the lever that makes the gradient self-closing.

### 4. The adoption ramp (provider stays the scheduling source-of-truth throughout)

1. **Read-as-is** — read PHI already in the provider (continuity, no disruption). *(PHI inflow, §5.)*
2. **Optional PHI-free writes** — write **opaque blocks** ("Busy"/token, no name). The safe write mode.
3. **Export PHI out** — custody with us is never lock-in.
4. **Turn off PHI writes** → provider becomes the PHI-free scheduling substrate only = the ADR-301
   end state. Far-future possibility: our own secured calendar tool. Out of scope here.

### 5. "Read" is PHI *inflow*; filter by individual, not by calendar

Reading provider PHI pulls it into our process — we become a processor of it. Therefore:

- **No hard "dedicated calendar" constraint.** Instead the **client roster is the filter lens**: an
  item not linked to a managed client is out of scope / invisible (personal life filters itself out).
- **Processing rule:** ingest → match-to-client → **persist only linked; discard unlinked.** Personal
  / unlinked data is never stored.
- The matching (provider record → client) is the **same seam** for both directions — surfacing
  existing clients *and* onboarding new ones from the provider. See ADR-508 §identity-resolution.

## Consequences

### Positive

- Meets practitioners in their current reality; offers a non-disruptive, anti-lock-in migration path.
- The score turns a would-be contradiction ("we say PHI never leaves, yet here's a PHI write") into a
  guided, measurable journey with a defensible default (off).
- The whole PHI-egress policy localizes to one place (the Sessions↔provider sync, ADR-508) rather than
  smearing across every surface.
- ADR-301's structural guarantee against *our* cloud is untouched and still Final.

### Negative

- We ship a path that *can* place PHI on a third party — a real trust/liability surface. Mitigated by:
  default-off, double opt-in, full audit, export, and the score actively closing it.
- "Accountable, not compliant" must be honoured in copy; sloppy messaging could imply false compliance.
- A shared personal+professional calendar means reads transiently ingest non-client data (discarded per §5).

## Considered Options

- **Hard ADR-301 wall from day one** — _Rejected_: no adoption path, reads as lock-in, can't wean users off PHI-permissive tools.
- **E2EE provider event payloads (BYOE)** — _Rejected_: the provider can't reason over ciphertext → kills free/busy, reminders, the practitioner's unified calendar; defeats the point of using a provider.
- **Consented, audited, default-off, score-driven *interim* gradient** _(chosen)_ — honest about egress, bounded, self-closing toward the ADR-301 end state.

## Open Items

- **O483** — PHI Safety Score scale design: what it measures, the number, how each opt-in moves it, deviation flagging. Lands with the PHI ramp (Schedule P2).
- Downstream homes: the gradient mechanism is exercised by ADR-507 (Schedule UI) + ADR-508 (Sessions↔provider sync, where the ramp localizes).
