/* eslint-disable react-refresh/only-export-components */
// Entry file — createRoot called at bottom; fast-refresh does not apply here.
import './aspects.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ViewRoot, useSoamView, useViewContext, useCapQuery, useCapMutation, Icon } from '@ru-soam/view-kit';

// ── Types ──────────────────────────────────────────────────────────────────────

interface PatientRecord {
  id: string;
  displayName?: string;
  givenName?: string;
  familyName?: string;
  dob?: string;
  contactEmail?: string;
  contactPhone?: string;
}
interface PatientProfile {
  preferredLanguage?: string;
  diagnosis?: string;
  medicationAwareness?: string;
}
interface CircleMember {
  id: string;
  kind: string;
  displayName: string;
  relationship?: string;
  phone?: string;
  email?: string;
  isPrimaryNr?: boolean;
}
interface ConsentState {
  advanceDirectiveStatus?: string;
  informedConsentStatus?: string;
  teleConsentMode?: string;
  capacityStatus?: string;
  confidentialityExceptionActive?: boolean;
}
interface RiskEvent {
  kind: string;
  summary?: string;
  severity?: string;
  occurredAt?: number;
}
interface SafetyPlan {
  status?: string;
}
interface Alias {
  id: string;
  kind: string;
  valueNorm: string;
}
interface DocumentRow {
  id: string;
  title: string;
  mimeType?: string;
  createdAt?: number;
}

type MsgState = { t: string; k: 'ok' | 'err' } | null;

// ── Helpers ──────────────────────────────────────────────────────────────────────

function computeAge(dob?: string): number | null {
  if (!dob) return null;
  try {
    const birth = new Date(dob);
    if (isNaN(birth.getTime())) return null;
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const m = now.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
    return age >= 0 ? age : null;
  } catch {
    return null;
  }
}

function initials(rec: PatientRecord): string {
  const g = (rec.givenName ?? '').trim();
  const f = (rec.familyName ?? '').trim();
  let a = '';
  if (g) a += g[0].toUpperCase();
  if (f) a += f[0].toUpperCase();
  return a || '?';
}

function relDate(ts?: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 31) return `${Math.floor(days / 7)}w ago`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function lockedText(err: unknown, fallback: string): string {
  return window.__viewBoot.isLockedError(err) ? 'Workspace locked.' : fallback;
}

const CAPACITY_LABELS: Record<string, string> = {
  intact: 'Capacity intact',
  diminished: 'Capacity diminished',
  lacks: 'Lacks capacity',
  unassessed: 'Capacity unassessed',
};
const SEV_CLASS: Record<string, string> = {
  info: 'sev-info',
  concern: 'sev-concern',
  elevated: 'sev-elevated',
  critical: 'sev-critical',
};
const SEV_CONCERN_SET = new Set(['elevated', 'critical']);
const KIND_LABELS: Record<string, string> = {
  nominated_rep: 'Nominated Rep',
  caregiver: 'Caregiver',
  family: 'Family',
  emergency_contact: 'Emergency Contact',
};

// ── Form-message hook (auto-clears 'ok' after a delay; errors persist) ───────────

function useMsg(autoClearMs = 1400) {
  const [msg, setMsg] = useState<MsgState>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const showOk = useCallback(
    (t: string) => {
      clearTimeout(timer.current);
      setMsg({ t, k: 'ok' });
      timer.current = setTimeout(() => setMsg(null), autoClearMs);
    },
    [autoClearMs],
  );
  const showErr = useCallback((t: string) => {
    clearTimeout(timer.current);
    setMsg({ t, k: 'err' });
  }, []);
  const clear = useCallback(() => {
    clearTimeout(timer.current);
    setMsg(null);
  }, []);
  return { msg, showOk, showErr, clear };
}

// ── Overlay hook (form open + msg; 'ok' auto-closes the form after 1.2s) ─────────

function useOverlay() {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<MsgState>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const close = useCallback(() => {
    clearTimeout(timer.current);
    setOpen(false);
    setMsg(null);
  }, []);
  const showOk = useCallback((t: string) => {
    clearTimeout(timer.current);
    setMsg({ t, k: 'ok' });
    timer.current = setTimeout(() => {
      setOpen(false);
      setMsg(null);
    }, 1200);
  }, []);
  const showErr = useCallback((t: string) => {
    clearTimeout(timer.current);
    setMsg({ t, k: 'err' });
  }, []);
  return { open, setOpen, msg, close, showOk, showErr };
}

function SaveMsg({ msg }: { msg: MsgState }) {
  return (
    <span className={`pe-save-msg${msg ? ` visible ${msg.k}` : ''}`} role="status" aria-live="polite">
      {msg?.t ?? ''}
    </span>
  );
}

// ── Section shell ────────────────────────────────────────────────────────────────

interface SectionProps {
  domId: string;
  maturityId?: string;
  icon: string;
  title: string;
  open: boolean;
  onToggle: () => void;
  onEdit?: () => void;
  editIcon?: string;
  editActive?: boolean;
  editLabel?: string;
  children: React.ReactNode;
}

