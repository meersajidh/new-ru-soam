/* eslint-disable react-refresh/only-export-components */
// Entry file — createRoot called at bottom; fast-refresh does not apply here.
import './client-migration.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ViewRoot,
  useSoamView,
  useViewQuery,
  useCapQuery,
  type BoundProxy,
} from '@ru-soam/view-kit';
import { Icon } from '@basebench/ui';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Candidate {
  participantKey?: string;
  seedName?: string;
  seedEmail?: string;
  seedPhone?: string;
  eventRefs?: number;
  outcome?: string; // 'none' | 'candidates'
  candidates?: string[]; // client ids (outcome === 'candidates')
}

interface ClusterMember {
  participantKey: string;
  seedName?: string;
  seedEmail?: string;
  seedPhone?: string;
}

interface Cluster {
  clusterId: string;
  reason: string; // 'contact' | 'heuristic'
  members: ClusterMember[];
}

interface RosterClient {
  id: string;
  displayName?: string;
}

interface AddedCalendar {
  id: string;
  displayName?: string;
}

interface StatusLine {
  text: string;
  cls: '' | 'scanning' | 'done' | 'error';
}

interface Caps {
  migrationQuery: BoundProxy; // record.migration.query
  migrationCmd: BoundProxy; // record.migration
  patientCmd: BoundProxy; // record.patient (command)
}

const PAGE_SIZE = 50;

