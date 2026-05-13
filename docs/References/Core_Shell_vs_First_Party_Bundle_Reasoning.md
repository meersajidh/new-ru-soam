# Core shell vs first-party bundle: why we keep core minimal

Reference document for the split that will land across ADR-401, ADR-402, and ADR-405. Captures the reasoning behind shipping most of the platform's visible functionality as bundles rather than as built-in workbench code. Read this when you find yourself wondering "why is the Patients view a bundle and not just part of the app?".

## The decision in one line

The **core shell** is the smallest set of code the workbench cannot run without. **First-party bundles** are everything else the platform ships — including features that look like they "belong to the app" — loaded through the same contribution mechanism that third-party bundles use.

## The two categories

### Core shell

Code built into the renderer bundle, present at every boot, not loaded through the contribution system. Includes:

- Layout primitives (the Part abstraction, the root grid, the activity bar / side bar / editor area / panel / status bar containers — *as empty slots*).
- The command service, the command palette, the context-key service.
- The bundle host manager and the capability binding machinery.
- The contribution registry (the place bundles register *into*; not what they register).
- The login / unlock / KEK gate.
- The settings shell — the frame that hosts settings, not the settings content.
- The recovery view shell (per ADR-306).

Core shell code is renderer-trust. It has the same access to `window.soam` that any renderer code has. It is updated when the shell is updated; users cannot disable or replace it.

### First-party bundle

Code shipped by the platform team, packaged the same way third-party bundles are packaged, loaded through the same contribution mechanism, running in the Bundle Host. The first-party catalogue is a product-scope decision, not an architectural one — ADR-405 commits the mechanism and defers the catalogue to a separate product-scoping pass. The only first-party bundle anchored at the architecture level is:

- `ru-soam.audit-viewer` — practitioner-facing audit view (per ADR-502).

Default theme bundles and icon-set bundles are also first-party-shippable but operate as data contributions only.

The examples below — `ru-soam.patients`, `ru-soam.sessions`, etc. — are **illustrative shorthand** for "a first-party bundle that might exist". They are not commitments. Wherever a concrete name appears in this reference, read it as "a hypothetical first-party bundle of that shape".

First-party bundles are bundle-host-trust. They run in the Bundle Host, communicate with Main via IPC, hold no privileged references. They are updated independently of the shell. A user — and especially a clinic with custom workflow needs — can disable them and install third-party replacements.

## Why split this way

There are four threads to the reasoning.

### Thread 1: Dogfooding the contribution surface

The contribution model (ADR-104) commits to a design promise: "core and bundles are equal citizens". That promise is only worth what the implementation makes of it.

If the platform team writes the Patients view as core shell code, with direct imports of internal services, with privileged DOM placement, with shortcuts around the capability contract — then the contribution surface is whatever's left over after we've already shipped the features we cared about. A third-party bundle author trying to write something equivalent will hit walls we never encountered because we routed around them.

If the platform team writes the Patients view as a bundle, registering through the same manifest, binding capabilities through the same IPC, contributing views through the same contribution points — then *every wall we hit is a wall every bundle author hits*. We have an incentive to fix it for everyone, because we're feeling the pain ourselves.

This is the load-bearing argument. The contribution API is honest because we use it for the same features the user thinks of as "the app".

VSCode is the canonical example: its file explorer, search panel, terminal, git integration, and language support are all bundled extensions. Microsoft uses the same `package.json` `contributes:{}` shape every third party uses. When the Git extension needs a new contribution point, Microsoft adds it to the platform API rather than reaching into private internals — and now every other extension can use it too.

### Thread 2: Replaceability and the clinic case

Mental health practice is not uniform. A solo private-practice CBT therapist and a large addiction-treatment clinic with case management, group therapy, and shared MDT records have wildly different needs from a "Patients" view. The platform cannot guess which shape to prefer; it can only commit to one shape and force the other to live with it.

If first-party features are bundles:

- A clinic can disable `ru-soam.patients` and install `acme-clinic.patients` that matches their workflow.
- A research practice can install both side-by-side and switch between them per project.
- A user who prefers a minimal interface can disable bundles they don't use.

If first-party features are core shell:

- The user gets the shape we shipped. Customisation lives in settings flags or in code forks.
- "I don't like the Patients view" becomes "wait for the next platform release" or "patch the source".

The mental-health domain has enough legitimate variation that locking the UI to our one opinion is the wrong default.

### Thread 3: Fault isolation reach

Per the Bundle Host reasoning ([Bundle_Host_Process_Reasoning](./Bundle_Host_Process_Reasoning.md)), bundles run in a separate process. If `ru-soam.patients` crashes:

