/* eslint-disable react-refresh/only-export-components */
// Entry file — createRoot called at bottom; fast-refresh does not apply here.
import './roster.css';
import { useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { ViewRoot, useSoamView, useCapQuery } from '@ru-soam/view-kit';
import { Badge, Icon } from '@basebench/ui';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Patient {
  id: string;
  displayName?: string;
  status?: string;
  dob?: string;
  stage?: string;
}

interface ObligationChip {
  key: string;
  label: string;
}

interface AttentionRow {
  id: string;
  displayName?: string;
  status?: string;
  doneCount: number;
  total: number;
  obligations: ObligationChip[];
}

interface IntakeCompletenessBadge {
  doneCount: number;
  total: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function computeAge(dob: string | null | undefined): number | null {
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

// ── Lens definitions ───────────────────────────────────────────────────────────

const LENSES = [
  { id: 'roster', icon: 'users', label: 'Roster' },
  { id: 'agenda', icon: 'calendar', label: 'Agenda' },
  { id: 'attention', icon: 'shield', label: 'Attention' },
  { id: 'intake', icon: 'inbox', label: 'Intake' },
] as const;

type LensId = (typeof LENSES)[number]['id'];

const PRE_ACTIVE_STAGES = ['referral', 'intake'];
const STAGE_LABELS: Record<string, string> = { referral: 'Referral', intake: 'Intake' };

// ── IntakeBadge ───────────────────────────────────────────────────────────────

function IntakeBadge({ clientId }: { clientId: string }) {
  const q = useCapQuery('record.patient.query', '1.0', 'getIntakeCompleteness', [clientId]);
  const data = q.data as IntakeCompletenessBadge | null | undefined;
  if (q.isError || !data) return null;
  return (
    <span
      className="intake-badge"
      title={`${data.doneCount} of ${data.total} intake items complete`}
    >
      {data.doneCount}/{data.total}
    </span>
  );
}

// ── ClientRow ─────────────────────────────────────────────────────────────────

interface ClientRowProps {
  patient: Patient;
  isActive: boolean;
  onClick: () => void;
  onDoubleClick?: () => void;
  onContextMenu: (x: number, y: number) => void;
  badge?: ReactNode;
}

function ClientRow({
  patient,
  isActive,
  onClick,
  onDoubleClick,
  onContextMenu,
  badge,
}: ClientRowProps) {
  const status = patient.status || 'active';
  const age = computeAge(patient.dob);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    onContextMenu(e.clientX, e.clientY);
  }

  return (
    <li
      className={`client-row${isActive ? ' is-active' : ''}`}
      data-id={patient.id}
      role="button"
      tabIndex={0}
      aria-label={`${patient.displayName || 'Client'}, ${status}${age != null ? `, age ${age}` : ''}`}
      aria-pressed={isActive}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onKeyDown={handleKeyDown}
      onContextMenu={handleContextMenu}
    >
      <span
        className={`status-dot ${status}`}
        aria-hidden="true"
        title={status.charAt(0).toUpperCase() + status.slice(1)}
      />
      <div className="client-row-main">
        <div className="client-row-name">{patient.displayName || '(unnamed)'}</div>
        {age != null && <div className="client-row-sub">{age} y/o</div>}
      </div>
      {badge}
    </li>
  );
}

// ── Roster ────────────────────────────────────────────────────────────────────

function Roster() {
  const soamView = useSoamView();
  const [activeLens, setActiveLens] = useState<LensId>('attention');
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState<'none' | 'status'>('none');
  const [activeId, setActiveId] = useState<string | null>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const rosterQuery = useCapQuery('record.patient.query', '1.0', 'list');
  const attentionQuery = useCapQuery('record.patient.query', '1.0', 'listAttention');

  const roster = Array.isArray(rosterQuery.data) ? (rosterQuery.data as Patient[]) : [];
  const attention = Array.isArray(attentionQuery.data)
    ? (attentionQuery.data as AttentionRow[])
    : [];

  const isRosterLocked =
    rosterQuery.isError && window.__viewBoot.isLockedError(rosterQuery.error);
  const isAttentionLocked =
    attentionQuery.isError && window.__viewBoot.isLockedError(attentionQuery.error);

  // Filtered roster for the roster lens (case-insensitive displayName match).
  const filteredRoster = search
    ? roster.filter((p) => (p.displayName || '').toLowerCase().includes(search.toLowerCase()))
    : roster;

  // Pre-active clients for intake lens — derived from roster, no extra cap call.
  const preActiveClients = roster.filter((p) => PRE_ACTIVE_STAGES.includes(p.stage ?? ''));

  function handleTabKeyDown(e: React.KeyboardEvent, idx: number) {
    const len = LENSES.length;
    let next = -1;
    if (e.key === 'ArrowRight') next = (idx + 1) % len;
    if (e.key === 'ArrowLeft') next = (idx - 1 + len) % len;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = len - 1;
    if (next >= 0) {
      e.preventDefault();
      setActiveLens(LENSES[next].id);
      tabRefs.current[next]?.focus();
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setActiveLens(LENSES[idx].id);
    }
  }

  function openOverview(p: Patient, preview: boolean) {
    setActiveId(p.id);
    soamView.openInEditor('overview', {
      entityId: p.id,
      title: p.displayName || 'Client',
      preview,
    });
  }

  function openIntake(p: Patient) {
    setActiveId(p.id);
    soamView.openInEditor('intake', {
      query: 'id=' + encodeURIComponent(p.id),
      title: p.displayName || 'Client',
    });
  }

  // ── Roster lens group rendering ─────────────────────────────────────────────

  function renderRosterGroups() {
    if (group === 'status') {
      const ORDER = ['active', 'inactive', 'archived'] as const;
      const buckets: Record<string, Patient[]> = { active: [], inactive: [], archived: [] };
      for (const p of filteredRoster) {
        const s = p.status || 'active';
        if (!buckets[s]) buckets[s] = [];
        buckets[s].push(p);
      }
      return ORDER.flatMap((key) => {
        const list = buckets[key] ?? [];
        if (list.length === 0) return [];
        const label = key.charAt(0).toUpperCase() + key.slice(1);
        return [
          <div key={`hdr-${key}`} className="group-header">
            {label} · {list.length}
          </div>,
          <ul key={`ul-${key}`} className="roster-group-list" role="list">
            {list.map((p) => (
              <ClientRow
                key={p.id}
                patient={p}
                isActive={activeId === p.id}
                onClick={() => openOverview(p, true)}
                onDoubleClick={() => openOverview(p, false)}
                onContextMenu={(x, y) =>
                  soamView.requestContextMenu(
                    'ru-soam-practice/roster/context',
                    x,
                    y,
                    { clientId: p.id, displayName: p.displayName || '' },
                  )
                }
              />
            ))}
          </ul>,
        ];
      });
    }

    // None group — single "All Clients · N" header.
    return [
      <div key="hdr-all" className="group-header">
        All Clients · {filteredRoster.length}
      </div>,
      <ul key="ul-all" className="roster-group-list" role="list">
        {filteredRoster.map((p) => (
          <ClientRow
            key={p.id}
            patient={p}
            isActive={activeId === p.id}
            onClick={() => openOverview(p, true)}
            onDoubleClick={() => openOverview(p, false)}
            onContextMenu={(x, y) =>
              soamView.requestContextMenu(
                'ru-soam-practice/roster/context',
                x,
                y,
                { clientId: p.id, displayName: p.displayName || '' },
              )
            }
          />
        ))}
      </ul>,
    ];
  }

  return (
    <>
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div id="panel-header">
        <span id="panel-title">Practice</span>
        <button
          id="btn-new"
          type="button"
          title="New client"
          aria-label="New client"
          onClick={() => soamView.openInEditor('form', { query: 'id=new', title: 'New Client' })}
        >
          <Icon name="add" size={13} />
        </button>
      </div>

      {/* ── Status banner (roster load error, non-locked) ────────────── */}
      {rosterQuery.isError && !isRosterLocked && (
        <div id="status-msg" className="visible" role="alert">
          {`Failed to load: ${(rosterQuery.error as Error)?.message ?? 'Unknown error'}`}
        </div>
      )}

      {/* ── Lens switcher ─────────────────────────────────────────────── */}
      <div id="lens-switch" role="tablist" aria-label="Navigation lens">
        {LENSES.map((lens, idx) => (
          <button
            key={lens.id}
            ref={(el) => {
              tabRefs.current[idx] = el;
            }}
            className={`lens-tab${activeLens === lens.id ? ' is-active' : ''}`}
            role="tab"
            aria-selected={activeLens === lens.id}
            tabIndex={activeLens === lens.id ? 0 : -1}
            title={lens.label}
            onClick={() => setActiveLens(lens.id)}
            onKeyDown={(e) => handleTabKeyDown(e, idx)}
          >
            <Icon name={lens.icon} size={15} />
            <span>{lens.label}</span>
          </button>
        ))}
      </div>

      {/* ── Lens body ────────────────────────────────────────────────── */}
      <div id="lens-body">

        {/* ── ROSTER lens ─────────────────────────────────────────────── */}
        <div
          className={`lens-panel${activeLens === 'roster' ? ' is-active' : ''}`}
          id="lens-roster"
        >
          <div id="roster-controls">
            {/* Search */}
            <div className="sidebar-search">
              <span className="search-lead" aria-hidden="true">
                <Icon name="search" size={12} />
              </span>
              <input
                id="search-input"
                type="search"
                placeholder="Filter clients…"
                autoComplete="off"
                spellCheck={false}
                aria-label="Filter clients"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {/* Group control */}
            <div className="arrange-row">
              <span className="arrange-label">
                <Icon name="split-horizontal" size={11} />
                Group
              </span>
              <div className="seg" role="group" aria-label="Group by">
                <button
                  className={`seg-btn${group === 'none' ? ' is-active' : ''}`}
                  type="button"
                  onClick={() => setGroup('none')}
                >
                  None
                </button>
                <button
                  className={`seg-btn${group === 'status' ? ' is-active' : ''}`}
                  type="button"
                  onClick={() => setGroup('status')}
                >
                  Status
                </button>
              </div>
            </div>
          </div>

          {/* Locked */}
          {isRosterLocked && (
            <div id="roster-locked" className="visible">
              <p>Workspace locked — unlock to view clients.</p>
            </div>
          )}

          {/* Empty (no clients at all, not a filter issue) */}
          {!isRosterLocked && !rosterQuery.isPending && roster.length === 0 && (
            <div id="roster-empty" className="visible">
              <div className="empty-graphic">
                <Icon name="users" size={18} />
              </div>
              <strong>No clients yet</strong>
              <p>Add your first client with the New button above.</p>
            </div>
          )}

          {/* No-results (filter active but nothing matches) */}
          {!isRosterLocked &&
            !rosterQuery.isPending &&
            roster.length > 0 &&
            filteredRoster.length === 0 && (
              <div id="roster-no-results" className="visible">
                <p>No clients match the filter.</p>
              </div>
            )}

          {/* Live list */}
          {!isRosterLocked && filteredRoster.length > 0 && (
            <div id="roster-content" className="visible" data-maturity-id="roster-list">
              {renderRosterGroups()}
            </div>
          )}
        </div>

        {/* ── AGENDA lens ─────────────────────────────────────────────── */}
        <div
          className={`lens-panel${activeLens === 'agenda' ? ' is-active' : ''}`}
          id="lens-agenda"
          data-maturity-id="lens-agenda-panel"
        >
          <p className="lens-placeholder">Agenda — needs the Schedule Activity.</p>
        </div>

        {/* ── ATTENTION lens ───────────────────────────────────────────── */}
        <div
          className={`lens-panel${activeLens === 'attention' ? ' is-active' : ''}`}
          id="lens-attention"
          data-maturity-id="lens-attention-panel"
        >
          {isAttentionLocked && (
            <p className="lens-placeholder" style={{ color: 'var(--color-warning)' }}>
              Workspace locked.
            </p>
          )}
          {!isAttentionLocked && attention.length === 0 && (
            <p className="lens-placeholder">Nothing needs attention.</p>
          )}
          {!isAttentionLocked && attention.length > 0 && (
            <>
              <div className="group-header">Needs attention · {attention.length}</div>
              {attention.map((row) => (
                <div
                  key={row.id}
                  className="attention-row"
                  role="button"
                  tabIndex={0}
                  aria-label={`${row.displayName ?? '(unnamed)'}, needs attention`}
                  onClick={() =>
                    soamView.openInEditor('overview', {
                      entityId: row.id,
                      title: row.displayName || 'Client',
                    })
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      soamView.openInEditor('overview', {
                        entityId: row.id,
                        title: row.displayName || 'Client',
                      });
                    }
                  }}
                >
                  <div className="attention-row-top">
                    <span
                      className={`status-dot ${row.status || 'active'}`}
                      aria-hidden="true"
                    />
                    <span className="attention-row-name">
                      {row.displayName || '(unnamed)'}
                    </span>
                    <span className="attention-count">
                      {row.doneCount}/{row.total}
                    </span>
                  </div>
                  <div className="obligation-chips">
                    {row.obligations.map((ob) => (
                      <Badge
                        key={ob.key}
                        render={<button type="button" />}
                        variant="outline"
                        size="xs"
                        className={`h-auto cursor-pointer rounded-[10px] px-[7px] py-0.5 text-3xs font-medium ${
                          ob.key === 'intake_incomplete'
                            ? 'border-primary/30 bg-primary/15 text-primary hover:bg-primary/25'
                            : 'border-warning/30 bg-warning/15 text-warning hover:bg-warning/25'
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (ob.key === 'intake_incomplete') {
                            soamView.openInEditor('intake', {
                              query: 'id=' + encodeURIComponent(row.id),
                              title: row.displayName || 'Client',
                            });
                          } else {
                            soamView.openInEditor('overview', {
                              entityId: row.id,
                              title: row.displayName || 'Client',
                            });
                          }
                        }}
                      >
                        {ob.label}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        {/* ── INTAKE lens ─────────────────────────────────────────────── */}
        <div
          className={`lens-panel${activeLens === 'intake' ? ' is-active' : ''}`}
          id="lens-intake"
          data-maturity-id="lens-intake-panel"
        >
          {preActiveClients.length === 0 && (
            <p className="lens-placeholder">No clients in intake.</p>
          )}
          {preActiveClients.length > 0 &&
            PRE_ACTIVE_STAGES.flatMap((stageId) => {
              const list = preActiveClients.filter((p) => p.stage === stageId);
              if (list.length === 0) return [];
              const label = STAGE_LABELS[stageId] ?? stageId;
              return [
                <div key={`hdr-${stageId}`} className="group-header">
                  {label} · {list.length}
                </div>,
                <ul key={`ul-${stageId}`} className="roster-group-list" role="list">
                  {list.map((p) => (
                    <ClientRow
                      key={p.id}
                      patient={p}
                      isActive={activeId === p.id}
                      onClick={() => openIntake(p)}
                      onContextMenu={(x, y) =>
                        soamView.requestContextMenu(
                          'ru-soam-practice/intake/context',
                          x,
                          y,
                          { clientId: p.id },
                        )
                      }
                      badge={<IntakeBadge clientId={p.id} />}
                    />
                  ))}
                </ul>,
              ];
            })}
        </div>

      </div>
    </>
  );
}

// ── Entry ──────────────────────────────────────────────────────────────────────

const rootEl = document.getElementById('root');
if (rootEl == null) throw new Error('[roster] missing #root element');

createRoot(rootEl).render(
  <ViewRoot>
    <Roster />
  </ViewRoot>,
);
