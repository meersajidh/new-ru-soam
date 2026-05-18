# Open Items — consolidated registry

**Status:** Draft
**Date:** 2026-05-16
**Owner:** Architecture
**Supersedes:** the Open Items table in [`docs/README.md`](README.md) (older, stops at O110).

Single source of truth for every Open Item (O##) raised across ADRs and the Implementation Plan. Newer items raised inside `Implementation_Plan.md` during phase landings are folded back in here so a reader does not need to grep both surfaces.

## Conventions

- **ID** — assigned at first surfacing. Never re-used. Gaps are gaps; do not back-fill.
- **Source** — the ADR or Implementation Plan section where the item is defined. If multiple, the *defining* one is listed first.
- **Status**
  - `Resolved` — decision committed AND reflected in code or canonical doc.
  - `Partial` — decision direction committed; mechanism / fields still open.
  - `Deferred` — decision intentionally postponed; target phase noted where known.
  - `Closed` — withdrawn / superseded (with pointer to successor).
- **Target** — phase number, ADR, or trigger condition that should land the resolution. `—` if long-range or undefined.

## Index by ID

| ID   | Topic                                       | Source                       | Status   | Target                | Notes |
| ---- | ------------------------------------------- | ---------------------------- | -------- | --------------------- | ----- |
| O1   | Canonical state placement                   | ADR-102                      | Deferred | —                     | Where canonical state lives (Main / Cloud Backend / per-domain). |
| O2   | Capability registry mechanism               | ADR-103                      | Resolved | Phase 1               | `ipcRenderer.invoke` + Map registry in `electron/main/capability/registry.ts`. ADR-103 still marks Deferred; update needed. |
| O3   | Capability versioning policy                | ADR-103                      | Deferred | —                     | Today: `name@version` registry key with side-by-side majors. Not committed in ADR text. |
| O4   | Permission scope model                      | ADR-103                      | Deferred | Phase 10+             | No permission round-trip yet; `bindCapability` is a typed-proxy handshake only. |
| O5   | Contribution declaration form               | ADR-104                      | Partial  | Phase 6 / 7           | Manifest JSON for capabilities + views shipped Phase 6 / 7; programmatic register() exists Main-side only. |
| O6   | Default activation trigger                  | ADR-105                      | Partial  | Phase 6.5             | `eager` / `lazy` shipped; selection criteria still implicit. |
| O7   | Contribution point catalogue                | ADR-104                      | Deferred | —                     | Live: `capabilities`, `views`. Pending: `commands`, `settings`, `keybindings`, `icons`, `themes`, `snippets`. |
| O8   | Bundle dependency declaration               | ADR-105                      | Deferred | —                     | No `dependsOn` in manifest. |
| O9   | Bundle hot reload in dev                    | ADR-105                      | Deferred | —                     | Renderer reload reactivates whole boot path; bundle-level HMR not built. |
| O10  | CSP exact policy text                       | ADR-201                      | Partial  | Phase 9 / 13          | Current CSP in `electron/main/security.ts`. Google Fonts allow-list dropped in Post-Phase-8 cleanup; remaining tightening (`'unsafe-inline'` in `style-src`, etc.) carries into Phase 9 hardening. |
| O11  | Sandbox + ESM preload compat                | ADR-201                      | Resolved | Phase 1               | CJS preload under `sandbox: true` works on current Electron; no follow-up. ADR text not updated. |
| O12  | IPC sender-validation helper                | ADR-201                      | Resolved | Phase 1               | `isPlatformSender(event)` in `electron/main/ipc/sender-validate.ts`. |
| O13  | Lint rules for hardening                    | ADR-201                      | Deferred | —                     | No ESLint rule enforces `BrowserWindow` / `electron` import gates. |
| O14  | `Soam` interface exact shape                | ADR-202                      | Partial  | Phase 7               | `bindCapability` + `events.on` settled in `electron/preload/soam.ts`; ADR text still strawman. |
| O15  | Preload module format                       | ADR-202                      | Resolved | Phase 1               | CJS preload bundled by `vite.preload.config.ts`. |
| O16  | Preload event channel surface               | ADR-202                      | Partial  | —                     | Live event: `bundle.crashed`. Catalogue not committed. |
| O17  | Events on bridge vs capability              | ADR-202                      | Deferred | —                     | Stays on `window.soam.events` for now. |
| O18  | `app://` route registration                 | ADR-203                      | Deferred | —                     | Only the platform's renderer-asset route exists. |
| O19  | Brokered networking caching                 | ADR-203                      | Deferred | Phase 11              | No outbound networking yet. |
| O20  | Brokered networking failures                | ADR-203                      | Deferred | Phase 11              | Tied to ADR-302 / 303 sync. |
| O21  | Direct-fetch enforcement                    | ADR-203                      | Deferred | —                     | No lint rule. |
| O22  | Local Store wrapper choice                  | ADR-302                      | Resolved | Phase 10a             | `better-sqlite3-multiple-ciphers@^12.9.0` (aliased as `better-sqlite3`). Plaintext in 10a, keyed in 10b. |
| O23  | Operational sync conflict resolution        | ADR-302                      | Deferred | Phase 11              | CRDT vs OT vs LWW. |
| O24  | PHI export/import flow shape                | ADR-302                      | Deferred | Phase 12              | Likely folded into ADR-306 recovery paths. |
| O25  | Operational side-door policy                | ADR-302                      | Deferred | —                     | Re-open when ToS / consent framing committed. |
| O26  | KEK rotation policy                         | ADR-303                      | Deferred | Phase 12              | KMS cadence (Strategy A) + recovery-code-bound rotation (Strategy B). Phase 9 ships change-passphrase only; full KEK rotation lands with the Phase 12 Recovery surface. Rotation procedure must also re-wrap every `kek-wrapped` keychain credential (per O307f). |
| O27  | Backup cadence and granularity              | ADR-303                      | Deferred | Phase 11              | Per-change vs periodic snapshot vs both. |
| O28  | Crash-dump PHI scrubbing                    | ADR-303 / ADR-307            | Deferred | Phase 9 hardening / Phase 10 | No telemetry surface yet, so latent. ADR-307 §threat-model names process-memory PHI exposure during the unlocked window; scrubbing pipeline lands when the first crash-report path ships. |
| O29  | Same KEK/DEK for sync + backup              | ADR-303                      | Deferred | Phase 11              | Strawman: same KEK across live sync and cold backup. Confirm when sync transport lands. |
| O30  | Linux keychain backend policy               | ADR-304                      | Deferred | Phase 11              | `libsecret` vs KWallet vs headless. Phase 9 ships only `local-store-db-key` through the keychain and refuses to start with a clear error if the backend is unavailable; the richer fallback policy lands when sync-session-token / KMS-credentials widen the surface. |
| O31  | Hardware-bound credential keys              | ADR-304                      | Deferred | —                     | Pilot post-MVP. |
| ~~O32~~ | _(unassigned; gap in numbering)_         | —                            | —        | —                     | Never assigned. Reserve or skip; do not reuse. |
| O33  | Provider plugin registration                | ADR-305                      | Deferred | Post-Phase 13         | Contribution point under ADR-104. |
| O34  | Credential validation hook                  | ADR-305                      | Deferred | Post-Phase 13         | Plugin-defined contract. |
| O35  | Per-provider rate-limit / quota             | ADR-305                      | Deferred | Post-Phase 13         | Counter location + user surfacing. |
| O36  | Clinic-shared Flow A credentials            | ADR-305                      | Deferred | ADR-503               | Post-MVP only. |
| O37  | Provider-plugin scaffolding                 | ADR-305                      | Deferred | After 2nd plugin      | CLI / wizard. |
| O38  | Local backup file format                    | ADR-306                      | Deferred | Phase 12              | Envelope schema + manifest signing. |
| O39  | DPAPI loss detection heuristic              | ADR-306                      | Deferred | Phase 12              | False-positive / -negative balance. |
| O40  | KMS access loss UX                          | ADR-306                      | Deferred | Phase 12              | "Expects it back" case. |
| O41  | Cloud ciphertext deletion API contract      | ADR-306                      | Deferred | Phase 11 / 12         | Single-call vs tombstone-grace. |
| O42  | Passphrase-wrapped backup extension         | ADR-306                      | Deferred | —                     | Optional plugin; demand-driven. |
| O43  | Role taxonomy                               | ADR-503                      | Deferred | ADR-503 Draft         | Inactive until 503 advances. |
| O44  | Cross-entity referral flow                  | ADR-503                      | Deferred | ADR-503 Draft         | Inactive until 503 advances. |
| O45  | Entity-type migration                       | ADR-503                      | Deferred | ADR-503 Draft         | Sole-prac ↔ Clinic transition story. |
| O46  | Local Store per-Entity partitioning         | ADR-503                      | Deferred | ADR-503 Draft         | Sub-keyed encryption vs separate DBs. |
| O47  | Concurrent multi-Entity views               | ADR-503                      | Deferred | ADR-503 Draft         | Not in initial Clinic shape. |
| O48  | Audit hash-chain mechanism                  | ADR-502                      | Deferred | Phase 10              | Linked hashes / Merkle / signed-batch. |
| O49  | Audit retention per event kind              | ADR-502                      | Deferred | Phase 10              | Sampling vs full retention. |
| O50  | Audit ledger export format                  | ADR-502                      | Deferred | Phase 13              | JSON / JSON-LD / domain schema. |
| O51  | Audit emission lint                         | ADR-502                      | Deferred | Phase 10              | Catch PHI handlers omitting emission. |
| O52  | Consent UI text hashing                     | ADR-502                      | Deferred | Phase 12              | Rendered-text-hash vs source-template-hash. |
| O53  | Multi-Entity workspace switcher             | ADR-403                      | Deferred | ADR-503 Draft         | In-shell vs new window. |
| O54  | Workspace-scoped bundle enablement          | ADR-403                      | Deferred | ADR-503 Draft         | Clinic admin disable. |
| O55  | Workspace settings cloud-mirror policy      | ADR-403                      | Deferred | Phase 10 / 11         | Layout / recents / explicit settings. |
| O56  | Workspace setting trust prompt              | ADR-403                      | Deferred | Post-MVP              | VSCode-workspace-trust analogue. |
| O57  | Window chrome (native vs custom frameless)  | ADR-401                      | Resolved | Phase 2               | Frameless + custom TitleBar Part; `platform.window@1.0`. |
| O58  | Grid engine / library choice                | ADR-401                      | Deferred | Phase 13              | Plain CSS today; revisit when ratio-persist + resize drag land. |
| O59  | Banner contribution scope                   | ADR-401                      | Deferred | Phase 13+             | Platform-only today. |
| O60  | Aux Side Bar navigation strip               | ADR-402                      | Deferred | —                     | Default: stays context-driven. |
| O61  | Narrow-window side-bar behaviour            | ADR-402                      | Deferred | Phase 13              | UX threshold. |
| O62  | Activity Bar `top` position                 | ADR-402                      | Deferred | Phase 12              | Where it renders when no left strip. |
| O63  | Panel-or-Aux dual contribution              | ADR-402                      | Deferred | First Panel-view bundle | Useful only when first-party panel views exist. |
| O64  | Bundle Host implementation choice           | ADR-410                      | Resolved | Phase 6               | `utilityProcess.fork` in `electron/main/bundle-host/manager.ts`. ADR-410 still marks Deferred. |
| O65  | Bundle Host isolation granularity           | ADR-410                      | Partial  | Phase 6.5             | Single host for all bundles + `Module._load` / ESM-loader deny set + neutered process globals. Per-bundle isolation deferred. |
| O66  | Bundle debugging mechanism                  | ADR-410                      | Partial  | Phase 13              | stdout/stderr prefix-piped in dev; per-bundle Output ring (256 lines, error attribution only). No inspector port. |
| O67  | Native module / non-portable dep policy     | ADR-410                      | Deferred | First demanding bundle | Default deny via deny-set; no opt-in contribution shape. |
| O68  | Bundle Host hibernation policy              | ADR-410 / IP Phase 6.5       | Partial  | First demanding bundle | `lazy` activation event landed; `onCommand` (O134) and `onEvent` (O135) still open; idle termination deferred. |
| O69  | Canonical domain type ownership             | ADR-405                      | Deferred | First cross-bundle ref | `core-domain` vs per-bundle. |
| O70  | Disabled-bundle degraded state              | ADR-405                      | Deferred | First cross-bundle ref | render-as-id / hide-link / block-disable. |
| O71  | Platform item discoverability               | ADR-405                      | Deferred | Phase 12              | Multiple discoverability paths. |
| O72  | Product-scope doc location                  | ADR-405                      | Deferred | Before Phase 14       | First-party bundle catalogue ownership. |
| O73  | Resource URI scheme registry                | ADR-404                      | Deferred | First clinical scheme | Bundle-scoped naming + conflict resolution. |
| O74  | Autosave default + override                 | ADR-404                      | Deferred | First clinical editor | Explicit-save default; per-type override. |
| O75  | Save failure UX                             | ADR-404                      | Deferred | Phase 11              | Banner + retry + sync-queue interaction. |
| O76  | View-state serialisation depth              | ADR-404                      | Deferred | First clinical editor | Cursor / scroll / filter persistence schema. |
| O77  | Aggregate save prompt                       | ADR-404                      | Deferred | Phase 12              | "Save N changes?" on close / re-lock / update. |
| O78  | View asset protocol scheme                  | ADR-411                      | Resolved | Phase 7               | `view://<bundleId>/<path>`; `_platform_` reserved host. ADR-411 still marks Deferred. |
| O79  | `soamView` exact API                        | ADR-411                      | Partial  | Phase 7+              | Phase 7 surface = `bindCapability`, `events.onActivate/Deactivate`, `theme`, `requestClose/Focus`. Carries into O141 follow-ups. |
| O80  | View iframe sandbox flags                   | ADR-411                      | Partial  | First demanding view  | Live: `allow-scripts allow-forms`. `allow-pointer-lock` deferred. |
| O81  | Bundle-view CSP exact text                  | ADR-411                      | Partial  | First non-test view   | Live policy in `electron/main/bundle-host/view-protocol.ts` carries `'unsafe-inline'` — see O143. |
| O82  | Declarative-view component vocabulary       | ADR-411                      | Deferred | First declarative view | Not in MVP. |
| O83  | A11y across iframe boundary                 | ADR-411                      | Deferred | First clinical view   | Focus / tab / aria-live / SR semantics. |
| O84  | Iframe pooling / count budgeting            | ADR-411                      | Deferred | First N-view scenario | Memory + startup cost mitigation. |
| O85  | WebContentsView usage policy                | ADR-411                      | Deferred | First exception       | Exceptional-case approval gate. |
| O86  | Command id naming + lint                    | ADR-406                      | Deferred | Phase 13              | `<bundleId>.<verb>[.<noun>]` + collision rejection. |
| O87  | Command argument schema                     | ADR-406                      | Deferred | First arg-bearing cmd | Optional manifest schema. |
| O88  | Command audit field                         | ADR-406                      | Deferred | Phase 10              | Interaction with capability-level audit. |
| O89  | Recent commands persistence                 | ADR-406                      | Deferred | Phase 10              | Per workspace vs per user. |
| O90  | Palette ranking algorithm                   | ADR-406                      | Deferred | First load test       | Fuzzy + recency + frequency + category. |
| O91  | Reserved-namespace context-key enforcement  | ADR-407                      | Deferred | Phase 13              | Lint + runtime. |
| O92  | Configuration-derived context-key mirror    | ADR-407                      | Deferred | Phase 12              | Type coercion + change propagation. |
| O93  | Bundle context-key authority limits         | ADR-407                      | Deferred | First demanding bundle | Rate-limit + quota. |
| O94  | PHI-adjacent context-key privacy            | ADR-407                      | Deferred | Phase 9 / 10          | Crash dump + telemetry + bridge scrub. |
| O95  | Expression evaluator perf budget            | ADR-407                      | Deferred | Phase 13              | Cost per re-eval at realistic counts. |
| O96  | Service id mechanism                        | ADR-412                      | Resolved | Phase 2               | Branded string `ServiceId<T>`. |
| O97  | TanStack Query key naming convention        | ADR-412                      | Resolved | Phase 10a             | `[capabilityNamespace, operation, ...keyArgs]`. See `docs/Guides/tanstack-query-keys.md`. |
| O98  | Workspace lifecycle reset matrix            | ADR-412                      | Partial  | Phase 10              | Definitive reset / persist / partial list. Today `WorkspaceService.close` resets `_state`, layout listener, and three context keys only — `EditorService` / `RuEditService` / `SnippetService` and per-tab caches survive untouched. Phase 9 adds `onDidWorkspaceLock` / `onDidWorkspaceUnlock` events per ADR-307 with a narrow PHI-derived-state reset discipline (stub PHI capability proves the pattern); the full matrix doc lands in `docs/References/` before Phase 10 wires real PHI consumers. |
| O99  | Suspense + loading discipline               | ADR-412                      | Deferred | Phase 10              | `<Suspense>` vs skeletons. |
| O100 | Change-event capability shape               | ADR-412                      | Resolved | Phase 10a             | `store.changed` PlatformEvent `{ table, op, keys }`; renderer bridge invalidates `[table]` (prefix match). |
| O101 | Output channel routing                      | ADR-408                      | Deferred | Phase 13              | Bundle stdout/stderr → Output Panel view. |
| O102 | Panel view persistence depth                | ADR-408                      | Deferred | First Panel view      | Scroll / filter / search per view. |
| O103 | Auto-activation rate limiting               | ADR-408                      | Deferred | First Panel view      | Reveal-too-often demotion. |
| O104 | Status-bar priority scheme                  | ADR-409                      | Deferred | First contention      | Free-form vs banded ranges. |
| O105 | Status-bar update rate-limit                | ADR-409                      | Deferred | First high-rate entry | Default 4/s. |
| O106 | Status-bar entry context menu               | ADR-409                      | Deferred | Phase 13              | Hide / show-all / configure. |
| O107 | Theme token catalogue v1                    | ADR-413                      | Resolved | Phase 2.5             | 17 colour tokens + 2 font tokens; `apps/desktop/src/styles/tokens.css`. |
| O108 | Icon rendering mechanism                    | ADR-413                      | Deferred | First icon contribution | Inline SVG vs sprite vs font. (Earlier Phase-5.5 collision on this number was resolved by renaming the editor item → O152.) |
| O109 | A11y theme contrast budget                  | ADR-413                      | Deferred | Phase 13              | WCAG AA minimum. (Earlier Phase-5.5 collision was resolved by rename → O153.) |
| O110 | Theme + iframe propagation cost             | ADR-413                      | Deferred | First N-view scenario | Push to many iframes on theme switch. (Earlier Phase-5.5 collision was resolved by rename → O154.) |
| O152 | EditorService event granularity             | IP Phase 5.5                 | Deferred | Phase 13              | Per-axis events vs version-number selectors. Renamed from the colliding O108 (Phase-5.5 surface) — ADR-413's O108 keeps the number. |
| O153 | `editor.activeResource` PHI scrub list      | IP Phase 5.5                 | Deferred | Phase 10              | Audit-payload scrub for `patient://` / `session://` URIs. Renamed from the colliding O109 (Phase-5.5 surface). |
| O154 | Tab dedup policy                            | IP Phase 5.5                 | Deferred | First clinical editor | `forceNew` / pinned / richer key. Renamed from the colliding O110 (Phase-5.5 surface). |
| O111 | Editor split-ratio persistence              | IP Phase 5.5                 | Deferred | Phase 13              | Ratio per workspace via Phase-4 layout path. |
| O112 | Editor tab context menu                     | IP Phase 5.5                 | Deferred | Phase 13              | Right-click / middle-close / pin / "close others". Depends on command-menu mechanism. |
| O113 | Manifest schema hardening                   | IP Phase 6                   | Deferred | First 3rd-party bundle | Zod + signature/integrity + namespace policy + prod packaging path. |
| O120 | Voice dictation adapter                     | ADR-414                      | Deferred | —                     | Web Speech / Dragon / Deepgram Medical. |
| O121 | Multi-clinician collab (Yjs + awareness)    | ADR-414                      | Deferred | —                     | Single-clinician-per-record assumption holds for foreseeable phases. |
| O122 | Snippet / template authoring UI             | ADR-414                      | Closed   | Renamed → O416c       | Re-scoped by ADR-416. |
| O128 | "SmartText engine"                          | ADR-414                      | Closed   | ADR-416 / Phase 8     | Renamed Snippet engine, landed. |
| O129 | Custom atomic blocks                        | ADR-414                      | Deferred | Post-Phase 8          | Vitals → Allergies → MedList → custom picklist node. Phase number locked at that phase's gate. |
| O130 | React-in-nodeView strategy                  | ADR-414 / ADR-415            | Deferred | Custom-blocks phase   | Imperative DOM vs `@handlewithcare/react-prosemirror`. |
| O131 | Stable ID strategy (v4 → v7)                | ADR-414                      | Deferred | First per-block revision phase | Currently UUID v4. |
| O132 | Print pipeline                              | ADR-414                      | Deferred | After custom blocks   | JSON → print-React → Puppeteer-in-Main. ADR-414 §134 now reads "(a later phase — see O132)" post Post-Phase-8 cleanup. |
| O134 | `onCommand` activation trigger              | IP Phase 6.5                 | Deferred | Phase 7+ work         | Manifest `commands: [...]` + CommandService → activate. |
| O135 | `onEvent` activation trigger                | IP Phase 6.5                 | Deferred | First event-driven bundle | No consumer yet. |
| O136 | Per-line stdout/stderr attribution          | IP Phase 6.5                 | Deferred | First 3rd-party bundle / Phase 13 | `AsyncLocalStorage`-tagged capture per handler invocation. |
| O137 | ESM-side hardening depth                    | IP Phase 6.5                 | Deferred | First untrusted bundle | `Function()` / base64-eval / wider process surface; vm-isolate option. |
| O138 | Side-bar / Panel slot iframe mounting       | IP Phase 7                   | Deferred | First clinical-bundle phase needing sidebar | Same mechanism; per-slot wiring + manifest contribution points. |
| O139 | Crash-placeholder UI for orphaned iframes   | IP Phase 7                   | Deferred | First clinical-bundle phase | Timeout-aware "view inactive" replacement. |
| O140 | `view.activate(viewId, ctx)` bundle hook    | IP Phase 7                   | Deferred | First clinical-view phase | Renderer/Main boundary only today. |
| O141 | View bridge follow-ups                      | IP Phase 7                   | Deferred | Per-clinical-bundle phase | `onResize`, `onResourceChange`, `notifyDirty`, `notifyTitle`, `announce`. |
| O142 | Typed `ThemeTokens` on `soamView.theme`     | IP Phase 7                   | Deferred | Phase 7.5+            | Raw CSS-var record today; typed object when needed. |
| O143 | Tighten view CSP `script-src` / `style-src` | IP Phase 7                   | Deferred | First non-test view (post-Phase-13) | Phase 7 keeps `'unsafe-inline'` for ergonomics. |
| O144 | `IRuEditService` workbench primitive        | IP Phase 7.5a                | Closed   | Phase 7.5b            | Landed; `RuEditServiceId` in `platform/services/ids.ts`. |
| O145 | RuEdit reload-survival                      | IP Phase 7.5a                | Closed   | Phase 7.5b            | `sessionStorage`-backed scratch store. |
| O146 | Heap-snapshot dispose-leak harness          | IP Phase 7.5a                | Deferred | Phase 9 hardening     | Manual smoke today; no CI gate. |
| O147 | RuEdit toolbar UI                           | IP Phase 7.5a                | Closed   | Phase 7.5b            | 11 buttons + commands. |
| O148 | Toolbar active-state highlighting           | IP Phase 7.5b                | Closed   | Phase 7.5c            | `computeActiveState` + `.is-active` + `aria-pressed`. |
| O149 | Read-only mode UI toggle on scratch         | IP Phase 7.5b                | Deferred | First clinical consumer | Cosmetic-only on scratch. |
| O150 | Command-palette commands for toolbar        | IP Phase 7.5b                | Deferred | First clinical consumer | Keyboard shortcuts cover surface. |
| O151 | Auto-coerce heading→paragraph on list wrap  | IP Phase 7.5b                | Closed   | Phase 7.5c            | `wrapInListCoerced` in one tr. |
| O416a | Type-constrained placeholders              | ADR-416                      | Deferred | First clinical consumer | `number`, `date`, regex-validated text. |
| O416b | Shared / clinic snippet registries + persistence | ADR-416                | Deferred | Phase 10 / 11         | Local persistence ≥ Phase 10; sharing ≥ Phase 11. |
| O416c | Snippet authoring UI                       | ADR-416                      | Deferred | Product phase         | Renamed from O122. |
| O416d | Snippet recursion                          | ADR-416                      | Deferred | Use-case-driven       | Body containing `/abbrev` re-trigger. |
| O416e | DataLink placeholder type                  | ADR-416                      | Deferred | Chart/FHIR phase      | Reserved type name today. |
| O416f | Template phase (whole-doc default scaffolds) | ADR-416                    | Deferred | First note-typed editor phase | Distinct ADR. |
| O416g | Trigger-character override per workspace setting | ADR-416                | Deferred | Long-range            | `/` default locked. |
| O416h | Completion popup UX                        | ADR-416                      | Partial  | Snippet-library-growth phase | Minimal list ships Phase 8. |
| O307a | Strategy A (user-owned KMS) implementation | ADR-307 (deferred from 303)  | Deferred | Phase 9.5 / pre-11    | KMS provider plugin surface + ADR-305 credential pattern. **Precondition (per ADR-307 §Keychain credential walk-up policy):** `kms-credentials` is `kek-wrapped`; KMS-using capability refuses with `LockedError` when `workspace.locked`. Raw `kms-credentials` would defeat ADR-307 entirely. |
| O307b | Idle-timeout configurability + range       | ADR-307                      | Partial  | Phase 10 / 12         | Default 5 min ships Phase 9. Confirm allowed range (1–60 min?), per-workspace vs per-user override semantics when settings cascade ships. |
| O307c | Passphrase strength policy hardening       | ADR-307                      | Partial  | Post-first-clinical-feedback | Phase 9 ships `length >= 12 && zxcvbn score >= 3` block. Tighten to `score >= 4`, blended length-vs-score scoring, or common-clinical-password blacklist after user feedback. |
| O307d | Hardware-bound passphrase / biometric      | ADR-307 (cross-ref O31)      | Deferred | —                     | Secure Enclave / TPM-assisted Argon2id; TouchID / Hello biometric shortcut UX. Care needed not to re-introduce walk-up exposure. |
| O307e | Audit-event catalogue for lock/unlock/setup/passphrase-change/recovery-code-use | ADR-307 / ADR-502 | Deferred | Phase 10              | Emit-points named in ADR-307. Ledger wiring lives with ADR-502 in Phase 10. |
| O307f | Per-keychain-credential walk-up policy (`raw` vs `kek-wrapped`) | ADR-307 / ADR-304 | Partial | Per-cred-introduction phase | Default for high-walk-up-impact creds = `kek-wrapped` (cloud account, KMS, billable third-party). `local-store-db-key` stays `raw` (bootstrap chicken-and-egg). Per-cred decisions land with the introducing phase: `cloud-session-token` (Phase 11), `kms-credentials` (Phase 9.5+ per O307a), `third-party-api-key` (post-Phase-13). KEK rotation (O26) re-wraps every `kek-wrapped` entry. |
| O307g | Real Google OAuth integration                   | ADR-307 / ADR-501             | Partial  | Phase 11 / 12         | Phase 9 ships mocked dialog returning `{ email, googleId: "mock-<uuid>" }`. Real OAuth (PKCE, refresh tokens, `cloud-session-token` storage) lands alongside cloud sync transport. |
| O307h | Nickname global-uniqueness (server-side)        | ADR-307 / ADR-501             | Partial  | Phase 11+             | Phase 9 ships length-only validation (4-64 chars). Server-side uniqueness check lands with real cloud account record. Migration plan for pre-existing duplicates: server rejects on first sync → user prompted to rename. |
| O155 | `setup.css` cross-import consolidation              | IP Phase 9b                  | Deferred | When CSS grows        | `apps/desktop/src/styles/setup.css` is imported by `routes/setup/keys.tsx`, `workbench/middle/UnlockGate.tsx`, and `workbench/middle/ChangePassphraseDialog.tsx`. Cosmetic; consolidate (move into per-Part CSS or share via a single import in a higher-level layout) when the sheet grows beyond a few hundred lines. |
| O156 | `workbench.workspace.changePassphrase` opens dialog | IP Phase 9b                  | Partial  | Phase 9c or 10        | Command currently logs a "open via user-avatar menu" hint. The `ChangePassphraseDialog` Part is fully implemented and reachable via the user-avatar menu. The command-palette entry should open it directly — needs a renderer-side `DialogService` (named in ADR-412 §"What this ADR does not commit"). Lands with the first phase that needs a second dialog (or earlier as a small platform addition). |
| O157 | Electron 41 pin — re-evaluate at Electron 42+ bump | IP Phase 10a                 | Open     | Phase 10b             | `better-sqlite3-multiple-ciphers@12.9.0` does not compile against Electron 42's V8 14 API. Pin holds at `^41.2.2` until upstream cuts a V8-14-compatible release. Revisit alongside SQLCipher landing. |
| O158 | Per-row TanStack Query invalidation              | IP Phase 10a / ADR-412       | Deferred | Volume-driven         | Phase 10a invalidates the whole namespace (`[table]`) on any write. Change event already carries `keys`; per-key matching can land when query volume warrants. |
| O159 | `PlatformEvent` discriminated-union typing       | IP Phase 10a / ADR-202       | Deferred | Refactor pass         | `PlatformEvent.payload: unknown` today; per-event payload types (`StoreChangedPayload`, etc.) live alongside but are not type-discriminated at the union level. Refactor when a third event needs typed payload narrowing. |
| O160 | `cap.no_workspace` error code                    | IP Phase 10a / ADR-103       | Deferred | New cap surface       | Capabilities backed by the Local Store throw `cap.not_found` when no workspace is active (semantically close but not exact). Add a dedicated code when another capability hits the same case. |
| O161 | Workspace rename command (`workbench.workspace.rename`) | IP Phase 9c | Deferred | Phase 12 (Settings)   | Trimmed from Phase 9c. Renames the active workspace's `nickname` in `meta.json` (length-only validation; global-uniqueness still server-side per O307h). Needs `DialogService` (sibling of O156) plus a Settings surface to host non-modal rename UX. Lands with Settings editor in Phase 12, or earlier if a second dialog forces `DialogService` to land first. |
| O162 | StatusBar workspace quick-switcher dropdown      | IP Phase 9c                  | Deferred | Phase 12 or first phase needing a StatusBar dropdown | Trimmed from Phase 9c. The `workbench.workspace.nickname` StatusBar entry should open a dropdown listing other workspaces for one-click switch. Requires a StatusBar dropdown/menu primitive that does not yet exist (current entries are click-to-fire commands only). Palette + picker route cover the action in 9c; dropdown lands when the primitive does. |
| O163 | `soam:workspace:set-active` relocks on switch-to-self | IP Phase 9c / ADR-307         | Open     | Phase 12 or next lock-state pass | `apps/desktop/electron/main/ipc/lock-channel.ts:202` always calls `currentSvc.relock()` on every `set-active`, including when `workspaceId === currentSvc.workspaceId`. From the picker, clicking the currently-active workspace forces re-unlock. Cross-workspace switch correctly relocks the leaving workspace, so the security model holds; the UX miss is only "browse picker → bail back to current". Fix is a 1-line guard (`if (currentSvc && currentSvc.workspaceId !== workspaceId)`) — deferred from 9c to keep that phase scoped to UI; lands with the next intentional lock-state touch. |
| O164 | `workbench.workspace.switch` command palette double-prefix | IP Phase 9c / ADR-406        | Open     | First palette-titling pass | Cosmetic. Command palette renders the category twice: "Workspace: Workspace: Switch…". Pattern is shared with `workbench.workspace.signOut` ("Workspace: Workspace: Sign Out") and any other command whose title already includes its category. Fix is one of (a) drop the `category:` field when title is already prefixed, (b) drop the in-title prefix and let the renderer prefix once, or (c) renderer dedups. Pick one and apply repo-wide. |

## Numbering hygiene

**Gaps (unassigned IDs).** O32, O114–O119, O123–O127, O133. Do not back-fill — leave as deliberate gaps so existing references stay anchored.

**Collisions.** O108/O109/O110 were collided; resolved by renaming the Phase-5.5 editor items to O152/O153/O154.

The collision affected:
- ADR-413 (icon rendering / contrast / iframe theme propagation) — keeps original numbers as historical record.
- Implementation_Plan Phase 5.5 amendment (editor event granularity / activeResource scrub / tab dedup) — renamed to O152/O153/O154.

The ADR-413 use predated the Phase 5.5 amendment, so the rename touched only the Phase-5.5 surface. `Implementation_Plan.md` Phase 5.5 §"Open items added (404-range)" and all forward references in Phases 7+ / 13 have been rewritten. ADR-413's O108/O109/O110 retain their original numbers; the per-row Notes column carries the rename pointer for any future reader who lands on the number cold.

## Maintenance rule

When a new Open Item is raised in a phase landing inside `Implementation_Plan.md`, copy it into the table above in the same commit. When an item is resolved, change Status and fill Target with the phase that landed it — do not delete rows. `docs/README.md`'s legacy Open Items table should be replaced by a pointer to this file.