function Section({
  domId,
  maturityId,
  icon,
  title,
  open,
  onToggle,
  onEdit,
  editIcon = 'edit',
  editActive,
  editLabel,
  children,
}: SectionProps) {
  return (
    <section className="section" id={domId} data-maturity-id={maturityId}>
      <header
        className="section-header"
        tabIndex={0}
        role="button"
        aria-expanded={open}
        onClick={onToggle}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        <span className={`section-caret${open ? ' is-open' : ''}`}>
          <Icon name="chevron-right" size={12} />
        </span>
        <Icon name={icon} size={13} />
        <span className="section-title">{title}</span>
        <span className="section-source">PRACTICE</span>
        {onEdit && (
          <button
            className={`section-edit-btn${editActive ? ' is-active' : ''}`}
            type="button"
            title={editLabel}
            aria-label={editLabel}
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
          >
            <Icon name={editIcon} size={12} />
          </button>
        )}
      </header>
      <div className={`section-body${open ? ' is-open' : ''}`}>{children}</div>
    </section>
  );
}

// ── KV row ───────────────────────────────────────────────────────────────────────

function KvRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="kv-row">
      <span className="kv-label">{label}</span>
      <span className={value ? 'kv-value' : 'kv-value is-empty'}>{value || 'Not recorded'}</span>
    </div>
  );
}

// ── Risk section ─────────────────────────────────────────────────────────────────

