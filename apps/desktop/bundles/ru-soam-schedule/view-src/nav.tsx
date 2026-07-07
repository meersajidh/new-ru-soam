/* eslint-disable react-refresh/only-export-components */
// Entry file — createRoot called at bottom; fast-refresh does not apply here.
import './nav.css';
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ViewRoot,
  useSoamView,
  useCapQuery,
  useViewChannel,
  type BoundProxy,
} from '@ru-soam/view-kit';
import { Icon } from '@basebench/ui';

// ── Types ───────────────────────────────────────────────────────────────────

interface Account {
  id: string;
  email?: string;
  externalAccountId?: string;
  displayName?: string;
  connectionState: string;
}

interface Calendar {
  id: string;
  accountId: string;
  displayName: string;
  color?: string;
  /** Visible when true. Stored as SQLite integer but the cap deserialises it to boolean. */
  selected: boolean;
}

interface ScheduleViewStatePayload {
  view?: string;
  calRev?: number;
  classFilter?: string | null;
}

// ── Constants ────────────────────────────────────────────────────────────────

const CLASSIFICATIONS = [
  { id: 'client_session', label: 'Client sessions' },
  { id: 'not_client_session', label: 'Excluded' },
  { id: 'personal', label: 'Personal' },
  { id: 'unclassified', label: 'Unclassified' },
] as const;

// ── ClassifRow sub-component ─────────────────────────────────────────────────

interface ClassifRowProps {
  label: string;
  count: number;
  /** Row is "active" (full brightness) when focused or no focus is set. */
  active: boolean;
  onClick: () => void;
}

function ClassifRow({ label, count, active, onClick }: ClassifRowProps) {
  return (
    <div className={`classif-row${active ? ' active' : ''}`} onClick={onClick}>
      <span className="classif-label">{label}</span>
      <span className="classif-count">{count}</span>
    </div>
  );
}

// ── Nav component ─────────────────────────────────────────────────────────────

