# Client Onboarding — Entry Discovery

**Status:** LIVING / in-progress. Discussion capture, not settled design. No ADR yet.
**Restarted afresh 2026-07-12** on top of two closed/companion docs (peers, not
parent-child): `new-client-intake-discovery.md` (the intake stage itself — CLOSED) and
`goals-and-loops-discovery.md` (two completenesses + catch-up loops — the conceptual
frame this doc now consumes). Superseded by the restart: the old "one queue, two doors,
one enrichment path" §1 and the "status is a family" §2 (absorbed into the loops model
and the intake doc's terminals).

**Scope of this doc:** how a client/case *enters* the system — new-client intake entry
and existing-client migration entry — and what each entry owes. The intake doc owns the
spine/stages/terminals/templates; the goals doc owns the loop mechanism; this doc owns
the **doors, entry events, and initial loop conditions**.

---

## 1. Two doors, one destination [FRAMED 2026-07-12]

High-level difference — **new client = relationship formation; existing client =
system catch-up:**

- **New client (intake door):** the relationship doesn't exist yet. Onboarding =
  deciding + building it — fit-check, commitment, consent, data gathered fresh as it
  is created. A real funnel: may end refer-out / declined / dropped. Uncertainty is
  genuine.
- **Existing client (migration door):** the relationship already exists in the world;
  only the system doesn't know. Nothing to decide — commitment evidence = the existing
  relationship itself. Onboarding = a *representation* problem: capturing facts that
  already happened from wherever they live (old system, paper, calendar,
  practitioner's head).

Secondary differences that fall out:

- **Data direction:** intake creates data during onboarding; migration moves data that
  predates it.
- **Arrival dynamics:** migration arrives in bulk (whole caseload, at adoption moment);
  intake arrives one at a time, forever.
- **Failure mode:** intake = drop-off (relationship never forms); migration =
  incomplete capture (relationship represented thin).

**One destination:** both doors end in **admission into the catch-up loops**
(`goals-and-loops-discovery.md` §3) — the end state is a process, not a state. The
doors differ only in **entry event + starting debt**:

| | Intake door | Migration door |
|---|---|---|
| Entry event marks | a relationship came into existence | an existing relationship became represented |
| Completeness gaps closed | reality gaps (capture rides along) | representation gaps only |
| Gating | gates on the checklist (facts don't exist until created) | must NOT gate — record must be usable now; completeness = debt |
| Starting loop debt | small (representation ≈ reality) | large (reality far ahead) |
| Retrospective record | none (baseline looks forward) | owed — history predating the system (industry: document attachment, not structured backfill) |
| Journey position at entry | starting line | mid-flight (treatment underway, contract operating) |

- Migration can *expose* genuine reality gaps (no signed consent ever existed) — real
  intake-type debt, the one legitimate borrow of intake machinery.
- **OPEN — terminal naming:** the two entry events are different achievements; sharing
  the terminal name "enrolled" misstates the migration event (practitioner never felt
  the client as "enrolled"). Leaning: separate entry events, same downstream client.
  (The intake doc's §4b "migration = fast-forward on the same spine" still holds for
  the *bookkeeping*; the open question is only whether the terminal is shared.)

## 2. Research — geo-segregated (2026-07-11)

### Migration — what the industry actually imports

**Global (US/CA — SimplePractice, Jane, Valant, ICANotes):**
- Importable = **demographics/contact only**, via CSV/template (Jane cols:
  name·contact·address·DOB·health#·emergency contact·family-doctor ref). Appointments
  importable via CSV.
- **NOT importable = clinical notes, appointment history, billing docs, cards.**
  SimplePractice states flatly it can't import clinical notes from another platform.
- **Legacy clinical = document attachment, not structured import.** Jane's actual
  mechanism = **PDF-per-client matched by filename convention**
  (`firstname_lastname_uniqueID.pdf`) or folder-per-client. Files, not fields.
- **Done-for-you + slow:** vendor staff key the template, 1–3 business days. The
  data-entry-service model **we structurally cannot offer** (local-first ⇒ no
  server-side ops on user data).

**India (PsychDeskHQ, PractiPal, DocVita):**
- Converge on WhatsApp integration, **UPI billing**, Google-Calendar sync, custom intake
  forms, digital consent, encrypted notes.
- **No migration story at all** — all assume fresh start, client-by-client onboarding.
  Migration is a genuine differentiator/gap here.
- Solo-practitioner real stack (Raah guide): Calendly/Google-Cal + WhatsApp Business +
  Meet/Zoom + SimplePractice-or-Notion + Excel. Duct-taped, not unified.

### Intake (BAU) — what the industry does
- Universal: **client portal / form sent before first session → responses land directly
  in chart, no re-keying.** Pre-appointment reminders. Self-scheduling → auto intake →
  into chart (ICANotes/Valant).
- **Drop-off is a designed-for metric, not an edge case** (Valant markets reducing it).
- Content standard = **biopsychosocial assessment** (bio · psycho · social) — recognized
  best-practice intake spine; 1–2 hrs; supports dx + treatment planning.

## 3. Capture primitives (partly built)

Local-first ⇒ no professional data-entry service; the load shifts onto
**client-completed forms** + **practitioner self-upload** + **document attachment**.

1. **Form-ingestion channel** — client fills a form (any channel: WhatsApp link, etc.)
   → submission seeds the record. The substitute for the data-entry service, not
   optional polish. Shared by both doors. MVP approach DECIDED → §5.
2. **Document-attachment (bulk)** — the only real legacy-clinical path. Adopt Jane's
   filename/folder→client matching. Already have `patient_document` + protected blobs.

## 4. Capture matrix — data domain × means × fallback (seed)

Means chosen by data type + who holds it + India reality (WhatsApp/Google-Forms/phone
dominate; slick portals don't land):

| Domain | Who holds it | Primary capture | Fallback |
|---|---|---|---|
| Demographics / contact / logistics | client | online form via WhatsApp/link | practitioner manual; CSV bulk (migration) |
| Consent / legal (informed, tele, NR, AD) | client + practitioner | form + e-sign / uploaded signed PDF | verbal in-session + doc upload |
| Health status / presenting concern | client | intake questionnaire (biopsychosocial) | practitioner captures in first-contact note |
| Assessment history (old scores/notes) | practitioner's old system | **document upload** (scan/PDF) + one distilled baseline | none — re-establish forward |
| Ongoing assessments (PHQ-9 etc.) | client | recurring form / link | administer in-session |
| Circle / family (NR, caregivers) | client + practitioner | form | practitioner enters in-session |

## 5. DECIDED (2026-07-11) — form-ingestion approach for MVP

**Crux:** every competitor's "form → chart" depends on a PHI-holding server (global =
vendor portal; India = Google Forms on Google's cloud). ADR-301 forbids PHI plaintext
on our cloud. Option space was A (client-owned file transport) · B (ciphertext-only
encrypted drop-box relay) · C (bring-your-own-form, practitioner-mediated ingest) · D
(manual entry).

**MVP decision = C + D + our template library.** Keep it simple:
- **C — BYOF (bring-your-own-form):** we do NOT host forms. Practitioner uses their own
  Google Form / paper / PDF; app ingests filled data via **CSV/response-export import** or
  **document attachment**. PHI-on-Google is the *practitioner's* choice, outside our
  boundary (their existing behavior). Zero new infra.
- **D — manual entry:** practitioner keys it in-session. Always-available floor.
- **Template library (our differentiator):** we ship **ready-to-copy, PHI-free form
  templates** — biopsychosocial intake, informed/tele consent, NR/AD, screeners
  (PHQ-9/GAD-7), India/MHA-aware. Practitioner copies to their own Google Form / prints /
  exports PDF. Templates are content assets (no PHI) → **safe to host, ship in-app, and
  cloud-update** — NO ADR-301 conflict (only *submissions* are PHI, and those never touch
  our cloud). India tools make you build forms yourself; we hand you clinically-sound ones.

**Clean split:** blank template (our IP, distribute freely) vs filled submission (PHI,
practitioner's own channel, local-only ingest). = the expectation-vs-provided PHI line
of `goals-and-loops-discovery.md` §5, discovered here first.

**Deferred (named later upgrade):** **B — hosted "SoamForms" with client-side encryption
to the practitioner's key** (our cloud holds only opaque ciphertext, consistent with the
ADR-204 backup/sync posture). The seamless experience without breaking sovereignty; real
infra (relay + browser-form crypto). **A** = niche fallback, not pursued.

## 6. Open threads

- **Terminal naming for the migration entry event** (§1) — shared "enrolled" vs
  separate.
- **Queue mechanics** — the inbound pool feeding both doors (old framing said "common
  queue"; re-derive from the goals/loops frame rather than assume).
- **Goal-domain enumeration** — prerequisite for structuring capture + loops →
  `goals-and-loops-discovery.md` §6, NEXT.
- **Bulk document-attachment flow** — matching, distilled-baseline capture.

## Sources
SimplePractice transfer FAQ · Jane import guide (diving-deeper) · Valant behavioral-health
portal · ICANotes portal 2025 + biopsychosocial guide · PractiPal India 2026 guide · Raah
India private-practice guide. (URLs in session log 2026-07-11.)