function RiskSection({
  clientId,
  consent,
  riskEvents,
  circle,
  open,
  onToggle,
}: {
  clientId: string;
  consent: ConsentState | null;
  riskEvents: RiskEvent[] | null;
  circle: CircleMember[] | null;
  open: boolean;
  onToggle: () => void;
}) {
  const soamView = useSoamView();
  const s23 = useOverlay();
  const riskAdd = useOverlay();

  const s23Active = !!consent?.confidentialityExceptionActive;

  // §23 form fields
  const [s23Ground, setS23Ground] = useState('');
  const [s23Disclosed, setS23Disclosed] = useState('');
  const [s23Reason, setS23Reason] = useState('');
  // Add-risk-event fields
  const [reKind, setReKind] = useState('si');
  const [reSeverity, setReSeverity] = useState('');
  const [reSummary, setReSummary] = useState('');

  const toggleMut = useCapMutation('record.patient', '1.0', 'toggleException');
  const capMut = useCapMutation('record.patient', '1.0', 'setCapacity');
  const riskMut = useCapMutation('record.patient', '1.0', 'addRiskEvent');

  function openSafetyPlan() {
    soamView.openInEditor('safety-plan', {
      query: `id=${encodeURIComponent(clientId)}`,
      title: 'Safety Plan',
      entityId: clientId,
    });
  }

  function toggleS23Form() {
    if (s23.open) {
      s23.close();
    } else {
      setS23Ground('');
      setS23Disclosed('');
      setS23Reason('');
      s23.setOpen(true);
    }
  }

  function confirmS23() {
    if (toggleMut.isPending) return;
    const invoking = !s23Active;
    const payload: Record<string, string> = {};
    if (invoking) {
      if (!s23Ground) {
        s23.showErr('Select a statutory ground.');
        return;
      }
      payload.ground = s23Ground;
      payload.disclosedTo = s23Disclosed.trim();
      payload.reason = s23Reason.trim();
    } else {
      payload.reason = s23Reason.trim();
    }
    toggleMut.mutate([clientId, invoking, payload], {
      onSuccess: () => s23.showOk('Saved.'),
      onError: (e) => s23.showErr(lockedText(e, `Failed: ${(e as Error)?.message}`)),
    });
  }

  function changeCapacity(newStatus: string) {
    if (!newStatus) return;
    capMut.mutate([clientId, newStatus], {
      onError: () => {
        /* surfaced via query refetch; keep select reset */
      },
    });
  }

  function toggleRiskForm() {
    if (riskAdd.open) {
      riskAdd.close();
    } else {
      setReKind('si');
      setReSeverity('');
      setReSummary('');
      riskAdd.setOpen(true);
    }
  }

  function saveRiskEvent() {
    if (riskMut.isPending) return;
    riskMut.mutate(
      [clientId, { kind: reKind, severity: reSeverity || null, summary: reSummary.trim() || null }],
      {
        onSuccess: () => riskAdd.showOk('Added.'),
        onError: (e) => riskAdd.showErr(lockedText(e, `Failed: ${(e as Error)?.message}`)),
      },
    );
  }

  // Facts
  const capText = consent?.capacityStatus
    ? CAPACITY_LABELS[consent.capacityStatus] || consent.capacityStatus
    : 'Capacity unassessed';
  const nr = circle?.find((m) => m.isPrimaryNr) ?? null;
  const events = riskEvents ?? [];

  return (
    <Section domId="section-risk" maturityId="section-risk" icon="shield" title="Risk / Safety" open={open} onToggle={onToggle}>
      {/* Facts */}
      <div className="risk-facts">
        <div className="risk-fact">
          <span>{capText}</span>
        </div>
        <div className="risk-fact" style={s23Active ? { color: 'var(--color-error)' } : undefined}>
          {s23Active ? 'MHA §23 exception INVOKED' : 'MHA §23 not invoked'}
        </div>
        <div className="risk-fact">{nr ? `NR: ${nr.displayName}` : 'No NR set'}</div>
      </div>

      {/* Events */}
      <ul className="risk-items">
        {events.length === 0 ? (
          <li>
            <span className="risk-empty">No risk events logged.</span>
          </li>
        ) : (
          events.map((ev, i) => (
            <li className="risk-item" key={i}>
              <span className={`risk-dot ${SEV_CLASS[ev.severity ?? ''] || ''}`} />
              <span>{ev.summary || ev.kind}</span>
              <span className="risk-when">{relDate(ev.occurredAt)}</span>
            </li>
          ))
        )}
      </ul>

      {/* Actions */}
      <div className="risk-actions">
        <button className="action-btn" type="button" onClick={openSafetyPlan}>
          <Icon name="shield" size={11} />
          Open safety plan
        </button>
        <button className="action-btn" type="button" onClick={toggleS23Form}>
          <Icon name="law" size={11} />
          {s23Active ? 'Revoke §23' : 'Log §23 disclosure'}
        </button>
        <button className="action-btn" type="button" onClick={toggleRiskForm}>
          <Icon name="add" size={11} />
          Add risk event
        </button>
      </div>

      {/* §23 form */}
      <div className={`risk-inline-form${s23.open ? ' is-open' : ''}`}>
        {!s23Active && (
          <>
            <div className="pe-field">
              <label className="pe-label" htmlFor="s23-ground">
                Statutory ground <span style={{ color: 'var(--color-error)' }}>*</span>
              </label>
              <select
                className="pe-input"
                id="s23-ground"
                value={s23Ground}
                onChange={(e) => setS23Ground(e.target.value)}
              >
                <option value="">— select —</option>
                <option value="harm_to_others">Harm to others</option>
                <option value="threat_to_life">Threat to life</option>
                <option value="nr_duty">NR duty</option>
                <option value="professional_care">Professional care duty</option>
                <option value="authority_order">Authority order</option>
              </select>
            </div>
            <div className="pe-field">
              <label className="pe-label" htmlFor="s23-disclosed">
                Disclosed to
              </label>
              <input
                className="pe-input"
                id="s23-disclosed"
                type="text"
                placeholder="Name / organisation"
                autoComplete="off"
                spellCheck={false}
                value={s23Disclosed}
                onChange={(e) => setS23Disclosed(e.target.value)}
              />
            </div>
          </>
        )}
        <div className="pe-field">
          <label className="pe-label" htmlFor="s23-reason">
            Reason / notes
          </label>
          <textarea
            className="pe-input"
            id="s23-reason"
            rows={2}
            placeholder="Clinical rationale for disclosure"
            value={s23Reason}
            onChange={(e) => setS23Reason(e.target.value)}
          />
        </div>
        <div className="pe-actions">
          <button className="pe-btn primary" type="button" disabled={toggleMut.isPending} onClick={confirmS23}>
            Confirm
          </button>
          <button className="pe-btn" type="button" onClick={() => s23.close()}>
            Cancel
          </button>
          <SaveMsg msg={s23.msg} />
        </div>
      </div>

      {/* Capacity quick-set */}
      <div className="pe-field" style={{ marginTop: '10px' }}>
        <label className="pe-label" htmlFor="cap-select">
          Capacity
        </label>
        <select
          className="pe-input"
          id="cap-select"
          style={{ maxWidth: '180px' }}
          value=""
          onChange={(e) => changeCapacity(e.target.value)}
        >
          <option value="">— unchanged —</option>
          <option value="intact">Intact</option>
          <option value="diminished">Diminished</option>
          <option value="lacks">Lacks capacity</option>
          <option value="unassessed">Unassessed</option>
        </select>
      </div>

      {/* Add risk event form */}
      <div className={`risk-inline-form${riskAdd.open ? ' is-open' : ''}`}>
        <div className="pe-field">
          <label className="pe-label" htmlFor="re-kind">
            Event type <span style={{ color: 'var(--color-error)' }}>*</span>
          </label>
          <select className="pe-input" id="re-kind" value={reKind} onChange={(e) => setReKind(e.target.value)}>
            <option value="si">Suicidal ideation (SI)</option>
            <option value="self_harm">Self-harm</option>
            <option value="harm_to_others">Harm to others</option>
            <option value="means_restriction">Means restriction</option>
            <option value="safety_plan_review">Safety plan review</option>
            <option value="s23_disclosure">§23 disclosure</option>
            <option value="capacity_change">Capacity change</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="pe-field">
          <label className="pe-label" htmlFor="re-severity">
            Severity
          </label>
          <select
            className="pe-input"
            id="re-severity"
            value={reSeverity}
            onChange={(e) => setReSeverity(e.target.value)}
          >
            <option value="">— none —</option>
            <option value="info">Info</option>
            <option value="concern">Concern</option>
            <option value="elevated">Elevated</option>
            <option value="critical">Critical</option>
          </select>
        </div>
        <div className="pe-field">
          <label className="pe-label" htmlFor="re-summary">
            Summary (clinical notes)
          </label>
          <textarea
            className="pe-input"
            id="re-summary"
            rows={3}
            placeholder="Brief clinical note — stored PHI, not in audit"
            value={reSummary}
            onChange={(e) => setReSummary(e.target.value)}
          />
        </div>
        <div className="pe-actions">
          <button className="pe-btn primary" type="button" disabled={riskMut.isPending} onClick={saveRiskEvent}>
            Add event
          </button>
          <button className="pe-btn" type="button" onClick={() => riskAdd.close()}>
            Cancel
          </button>
          <SaveMsg msg={riskAdd.msg} />
        </div>
      </div>
    </Section>
  );
}

// ── Profile section ──────────────────────────────────────────────────────────────

