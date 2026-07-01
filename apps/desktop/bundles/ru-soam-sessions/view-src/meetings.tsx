/* eslint-disable react-refresh/only-export-components */
// Entry file — createRoot called at bottom; fast-refresh does not apply here.
import './meetings.css';
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useQueryClient } from '@tanstack/react-query';
import { ViewRoot, useSoamView, useCapQuery, useCapMutation, Icon } from '@ru-soam/view-kit';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Meeting {
  id: string;
  patientId: string;
  kind: string;
  status: string;
  modality?: string;
  startsAt: number;
  endsAt?: number;
  syncState: string;
}

interface Patient {
  id: string;
  displayName?: string;
}

interface SyncReport {
  linked: number;
  reconciled: number;
  orphaned: number;
}

// ── Formatters ─────────────────────────────────────────────────────────────────

const DATE_FMT = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const TIME_FMT = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

function fmtDate(ms: number): string {
  try {
    return DATE_FMT.format(new Date(ms));
  } catch {
    return '—';
  }
}

function fmtTime(ms: number): string {
  try {
    return TIME_FMT.format(new Date(ms));
  } catch {
    return '';
  }
}

function fmtDuration(startMs: number, endMs?: number): string | null {
  if (!endMs) return null;
  const mins = Math.round((endMs - startMs) / 60_000);
  if (mins <= 0) return null;
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ── Meeting row ────────────────────────────────────────────────────────────────

interface MeetingRowProps {
  meeting: Meeting;
  clientName: string | undefined;
  onOpen: () => void;
}

function MeetingRow({ meeting: m, clientName, onOpen }: MeetingRowProps) {
  const displayName = clientName ?? m.patientId;
  const dur = fmtDuration(m.startsAt, m.endsAt);
  const ariaLabel = `${displayName}, ${m.kind || 'session'}, ${m.status || 'scheduled'}, ${fmtDate(m.startsAt)} ${fmtTime(m.startsAt)}`;

  return (
    <li className="meeting-row" role="listitem" aria-label={ariaLabel} onClick={onOpen}>
      {/* Time column */}
      <div className="shrink-0 flex flex-col items-end min-w-[44px] pt-px" aria-hidden="true">
        <div className="text-[10.5px] font-semibold text-fg-secondary font-mono whitespace-nowrap leading-[1.3]">
          {fmtDate(m.startsAt)}
        </div>
        <div className="text-[10px] text-fg-muted font-mono whitespace-nowrap leading-[1.3]">
          {fmtTime(m.startsAt)}
        </div>
        {dur != null && (
          <div className="text-[9.5px] text-fg-muted font-mono whitespace-nowrap leading-[1.3]">
            {dur}
          </div>
        )}
      </div>

      {/* Main body */}
      <div className="flex-auto min-w-0 flex flex-col gap-[2px]">
        <div className="text-sm font-medium text-fg-secondary truncate leading-[1.3]">
          {displayName}
        </div>
        <div className="flex items-center gap-[5px] flex-wrap">
          <span className="text-[10.5px] text-fg-muted capitalize leading-[1.3]">
            {m.kind || 'session'}
          </span>
          <span className={`status-badge ${m.status || 'scheduled'}`}>
            {(m.status || 'scheduled').replace('_', ' ')}
          </span>
          {m.modality === 'online' && (
            <span
              className="inline-flex items-center text-fg-muted shrink-0"
              title="Online"
              aria-label="Online"
            >
              <Icon name="device-camera-video" size={12} />
            </span>
          )}
          {m.modality === 'in_person' && (
            <span
              className="inline-flex items-center text-fg-muted shrink-0"
              title="In person"
              aria-label="In person"
            >
              <Icon name="location" size={12} />
            </span>
          )}
        </div>
        {m.syncState === 'orphaned' && (
          <div className="text-[10px] text-fg-muted italic mt-px">event removed</div>
        )}
      </div>
    </li>
  );
}

// ── Meetings component ─────────────────────────────────────────────────────────

function Meetings() {
  // Stable "now" for listUpcoming @from arg — initialized once on mount.
  // Using a stable key means the cache entry is reused across view switches
  // within a session (no refetch on every activation unless invalidated).
  const [fromTs] = useState(() => Date.now());
  const [syncSummary, setSyncSummary] = useState<string | null>(null);

  const soamView = useSoamView();
  const queryClient = useQueryClient();

  // ── Queries ───────────────────────────────────────────────────────────────

  const meetingsQuery = useCapQuery('sessions.meeting.query', '1.0', 'listUpcoming', [fromTs]);

  // Patient name map — best-effort. If locked/failed, fall back to patientId in rows.
  const patientQuery = useCapQuery('record.patient.query', '1.0', 'list', []);

  // ── Sync mutation ─────────────────────────────────────────────────────────

  const syncMutation = useCapMutation('sessions.meeting', '1.0', 'sync');

  function handleSync() {
    setSyncSummary(null);
    // sync takes no extra positional args; method is fixed in useCapMutation.
    syncMutation.mutate([], {
      onSuccess: (data) => {
        const r = data as SyncReport;
        setSyncSummary(`${r.linked} linked · ${r.reconciled} reconciled · ${r.orphaned} orphaned`);
      },
    });
  }

  // ── Refetch on activate ───────────────────────────────────────────────────

  // ViewRoot already invalidates all queries on onStoreChange. Also invalidate
  // the meetings query on onActivate so the list is fresh when the user switches
  // back to the Sessions activity.
  useEffect(() => {
    const sub = soamView.events.onActivate(() => {
      void queryClient.invalidateQueries({ queryKey: ['sessions.meeting.query'] });
    });
    return () => sub.dispose();
  }, [soamView, queryClient]);

  // ── Derived state ─────────────────────────────────────────────────────────

  // Build id→displayName map (best-effort — skip if query failed)
  const nameMap: Record<string, string> = {};
  if (!patientQuery.isError && Array.isArray(patientQuery.data)) {
    for (const p of patientQuery.data as Patient[]) {
      nameMap[p.id] = p.displayName ?? p.id;
    }
  }

  const isLocked = meetingsQuery.isError && window.__viewBoot.isLockedError(meetingsQuery.error);

  const meetings: Meeting[] = Array.isArray(meetingsQuery.data)
    ? (meetingsQuery.data as Meeting[])
    : [];

  function handleRowOpen(m: Meeting) {
    const clientName = nameMap[m.patientId] ?? null;
    soamView.openInEditor('meeting-record', {
      query: `id=${encodeURIComponent(m.id)}`,
      title: clientName ?? 'Client Meeting',
      entityId: m.id,
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Header */}
      <div className="flex items-center h-[35px] px-3 shrink-0 border-b border-border">
        <span id="panel-title">Upcoming Meetings</span>
        <button
          id="sync-btn"
          type="button"
          title="Sync with calendar provider"
          disabled={syncMutation.isPending}
          onClick={handleSync}
        >
          <Icon name="sync" size={11} />
          Sync
        </button>
      </div>

      {/* Sync summary */}
      {syncSummary != null && (
        <div className="shrink-0 px-3 py-1 text-fg-muted border-b border-border text-[10.5px] leading-[1.4]">
          {syncSummary}
        </div>
      )}

      {/* Error banner (non-locked failures) */}
      {meetingsQuery.isError && !isLocked && (
        <div
          className="shrink-0 px-[10px] py-[5px] text-[11px] font-medium text-error border-b bg-[color-mix(in_srgb,var(--color-error)_9%,transparent)] border-[color-mix(in_srgb,var(--color-error)_25%,transparent)]"
          role="alert"
        >
          {`Failed to load: ${(meetingsQuery.error as Error)?.message ?? 'Unknown error'}`}
        </div>
      )}

      {/* Scroll body */}
      <div id="meetings-body">
        {/* Locked */}
        {isLocked && (
          <div className="p-4 text-center">
            <p className="text-[11.5px] leading-[1.55] text-error opacity-80 font-medium">
              Workspace locked — unlock to view meetings.
            </p>
          </div>
        )}

        {/* Loading (spinner while first fetch pending and no lock/error) */}
        {meetingsQuery.isPending && !isLocked && (
          <div className="pt-7 px-4 pb-5 text-center">
            <div className="empty-graphic">
              <span className="spinner" />
            </div>
          </div>
        )}

        {/* Empty */}
        {meetingsQuery.isSuccess && meetings.length === 0 && (
          <div className="pt-7 px-4 pb-5 text-center">
            <div className="empty-graphic">
              <Icon name="calendar" size={18} />
            </div>
            <strong className="block text-[12.5px] font-semibold text-fg-secondary mb-[5px]">
              No meetings yet
            </strong>
            <p className="text-[11.5px] leading-[1.55] text-fg-muted max-w-[200px] mx-auto italic">
              Meetings appear here once calendar sync runs.
            </p>
          </div>
        )}

        {/* Meetings list */}
        {meetingsQuery.isSuccess && meetings.length > 0 && (
          <div>
            <div className="group-header">Upcoming · {meetings.length}</div>
            <ul className="list-none flex flex-col gap-px px-[5px] mb-[2px]" role="list">
              {meetings.map((m) => (
                <MeetingRow
                  key={m.id}
                  meeting={m}
                  clientName={nameMap[m.patientId]}
                  onOpen={() => handleRowOpen(m)}
                />
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}

// ── Entry ──────────────────────────────────────────────────────────────────────

const rootEl = document.getElementById('root');
if (rootEl == null) throw new Error('[meetings] missing #root element');

createRoot(rootEl).render(
  <ViewRoot>
    <Meetings />
  </ViewRoot>,
);
