/* eslint-disable react-refresh/only-export-components */
// Entry file — createRoot called at bottom; fast-refresh does not apply here.
import './projections.css';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ViewRoot, useSoamView, useViewContext, useCapQuery, Icon } from '@ru-soam/view-kit';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Note {
  when: string;
  kind: string;
  summary: string;
  reviewed: boolean;
  pinned: boolean;
  flagged: boolean;
}

interface PatientRecord {
  givenName?: string;
  familyName?: string;
}

// ── Mock data (Phase A — ported from legacy projections.html) ──────────────────

const INITIAL_NOTES: Note[] = [
  {
    when: '28 May 2026',
    kind: 'Progress note',
    summary:
      'SI passive, safety plan revisited. Sleep improving on sertraline 100 mg. Continue BA homework.',
    reviewed: false,
    pinned: true,
    flagged: true,
  },
  {
    when: '14 May 2026',
    kind: 'Progress note',
    summary: 'Sertraline titrated to 100 mg. Tele-consent recorded.',
    reviewed: true,
    pinned: false,
    flagged: false,
  },
  {
    when: '30 Apr 2026',
    kind: 'Progress note',
    summary: 'Behavioural activation introduced. Sleep routine discussed.',
    reviewed: true,
    pinned: false,
    flagged: false,
  },
  {
    when: '16 Apr 2026',
    kind: 'Intake note',
    summary: 'Initial assessment & formulation completed. PHQ-9 = 21.',
    reviewed: true,
    pinned: false,
    flagged: false,
  },
];

// ── Projections component ──────────────────────────────────────────────────────

function Projections() {
  const { entityId } = useViewContext();
  const soamView = useSoamView();

  // Local overlay toggle state (mock Phase A — notes are not per-client yet).
  const [notes, setNotes] = useState<Note[]>(() => INITIAL_NOTES.map((n) => ({ ...n })));

  // Client name — entity-gated: only fetches when entityId arrives.
  const patientQuery = useCapQuery(
    'record.patient.query',
    '1.0',
    'get',
    [entityId],
    { enabled: entityId != null },
  );

  // Detect locked-workspace error on the name query.
  const isLocked =
    patientQuery.isError && window.__viewBoot.isLockedError(patientQuery.error);

  // Build display name from record fields (best-effort; empty on failure / no entity).
  let clientName = '';
  if (!patientQuery.isError && patientQuery.data != null) {
    const rec = patientQuery.data as PatientRecord;
    const given = (rec.givenName ?? '').trim();
    const family = (rec.familyName ?? '').trim();
    clientName = [given, family].filter(Boolean).join(' ');
  }

  function toggleNote(idx: number, key: 'reviewed' | 'pinned' | 'flagged') {
    setNotes((prev) => prev.map((n, i) => (i === idx ? { ...n, [key]: !n[key] } : n)));
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Status bar — locked or error state */}
      {isLocked && (
        <div id="status-bar" className="visible is-locked" role="alert">
          Workspace locked.
        </div>
      )}
      {patientQuery.isError && !isLocked && (
        <div id="status-bar" className="visible" role="alert">
          {`Failed to load: ${(patientQuery.error as Error)?.message ?? 'Unknown error'}`}
        </div>
      )}

      {/* Header bar */}
      <div id="header-bar">
        <span className="header-title">
          <Icon name="file-text" size={12} />
          Notes
          <span className="header-source">Sessions</span>
          <span id="header-client-name" aria-live="polite">
            {clientName ? `· ${clientName}` : ''}
          </span>
        </span>
        <button
          className="header-link"
          type="button"
          title="Open Sessions Activity"
          onClick={() => soamView.openActivity('ru-soam-sessions.container')}
        >
          Sessions
          <Icon name="link-external" size={11} />
        </button>
      </div>

      {/* Notes scroll area */}
      <div id="notes-scroll" data-maturity-id="notes-view">
        <ul className="note-list">
          {notes.length === 0 ? (
            <li className="empty-state">No notes yet.</li>
          ) : (
            notes.map((note, idx) => (
              <NoteItem
                key={idx}
                note={note}
                onToggle={(key) => toggleNote(idx, key)}
              />
            ))
          )}
        </ul>
      </div>
    </>
  );
}

// ── NoteItem ───────────────────────────────────────────────────────────────────

interface NoteItemProps {
  note: Note;
  onToggle: (key: 'reviewed' | 'pinned' | 'flagged') => void;
}

function NoteItem({ note, onToggle }: NoteItemProps) {
  return (
    <li className="note-item">
      <div className="note-meta">
        <span>{note.when}</span>
        <span className="note-kind">{note.kind}</span>
      </div>
      <p className="note-summary">{note.summary}</p>
      <div className="note-overlays">
        <button
          type="button"
          className={`overlay-btn${note.reviewed ? ' is-on' : ''}`}
          title="Reviewed"
          onClick={() => onToggle('reviewed')}
        >
          <Icon name="pass" size={11} />
          Reviewed
        </button>
        <button
          type="button"
          className={`overlay-btn${note.pinned ? ' is-on' : ''}`}
          title="Pin"
          onClick={() => onToggle('pinned')}
        >
          <Icon name="pin" size={11} />
          Pin
        </button>
        <button
          type="button"
          className={`overlay-btn${note.flagged ? ' is-on is-flag' : ''}`}
          title="Flag"
          onClick={() => onToggle('flagged')}
        >
          <Icon name="flag" size={11} />
          Flag
        </button>
      </div>
    </li>
  );
}

// ── Entry ──────────────────────────────────────────────────────────────────────

const rootEl = document.getElementById('root');
if (rootEl == null) throw new Error('[projections] missing #root element');

createRoot(rootEl).render(
  <ViewRoot>
    <Projections />
  </ViewRoot>,
);
