# Sessions Activity — build plan & status tracker

**Status:** In progress — P1 slices 2 / 3 / 4a / 4b shipped; orchestration spine live on real Google Calendar.
**Created:** 2026-06-19 (to give Sessions its own home — the slice reasoning previously lived inside the
**Schedule** design log, `docs/Activities/schedule/schedule-design-log.md` SD-15..19, which caused
cross-Activity confusion).
**Canonical design:** ADR-508 (Sessions = Client Meeting + `MeetingProvider` port), ADR-507 (Schedule =
storeless UI over provider), ADR-313 (PHI gradient + Safety Score), ADR-506 (domain-module CQRS +
ownership authoring rule).
**Reasoning journal:** `docs/Activities/schedule/schedule-design-log.md` — **SD-9/10/11** (boundary +
identity seam), **SD-15..19** (the built slices). This file is the *status tracker*; the SD entries hold
the full reasoning — do not duplicate them here, link to them.

---

## 1. What Sessions is

Sessions is the **only persistence** in the Schedule/Sessions pair (Schedule is storeless UI over a
calendar provider). It owns the clinical **Client Meeting** — the client-appointment subset of all
calendar events. A client appointment is a **link** to a provider event, not a moved/owned calendar
block. Sync is **field-partitioned (no LWW)**: the provider is the source of truth for *time*; the
workbench is authoritative for the *clinical* fields (kind, status, notes). Provider event deleted ⇒
the Client Meeting is **orphaned, never deleted**.

Bundle: `apps/desktop/bundles/ru-soam-sessions/` — a first-party FP-Host module, **zero Main TS**
(ADR-506 authoring rule: CQRS-explicit, FP-Host-resident, manifest-declared).

Identity authority is **Practice** (`record.patient`), not Sessions — Sessions *orchestrates*
resolution, Practice *owns* it (SD-10).

---

## 2. Slice status (P1)

| Slice | Scope | Status | Commit / SD |
|---|---|---|---|
| **2 — Store** | `ru-soam-sessions` bundle + `client_meeting` table (`protected`) + CQRS caps `sessions.meeting.query` / `sessions.meeting` (phi:true) + read-only "Upcoming Meetings" Activity | ✅ Built, live-verified | `c1eca9d`, SD-15 |
| **3 — Identity resolver** | On `record.patient`: `resolveParticipant({email?,phone?,name?})→{outcome}` + `getAliases`; commands `addAlias` / `suppressParticipant`; tables `patient_identity_alias` (PHI, erase-cascaded) + `participant_suppression` (sha256-hashed, **excluded** from erase cascade) | ✅ Built, live-verified | `7b49dc5`, SD-16 |
| **4a — Auto-link sync** | `sessions.meeting.sync` consumes cross-bundle `schedule.calendar.query.listEvents` + `record.patient.query.resolveParticipant`; single distinct match ⇒ auto-link (upsert on `provider_event_id`); window-scoped orphan pass; ambiguous/none/suppressed ⇒ **transient `needsLinking[]`** (never persisted) | ✅ Built, live-verified on real Google Calendar | `f102704`, SD-17 |
| **4b — Needs-linking triage panel** | Sessions `panel.view` (`needs-linking.html`) renders transient `needsLinking[]`; per-participant confirm→alias+link / promote→create+link / exclude→suppress; `linkProviderEvent(event,clientId)` | ✅ Built (card-render + 3 actions code-reviewed, not live-fired) | `18ab656`, SD-18 |
| **§6 — Classification colours** *(Schedule-side, depends on Sessions data)* | 5-state render-time classification in `schedule.html` (CLIENT / PROBABLE / EXCLUDED / PERSONAL / UNCLASSIFIED); view-side derive binds `sessions.meeting.query` + `record.patient.query` | ✅ Built, all 5 states live-fired | `2620f39`, SD-19 |

**Cross-bundle host→host is sanctioned:** the loader registers every bundle's caps in the Main registry
with a host-forwarding handler; first-party→first-party `phi:true` passes the gate; the consuming bundle
**must declare the dep in its manifest**. (Renderer view-bridge binds are *not* manifest-gated — §6 and
4b exploit this to avoid a Schedule→Sessions host cycle.)

---

## 3. Deferred / open items

- **O487** — full Sessions pass: Client-Meeting notes / progress note, the clinical spine beyond linking.
- **O489** — one-click **Join** launch (`soamView.openExternal` verb → existing `shell.openExternal`
  cap). Copy-link is the interim.
- **O490** — **cross-bundle DPDP erase cascade.** `client_meeting.patient_id` is a plain column with
  **no cross-bundle FK** to Practice's `patients`; 4a/4b/§6 now link **real** clients to provider events,
  so a client erase must also cascade into Sessions. **Now genuinely needed — close before prod.**
- **O486** — `MeetingProvider` port (Meet / Zoom) for meeting creation.
- **O485-rest** — remaining Schedule UI surfaces (see schedule build-plan P-B / O491 / P-C / P-D).
- **O483** — ADR-313 PHI opt-ins + PHI Safety Score value (gates Schedule P-D).

---

## 4. Pointers

- Schedule UI build plan + status: `docs/Activities/schedule/schedule-ui-build-plan.md`.
- Reasoning journal (SD-1..19): `docs/Activities/schedule/schedule-design-log.md`.
- ADRs: 508 (Sessions), 507 (Schedule), 313 (PHI), 506 (domain module).