function ProfileSection({
  clientId,
  profile,
  open,
  onToggle,
}: {
  clientId: string;
  profile: PatientProfile | null;
  open: boolean;
  onToggle: () => void;
}) {
  const ov = useOverlay();
  const [lang, setLang] = useState('');
  const [diag, setDiag] = useState('');
  const [meds, setMeds] = useState('');
  const mut = useCapMutation('record.patient', '1.0', 'updateProfile');

  function toggleEdit() {
    if (ov.open) {
      ov.close();
    } else {
      setLang(profile?.preferredLanguage ?? '');
      setDiag(profile?.diagnosis ?? '');
      setMeds(profile?.medicationAwareness ?? '');
      ov.setOpen(true);
    }
  }

  function save() {
    if (mut.isPending) return;
    // Send trimmed strings (not null) so a cleared field actually clears (upsert
    // skips null via COALESCE but writes '').
    mut.mutate(
      [clientId, { preferredLanguage: lang.trim(), diagnosis: diag.trim(), medicationAwareness: meds.trim() }],
      {
        onSuccess: () => ov.showOk('Saved.'),
        onError: (e) => ov.showErr(lockedText(e, `Save failed: ${(e as Error)?.message}`)),
      },
    );
  }

  const langLabel = profile?.preferredLanguage ? `${profile.preferredLanguage} (preferred)` : null;

  return (
    <Section
      domId="section-profile"
      maturityId="section-profile"
      icon="person"
      title="Profile"
      open={open}
      onToggle={onToggle}
      onEdit={toggleEdit}
      editActive={ov.open}
      editLabel="Edit profile"
    >
      <div className="kv">
        <KvRow label="Language" value={langLabel} />
        <KvRow label="Diagnosis" value={profile?.diagnosis} />
        <KvRow label="Medications" value={profile?.medicationAwareness} />
        <p className="note-subtle">Medication awareness only — not a prescribing workflow.</p>
      </div>
      <div className={`section-edit-form${ov.open ? ' is-open' : ''}`} id="profile-edit-form">
        <div className="pe-field">
          <label className="pe-label" htmlFor="pe-language">
            Preferred language
          </label>
          <input
            className="pe-input"
            id="pe-language"
            type="text"
            placeholder="e.g. Marathi"
            autoComplete="off"
            spellCheck={false}
            value={lang}
            onChange={(e) => setLang(e.target.value)}
          />
        </div>
        <div className="pe-field">
          <label className="pe-label" htmlFor="pe-diagnosis">
            Diagnosis / problem list
          </label>
          <input
            className="pe-input"
            id="pe-diagnosis"
            type="text"
            placeholder="e.g. F33.2 Recurrent depressive disorder"
            autoComplete="off"
            spellCheck={false}
            value={diag}
            onChange={(e) => setDiag(e.target.value)}
          />
        </div>
        <div className="pe-field">
          <label className="pe-label" htmlFor="pe-meds">
            Medication awareness
          </label>
          <input
            className="pe-input"
            id="pe-meds"
            type="text"
            placeholder="e.g. Sertraline 100 mg OD"
            autoComplete="off"
            spellCheck={false}
            value={meds}
            onChange={(e) => setMeds(e.target.value)}
          />
        </div>
        <div className="pe-actions">
          <button className="pe-btn primary" type="button" disabled={mut.isPending} onClick={save}>
            Save
          </button>
          <button className="pe-btn" type="button" onClick={() => ov.close()}>
            Cancel
          </button>
          <SaveMsg msg={ov.msg} />
        </div>
      </div>
    </Section>
  );
}

// ── Identifiers / aliases section ────────────────────────────────────────────────

