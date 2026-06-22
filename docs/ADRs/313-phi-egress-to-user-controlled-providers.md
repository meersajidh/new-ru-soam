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

- **O483 — CLOSED/REVERSED.** Read-half (PHI-read opt-in + gate + score engine + P-D status-bar chrome) built + dogfooded, then **removed by Amendment 2** (reading the user's own provider PHI locally is not an egress → no gate; the read-half does not belong in the score). Linking is now always-on. The **whole PHI Safety Score is deferred to O499** and rebuilt there keyed to write-back egress. Am1's read-half metric (A1.1–A1.2) is withdrawn.
- **O499** — write-half: calendar write-back + the single **PHI-write** opt-in + the Safety Score (rebuilt fresh, keyed to write-back egress). The only direction that originates a real PHI egress.
- Downstream homes: the gradient mechanism is exercised by ADR-507 (Schedule UI) + ADR-508 (Sessions↔provider sync, where the ramp localizes).

---

## Amendment 1 — PHI Safety Score scale (resolves §3 / O483 scale design) — 2026-06-20

§3 fixed the score as a first-class, gradient-closing **engine** but left the metric open (O483). This
amendment fixes the metric. It does **not** change §1 (cloud = absolute) or the default-off / double-opt-in /
audit / honesty posture.

### A1.1 — The metric: 0–100, "% of clinical scheduling PHI kept local"

100 = the ADR-301 end state (the provider holds only PHI-free scheduling substrate; the app introduces no
provider-resident client PHI). The number falls as provider-resident client PHI exists and as PHI-bearing
opt-ins are enabled. It is computed in the **Sessions FP-Host bundle** (owns `client_meeting`); the output is a
**PHI-free aggregate** (a number + counts), so it crosses to the renderer without a new trust crossing.

**Factors:**

| factor | source | note |
|---|---|---|
| `readOptIn` | pref `sessions.calendarPhiReadOptIn` (default `false`) | the **gate** — when OFF the app reads/links no provider PHI; nothing to measure |
| `writeOptIn` | pref `sessions.calendarPhiWriteOptIn` (default `false`) | **always `false` until O499** (write-back deferred); reserved factor |
| `M` | count of provider-origin linked `client_meeting` rows | the denominator |
| `E` | of `M`, those whose provider event still carries client-identifying detail | **v1: `E = M`** — with no opaque-write path yet, every provider-linked meeting names its client. Reserved so O499 write-back lowers `E` and raises the score |

### A1.2 — The formula

```
readOptIn = false                        → 100
readOptIn = true                         → max(0, 100 − round(60 · E / max(M,1)) − (writeOptIn ? 40 : 0))
```

- read-off → **100** (default ADR-301 posture).
- read-on, `M = 0` (opted in, nothing linked yet) → **100** (nothing exposed).
- read-on, provider events name clients (`E = M`, the v1 norm) → **40** (a recorded deviation).
- + write-on (O499) → toward **0** at max exposure, climbing back as write-back opaques events (`E` falls).

The weights **`60 / 40`** are the single tunable; this amendment fixes them and they are revisited when O499
lands. **Deviation flag = `readOptIn || writeOptIn`** (a non-100 posture that the P-D chrome surfaces).

### A1.3 — Honesty rule binds the chrome copy

The P-D popover (and any surface showing the score) states the posture as a **recorded, user-owned, actively-closing
deviation**, never as "compliant." Concretely, when read-on with exposure it shows e.g. *"Accountable, not
compliant — N client meetings carry identifying detail on your Google calendar."* (§ Decision honesty rule.)

### A1.4 — The gate is a policy, not a single call site

The PHI-read opt-in gates **every** provider→client matching path, not just one. As of build there are two:
Sessions `sync` (the link/orphan engine) **and** the Schedule §6 render-time classification (`schedule.html`
calls `record.patient.query.resolveParticipant` directly). Both must honor the same flag — when read-off, Sessions
`sync` links nothing and classification renders every event `unclassified`. New matching paths added later inherit
the same obligation.

### A1.5 — Deferred to O499 (write-half)

Calendar write-back (`createEvent`/`updateEvent`/`deleteEvent`, opaque "Busy" blocks per §4.2), the **PHI-write
opt-in**, and the `writeOptIn = true` / `E < M` score paths. The factors are reserved here so the metric shape is
stable when O499 lands.

---

## Amendment 2 — read is not egress: drop the PHI-read gate + the read-half score — 2026-06-22

Built, dogfooded, then reversed. Am1 gated **reading** provider PHI behind an opt-in and let that read-half
*lower* the Safety Score. On reflection both were wrong. This amendment removes them. **§1 (PHI → our cloud =
absolute, structural, frozen) is untouched and stays Final** — this only corrects the §2/§3 treatment of the
*read* direction.

### A2.1 — Reading the user's own provider PHI is not an egress; it needs no gate

The read path pulls client-identifying detail **the practitioner themselves put in their own Google calendar**
into our **local** process, matches it to the roster, and persists only linked rows into the **protected
KEK-wrapped store** (erase-cascaded, O490). Nothing crosses a trust boundary the app didn't already cross
(calendar events already enter the renderer as a trusted PHI peer via the `phi:true` lock-gated cap), and
**nothing leaves the device**. Gating a no-egress, all-local correlation behind a consent toggle is consent
theater; worse, **default-off ships a dumb app** — the calendar is dead pixels until the user hunts a setting,
when correlating one's schedule with one's clients *is the product*.

Therefore: **linking is always-on, expected behaviour.** The PHI-**read** opt-in is removed:

- pref `sessions.calendarPhiReadOptIn` — **removed** (orphan values ignored; no migration).
- caps `getPhiReadOptIn` / `setPhiReadOptIn` — **removed**.
- audit kinds `sessions.phi_read.opted_in` / `opted_out` — **removed**.
- The A1.4 "gate is a policy honored by two consumers" obligation is **void** — both consumers (Sessions
  `sync`, Schedule render-time classification) now run unconditionally.

The §5 hygiene rule **stands**: ingest → match-to-client → **persist only linked, discard unlinked**. That was
never the gate; it is good practice and remains.

The "two separate opt-ins" of §2 collapses to **one** — the **PHI-*write*** opt-in (deferred to O499). Writing
client detail *back* to the provider is a genuine app-originated egress and keeps its consent step + audit +
honesty rule. Reading does not.

### A2.2 — The read-half does not belong in the Safety Score

Am1's metric *penalized* the read-half: `E = M` (every provider-linked meeting names its client) dragged the
score to 40. But that naming is the user's **own pre-existing calendar content** — the app **reading** it
locally adds **zero new exposure**. Scoring it punishes the app for data the user placed there by their own
hand, outside the app. Incoherent.

Real exposure lives **only** in the **write-half** (O499): client detail the app writes *back* to the provider,
or (never, per §1) to our cloud. So:

- The **read-half contributes nothing** to the score. With the write-half not yet built, the score has **no live
  input** — it would be a constant "100 / all-safe" badge = false comfort + noise.
- caps `getSafetyScore` — **removed**. The **P-D status-bar PHI-Safety chrome** (chip + `PhiSafetyPopover` +
  `workbench.phi-safety.show`) is **removed entirely**.
- The **PHI Safety Score is deferred whole to O499**, where it is rebuilt fresh keyed to actual write-back
  egress (the only thing that moves PHI anywhere new). The §3 "score = the self-closing engine" intent survives;
  Am1's specific 0–100 read-half formula (A1.1–A1.2) is **withdrawn** and re-derived under O499.

### A2.3 — What survives

§1 (cloud absolute). §2 default-off **PHI-write**. §4 ramp. §5 read-as-inflow + persist-only-linked hygiene.
The score-as-engine *concept* (§3). What's gone: the read gate, the double-opt-in (now single, write-only),
and Am1's read-half metric + its chrome.