const AVATAR_COLORS = [
  { bg: '#2a3a2e', fg: '#5ac85a' },
  { bg: '#2a3040', fg: '#4ea6e0' },
  { bg: '#352a40', fg: '#9b78e0' },
  { bg: '#3a2e2a', fg: '#e07857' },
  { bg: '#2a3a3a', fg: '#4eccc4' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function avatarInitial(name?: string, email?: string): string {
  const src = name || email || '?';
  return (src[0] || '?').toUpperCase();
}

function avatarColor(initial: string) {
  const code = initial.charCodeAt(0) || 0;
  return AVATAR_COLORS[code % AVATAR_COLORS.length];
}

function participantKey(c: Candidate): string {
  return c.participantKey || c.seedEmail || c.seedName || '';
}

function errMsg(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

function splitName(displaySrc: string, seedEmail: string): { givenName: string; familyName?: string } {
  const parts = displaySrc.trim().split(/\s+/);
  const givenName = parts[0] || seedEmail || 'Unknown';
  const familyName = parts.length > 1 ? parts.slice(1).join(' ') : undefined;
  return { givenName, familyName };
}

// ── Confirm-candidate strip (async name lookup) ──────────────────────────────

function ConfirmStrip({
  clientId,
  hasIdentifier,
  busy,
  onConfirm,
}: {
  clientId: string;
  hasIdentifier: boolean;
  busy: boolean;
  onConfirm: () => void;
}) {
  const nameQuery = useCapQuery('record.patient.query', '1.0', 'get', [clientId]);
  const rec = nameQuery.data as { displayName?: string } | undefined;

  let label: string;
  if (nameQuery.isPending) label = 'Loading…';
  else if (nameQuery.isError) label = 'Possible match (could not load name)';
  else if (rec && rec.displayName) label = 'Possible match: ' + rec.displayName;
  else label = 'Possible match';

  const disabled = busy || nameQuery.isPending || !hasIdentifier;

  return (
    <div className="confirm-strip">
      <span className="confirm-strip-label">{label}</span>
      <button type="button" className="btn-confirm-match" disabled={disabled} onClick={onConfirm}>
        <Icon name="link" size={11} />
        Confirm
      </button>
    </div>
  );
}

// ── Candidate card ───────────────────────────────────────────────────────────

function CandidateCard({
  candidate,
  isSelected,
  onToggle,
  doPromote,
  doExclude,
  doLink,
  onRemove,
  openPicker,
}: {
  candidate: Candidate;
  isSelected: boolean;
  onToggle: (pKey: string, checked: boolean) => void;
  doPromote: (c: Candidate) => Promise<void>;
  doExclude: (c: Candidate) => Promise<void>;
  doLink: (c: Candidate, clientId: string) => Promise<void>;
  onRemove: (c: Candidate) => void;
  openPicker: (c: Candidate) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ cls: 'ok' | 'error'; text: string } | null>(null);
  const removeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (removeTimer.current) clearTimeout(removeTimer.current);
  }, []);

  const seedName = candidate.seedName || '';
  const seedEmail = candidate.seedEmail || '';
  const seedPhone = candidate.seedPhone || '';
  const outcome = candidate.outcome || 'none';
  const eventRefs = candidate.eventRefs || 0;
  const pKey = participantKey(candidate);
  const hasIdentifier = !!(seedEmail || seedPhone);
  const hasCandidates =
    outcome === 'candidates' && Array.isArray(candidate.candidates) && candidate.candidates.length > 0;

  const initial = avatarInitial(seedName, seedEmail);
  const ac = avatarColor(initial);

  function promote() {
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    doPromote(candidate)
      .then(() => {
        setFeedback({ cls: 'ok', text: 'Added as migrated client.' });
        removeTimer.current = setTimeout(() => onRemove(candidate), 900);
      })
      .catch((err) => {
        setBusy(false);
        setFeedback({ cls: 'error', text: errMsg(err, 'Could not add client. Try again.') });
      });
  }

  function exclude() {
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    doExclude(candidate)
      .then(() => onRemove(candidate))
      .catch((err) => {
        setBusy(false);
        setFeedback({ cls: 'error', text: errMsg(err, 'Could not exclude. Try again.') });
      });
  }

  function confirmMatch(clientId: string) {
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    doLink(candidate, clientId)
      .then(() => {
        setFeedback({ cls: 'ok', text: 'Linked to existing client.' });
        removeTimer.current = setTimeout(() => onRemove(candidate), 900);
      })
      .catch((err) => {
        setBusy(false);
        setFeedback({ cls: 'error', text: errMsg(err, 'Could not link. Try again.') });
      });
  }

  return (
    <div className={'candidate-card' + (isSelected ? ' is-selected' : '')} data-pkey={pKey}>
      <div className="card-checkbox-wrap">
        <input
          type="checkbox"
          className="card-checkbox"
          checked={isSelected}
          disabled={busy}
          aria-label={'Select ' + (seedName || seedEmail || 'this person')}
          onChange={(e) => onToggle(pKey, e.target.checked)}
        />
      </div>

      <div className="candidate-avatar" style={{ background: ac.bg, color: ac.fg, borderColor: 'transparent' }}>
        {initial}
      </div>

      <div className="candidate-body">
        <div className="candidate-name">{seedName || seedEmail || 'Unknown'}</div>
        {seedEmail && seedEmail !== seedName && <div className="candidate-email">{seedEmail}</div>}

        <div className="candidate-meta">
          {hasCandidates ? (
            <span className="badge badge--candidates">Possible match</span>
          ) : (
            <span className="badge badge--none">Unknown</span>
          )}
          {eventRefs > 0 && (
            <span className="candidate-event-count">
              {eventRefs} {eventRefs === 1 ? 'meeting' : 'meetings'}
            </span>
          )}
        </div>

        {hasCandidates &&
          candidate.candidates!.map((clientId) => (
            <ConfirmStrip
              key={clientId}
              clientId={clientId}
              hasIdentifier={hasIdentifier}
              busy={busy}
              onConfirm={() => confirmMatch(clientId)}
            />
          ))}

        {feedback && <div className={'card-feedback card-feedback--' + feedback.cls}>{feedback.text}</div>}
      </div>

      <div className="candidate-actions">
        <button type="button" className="btn-promote" disabled={busy} onClick={promote}>
          <Icon name="person" size={12} />
          Add as client
        </button>
        <button
          type="button"
          className="btn-link"
          disabled={busy || !hasIdentifier}
          title={hasIdentifier ? undefined : 'No email or phone — cannot link by identity'}
          onClick={() => openPicker(candidate)}
        >
          <Icon name="link" size={12} />
          Link to existing
        </button>
        <button type="button" className="btn-exclude" disabled={busy} onClick={exclude}>
          Exclude
        </button>
      </div>
    </div>
  );
}

// ── Dedup cluster card ───────────────────────────────────────────────────────

function DedupCluster({
  cluster,
  doMergeCluster,
  onDismiss,
  onAfterMerge,
}: {
  cluster: Cluster;
  doMergeCluster: (primary: ClusterMember, others: ClusterMember[]) => Promise<void>;
  onDismiss: (clusterId: string) => void;
  onAfterMerge: () => void;
}) {
  const [primaryKey, setPrimaryKey] = useState(cluster.members[0]?.participantKey ?? '');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ cls: 'ok' | 'error'; text: string } | null>(null);
  const mergeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (mergeTimer.current) clearTimeout(mergeTimer.current);
  }, []);

  function merge() {
    if (busy) return;
    let primary: ClusterMember | null = null;
    const others: ClusterMember[] = [];
    cluster.members.forEach((m) => {
      if (m.participantKey === primaryKey) primary = m;
      else others.push(m);
    });
    if (!primary) {
      primary = cluster.members[0];
      others.length = 0;
      others.push(...cluster.members.slice(1));
    }

    setBusy(true);
    setFeedback(null);
    doMergeCluster(primary, others)
      .then(() => {
        setFeedback({ cls: 'ok', text: 'Merged into one client.' });
        mergeTimer.current = setTimeout(() => onAfterMerge(), 700);
      })
      .catch((err) => {
        setBusy(false);
        setFeedback({ cls: 'error', text: errMsg(err, 'Merge failed. Try again.') });
      });
  }

  const radioName = 'dedup-primary-' + cluster.clusterId;

  return (
    <div className="dedup-cluster-card">
      <div>
        <span className={'badge ' + (cluster.reason === 'contact' ? 'badge--dedup-contact' : 'badge--dedup-heuristic')}>
          {cluster.reason === 'contact' ? 'Grouped in your Google Contacts' : 'Similar name or shared phone'}
        </span>
      </div>

      <div className="dedup-members">
        {cluster.members.map((member) => (
          <div className="dedup-member-row" key={member.participantKey}>
            <input
              type="radio"
              name={radioName}
              className="dedup-member-radio"
              value={member.participantKey}
              checked={primaryKey === member.participantKey}
              disabled={busy}
              onChange={() => setPrimaryKey(member.participantKey)}
            />
            <div className="dedup-member-name">
              {member.seedName || member.seedEmail || member.participantKey}
            </div>
            {member.seedEmail && member.seedEmail !== (member.seedName || '') && (
              <div className="dedup-member-email">{member.seedEmail}</div>
            )}
          </div>
        ))}
      </div>

      {feedback && <div className={'dedup-feedback dedup-feedback--' + feedback.cls}>{feedback.text}</div>}

      <div className="dedup-actions">
        <button type="button" className="btn-dedup-merge" disabled={busy} onClick={merge}>
          Confirm merge
        </button>
        <button
          type="button"
          className="btn-dedup-keep"
          disabled={busy}
          onClick={() => onDismiss(cluster.clusterId)}
        >
          Keep separate
        </button>
      </div>
    </div>
  );
}