- As a bundle: the Bundle Host's slice for that bundle crashes. Main detects it, marks the bundle inactive, surfaces a "Patients view is unavailable; restart?" notice. The rest of the workbench keeps running — including the session the practitioner is in the middle of.
- As core shell code: the crash is in the renderer process. Depending on where the exception lands, the workbench either shows a blank screen or quits.

Making Patients a bundle moves its failure into a smaller fault domain. For a clinical product where one practitioner can have one session in progress with one patient, that move is a meaningful reduction in worst-case impact.

### Thread 4: Update cadence

Shell updates touch process model, IPC contracts, capability machinery, security baseline. They warrant care, staged rollout, and possibly clinic-side approval cycles.

Feature updates — a tweak to how the patient list groups, a new template in the library, a sort order in the calendar — should not need that ceremony. As bundles, they ship on their own cadence, can be staged independently, and can be rolled back without touching the workbench.

The user's experience is "a feature improved", not "the platform updated".

## Where the line is drawn

The decision rule, written out:

> Code lives in core shell if and only if **bundles cannot reasonably do it**.

Three flavours of "cannot":

1. **Cannot, because bundles depend on it.** The contribution registry is core because bundles register into it. The capability binding machinery is core because bundles' capability calls flow through it. The Part abstraction is core because bundle views mount into it.
2. **Cannot, because the trust boundary forbids it.** The login / unlock / KEK gate is core because a bundle cannot authoritatively decide who is unlocked. The PHI boundary enforcement (ADR-301) is structural; bundles cannot self-validate their own claims.
3. **Cannot, because the platform must work before any bundle activates.** The empty workbench shell is core — at first paint, no bundle has activated yet, and the user still needs to see *something* (a window with a title bar and a status bar and an empty activity bar is what they see).

Everything else — any feature that operates on platform data through declared capabilities, contributes UI through declared contribution points, and is meaningful only after the platform has booted — is a bundle. First-party or third-party.

## Cost honesty

The minimal-core, bundles-for-everything approach has costs:

- **More upfront contribution-API design.** Before we can ship the Patients view as a bundle, the contribution points it needs (tree views, detail panes, command groups, status indicators) must exist in the platform. We can't take the shortcut of "just write a React tree directly".
- **First-feature lead time is longer.** The first bundle that ships is also the first stress test of the bundle infrastructure. Pre-bundle-infrastructure development looks like "build the contribution system, build the bundle host, build the IPC, build the manifest reader" — and only then does a feature land.
- **The shell, by design, does nothing visible.** A workbench with no bundles activated shows a window, an activity bar with no items, a status bar with no entries, and an empty editor area. This is the right starting state, but it means the platform's perceived completeness depends on bundles, not on the shell binary.

The platform pays these costs because the alternative — shipping features fast by routing around the contribution system — produces an extensibility story that doesn't survive the first third-party who actually tries to build something. We'd rather pay the cost up front than discover, two years in, that our contribution API is a polite fiction.

## What this means for ADR-405

The activity-bar-surfaces ADR will enumerate which top-level surfaces ship as first-party bundles and which (if any) are core shell. Default position: none of them are core shell. The activity bar's slots are core; the items that populate them come from bundles.

The settings surface is a partial exception. The settings *shell* (the route, the persistence, the schema reader) is core because configuration is a contribution point bundles register *into*. The settings *content* — the per-bundle pages — is contributed by the bundles themselves.

## What this is not

- **It is not a commitment to ship everything as a separate bundle.** Closely related features can live in one bundle. `ru-soam.sessions` may include the session editor, the session history view, and the session search — three views, one bundle, one activation surface.
- **It is not a commitment that the platform team writes nothing.** First-party bundles are still written by the platform team. They're just written *through the same door* as everyone else.
- **It is not a commitment that bundles look identical to third-party bundles in marketing or installation.** First-party bundles can be installed by default, can be visually grouped, can carry the platform's brand. The discipline is technical — same contribution API, same process model, same trust level — not presentational.

## See also

- ADR-104 — Contribution model (the surface bundles register into)
- ADR-105 — Bundle activation lifecycle (the surface bundles register *as*)
- ADR-401 — Workbench shell anatomy (which slots exist in core)
- ADR-402 — Middle section composition (which slots exist in core, again, in the busiest region)
- ADR-405 — Activity-bar surfaces (which items are first-party bundles)
- ADR-410 — Bundle host process model (the trust boundary first-party bundles sit on the other side of)
- [Bundle Host Process Reasoning](./Bundle_Host_Process_Reasoning.md)
- [VSCode Architecture Case Study](./VSCode_Architecture_Case_Study.md)
