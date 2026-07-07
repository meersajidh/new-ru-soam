/* eslint-disable react-refresh/only-export-components */
// Entry file — createRoot called at bottom; fast-refresh does not apply here.
import './safety-plan.css';
import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ViewRoot, useViewQuery, useCapQuery, useCapMutation } from '@ru-soam/view-kit';
import { Icon } from '@basebench/ui';

// ── Types ──────────────────────────────────────────────────────────────────────

interface SafetyPlanData {
  patientId?: string;
  status?: string;
  warningSigns?: string;
  copingStrategies?: string;
  socialSettingsContacts?: string;
  helpContacts?: string;
  professionalAgencies?: string;
  meansRestriction?: string;
  reasonsForLiving?: string;
  sharedWithNr?: boolean | number;
  updatedAt?: number | string;
}

interface PatientRecord {
  displayName?: string;
  givenName?: string;
}

// ── Field definitions (Stanley-Brown India-adapted) ───────────────────────────

interface FieldDef {
  key: keyof Omit<SafetyPlanData, 'patientId' | 'status' | 'sharedWithNr' | 'updatedAt'>;
  label: string;
  placeholder: string;
}

const FIELDS: FieldDef[] = [
  {
    key: 'warningSigns',
    label: 'Warning signs',
    placeholder:
      'Thoughts, images, mood, situation, behaviour that signal a crisis may be coming',
  },
  {
    key: 'copingStrategies',
    label: 'Coping strategies',
    placeholder:
      'Things I can do alone to distract or calm myself — incl. faith/spiritual practice, community rituals',
  },
  {
    key: 'socialSettingsContacts',
    label: 'Social settings & people for distraction',
    placeholder:
      'Places or family/community members who help me feel better without discussing crisis',
  },
  {
    key: 'helpContacts',
    label: 'People I can ask for help',
    placeholder: 'Pull from People/Circle — NR is primary contact; add name & phone number',
  },
  {
    key: 'professionalAgencies',
    label: 'Professionals & agencies',
    placeholder: 'Tele-MANAS 14416 (national helpline); treating clinician; hospital contact',
  },
  {
    key: 'meansRestriction',
    label: 'Means restriction',
    placeholder:
      'Pesticide/insecticide access, ligature points, medication quantity — consider family-held custody',
  },
  {
    key: 'reasonsForLiving',
    label: 'Reasons for living',
    placeholder: 'Family, children, faith, goals, cultural obligations',
  },
];

// ── SafetyPlan (outer) ────────────────────────────────────────────────────────

function SafetyPlan() {
  const params = useViewQuery();
  const clientId = params.id ?? null;

  const planQuery = useCapQuery('record.patient.query', '1.0', 'getSafetyPlan', [clientId], {
    enabled: clientId != null,
  });

  const recordQuery = useCapQuery('record.patient.query', '1.0', 'get', [clientId], {
    enabled: clientId != null,
  });

  // No-id guard — render error + minimal header, no data load.
  if (clientId == null) {
    return (
      <>
        <div id="status-bar" className="visible" role="alert">
          No client id in URL — open via the Safety plan button.
        </div>
        <div id="header-strip">
          <span className="hs-icon">
            <Icon name="shield" size={15} />
          </span>
          <span className="hs-title">Safety Plan</span>
        </div>
      </>
    );
  }

  const isLocked = planQuery.isError && window.__viewBoot.isLockedError(planQuery.error);

  const rec = recordQuery.data as PatientRecord | null | undefined;
  const clientName = rec?.displayName || rec?.givenName || clientId;

  const plan = planQuery.data as SafetyPlanData | null | undefined;

  return (
    <>
      {/* Status bars — at most one renders */}
      {isLocked && (
        <div id="status-bar" className="visible is-locked" role="alert">
          Workspace locked — unlock to view.
        </div>
      )}
      {planQuery.isError && !isLocked && (
        <div id="status-bar" className="visible" role="alert">
          {`Failed to load: ${(planQuery.error as Error)?.message ?? 'Unknown error'}`}
        </div>
      )}

      {/* Header strip */}
      <div id="header-strip">
        <span className="hs-icon">
          <Icon name="shield" size={15} />
        </span>
        <span className="hs-title">Safety Plan</span>
        <span className="hs-client">{clientName}</span>
      </div>

      {/* Scroll area */}
      <div id="sp-scroll">
        <div id="sp-card" data-maturity-id="safety-plan-editor">
          {planQuery.isPending && (
            <div className="text-muted-foreground text-xs">Loading…</div>
          )}
          {/*
           * Key on updatedAt so the form re-mounts (re-seeds state) after a
           * successful save or external store change that changes the plan.
           * TanStack Query structuralSharing keeps the same reference when data
           * is deeply equal, so spurious refetches do NOT trigger a re-mount.
           */}
          {planQuery.isSuccess && (
            <SafetyPlanForm
              key={plan?.updatedAt ?? 'none'}
              plan={plan ?? null}
              clientId={clientId}
            />
          )}
        </div>
      </div>
    </>
  );
}

// ── SafetyPlanForm (inner, controlled) ───────────────────────────────────────

