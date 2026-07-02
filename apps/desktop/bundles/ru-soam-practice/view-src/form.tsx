/* eslint-disable react-refresh/only-export-components */
// Entry file — createRoot called at bottom; fast-refresh does not apply here.
import './form.css';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ViewRoot,
  useSoamView,
  useViewQuery,
  useCapQuery,
  type BoundProxy,
} from '@ru-soam/view-kit';

// ── Types ──────────────────────────────────────────────────────────────────────

interface PatientRecord {
  id: string;
  createdAt: number;
  updatedAt: number;
  givenName: string;
  familyName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  dob?: string | null;
  status: string;
  displayName?: string;
}

interface PatientProfile {
  patientId: string;
  preferredLanguage?: string | null;
  medicationAwareness?: string | null;
  diagnosis?: string | null;
  updatedAt: number;
}

interface FormState {
  givenName: string;
  familyName: string;
  contactPhone: string;
  contactEmail: string;
  dob: string;
  status: string;
  preferredLanguage: string;
  diagnosis: string;
  medicationAwareness: string;
}

interface SaveStatus {
  text: string;
  kind: 'ok' | 'err' | 'locked';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getDisplayName(given: string, family: string): string {
  const g = given.trim();
  const f = family.trim();
  if (f) return `${f}, ${g}`;
  return g || '—';
}

function getInitials(given: string, family: string): string {
  const g = given.trim();
  const f = family.trim();
  let a = '';
  if (g) a += g[0].toUpperCase();
  if (f) a += f[0].toUpperCase();
  return a || '?';
}

// ── Panels ────────────────────────────────────────────────────────────────────

function LockedPanel() {
  return (
    <div id="state-locked">
      <p>🔒 Workspace is locked — unlock to view this client.</p>
    </div>
  );
}

function NotFoundPanel() {
  return (
    <div id="state-not-found">
      <p>Client record not found. It may have been deleted.</p>
    </div>
  );
}

// ── FormFields — shared presentational ────────────────────────────────────────

interface FormFieldsProps {
  form: FormState;
  onChange: (field: keyof FormState, value: string) => void;
  givenRef: RefObject<HTMLInputElement | null>;
  givenInvalid: boolean;
}

function FormFields({ form, onChange, givenRef, givenInvalid }: FormFieldsProps) {
  return (
    <>
      <div className="field-row">
        <div className="field-group">
          <label htmlFor="f-given">
            Given name<span className="req">*</span>
          </label>
          <input
            type="text"
            id="f-given"
            name="givenName"
            placeholder="First / given name"
            autoComplete="off"
            spellCheck={false}
            value={form.givenName}
            onChange={(e) => onChange('givenName', e.target.value)}
            aria-invalid={givenInvalid ? true : undefined}
            ref={givenRef}
          />
        </div>
        <div className="field-group">
          <label htmlFor="f-family">Family name</label>
          <input
            type="text"
            id="f-family"
            name="familyName"
            placeholder="Last / family name"
            autoComplete="off"
            spellCheck={false}
            value={form.familyName}
            onChange={(e) => onChange('familyName', e.target.value)}
          />
        </div>
      </div>

      <div className="divider" />

      <div className="field-row">
        <div className="field-group">
          <label htmlFor="f-phone">Phone</label>
          <input
            type="tel"
            id="f-phone"
            name="contactPhone"
            placeholder="+1 555 000 1234"
            autoComplete="off"
            value={form.contactPhone}
            onChange={(e) => onChange('contactPhone', e.target.value)}
          />
        </div>
        <div className="field-group">
          <label htmlFor="f-email">Email</label>
          <input
            type="email"
            id="f-email"
            name="contactEmail"
            placeholder="client@example.com"
            autoComplete="off"
            spellCheck={false}
            value={form.contactEmail}
            onChange={(e) => onChange('contactEmail', e.target.value)}
          />
        </div>
      </div>

      <div className="field-row">
        <div className="field-group">
          <label htmlFor="f-dob">Date of birth</label>
          <input
            type="date"
            id="f-dob"
            name="dob"
            value={form.dob}
            onChange={(e) => onChange('dob', e.target.value)}
          />
        </div>
        <div className="field-group">
          <label htmlFor="f-status">Status</label>
          <div className="select-wrap">
            <select
              id="f-status"
              name="status"
              value={form.status}
              onChange={(e) => onChange('status', e.target.value)}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </div>
      </div>

      <div className="divider" />

      <div className="field-row">
        <div className="field-group full">
          <label htmlFor="f-language">Preferred language</label>
          <input
            type="text"
            id="f-language"
            name="preferredLanguage"
            placeholder="e.g. Marathi, Hindi, English"
            autoComplete="off"
            spellCheck={false}
            value={form.preferredLanguage}
            onChange={(e) => onChange('preferredLanguage', e.target.value)}
          />
        </div>
      </div>

      <div className="field-row">
        <div className="field-group full">
          <label htmlFor="f-diagnosis">Diagnosis / problem list</label>
          <input
            type="text"
            id="f-diagnosis"
            name="diagnosis"
            placeholder="e.g. F33.2 Recurrent depressive disorder, severe"
            autoComplete="off"
            spellCheck={false}
            value={form.diagnosis}
            onChange={(e) => onChange('diagnosis', e.target.value)}
          />
        </div>
      </div>

      <div className="field-row">
        <div className="field-group full">
          <label htmlFor="f-meds">Medication awareness</label>
          <input
            type="text"
            id="f-meds"
            name="medicationAwareness"
            placeholder="e.g. Sertraline 100 mg OD"
            autoComplete="off"
            spellCheck={false}
            value={form.medicationAwareness}
            onChange={(e) => onChange('medicationAwareness', e.target.value)}
          />
        </div>
      </div>
    </>
  );
}

// ── ClientForm — top-level mode switch ────────────────────────────────────────

function ClientForm() {
  const params = useViewQuery();
  const id = params.id ?? null;
  const isCreate = id == null || id === 'new';

  if (isCreate) {
    return <CreateContent />;
  }
  return <EditContent id={id} />;
}

// ── CreateContent ─────────────────────────────────────────────────────────────

const CREATE_DEFAULT: FormState = {
  givenName: '',
  familyName: '',
  contactPhone: '',
  contactEmail: '',
  dob: '',
  status: 'active',
  preferredLanguage: '',
  diagnosis: '',
  medicationAwareness: '',
};

function CreateContent() {
  const soamView = useSoamView();
  const cmdProxyRef = useRef<Promise<BoundProxy> | null>(null);
  const [locked, setLocked] = useState(false);
  const [form, setForm] = useState<FormState>(CREATE_DEFAULT);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus | null>(null);
  const [givenInvalid, setGivenInvalid] = useState(false);
  const givenRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Bind command proxy on mount to detect locked state early.
  useEffect(() => {
    let cancelled = false;
    const p = soamView.bindCommand('record.patient', '1.0');
    cmdProxyRef.current = p;
    p.catch((err: unknown) => {
      if (!cancelled && window.__viewBoot.isLockedError(err)) setLocked(true);
    });
    return () => {
      cancelled = true;
    };
  }, [soamView]);

  function showSaveStatus(text: string, kind: 'ok' | 'err' | 'locked') {
    if (timerRef.current != null) clearTimeout(timerRef.current);
    setSaveStatus({ text, kind });
    if (kind !== 'locked') {
      timerRef.current = setTimeout(() => setSaveStatus(null), 3500);
    }
  }

  function onChange(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (field === 'givenName' && givenInvalid) setGivenInvalid(false);
  }

  async function onSave() {
    if (saving) return;

    const givenName = form.givenName.trim();
    if (!givenName) {
      setGivenInvalid(true);
      setSaveStatus({ text: 'Given name is required.', kind: 'err' });
      givenRef.current?.focus();
      return;
    }
    setGivenInvalid(false);
    setSaveStatus(null);
    setSaving(true);

    const familyName = form.familyName.trim();
    const contactPhone = form.contactPhone.trim();
    const contactEmail = form.contactEmail.trim();
    const dob = form.dob;

    const input: Record<string, unknown> = { givenName, status: form.status };
    if (familyName) input.familyName = familyName;
    if (contactPhone) input.contactPhone = contactPhone;
    if (contactEmail) input.contactEmail = contactEmail;
    if (dob) input.dob = dob;

    const profilePatch: Record<string, string> = {};
    const preferredLanguage = form.preferredLanguage.trim();
    const diagnosis = form.diagnosis.trim();
    const medicationAwareness = form.medicationAwareness.trim();
    if (preferredLanguage) profilePatch.preferredLanguage = preferredLanguage;
    if (diagnosis) profilePatch.diagnosis = diagnosis;
    if (medicationAwareness) profilePatch.medicationAwareness = medicationAwareness;

    try {
      if (!cmdProxyRef.current) {
        cmdProxyRef.current = soamView.bindCommand('record.patient', '1.0');
      }
      const proxy = await cmdProxyRef.current;
      const newRec = (await proxy.call('create', input)) as PatientRecord;
      const newId = newRec?.id;
      if (newId && Object.keys(profilePatch).length > 0) {
        await proxy.call('updateProfile', newId, profilePatch);
      }
      setSaving(false);
      soamView.requestClose();
    } catch (err: unknown) {
      setSaving(false);
      if (window.__viewBoot.isLockedError(err)) {
        showSaveStatus('Workspace locked — unlock to save.', 'locked');
      } else {
        showSaveStatus(`Create failed: ${(err as Error)?.message ?? 'Unknown error'}`, 'err');
      }
    }
  }

  // Derive live avatar + title from form state (create mode only).
  const liveTitle = form.givenName.trim()
    ? getDisplayName(form.givenName, form.familyName)
    : 'New Client';
  const liveAvatar = form.givenName.trim()
    ? getInitials(form.givenName, form.familyName)
    : '?';

  if (locked) return <LockedPanel />;

  return (
    <div id="page">
      <div id="form-card">
        <div id="card-header">
          <div id="card-avatar">{liveAvatar}</div>
          <div id="card-meta">
            <div id="card-title">{liveTitle}</div>
          </div>
        </div>

        <form
          id="patient-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void onSave();
          }}
        >
          <FormFields
            form={form}
            onChange={onChange}
            givenRef={givenRef}
            givenInvalid={givenInvalid}
          />
        </form>