// ── Roster picker modal ──────────────────────────────────────────────────────

function PickerModal({
  candidate,
  doLink,
  onClose,
  onLinked,
}: {
  candidate: Candidate;
  doLink: (c: Candidate, clientId: string) => Promise<void>;
  onClose: () => void;
  onLinked: (c: Candidate) => void;
}) {
  const [filter, setFilter] = useState('');
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const rosterQuery = useCapQuery('record.patient.query', '1.0', 'list', []);
  const roster = (rosterQuery.data as RosterClient[] | undefined) ?? [];

  useEffect(() => {
    const t = setTimeout(() => searchRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, []);

  const sub = candidate.seedName || candidate.seedEmail || '';
  const lf = filter.trim().toLowerCase();
  const filtered = lf
    ? roster.filter((r) => (r.displayName || '').toLowerCase().indexOf(lf) !== -1)
    : roster;

  function pick(client: RosterClient) {
    if (busyId) return;
    setBusyId(client.id);
    setStatus({ text: 'Linking…', error: false });
    doLink(candidate, client.id)
      .then(() => {
        onLinked(candidate);
        onClose();
      })
      .catch((err) => {
        setBusyId(null);
        setStatus({ text: errMsg(err, 'Could not link. Try again.'), error: true });
      });
  }

  return (
    <div
      className="picker-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Link to existing client"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className="picker-modal">
        <div className="picker-header">
          <div>
            <div className="picker-title">Link to existing client</div>
            {sub && <div className="picker-subtitle">{'Linking: ' + sub}</div>}
          </div>
          <button type="button" className="picker-close" title="Cancel" onClick={onClose}>
            <Icon name="close" size={14} />
          </button>
        </div>

        <div className="picker-search-wrap">
          <input
            ref={searchRef}
            type="text"
            className="picker-search"
            placeholder="Search clients…"
            autoComplete="off"
            spellCheck={false}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>

        <div className="picker-list">
          {rosterQuery.isError ? (
            <div className="picker-empty">Could not load clients.</div>
          ) : filtered.length === 0 ? (
            <div className="picker-empty">{filter ? 'No clients match.' : 'No clients in roster.'}</div>
          ) : (
            filtered.map((client) => {
              const initial =
                client.displayName && client.displayName[0] ? client.displayName[0].toUpperCase() : '?';
              const ac = avatarColor(initial);
              return (
                <div
                  key={client.id}
                  className={'picker-item' + (busyId ? ' is-busy' : '')}
                  role="button"
                  tabIndex={0}
                  onClick={() => pick(client)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      pick(client);
                    }
                  }}
                >
                  <div className="picker-item-avatar" style={{ background: ac.bg, color: ac.fg }}>
                    {initial}
                  </div>
                  <div className="picker-item-name">{client.displayName || client.id}</div>
                </div>
              );
            })
          )}
        </div>

        <div className={'picker-status' + (status?.error ? ' picker-status--error' : '')}>
          {status?.text ?? ''}
        </div>
      </div>
    </div>
  );
}