interface SafetyPlanFormProps {
  plan: SafetyPlanData | null;
  clientId: string;
}

interface FormState {
  status: string;
  sharedWithNr: boolean;
  warningSigns: string;
  copingStrategies: string;
  socialSettingsContacts: string;
  helpContacts: string;
  professionalAgencies: string;
  meansRestriction: string;
  reasonsForLiving: string;
}

interface SaveMsg {
  text: string;
  kind: 'ok' | 'err';
}

function SafetyPlanForm({ plan, clientId }: SafetyPlanFormProps) {
  const mutation = useCapMutation('record.patient', '1.0', 'setSafetyPlan');

  const [form, setForm] = useState<FormState>({
    status: plan?.status ?? 'none',
    sharedWithNr: !!(plan?.sharedWithNr),
    warningSigns: plan?.warningSigns ?? '',
    copingStrategies: plan?.copingStrategies ?? '',
    socialSettingsContacts: plan?.socialSettingsContacts ?? '',
    helpContacts: plan?.helpContacts ?? '',
    professionalAgencies: plan?.professionalAgencies ?? '',
    meansRestriction: plan?.meansRestriction ?? '',
    reasonsForLiving: plan?.reasonsForLiving ?? '',
  });

  const [saveMsg, setSaveMsg] = useState<SaveMsg | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showSaveMsg(text: string, kind: 'ok' | 'err') {
    if (timerRef.current != null) clearTimeout(timerRef.current);
    setSaveMsg({ text, kind });
    if (kind === 'ok') {
      timerRef.current = setTimeout(() => setSaveMsg(null), 2000);
    }
  }

  function updateField(key: keyof FormState, value: string | boolean) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    const patch = {
      status: form.status,
      sharedWithNr: form.sharedWithNr,
      warningSigns: form.warningSigns,
      copingStrategies: form.copingStrategies,
      socialSettingsContacts: form.socialSettingsContacts,
      helpContacts: form.helpContacts,
      professionalAgencies: form.professionalAgencies,
      meansRestriction: form.meansRestriction,
      reasonsForLiving: form.reasonsForLiving,
    };
    mutation.mutate([clientId, patch], {
      onSuccess: () => {
        showSaveMsg('Saved.', 'ok');
      },
      onError: (err: unknown) => {
        if (window.__viewBoot.isLockedError(err)) {
          showSaveMsg('Workspace locked.', 'err');
        } else if (window.__viewBoot.isNotFoundError(err)) {
          showSaveMsg('Client not found.', 'err');
        } else {
          showSaveMsg(`Save failed: ${(err as Error)?.message ?? 'Unknown error'}`, 'err');
        }
      },
    });
  }

  return (
    <>
      {/* ── Plan status section ─────────────────────────────────────── */}
      <div>
        <div className="sp-section-head">Plan status</div>
        <div className="sp-field">
          <label className="sp-label" htmlFor="sp-status">
            Status
          </label>
          <select
            className="sp-input"
            id="sp-status"
            value={form.status}
            onChange={(e) => updateField('status', e.target.value)}
          >
            <option value="none">None</option>
            <option value="active">Active</option>
            <option value="under_review">Under review</option>
          </select>
        </div>
        <div className="sp-check-row">
          <input
            type="checkbox"
            id="sp-shared-nr"
            checked={form.sharedWithNr}
            onChange={(e) => updateField('sharedWithNr', e.target.checked)}
          />
          <label htmlFor="sp-shared-nr">
            Plan shared with Nominated Representative (NR)
          </label>
        </div>
      </div>

      {/* ── Stanley-Brown fields ─────────────────────────────────────── */}
      <div>
        <div className="sp-section-head">
          Safety plan content — Stanley-Brown (India-adapted)
        </div>
        {FIELDS.map((f) => (
          <div key={f.key} className="sp-field" style={{ marginBottom: '14px' }}>
            <label className="sp-label" htmlFor={`sp-${f.key}`}>
              {f.label}
            </label>
            <textarea
              className="sp-input"
              id={`sp-${f.key}`}
              rows={3}
              placeholder={f.placeholder}
              value={form[f.key]}
              onChange={(e) => updateField(f.key, e.target.value)}
            />
          </div>
        ))}
      </div>

      {/* ── Actions ─────────────────────────────────────────────────── */}
      <div id="sp-actions">
        <button
          type="button"
          className="sp-btn primary"
          disabled={mutation.isPending}
          onClick={handleSave}
        >
          <Icon name="save" size={12} />
          Save
        </button>
        <span
          className={`sp-save-msg${saveMsg != null ? ` visible ${saveMsg.kind}` : ''}`}
          role="status"
          aria-live="polite"
        >
          {saveMsg?.text ?? ''}
        </span>
      </div>
    </>
  );
}

// ── Entry ──────────────────────────────────────────────────────────────────────

const rootEl = document.getElementById('root');
if (rootEl == null) throw new Error('[safety-plan] missing #root element');

createRoot(rootEl).render(
  <ViewRoot>
    <SafetyPlan />
  </ViewRoot>,
);