        <div id="form-actions">
          <span
            id="save-status"
            role="status"
            aria-live="polite"
            className={saveStatus != null ? `visible ${saveStatus.kind}` : ''}
          >
            {saveStatus?.text ?? ''}
          </span>
          <button
            type="button"
            id="btn-save"
            className="btn btn-primary"
            disabled={saving}
            onClick={() => void onSave()}
          >
            {saving ? 'Creating…' : 'Create Client'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── EditContent — query wrapper (holds lifted save-status state) ──────────────

function EditContent({ id }: { id: string }) {
  const recQuery = useCapQuery('record.patient.query', '1.0', 'get', [id]);
  const profileQuery = useCapQuery('record.patient.query', '1.0', 'getProfile', [id]);

  /*
   * Save-status is lifted OUT of the keyed EditContentInner so the "Saved."
   * message survives the inner component remounting after TQ refetches
   * (updatedAt changes → key changes → inner unmounts+remounts, destroying
   * local state). The parent never remounts on a normal save/refetch cycle.
   */
  const [saveStatus, setSaveStatus] = useState<SaveStatus | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showSaveStatus(text: string, kind: 'ok' | 'err' | 'locked') {
    if (timerRef.current != null) clearTimeout(timerRef.current);
    setSaveStatus({ text, kind });
    if (kind !== 'locked') {
      timerRef.current = setTimeout(() => setSaveStatus(null), 3500);
    }
  }

  function clearSaveStatus() {
    if (timerRef.current != null) clearTimeout(timerRef.current);
    setSaveStatus(null);
  }

  const rec = recQuery.data as PatientRecord | null | undefined;
  const profile = profileQuery.data as PatientProfile | null | undefined;

  // Either query locked → show locked panel.
  if (
    (recQuery.isError && window.__viewBoot.isLockedError(recQuery.error)) ||
    (profileQuery.isError && window.__viewBoot.isLockedError(profileQuery.error))
  ) {
    return <LockedPanel />;
  }

  // Still loading.
  if (recQuery.isPending || profileQuery.isPending) {
    return (
      <div id="page">
        <div className="text-fg-muted text-xs">Loading…</div>
      </div>
    );
  }

  // Any non-locked error OR record null → not found.
  if (recQuery.isError || profileQuery.isError || rec == null) {
    return <NotFoundPanel />;
  }

  /*
   * Key on updatedAt so the inner form re-mounts (re-seeds state) after a
   * successful save or an external store change. TanStack Query structuralSharing
   * keeps the same reference when data is deeply equal, so spurious refetches
   * do NOT trigger a re-mount. The lifted saveStatus/showSaveStatus survive the
   * remount because they live here in the non-keyed parent.
   */
  return (
    <EditContentInner
      key={`${rec.updatedAt}/${profile?.updatedAt ?? 'np'}`}
      rec={rec}
      profile={profile ?? null}
      id={id}
      saveStatus={saveStatus}
      showSaveStatus={showSaveStatus}
      clearSaveStatus={clearSaveStatus}
    />
  );
}

// ── EditContentInner — keyed, re-mounts when data identity changes ─────────────

interface EditContentInnerProps {
  rec: PatientRecord;
  profile: PatientProfile | null;
  id: string;
  saveStatus: SaveStatus | null;
  showSaveStatus: (text: string, kind: 'ok' | 'err' | 'locked') => void;
  clearSaveStatus: () => void;
}

function EditContentInner({
  rec,
  profile,
  id,
  saveStatus,
  showSaveStatus,
  clearSaveStatus,
}: EditContentInnerProps) {
  const soamView = useSoamView();
  const cmdProxyRef = useRef<Promise<BoundProxy> | null>(null);
  // Tracks the last-loaded profile for diff calculation (clear-semantics patch).
  const loadedProfileRef = useRef<PatientProfile | null>(profile);

  const [form, setForm] = useState<FormState>({
    givenName: rec.givenName,
    familyName: rec.familyName ?? '',
    contactPhone: rec.contactPhone ?? '',
    contactEmail: rec.contactEmail ?? '',
    dob: rec.dob ?? '',
    status: rec.status,
    preferredLanguage: profile?.preferredLanguage ?? '',
    diagnosis: profile?.diagnosis ?? '',
    medicationAwareness: profile?.medicationAwareness ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [givenInvalid, setGivenInvalid] = useState(false);
  const givenRef = useRef<HTMLInputElement>(null);

  function onChange(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (field === 'givenName' && givenInvalid) setGivenInvalid(false);
  }

  async function onSave() {
    if (saving) return;

    const givenName = form.givenName.trim();
    if (!givenName) {
      setGivenInvalid(true);
      showSaveStatus('Given name is required.', 'err');
      givenRef.current?.focus();
      return;
    }
    setGivenInvalid(false);
    clearSaveStatus();
    setSaving(true);

    const familyName = form.familyName.trim();
    const contactPhone = form.contactPhone.trim();
    const contactEmail = form.contactEmail.trim();
    const dob = form.dob;

    const patch = {
      givenName,
      familyName: familyName || null,
      contactPhone: contactPhone || null,
      contactEmail: contactEmail || null,
      dob: dob || null,
      status: form.status,
    };

    // Clear-semantics profile patch: send the trimmed value (possibly '') for
    // each field that differs from the loaded profile value. NOT `|| null` —
    // updateProfile's update branch skips null but writes '' to clear a field.
    const prevProfile = loadedProfileRef.current;
    const profilePatch: Record<string, string> = {};
    const preferredLanguage = form.preferredLanguage.trim();
    const diagnosis = form.diagnosis.trim();
    const medicationAwareness = form.medicationAwareness.trim();
    if (preferredLanguage !== (prevProfile?.preferredLanguage ?? '')) {
      profilePatch.preferredLanguage = preferredLanguage;
    }
    if (diagnosis !== (prevProfile?.diagnosis ?? '')) {
      profilePatch.diagnosis = diagnosis;
    }
    if (medicationAwareness !== (prevProfile?.medicationAwareness ?? '')) {
      profilePatch.medicationAwareness = medicationAwareness;
    }

    try {
      if (!cmdProxyRef.current) {
        cmdProxyRef.current = soamView.bindCommand('record.patient', '1.0');
      }
      const proxy = await cmdProxyRef.current;
      const hasProfilePatch = Object.keys(profilePatch).length > 0;

      const [updatedRec, updatedProfile] = await Promise.all([
        proxy.call('update', id, patch) as Promise<PatientRecord>,
        hasProfilePatch
          ? (proxy.call('updateProfile', id, profilePatch) as Promise<PatientProfile>)
          : Promise.resolve<PatientProfile | null>(null),
      ]);

      // Repopulate local form state from the returned record/profile so the form
      // reflects server-canonical values immediately (before TQ refetch re-seeds).
      setForm((prev) => {
        const next = { ...prev };
        if (updatedRec) {
          next.givenName = updatedRec.givenName;
          next.familyName = updatedRec.familyName ?? '';
          next.contactPhone = updatedRec.contactPhone ?? '';
          next.contactEmail = updatedRec.contactEmail ?? '';
          next.dob = updatedRec.dob ?? '';
          next.status = updatedRec.status;
        }
        if (updatedProfile) {
          next.preferredLanguage = updatedProfile.preferredLanguage ?? '';
          next.diagnosis = updatedProfile.diagnosis ?? '';
          next.medicationAwareness = updatedProfile.medicationAwareness ?? '';
        }
        return next;
      });
      if (updatedProfile) {
        loadedProfileRef.current = updatedProfile;
      }

      setSaving(false);
      showSaveStatus('Saved.', 'ok');
    } catch (err: unknown) {
      setSaving(false);
      if (window.__viewBoot.isLockedError(err)) {
        showSaveStatus('Workspace locked — unlock to save.', 'locked');
      } else {
        showSaveStatus(`Save failed: ${(err as Error)?.message ?? 'Unknown error'}`, 'err');
      }
    }
  }

  const dn = getDisplayName(rec.givenName, rec.familyName ?? '');
  const av = getInitials(rec.givenName, rec.familyName ?? '');

  return (
    <div id="page">
      <div id="form-card">
        <div id="card-header">
          <div id="card-avatar">{av}</div>
          <div id="card-meta">
            <div id="card-title">{dn}</div>
            <div id="card-subtitle">{rec.id}</div>
          </div>
        </div>

        <form
          id="patient-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void onSave();
          }}
        >
          <FormFields
            form={form}
            onChange={onChange}
            givenRef={givenRef}
            givenInvalid={givenInvalid}
          />
        </form>

        <div id="form-actions">
          <span
            id="save-status"
            role="status"
            aria-live="polite"
            className={saveStatus != null ? `visible ${saveStatus.kind}` : ''}
          >
            {saveStatus?.text ?? ''}
          </span>
          <button
            type="button"
            id="btn-save"
            className="btn btn-primary"
            disabled={saving}
            onClick={() => void onSave()}
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Entry ──────────────────────────────────────────────────────────────────────

const rootEl = document.getElementById('root');
if (rootEl == null) throw new Error('[form] missing #root element');

createRoot(rootEl).render(
  <ViewRoot>
    <ClientForm />
  </ViewRoot>,
);