function Nav() {
  const soamView = useSoamView();
  const qc = useQueryClient();

  // ── calRev dedup refs ──────────────────────────────────────────────────────
  // These mirror the vanilla nav.html module state (_lastSeenRev, currentRev,
  // currentView). Refs not state — updates don't need to trigger re-renders.
  // Written only inside effects and async callbacks (not during render).
  //
  // Invariant:
  //   lastSeenRevRef starts at -1 (= uninitialised).
  //   On first scheduleViewState received: set both refs to incoming calRev (no
  //     invalidation — this is the seed value, not an external bump).
  //   On subsequent receives where calRev > currentRev AND lastSeenRev >= 0:
  //     EXTERNAL bump (e.g. calendar-setup added a calendar) → invalidate.
  //   On echo of our own bump (calRev <= currentRev): do NOT invalidate.
  const currentRevRef = useRef(0);
  const lastSeenRevRef = useRef(-1);
  const currentViewRef = useRef('week');

  // ── Channel values ─────────────────────────────────────────────────────────
  const scheduleViewState = useViewChannel<ScheduleViewStatePayload>('scheduleViewState');
  const scheduleCounts = useViewChannel<Record<string, number>>('scheduleCounts');
  const counts: Record<string, number> = scheduleCounts ?? {};

  // ── classFilter — derived during render, not from effect ───────────────────
  // Nav is the ONLY writer of classFilter in the Schedule context. Channel
  // echoes always carry the same value we last pushed locally. To avoid calling
  // setState inside an effect (react-hooks/set-state-in-effect):
  //   - Track local user choice via `localClassFilter` state (undefined = not yet set).
  //   - Derive the effective classFilter from localClassFilter if set, otherwise
  //     from the channel's scheduleViewState.classFilter (the init seed).
  //   - This seeds from channel on first render and switches to local on first
  //     user interaction, with no intermediate effect needed.
  const [localClassFilter, setLocalClassFilter] = useState<string | null | undefined>(undefined);

  const channelClassFilter: string | null =
    typeof scheduleViewState?.classFilter === 'string' && scheduleViewState.classFilter.length > 0
      ? scheduleViewState.classFilter
      : null;

  const classFilter: string | null =
    localClassFilter !== undefined ? localClassFilter : channelClassFilter;

  // ── Apply inbound scheduleViewState (calRev dedup + view sync) ────────────
  // Dedup: only fire a calendar-list refetch on an EXTERNAL calRev increase
  // (not on the echo of our own bump). Preserves currentView so our pushes
  // don't reset schedule.html's active view.
  // classFilter is derived during render above — no setState here.
  useEffect(() => {
    if (!scheduleViewState) return;
    const { view, calRev } = scheduleViewState;

    if (typeof view === 'string') currentViewRef.current = view;

    if (typeof calRev === 'number') {
      if (lastSeenRevRef.current >= 0 && calRev > currentRevRef.current) {
        // External bump: increment from another source (e.g. calendar-setup
        // added a calendar, triggering ScheduleViewStateService.bumpCalRev).
        currentRevRef.current = calRev;
        lastSeenRevRef.current = calRev;
        void qc.invalidateQueries({ queryKey: ['schedule.calendar.query'] });
      } else {
        // Own echo (calRev <= currentRev) or first seed (lastSeenRev = -1).
        // Either way, update currentRev and initialise lastSeenRev if needed.
        currentRevRef.current = calRev;
        if (lastSeenRevRef.current < 0) lastSeenRevRef.current = calRev;
      }
    }
  }, [scheduleViewState, qc]);

  // ── Queries ────────────────────────────────────────────────────────────────
  const accountsQuery = useCapQuery('schedule.calendar.query', '1.0', 'listAccounts', [], {
    staleTime: 30_000,
  });
  const calsQuery = useCapQuery('schedule.calendar.query', '1.0', 'listAddedCalendars', [], {
    staleTime: 30_000,
  });

  // ── bumpCalRev ─────────────────────────────────────────────────────────────
  // Increments local calRev and pushes scheduleViewState to the renderer. The
  // renderer echoes it back to all schedule views (including this one) — the
  // dedup above prevents us from refetching on our own echo.
  //
  // `classFilter` is captured from the closure. TanStack Query v5 refreshes
  // mutation options (including onSuccess) on each render via setOptions, so
  // the bumpCalRev called from onSuccess always has the latest classFilter.
  function bumpCalRev() {
    currentRevRef.current += 1;
    soamView.setScheduleViewState({
      view: currentViewRef.current,
      calRev: currentRevRef.current,
      classFilter: classFilter,
    });
  }

  // ── Calendar toggle mutation (optimistic) ──────────────────────────────────
  // Uses a hand-written useMutation (not useCapMutation) because we need custom
  // optimistic cache manipulation + bumpCalRev on success.
  // queryKey for the calendars list: ['schedule.calendar.query','listAddedCalendars']
  // — must match useCapQuery's key convention [capId, method, ...args].
  const cmdProxyRef = useRef<Promise<BoundProxy> | null>(null);

  const toggleMutation = useMutation({
    mutationFn: async ({ calId, newSelected }: { calId: string; newSelected: boolean }) => {
      if (!cmdProxyRef.current) {
        cmdProxyRef.current = soamView.bindCommand('schedule.calendar', '1.0');
      }
      const proxy = await cmdProxyRef.current;
      return proxy.call('updateCalendar', calId, { selected: newSelected });
    },
    onMutate: async ({ calId, newSelected }) => {
      // Cancel in-flight fetches for the calendars list to avoid overwriting
      // the optimistic update with a stale server response.
      await qc.cancelQueries({ queryKey: ['schedule.calendar.query', 'listAddedCalendars'] });
      // Snapshot the previous value for rollback.
      const prev = qc.getQueryData<Calendar[]>([
        'schedule.calendar.query',
        'listAddedCalendars',
      ]);
      // Optimistic patch: flip the selected flag immediately so the checkbox
      // updates before the server round-trip completes.
      if (Array.isArray(prev)) {
        qc.setQueryData(
          ['schedule.calendar.query', 'listAddedCalendars'],
          prev.map((c) => (c.id === calId ? { ...c, selected: newSelected } : c)),
        );
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      // Roll back the optimistic update if the mutation failed.
      if (ctx?.prev !== undefined) {
        qc.setQueryData(['schedule.calendar.query', 'listAddedCalendars'], ctx.prev);
      }
    },
    onSuccess: () => {
      // Signal other schedule views (schedule.html) that calendar visibility
      // changed and they should invalidate their event window cache.
      bumpCalRev();
    },
    onSettled: () => {
      // Invalidate to refetch the authoritative state from the store.
      void qc.invalidateQueries({ queryKey: ['schedule.calendar.query'] });
    },
  });

  // ── writeFocusedClass ──────────────────────────────────────────────────────
  function writeFocusedClass(focused: string | null) {
    // Update local state (overrides channel derive on next render).
    setLocalClassFilter(focused);
    // NO calRev bump — classFilter is a client-side display filter, not a
    // calendar-list change signal. Push the updated state so schedule.html
    // can apply the same filter. Use `focused` directly (the new value) rather
    // than the stale rendered `classFilter` from the current render.
    soamView.setScheduleViewState({
      view: currentViewRef.current,
      calRev: currentRevRef.current,
      classFilter: focused,
    });
  }

  // ── Open schedule tab (reopen/focus aggregate Schedule tab) ───────────────
  function openSchedule() {
    soamView.openInEditor('schedule', {
      query: 'id=schedule',
      title: 'Schedule',
      entityId: 'schedule',
    });
  }

  // ── onActivate: auto-open schedule grid + refresh data ────────────────────
  useEffect(() => {
    const sub = soamView.events.onActivate(() => {
      openSchedule();
      void qc.invalidateQueries({ queryKey: ['schedule.calendar.query'] });
    });
    return () => sub.dispose();
    // soamView and qc are stable references; openSchedule reads them by closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soamView, qc]);

  // ── Derived data ───────────────────────────────────────────────────────────
  const accounts: Account[] = Array.isArray(accountsQuery.data)
    ? (accountsQuery.data as Account[])
    : [];
  const calendars: Calendar[] = Array.isArray(calsQuery.data)
    ? (calsQuery.data as Calendar[])
    : [];

  // Build lookup maps for calendar-row rendering.
  const accountStateMap: Record<string, string> = {};
  const accountEmailMap: Record<string, string> = {};
  for (const a of accounts) {
    accountStateMap[a.id] = a.connectionState;
    if (a.email) accountEmailMap[a.id] = a.email;
  }

  // Period string for the activity title (month + year — cosmetic only).
  const period = new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

  // Total event count for the "All events" classification row.
  const totalCount = CLASSIFICATIONS.reduce((sum, c) => sum + (counts[c.id] ?? 0), 0);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Activity title */}
      <div id="activity-title">
        <span className="activity-title-label">Schedule</span>
        <span className="activity-title-period">{period}</span>
      </div>

      {/* Scrollable body */}
      <div id="scroll-body">
        {/* ── Calendars section ─────────────────────────────────────────── */}
        <div className="section-header">
          <span className="section-header-label">Calendars</span>
          <div className="section-header-actions">
            <button
              className="btn-section-add"
              type="button"
              title="Open calendar"
              onClick={openSchedule}
            >
              <Icon name="open-in-window" size={14} />
            </button>
            <button
              className="btn-section-add"
              type="button"
              title="Add calendar"
              onClick={() => {
                soamView.openInEditor('calendar-setup', {
                  query: 'mode=add',
                  title: 'Add calendar',
                  entityId: 'calendar-setup',
                });
              }}
            >
              <Icon name="add" size={14} />
            </button>
          </div>
        </div>

        <div id="cals-block">
          {calendars.length === 0 ? (
            <div className="cals-empty">No calendars yet — click + to add one.</div>
          ) : (
            calendars.map((cal) => {
              const color = cal.color ?? '#a0a0a8';
              const isOn = !!cal.selected;
              const disabled = accountStateMap[cal.accountId] !== 'connected';
              const emailHint = accountEmailMap[cal.accountId];
              const tooltip = emailHint
                ? `${emailHint} / ${cal.displayName}`
                : cal.displayName;
              const effectiveOn = isOn && !disabled;

              return (
                <div
                  key={cal.id}
                  className={[
                    'cal-row',
                    disabled ? 'cal-row--disabled' : '',
                    effectiveOn ? 'active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  title={tooltip}
                  onClick={() => {
                    if (disabled) return;
                    toggleMutation.mutate({ calId: cal.id, newSelected: !isOn });
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    soamView.requestContextMenu(
                      'ru-soam-schedule/calendar/context',
                      e.clientX,
                      e.clientY,
                      {
                        calendarId: cal.id,
                        accountId: cal.accountId,
                        name: cal.displayName,
                        color: cal.color,
                      },
                      {
                        'schedule.calendarAccountErrored':
                          accountStateMap[cal.accountId] !== 'connected',
                      },
                    );
                  }}
                >
                  {/* Merged colored-tick checkbox */}
                  <div
                    className={`cal-checkbox${effectiveOn ? ' on' : ''}`}
                    style={
                      effectiveOn
                        ? { background: color, borderColor: 'transparent' }
                        : { background: 'transparent', borderColor: color }
                    }
                    title={
                      disabled
                        ? 'Account disconnected'
                        : effectiveOn
                          ? 'Hide calendar'
                          : 'Show calendar'
                    }
                  >
                    {/* Tick mark: M1.5,5 L4,7.5 L8.5,2 */}
                    {/* eslint-disable-next-line no-restricted-syntax -- decorative tick marker in calendar-visibility dot */}
                    <svg viewBox="0 0 10 10" fill="none">
                      <path
                        d="M1.5 5 L4 7.5 L8.5 2"
                        stroke="rgba(0,0,0,0.8)"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  {/* textContent-equivalent: calendar displayName is non-PHI metadata */}
                  <span className="cal-name">{cal.displayName}</span>
                </div>
              );
            })
          )}
        </div>

        {/* ── Filter by Classification section ──────────────────────────── */}
        <div className="section-header" style={{ marginTop: 4 }}>
          <span className="section-header-label">Filter by Classification</span>
        </div>
        <div id="classif-block">
          {/* "All events" master row — active when no class is focused */}
          <ClassifRow
            label="All events"
            count={totalCount}
            active={!classFilter}
            onClick={() => writeFocusedClass(null)}
          />
          {CLASSIFICATIONS.map((c) => {
            const isFocused = classFilter === c.id;
            return (
              <ClassifRow
                key={c.id}
                label={c.label}
                count={counts[c.id] ?? 0}
                /* Active = this is the focused class, OR nothing is focused. */
                active={!classFilter || isFocused}
                onClick={() => {
                  // Click the already-focused class → reset to all visible.
                  writeFocusedClass(isFocused ? null : c.id);
                }}
              />
            );
          })}
        </div>

        {/* ── Accounts section — bottom-pinned ──────────────────────────── */}
        <div id="accounts-section">
          <div className="section-header">
            <span className="section-header-label">Accounts</span>
          </div>
          <div id="accounts-block">
            {accounts.length === 0 ? (
              <div className="cals-empty">No accounts connected.</div>
            ) : (
              accounts.map((a) => {
                const isConnected = a.connectionState === 'connected';
                return (
                  <div
                    key={a.id}
                    className={`acct-row${isConnected ? ' active' : ''}`}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      soamView.requestContextMenu(
                        'ru-soam-schedule/account/context',
                        e.clientX,
                        e.clientY,
                        { accountId: a.id },
                        { 'schedule.accountConnected': isConnected },
                      );
                    }}
                  >
                    {/* Provider icon — inline 'G' circle (Google) */}
                    <div className="acct-row-icon" aria-hidden="true">
                      G
                    </div>
                    <div className="acct-row-info">
                      {/* textContent-equivalent: account email is non-client PII */}
                      <div className="acct-row-email">
                        {a.email ?? a.externalAccountId ?? '—'}
                      </div>
                      <div
                        className={`acct-row-status acct-row-status--${isConnected ? 'connected' : 'disconnected'}`}
                      >
                        {isConnected ? 'Connected · read-only' : 'Disconnected'}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Entry ─────────────────────────────────────────────────────────────────────

const rootEl = document.getElementById('root');
if (rootEl == null) throw new Error('[nav] missing #root element');

createRoot(rootEl).render(
  <ViewRoot>
    <Nav />
  </ViewRoot>,
);