// ── Root view ────────────────────────────────────────────────────────────────

function MigrationView() {
  const soamView = useSoamView();
  const params = useViewQuery();
  const calendarId = params.calendarId || null;

  const capsRef = useRef<Caps | null>(null);
  const [bindError, setBindError] = useState<string | null>(null);

  const [scanning, setScanning] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [shownCount, setShownCount] = useState(PAGE_SIZE);
  const [status, setStatus] = useState<StatusLine>({ text: '', cls: '' });
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState<string | null>(null);
  const [picker, setPicker] = useState<Candidate | null>(null);

  // ── Calendar name for header ────────────────────────────────────────────
  const calQuery = useCapQuery('schedule.calendar.query', '1.0', 'listAddedCalendars', [], {
    enabled: !!calendarId,
  });
  const cals = (calQuery.data as AddedCalendar[] | undefined) ?? [];
  const calMatch = cals.find((c) => c.id === calendarId);
  const headerSub = !calendarId
    ? 'No calendar selected'
    : calMatch?.displayName || (calQuery.isPending ? 'Loading calendar…' : calendarId);

  const didScanRef = useRef(false);

  // ── Action primitives (capsRef stable) ──────────────────────────────────
  const doPromote = useCallback(async (candidate: Candidate) => {
    const caps = capsRef.current;
    if (!caps) throw new Error('Not ready — try again.');
    const seedEmail = candidate.seedEmail || '';
    const { givenName, familyName } = splitName(candidate.seedName || seedEmail || '', seedEmail);
    const createPayload: Record<string, unknown> = { givenName };
    if (familyName) createPayload.familyName = familyName;
    if (seedEmail) createPayload.contactEmail = seedEmail;
    const newClient = (await caps.patientCmd.call('create', createPayload)) as {
      id?: string;
      patient_id?: string;
      patientId?: string;
    };
    const newId = newClient && (newClient.id || newClient.patient_id || newClient.patientId);
    if (!newId) throw new Error('create returned no id');
    await caps.patientCmd.call('setStage', newId, 'migrated', 'migration');
  }, []);

  const doExclude = useCallback(
    async (candidate: Candidate) => {
      const seedEmail = candidate.seedEmail || '';
      if (!seedEmail) return; // no email — only transient removal
      const caps = capsRef.current;
      if (!caps) throw new Error('Not ready — try again.');
      await caps.patientCmd.call('suppressParticipant', {
        email: seedEmail,
        calendarId: calendarId || '',
      });
    },
    [calendarId],
  );

  const doLink = useCallback(async (candidate: Candidate, clientId: string) => {
    const caps = capsRef.current;
    if (!caps) throw new Error('Not ready — try again.');
    const seedEmail = candidate.seedEmail || '';
    const seedPhone = candidate.seedPhone || '';
    if (!seedEmail && !seedPhone) throw new Error('No email or phone to link with.');
    const aliasInput: Record<string, unknown> = {};
    if (seedEmail) aliasInput.email = seedEmail;
    if (seedPhone) aliasInput.phone = seedPhone;
    await caps.patientCmd.call('addAlias', clientId, aliasInput);
  }, []);

  const doMergeCluster = useCallback(async (primary: ClusterMember, others: ClusterMember[]) => {
    const caps = capsRef.current;
    if (!caps) throw new Error('Not ready — try again.');
    const seedEmail = primary.seedEmail || '';
    const seedPhone = primary.seedPhone || '';
    const { givenName, familyName } = splitName(primary.seedName || seedEmail || '', seedEmail);
    const createPayload: Record<string, unknown> = { givenName };
    if (familyName) createPayload.familyName = familyName;
    if (seedEmail) createPayload.contactEmail = seedEmail;
    if (seedPhone) createPayload.contactPhone = seedPhone;
    const newClient = (await caps.patientCmd.call('create', createPayload)) as {
      id?: string;
      patient_id?: string;
      patientId?: string;
    };
    const newId = newClient && (newClient.id || newClient.patient_id || newClient.patientId);
    if (!newId) throw new Error('create returned no id');
    await caps.patientCmd.call('setStage', newId, 'migrated', 'migration');
    for (const m of others) {
      const aliasInput: Record<string, unknown> = {};
      if (m.seedEmail) aliasInput.email = m.seedEmail;
      if (m.seedPhone) aliasInput.phone = m.seedPhone;
      if (m.seedName) aliasInput.name = m.seedName;
      if (!aliasInput.email && !aliasInput.phone && !aliasInput.name) continue;
      await caps.patientCmd.call('addAlias', newId, aliasInput);
    }
  }, []);

  // ── Scan ────────────────────────────────────────────────────────────────
  const runScan = useCallback(async () => {
    const caps = capsRef.current;
    if (!caps) {
      setStatus({ text: 'Not ready — try again.', cls: 'error' });
      return;
    }
    if (!calendarId) {
      setStatus({ text: 'No calendar selected.', cls: 'error' });
      return;
    }
    setScanning(true);
    setCandidates([]);
    setClusters([]);
    setShownCount(PAGE_SIZE);
    setSelected(new Set());
    setStatus({ text: 'Scanning calendar…', cls: 'scanning' });

    try {
      const result = (await caps.migrationCmd.call('run', calendarId)) as { candidates?: Candidate[] };
      const list = Array.isArray(result?.candidates) ? result.candidates : [];
      setCandidates(list);
      setStatus(
        list.length === 0
          ? { text: 'No unrecognised people found.', cls: 'done' }
          : {
              text: `${list.length} unrecognised ${list.length === 1 ? 'person' : 'people'} found.`,
              cls: 'done',
            },
      );
      caps.migrationQuery
        .call('listDuplicates', calendarId)
        .then((r) => {
          const cl = r && Array.isArray((r as { clusters?: Cluster[] }).clusters)
            ? (r as { clusters: Cluster[] }).clusters
            : [];
          setClusters(cl);
        })
        .catch(() => setClusters([]));
    } catch (err) {
      setStatus({ text: errMsg(err, 'Scan failed. Try again.'), cls: 'error' });
    } finally {
      setScanning(false);
    }
  }, [calendarId]);

  // ── Bind caps lazily + run the initial scan once, on first activation ────
  // Bind + scan live inside the onActivate callback (not the effect body) so the
  // setState calls satisfy react-hooks/set-state-in-effect. onActivate is
  // replayed by the bridge when the view is already active on subscribe, so it
  // reliably fires on mount. didScanRef gates the scan to run once (re-activation
  // does not re-scan; the Refresh button is the explicit re-scan path).
  useEffect(() => {
    const sub = soamView.events.onActivate(() => {
      void (async () => {
        if (!capsRef.current) {
          try {
            const [migrationQuery, migrationCmd, patientCmd] = await Promise.all([
              soamView.bindQuery('record.migration.query', '1.0'),
              soamView.bindCommand('record.migration', '1.0'),
              soamView.bindCommand('record.patient', '1.0'),
            ]);
            capsRef.current = { migrationQuery, migrationCmd, patientCmd };
          } catch (err) {
            setBindError(errMsg(err, 'Could not bind capabilities.'));
            return;
          }
        }
        if (!didScanRef.current) {
          didScanRef.current = true;
          void runScan();
        }
      })();
    });
    return () => sub.dispose();
    // soamView is stable; runScan is stable per calendarId (URL constant).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soamView]);

  // ── Row removal (optimistic, shared) ────────────────────────────────────
  const removeCandidate = useCallback((candidate: Candidate) => {
    setCandidates((prev) => prev.filter((c) => c !== candidate));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(participantKey(candidate));
      return next;
    });
  }, []);

  // ── Selection ───────────────────────────────────────────────────────────
  const toggleCard = useCallback((pKey: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(pKey);
      else next.delete(pKey);
      return next;
    });
  }, []);

  const total = Math.min(candidates.length, shownCount);
  const selCount = selected.size;
  const allChecked = selCount > 0 && selCount >= total;
  const someChecked = selCount > 0 && selCount < total;

  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someChecked;
  }, [someChecked]);

  function toggleSelectAll(checked: boolean) {
    if (checked) {
      setSelected(() => {
        const next = new Set<string>();
        candidates.slice(0, shownCount).forEach((c) => next.add(participantKey(c)));
        return next;
      });
    } else {
      setSelected(new Set());
    }
  }

  // ── Batch ───────────────────────────────────────────────────────────────
  // Plain closure (reads current candidates/selected from render scope); it runs
  // from a click handler, so no memoisation or ref-mirror is needed.
  async function runBatchOp(op: 'promote' | 'exclude') {
    const keys = Array.from(selected);
    const totalOp = keys.length;
    if (totalOp === 0) return;

    const toProcess = keys
      .map((pKey) => ({ pKey, candidate: candidates.find((c) => participantKey(c) === pKey) }))
      .filter((x): x is { pKey: string; candidate: Candidate } => !!x.candidate);

    const verb = op === 'promote' ? 'Adding' : 'Excluding';
    setBatchRunning(true);
    setBatchProgress(`${verb} 1 of ${totalOp}…`);

    const succeeded: string[] = [];
    const failed: string[] = [];
    for (let i = 0; i < toProcess.length; i++) {
      setBatchProgress(`${verb} ${i + 1} of ${totalOp}…`);
      try {
        await (op === 'promote' ? doPromote(toProcess[i].candidate) : doExclude(toProcess[i].candidate));
        succeeded.push(toProcess[i].pKey);
      } catch {
        failed.push(toProcess[i].pKey);
      }
    }

    const succeededKeys = new Set(succeeded);
    setCandidates((prev) => prev.filter((c) => !succeededKeys.has(participantKey(c))));
    setSelected(new Set(failed));
    setBatchRunning(false);
    setBatchProgress(null);

    if (failed.length > 0) {
      setStatus({
        text: `${totalOp - failed.length} done, ${failed.length} failed — failed items still selected.`,
        cls: 'error',
      });
    }
  }

  // ── Derived render ──────────────────────────────────────────────────────
  const visibleClusters = clusters.filter((c) => !dismissed.has(c.clusterId));
  const visibleCandidates = candidates.slice(0, shownCount);
  const remaining = candidates.length - shownCount;
  const showSelectAll = candidates.length > 0 && !scanning;
  const showBatchBar = selCount > 0 && !batchRunning;

  if (bindError) {
    return (
      <>
        <div className="work-header">
          <div className="work-header-titles">
            <div className="work-header-title">Migrate clients</div>
            <div className="work-header-sub">{headerSub}</div>
          </div>
        </div>
        <div className="toolbar">
          <span className="toolbar-status error">{bindError}</span>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Work-area header */}
      <div className="work-header">
        <div className="work-header-titles">
          <div className="work-header-title">Migrate clients</div>
          <div className="work-header-sub">{headerSub}</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <span className={'toolbar-status' + (status.cls ? ' ' + status.cls : '')}>
          {calendarId ? status.text : 'Open this view from a calendar row.'}
        </span>
        {showSelectAll && (
          <label className="toolbar-select-all">
            <input
              ref={selectAllRef}
              type="checkbox"
              checked={allChecked}
              disabled={batchRunning}
              onChange={(e) => toggleSelectAll(e.target.checked)}
            />
            All
          </label>
        )}
        <button
          type="button"
          className="btn-refresh"
          title="Re-scan this calendar"
          disabled={scanning || batchRunning}
          onClick={() => void runScan()}
        >
          <Icon name="refresh" size={13} />
          Refresh
        </button>
      </div>

      {/* Batch action bar */}
      {(showBatchBar || batchRunning) && (
        <div className="batch-bar">
          {batchRunning ? (
            <span className="batch-progress">{batchProgress}</span>
          ) : (
            <>
              <span className="batch-count">{selCount} selected</span>
              <button type="button" className="btn-batch-promote" onClick={() => void runBatchOp('promote')}>
                <Icon name="person" size={12} />
                Add as clients
              </button>
              <button type="button" className="btn-batch-exclude" onClick={() => void runBatchOp('exclude')}>
                Exclude
              </button>
              <button type="button" className="btn-batch-clear" onClick={() => setSelected(new Set())}>
                Clear
              </button>
            </>
          )}
        </div>
      )}

      {/* Possible duplicates */}
      {visibleClusters.length > 0 && (
        <div className="dedup-section">
          <div className="dedup-section-header">
            <Icon name="group-by-ref-type" size={11} />
            Possible duplicates
          </div>
          <div className="dedup-clusters">
            {visibleClusters.map((cluster) => (
              <DedupCluster
                key={cluster.clusterId}
                cluster={cluster}
                doMergeCluster={doMergeCluster}
                onDismiss={(id) =>
                  setDismissed((prev) => {
                    const next = new Set(prev);
                    next.add(id);
                    return next;
                  })
                }
                onAfterMerge={() => void runScan()}
              />
            ))}
          </div>
        </div>
      )}

      {/* Candidate list */}
      <div className="list-area">
        <div className="list-inner">
          {scanning ? (
            <div className="empty-state">
              <span className="spinner" />
              <div className="empty-state-body">
                Scanning calendar events for unrecognised participants…
              </div>
            </div>
          ) : candidates.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <Icon name="check" size={18} />
              </div>
              <div className="empty-state-heading">No unrecognised people</div>
              <div className="empty-state-body">
                No unrecognised people — this calendar is migrated.
              </div>
            </div>
          ) : (
            <>
              {visibleCandidates.map((candidate) => (
                <CandidateCard
                  key={participantKey(candidate) || candidate.seedEmail || candidate.seedName}
                  candidate={candidate}
                  isSelected={selected.has(participantKey(candidate))}
                  onToggle={toggleCard}
                  doPromote={doPromote}
                  doExclude={doExclude}
                  doLink={doLink}
                  onRemove={removeCandidate}
                  openPicker={setPicker}
                />
              ))}
              {remaining > 0 && (
                <div className="pager-row">
                  <button
                    type="button"
                    className="btn-show-more"
                    onClick={() => setShownCount((n) => n + PAGE_SIZE)}
                  >
                    Show {remaining} more
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Roster picker modal */}
      {picker && (
        <PickerModal
          candidate={picker}
          doLink={doLink}
          onClose={() => setPicker(null)}
          onLinked={removeCandidate}
        />
      )}
    </>
  );
}

// ── Entry ──────────────────────────────────────────────────────────────────────

const rootEl = document.getElementById('root');
if (rootEl == null) throw new Error('[client-migration] missing #root element');

createRoot(rootEl).render(
  <ViewRoot>
    <MigrationView />
  </ViewRoot>,
);
