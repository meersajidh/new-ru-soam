/* eslint-disable react-refresh/only-export-components */
// Entry file — createRoot called at bottom; fast-refresh does not apply here.
import './meeting-record.css';
import { createRoot } from 'react-dom/client';
import { ViewRoot, useSoamView, useViewQuery, useCapQuery, useCapMutation } from '@ru-soam/view-kit';
import { Icon } from '@basebench/ui';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Meeting {
  id: string;
  patientId?: string;
  kind?: string;
  status?: string;
  modality?: string;
  startsAt?: number;
  endsAt?: number;
  sourceOrigin?: string;
  syncState?: string;
  providerEventId?: string;
  providerCalendarId?: string;
  meetingLink?: string;
}

interface Patient {
  id: string;
  displayName?: string;
}

const STATUSES = ['scheduled', 'completed', 'no_show', 'cancelled'] as const;
type Status = (typeof STATUSES)[number];

const STATUS_LABEL: Record<Status, string> = {
  scheduled: 'Scheduled',
  completed: 'Completed',
  no_show: 'No-show',
  cancelled: 'Cancelled',
};

// ── Formatters ─────────────────────────────────────────────────────────────────

const DATE_FMT = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});
const TIME_FMT = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

function fmtDate(ms?: number): string {
  if (!ms) return '—';
  try {
    return DATE_FMT.format(new Date(ms));
  } catch {
    return '—';
  }
}
function fmtTime(ms?: number): string {
  if (!ms) return '—';
  try {
    return TIME_FMT.format(new Date(ms));
  } catch {
    return '—';
  }
}
function fmtDuration(startMs?: number, endMs?: number): string {
  if (!startMs || !endMs) return '—';
  const mins = Math.round((endMs - startMs) / 60_000);
  if (mins <= 0) return '—';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ── Component ──────────────────────────────────────────────────────────────────

function MeetingRecord() {
  const soamView = useSoamView();
  const meetingId = useViewQuery().id ?? null;

  const meetingQuery = useCapQuery('sessions.meeting.query', '1.0', 'get', [meetingId], {
    enabled: !!meetingId,
  });
  const meeting = (meetingQuery.data as Meeting | null) ?? null;
  const patientId = meeting?.patientId ?? null;

  // Best-effort client name lookup.
  const patientQuery = useCapQuery('record.patient.query', '1.0', 'get', [patientId], {
    enabled: !!patientId,
  });
  const clientName = (patientQuery.data as Patient | null)?.displayName ?? null;

  const statusMutation = useCapMutation('sessions.meeting', '1.0', 'setStatus');

  // ── Top-level states ───────────────────────────────────────────────────────

  if (!meetingId) {
    return <div className="rec-banner err">No meeting id in URL.</div>;
  }

  if (meetingQuery.isPending) {
    return (
      <div className="bridge-wait">
        <span className="spinner" />
        Loading…
      </div>
    );
  }

  if (meetingQuery.isError) {
    if (window.__viewBoot.isLockedError(meetingQuery.error)) {
      return <div className="rec-banner">Workspace locked — unlock to view this meeting.</div>;
    }
    const msg = (meetingQuery.error as Error)?.message ?? String(meetingQuery.error);
    return <div className="rec-banner err">{`Failed to load: ${msg}`}</div>;
  }

  if (!meeting) {
    return <div className="rec-banner err">Meeting not found.</div>;
  }

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleSetStatus(status: Status) {
    if (statusMutation.isPending || !meetingId) return;
    statusMutation.mutate([meetingId, status]);
  }

  function handleOpenClient() {
    if (!patientId) return;
    soamView.openInEditor('overview', {
      bundleId: 'ru-soam-practice',
      entityId: patientId,
      title: clientName ?? 'Client Record',
    });
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const status = meeting.status ?? 'scheduled';
  const kind = meeting.kind ?? 'session';
  const headerName = clientName ?? 'Client Meeting';

  let statusMsg: { text: string; err: boolean } | null = null;
  if (statusMutation.isError) {
    statusMsg = window.__viewBoot.isLockedError(statusMutation.error)
      ? { text: 'Workspace locked.', err: true }
      : {
          text: `Failed: ${(statusMutation.error as Error)?.message ?? String(statusMutation.error)}`,
          err: true,
        };
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Header */}
      <div className="rec-header">
        <div className="rec-client-name">{headerName}</div>
        <div className="rec-header-meta">
          <span className="rec-kind">{kind}</span>
          <span className={`status-badge ${status}`}>{status.replace('_', ' ')}</span>
        </div>
        {patientId && (
          <button className="open-client-btn" type="button" onClick={handleOpenClient}>
            <Icon name="open-in-window" size={12} />
            <span>{clientName ? `Open ${clientName}'s record` : 'Open client record'}</span>
          </button>
        )}
      </div>

      {/* Scrollable content */}
      <div className="content-body">
        {/* Time */}
        <div className="rec-section">
          <div className="rec-section-title">
            <Icon name="clockface" size={12} />
            Time
          </div>
          <div className="rec-time-row">
            <span className="rec-time-label">Date</span>
            <span>{fmtDate(meeting.startsAt)}</span>
          </div>
          <div className="rec-time-row">
            <span className="rec-time-label">Time</span>
            <span>{fmtTime(meeting.startsAt)}</span>
          </div>
          <div className="rec-time-row">
            <span className="rec-time-label">Duration</span>
            <span>{fmtDuration(meeting.startsAt, meeting.endsAt)}</span>
          </div>
          {meeting.modality === 'online' && (
            <div className="rec-modality-row">
              <Icon name="video" size={12} />
              <span>Online</span>
            </div>
          )}
          {meeting.modality === 'in_person' && (
            <div className="rec-modality-row">
              <Icon name="location" size={12} />
              <span>In person</span>
            </div>
          )}
        </div>

        {/* Source */}
        <div className="rec-section">
          <div className="rec-section-title">
            <Icon name="link" size={12} />
            Source
          </div>
          <div className="rec-source-row">
            <span className="rec-source-label">Origin</span>
            <span className="rec-source-value">
              {meeting.sourceOrigin === 'provider' ? 'Calendar provider' : 'App'}
            </span>
          </div>
          <div className="rec-source-row">
            <span className="rec-source-label">Sync state</span>
            <span className="rec-source-value">{meeting.syncState ?? '—'}</span>
          </div>
          {meeting.providerEventId && (
            <div className="rec-source-row">
              <span className="rec-source-label">Provider event</span>
              <span className="rec-source-value">
                {meeting.providerCalendarId
                  ? `${meeting.providerCalendarId} / ${meeting.providerEventId}`
                  : meeting.providerEventId}
              </span>
            </div>
          )}
          {meeting.meetingLink && (
            <div className="rec-source-row">
              <span className="rec-source-label">Meeting link</span>
              <span className="rec-source-value">
                <Icon name="globe" size={11} />
                <span>{meeting.meetingLink}</span>
              </span>
            </div>
          )}
        </div>

        {/* Status management */}
        <div className="rec-section">
          <div className="rec-section-title">
            <Icon name="pass" size={12} />
            Status
          </div>
          <div className="rec-status-btns">
            {STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                className={`rec-status-btn${s === status ? ' active' : ''}`}
                disabled={statusMutation.isPending}
                onClick={() => handleSetStatus(s)}
              >
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
          {statusMsg && (
            <div className={`rec-status-msg${statusMsg.err ? ' err' : ''}`}>{statusMsg.text}</div>
          )}
        </div>

        {/* Notes placeholder */}
        <div className="rec-section">
          <div className="rec-section-title">
            <Icon name="file-text" size={12} />
            Notes
          </div>
          <div className="notes-placeholder">
            <Icon name="note" size={14} />
            <span>
              Session notes are coming in a future update. The Notes subsystem — supporting
              structured templates, multi-context authoring, and summarization — is designed
              separately.
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Entry ──────────────────────────────────────────────────────────────────────

const rootEl = document.getElementById('root');
if (rootEl == null) throw new Error('[meeting-record] missing #root element');

createRoot(rootEl).render(
  <ViewRoot>
    <MeetingRecord />
  </ViewRoot>,
);