function IdentifiersSection({
  clientId,
  record,
  aliases,
  open,
  onToggle,
}: {
  clientId: string;
  record: PatientRecord;
  aliases: Alias[] | null;
  open: boolean;
  onToggle: () => void;
}) {
  const { msg, showOk, showErr } = useMsg();
  const [kind, setKind] = useState('email');
  const [value, setValue] = useState('');

  const addMut = useCapMutation('record.patient', '1.0', 'addAlias');
  const removeMut = useCapMutation('record.patient', '1.0', 'removeAlias');
  const primaryMut = useCapMutation('record.patient', '1.0', 'setPrimaryIdentity');
  const busy = addMut.isPending || removeMut.isPending || primaryMut.isPending;

  function add() {
    if (busy) return;
    const v = value.trim();
    if (!v) {
      showErr('Enter a value.');
      return;
    }
    const input = kind === 'email' ? { email: v } : { phone: v };
    addMut.mutate([clientId, input], {
      onSuccess: () => {
        setValue('');
        showOk('Added.');
      },
      onError: (e) => showErr(lockedText(e, `Error: ${(e as Error)?.message}`)),
    });
  }

  function remove(aliasId: string) {
    if (busy) return;
    removeMut.mutate([clientId, aliasId], {
      onError: (e) => showErr(lockedText(e, `Remove failed: ${(e as Error)?.message}`)),
    });
  }

  function setPrimary(aliasId: string) {
    if (busy) return;
    primaryMut.mutate([clientId, aliasId], {
      onError: (e) => showErr(lockedText(e, `Error: ${(e as Error)?.message}`)),
    });
  }

  const list = aliases ?? [];

  return (
    <Section domId="section-identifiers" icon="account" title="Other identifiers" open={open} onToggle={onToggle}>
      <div className="kv" id="id-primary-kv" style={{ marginBottom: '10px' }}>
        <KvRow label="Primary email" value={record.contactEmail} />
        <KvRow label="Primary phone" value={record.contactPhone} />
      </div>
      <div className="alias-list">
        {list.length === 0 ? (
          <p className="note-subtle">No other identifiers.</p>
        ) : (
          list.map((alias) => (
            <div className="alias-row" key={alias.id}>
              <span className="alias-kind">{alias.kind}</span>
              <span className="alias-value">{alias.valueNorm}</span>
              <div className="alias-actions">
                <button className="pe-btn" type="button" disabled={busy} onClick={() => remove(alias.id)}>
                  Remove
                </button>
                {(alias.kind === 'email' || alias.kind === 'phone') && (
                  <button className="pe-btn" type="button" disabled={busy} onClick={() => setPrimary(alias.id)}>
                    Set as primary
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
      <div id="alias-add-form">
        <div className="pe-field">
          <label className="pe-label" htmlFor="aa-kind">
            Type
          </label>
          <select
            className="pe-input"
            id="aa-kind"
            style={{ height: '26px', padding: '3px 6px', flex: '0 0 80px' }}
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="email">Email</option>
            <option value="phone">Phone</option>
          </select>
        </div>
        <div className="pe-field">
          <label className="pe-label" htmlFor="aa-value">
            Value
          </label>
          <input
            className="pe-input"
            id="aa-value"
            type="text"
            placeholder="e.g. alt@example.com"
            autoComplete="off"
            spellCheck={false}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <div className="pe-actions">
          <button className="pe-btn primary" type="button" disabled={busy} onClick={add}>
            Add
          </button>
          <SaveMsg msg={msg} />
        </div>
      </div>
    </Section>
  );
}

// ── Circle section ───────────────────────────────────────────────────────────────

function CircleSection({
  clientId,
  circle,
  open,
  onToggle,
}: {
  clientId: string;
  circle: CircleMember[] | null;
  open: boolean;
  onToggle: () => void;
}) {
  const ov = useOverlay();
  const [kind, setKind] = useState('nominated_rep');
  const [name, setName] = useState('');
  const [relationship, setRelationship] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [isNr, setIsNr] = useState(false);

  const addMut = useCapMutation('record.patient', '1.0', 'addCircleMember');
  const nrMut = useCapMutation('record.patient', '1.0', 'setNR');

  function toggleAdd() {
    if (ov.open) {
      ov.close();
    } else {
      setKind('nominated_rep');
      setName('');
      setRelationship('');
      setPhone('');
      setEmail('');
      setIsNr(false);
      ov.setOpen(true);
    }
  }

  function save() {
    if (addMut.isPending) return;
    const displayName = name.trim();
    if (!displayName) {
      ov.showErr('Display name is required.');
      return;
    }
    addMut.mutate(
      [
        clientId,
        {
          kind,
          displayName,
          relationship: relationship.trim() || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
          isPrimaryNr: isNr,
        },
      ],
      {
        onSuccess: () => ov.showOk('Added.'),
        onError: (e) => ov.showErr(lockedText(e, `Failed: ${(e as Error)?.message}`)),
      },
    );
  }

  function setNR(memberId: string) {
    nrMut.mutate([clientId, memberId]);
  }

  const list = circle ?? [];

  return (
    <Section
      domId="section-circle"
      icon="organization"
      title="People / Circle"
      open={open}
      onToggle={onToggle}
      onEdit={toggleAdd}
      editIcon="add"
      editActive={ov.open}
      editLabel="Add circle member"
    >
      <div className="circle-list">
        {list.length === 0 ? (
          <div className="circle-empty">No circle members recorded.</div>
        ) : (
          list.map((member) => {
            const meta = [member.relationship, member.phone, member.email].filter(Boolean).join(' · ');
            return (
              <div className="circle-member" key={member.id}>
                <div className="circle-member-row">
                  <span className="circle-member-name">{member.displayName}</span>
                  <span className="circle-member-kind">{KIND_LABELS[member.kind] || member.kind}</span>
                  {member.isPrimaryNr && <span className="circle-nr-badge">NR</span>}
                </div>
                {meta && <div className="circle-member-meta">{meta}</div>}
                <div className="circle-member-actions">
                  {!member.isPrimaryNr && (
                    <button
                      className="circle-action-btn"
                      type="button"
                      disabled={nrMut.isPending}
                      onClick={() => setNR(member.id)}
                    >
                      Set as NR
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
      <div className={`section-edit-form${ov.open ? ' is-open' : ''}`} id="circle-add-form">
        <div className="pe-field">
          <label className="pe-label" htmlFor="ca-kind">
            Role
          </label>
          <select className="pe-input" id="ca-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="nominated_rep">Nominated Representative</option>
            <option value="caregiver">Caregiver</option>
            <option value="family">Family</option>
            <option value="emergency_contact">Emergency Contact</option>
          </select>
        </div>
        <div className="pe-field">
          <label className="pe-label" htmlFor="ca-name">
            Display name <span style={{ color: 'var(--color-error)' }}>*</span>
          </label>
          <input
            className="pe-input"
            id="ca-name"
            type="text"
            placeholder="Full name"
            autoComplete="off"
            spellCheck={false}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="pe-field">
          <label className="pe-label" htmlFor="ca-relationship">
            Relationship
          </label>
          <input
            className="pe-input"
            id="ca-relationship"
            type="text"
            placeholder="e.g. Spouse"
            autoComplete="off"
            spellCheck={false}
            value={relationship}
            onChange={(e) => setRelationship(e.target.value)}
          />
        </div>
        <div className="pe-field">
          <label className="pe-label" htmlFor="ca-phone">
            Phone
          </label>
          <input
            className="pe-input"
            id="ca-phone"
            type="text"
            placeholder="e.g. +91 98765 43210"
            autoComplete="off"
            spellCheck={false}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <div className="pe-field">
          <label className="pe-label" htmlFor="ca-email">
            Email
          </label>
          <input
            className="pe-input"
            id="ca-email"
            type="email"
            placeholder="e.g. name@example.com"
            autoComplete="off"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="pe-field" style={{ flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
          <input
            type="checkbox"
            id="ca-isnr"
            style={{ accentColor: 'var(--color-accent)', width: '14px', height: '14px' }}
            checked={isNr}
            onChange={(e) => setIsNr(e.target.checked)}
          />
          <label
            className="pe-label"
            htmlFor="ca-isnr"
            style={{ textTransform: 'none', fontSize: '11px', fontWeight: 400, color: 'var(--color-fg-secondary)' }}
          >
            Set as Nominated Representative (primary contact)
          </label>
        </div>
        <div className="pe-actions">
          <button className="pe-btn primary" type="button" disabled={addMut.isPending} onClick={save}>
            Add Member
          </button>
          <button className="pe-btn" type="button" onClick={() => ov.close()}>
            Cancel
          </button>
          <SaveMsg msg={ov.msg} />
        </div>
      </div>
    </Section>
  );
}

// ── Consent section ──────────────────────────────────────────────────────────────

function ConsentSection({
  clientId,
  consent,
  open,
  onToggle,
}: {
  clientId: string;
  consent: ConsentState | null;
  open: boolean;
  onToggle: () => void;
}) {
  const ov = useOverlay();
  const [ad, setAd] = useState('');
  const [ic, setIc] = useState('');
  const [tele, setTele] = useState('');
  const [cap, setCap] = useState('');
  const [s23, setS23] = useState(false);
  const mut = useCapMutation('record.patient', '1.0', 'setConsentState');

  function toggleEdit() {
    if (ov.open) {
      ov.close();
    } else {
      setAd(consent?.advanceDirectiveStatus ?? '');
      setIc(consent?.informedConsentStatus ?? '');
      setTele(consent?.teleConsentMode ?? '');
      setCap(consent?.capacityStatus ?? '');
      setS23(!!consent?.confidentialityExceptionActive);
      ov.setOpen(true);
    }
  }

  function save() {
    if (mut.isPending) return;
    mut.mutate(
      [
        clientId,
        {
          advanceDirectiveStatus: ad.trim() || null,
          informedConsentStatus: ic.trim() || null,
          teleConsentMode: tele.trim() || null,
          capacityStatus: cap.trim() || null,
          confidentialityExceptionActive: s23,
        },
      ],
      {
        onSuccess: () => ov.showOk('Saved.'),
        onError: (e) => ov.showErr(lockedText(e, `Save failed: ${(e as Error)?.message}`)),
      },
    );
  }

  return (
    <Section
      domId="section-consent"
      icon="law"
      title="Consent & Legal"
      open={open}
      onToggle={onToggle}
      onEdit={toggleEdit}
      editActive={ov.open}
      editLabel="Edit consent & legal"
    >
      <div className="consent-kv">
        <KvRow label="Advance directive" value={consent?.advanceDirectiveStatus} />
        <KvRow label="Informed consent" value={consent?.informedConsentStatus} />
        <KvRow label="Tele-consent" value={consent?.teleConsentMode} />
        <KvRow label="Capacity status" value={consent?.capacityStatus} />
        {consent?.confidentialityExceptionActive && (
          <div className="consent-flag-row">MHA §23 confidentiality exception — currently active</div>
        )}
      </div>
      <div className={`section-edit-form${ov.open ? ' is-open' : ''}`} id="consent-edit-form">
        <div className="pe-field">
          <label className="pe-label" htmlFor="ce-ad-status">
            Advance directive status
          </label>
          <input
            className="pe-input"
            id="ce-ad-status"
            type="text"
            placeholder="e.g. Active, Filed, None"
            autoComplete="off"
            spellCheck={false}
            value={ad}
            onChange={(e) => setAd(e.target.value)}
          />
        </div>
        <div className="pe-field">
          <label className="pe-label" htmlFor="ce-consent-status">
            Informed consent status
          </label>
          <input
            className="pe-input"
            id="ce-consent-status"
            type="text"
            placeholder="e.g. Signed, Verbal, Pending"
            autoComplete="off"
            spellCheck={false}
            value={ic}
            onChange={(e) => setIc(e.target.value)}
          />
        </div>
        <div className="pe-field">
          <label className="pe-label" htmlFor="ce-tele-mode">
            Tele-consent mode
          </label>
          <input
            className="pe-input"
            id="ce-tele-mode"
            type="text"
            placeholder="e.g. Video, Audio-only, None"
            autoComplete="off"
            spellCheck={false}
            value={tele}
            onChange={(e) => setTele(e.target.value)}
          />
        </div>
        <div className="pe-field">
          <label className="pe-label" htmlFor="ce-capacity">
            Capacity status
          </label>
          <input
            className="pe-input"
            id="ce-capacity"
            type="text"
            placeholder="e.g. Intact, Under review, Impaired"
            autoComplete="off"
            spellCheck={false}
            value={cap}
            onChange={(e) => setCap(e.target.value)}
          />
        </div>
        <div className="pe-field" style={{ flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
          <input
            type="checkbox"
            id="ce-s23"
            style={{ accentColor: 'var(--color-warning)', width: '14px', height: '14px' }}
            checked={s23}
            onChange={(e) => setS23(e.target.checked)}
          />
          <label
            className="pe-label"
            htmlFor="ce-s23"
            style={{ textTransform: 'none', fontSize: '11px', fontWeight: 400, color: 'var(--color-fg-secondary)' }}
          >
            MHA §23 confidentiality exception currently active
          </label>
        </div>
        <div className="pe-actions">
          <button className="pe-btn primary" type="button" disabled={mut.isPending} onClick={save}>
            Save
          </button>
          <button className="pe-btn" type="button" onClick={() => ov.close()}>
            Cancel
          </button>
          <SaveMsg msg={ov.msg} />
        </div>
      </div>
    </Section>
  );
}

// ── Documents section ────────────────────────────────────────────────────────────

const DOC_MAX_BYTES = 25 * 1024 * 1024;

function fmtSize(bytes?: number): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DocumentsSection({
  clientId,
  documents,
  open,
  onToggle,
}: {
  clientId: string;
  documents: DocumentRow[] | null;
  open: boolean;
  onToggle: () => void;
}) {
  const { msg, showOk, showErr } = useMsg(2000);
  const [file, setFile] = useState<File | null>(null);
  const [sizeErr, setSizeErr] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const attachMut = useCapMutation('record.patient', '1.0', 'attachDocument');
  const removeMut = useCapMutation('record.patient', '1.0', 'removeDocument');

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setSizeErr('');
    if (!f) {
      setFile(null);
      return;
    }
    if (f.size > DOC_MAX_BYTES) {
      setSizeErr('File too large (max 25 MB).');
      setFile(null);
      return;
    }
    setFile(f);
  }

  function upload() {
    if (attachMut.isPending || !file) return;
    if (file.size > DOC_MAX_BYTES) {
      setSizeErr('File too large (max 25 MB).');
      return;
    }
    setSizeErr('');
    const f = file;
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = String(e.target?.result ?? '');
      const commaIdx = dataUrl.indexOf(',');
      const base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
      attachMut.mutate([clientId, { fileName: f.name, mimeType: f.type || null, base64 }], {
        onSuccess: () => {
          setFile(null);
          if (fileInputRef.current) fileInputRef.current.value = '';
          showOk('Attached.');
        },
        onError: (err) => showErr(lockedText(err, `Upload failed: ${(err as Error)?.message}`)),
      });
    };
    reader.onerror = () => showErr('Could not read file.');
    reader.readAsDataURL(f);
  }

  function remove(docId: string) {
    removeMut.mutate([clientId, docId], {
      onError: (e) => showErr(lockedText(e, `Remove failed: ${(e as Error)?.message}`)),
    });
  }

  const list = documents ?? [];

  return (
    <Section domId="section-documents" maturityId="section-documents" icon="file" title="Documents" open={open} onToggle={onToggle}>
      <div className="doc-list">
        {list.length === 0 ? (
          <div className="doc-empty">No documents.</div>
        ) : (
          list.map((doc) => {
            const meta = [doc.mimeType, doc.createdAt ? relDate(doc.createdAt) : null]
              .filter(Boolean)
              .join(' · ');
            return (
              <div className="doc-item" key={doc.id}>
                <span className="doc-icon">
                  <Icon name="file" size={12} />
                </span>
                <div className="doc-info">
                  <div className="doc-title">{doc.title}</div>
                  {meta && <div className="doc-meta">{meta}</div>}
                </div>
                <button
                  className="doc-remove-btn"
                  type="button"
                  disabled={removeMut.isPending}
                  onClick={() => remove(doc.id)}
                >
                  Remove
                </button>
              </div>
            );
          })
        )}
      </div>
      <div id="doc-upload-form" style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--color-border)' }}>
        <div className="pe-field" style={{ marginBottom: '6px' }}>
          <label className="pe-label" htmlFor="doc-file-input">
            Attach file
          </label>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '3px' }}>
            <label className="pe-btn" htmlFor="doc-file-input" style={{ cursor: 'pointer' }}>
              <Icon name="file-add" size={11} />
              Choose file
            </label>
            <span
              style={{
                fontSize: '10.5px',
                color: 'var(--color-fg-muted)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '140px',
              }}
            >
              {file ? `${file.name} · ${fmtSize(file.size)}` : ''}
            </span>
            <input
              type="file"
              id="doc-file-input"
              ref={fileInputRef}
              style={{ display: 'none' }}
              onChange={onFileChange}
            />
          </div>
        </div>
        {sizeErr && (
          <div style={{ fontSize: '10.5px', color: 'var(--color-error)', marginBottom: '6px' }}>{sizeErr}</div>
        )}
        <div className="pe-actions">
          <button className="pe-btn primary" type="button" disabled={!file || attachMut.isPending} onClick={upload}>
            <Icon name="cloud-upload" size={11} />
            Attach
          </button>
          <SaveMsg msg={msg} />
        </div>
      </div>
    </Section>
  );
}

// ── Aspects (root) ───────────────────────────────────────────────────────────────

type SectionKey = 'risk' | 'profile' | 'identifiers' | 'circle' | 'consent' | 'documents';

const DEFAULT_OPEN: Record<SectionKey, boolean> = {
  risk: true,
  profile: true,
  identifiers: false,
  circle: false,
  consent: false,
  documents: false,
};

function Aspects() {
  const { entityId } = useViewContext();
  const enabled = entityId != null && entityId !== 'new';

  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>(DEFAULT_OPEN);

  const recordQ = useCapQuery('record.patient.query', '1.0', 'get', [entityId], { enabled });
  const profileQ = useCapQuery('record.patient.query', '1.0', 'getProfile', [entityId], { enabled });
  const circleQ = useCapQuery('record.patient.query', '1.0', 'getCircle', [entityId], { enabled });
  const consentQ = useCapQuery('record.patient.query', '1.0', 'getConsentState', [entityId], { enabled });
  const riskQ = useCapQuery('record.patient.query', '1.0', 'listRiskEvents', [entityId], { enabled });
  const safetyQ = useCapQuery('record.patient.query', '1.0', 'getSafetyPlan', [entityId], { enabled });
  const docsQ = useCapQuery('record.patient.query', '1.0', 'listDocuments', [entityId], { enabled });
  const aliasQ = useCapQuery('record.patient.query', '1.0', 'getAliases', [entityId], { enabled });

  const record = (recordQ.data as PatientRecord | null) ?? null;
  const profile = (profileQ.data as PatientProfile | null) ?? null;
  const circle = (circleQ.data as CircleMember[] | null) ?? null;
  const consent = (consentQ.data as ConsentState | null) ?? null;
  const riskEvents = (riskQ.data as RiskEvent[] | null) ?? null;
  const safetyPlan = (safetyQ.data as SafetyPlan | null) ?? null;
  const documents = (docsQ.data as DocumentRow[] | null) ?? null;
  const aliases = (aliasQ.data as Alias[] | null) ?? null;

  function toggle(key: SectionKey) {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  // focusAspect deep-link (O465): collapse all but the target, then scroll to it.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const d = e.data;
      if (!d || d.__soamView !== true || d.kind !== 'focusAspect') return;
      const sectionId: string = d.sectionId ?? '';
      const key = sectionId.replace('section-', '') as SectionKey;
      if (!(key in DEFAULT_OPEN)) return;
      setOpenSections({
        risk: false,
        profile: false,
        identifiers: false,
        circle: false,
        consent: false,
        documents: false,
        [key]: true,
      });
      // Defer scroll until the section has rendered open.
      requestAnimationFrame(() => {
        document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // ── Active-concern alert bar ────────────────────────────────────────────────
  const hasConcern =
    !!consent?.confidentialityExceptionActive ||
    safetyPlan?.status === 'active' ||
    (riskEvents != null && riskEvents.length > 0 && SEV_CONCERN_SET.has(riskEvents[0].severity ?? ''));

  // ── Top-level states ────────────────────────────────────────────────────────
  if (!enabled) {
    return null;
  }
  if (recordQ.isError && window.__viewBoot.isLockedError(recordQ.error)) {
    return (
      <div id="status-bar" className="visible is-locked" role="alert">
        Workspace locked — unlock to view client.
      </div>
    );
  }
  if (recordQ.isError) {
    return (
      <div id="status-bar" className="visible" role="alert">
        {`Failed to load: ${(recordQ.error as Error)?.message ?? 'Unknown error'}`}
      </div>
    );
  }
  if (recordQ.isPending || !record) {
    return (
      <div className="aspects-loading">
        <span className="spinner" />
        Loading…
      </div>
    );
  }

  const age = computeAge(record.dob);

  return (
    <>
      {/* Identity strip */}
      <div id="identity-strip">
        <div className="id-avatar">{initials(record)}</div>
        <div className="id-text">
          <div className="id-name">
            {record.displayName || `${record.givenName ?? ''} ${record.familyName ?? ''}`.trim()}
          </div>
          <div className="id-sub">{age !== null ? `age ${age}` : record.id}</div>
        </div>
      </div>

      <div id="aspects-scroll">
        {hasConcern && (
          <div className="risk-alert-bar">
            <Icon name="shield" size={13} />
            Risk / Safety — active concern
          </div>
        )}

        <RiskSection
          clientId={record.id}
          consent={consent}
          riskEvents={riskEvents}
          circle={circle}
          open={openSections.risk}
          onToggle={() => toggle('risk')}
        />
        <ProfileSection
          clientId={record.id}
          profile={profile}
          open={openSections.profile}
          onToggle={() => toggle('profile')}
        />
        <IdentifiersSection
          clientId={record.id}
          record={record}
          aliases={aliases}
          open={openSections.identifiers}
          onToggle={() => toggle('identifiers')}
        />
        <CircleSection
          clientId={record.id}
          circle={circle}
          open={openSections.circle}
          onToggle={() => toggle('circle')}
        />
        <ConsentSection
          clientId={record.id}
          consent={consent}
          open={openSections.consent}
          onToggle={() => toggle('consent')}
        />
        <DocumentsSection
          clientId={record.id}
          documents={documents}
          open={openSections.documents}
          onToggle={() => toggle('documents')}
        />
      </div>
    </>
  );
}

// ── Entry ──────────────────────────────────────────────────────────────────────

const rootEl = document.getElementById('root');
if (rootEl == null) throw new Error('[aspects] missing #root element');

createRoot(rootEl).render(
  <ViewRoot>
    <Aspects />
  </ViewRoot>,
);
