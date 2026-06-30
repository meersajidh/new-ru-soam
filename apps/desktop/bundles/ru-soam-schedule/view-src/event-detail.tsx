/* eslint-disable react-refresh/only-export-components */
// Entry file — createRoot called at bottom; fast-refresh does not apply here.
import './event-detail.css';
import { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ViewRoot,
  useSoamView,
  useCapQuery,
  useViewChannel,
  Icon,
  type BoundProxy,
} from '@ru-soam/view-kit';

// ── Types ────────────────────────────────────────────────────────────────────

interface AttendeeEntry {
  email?: string;
  name?: string;
  self?: boolean;
  organizer?: boolean;
  responseStatus?: string;
}

interface EventMatch {
  matchClientId?: string | null;
  candidates?: unknown[];
  linkedMeetingId?: string | null;
  source?: string;
}

interface ActiveEvent {
  id?: string;
  providerEventId?: string;
  externalAccountId?: string;
  providerCalendarId?: string;
  calendarId?: string;
  title?: string;
  start?: string;
  end?: string;
  allDay?: boolean;
  location?: string;
  meetingLink?: string;
  meetingProvider?: string;
  attendees?: AttendeeEntry[];
  organizer?: { email?: string; displayName?: string; self?: boolean };
  calendarName?: string;
  calendarColor?: string;
  classification?: string;
  _match?: EventMatch | null;
}

interface ScheduleViewState {
  view?: string;
  calRev?: number;
  classFilter?: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CLS_CLASS: Record<string, string> = {
  client_session: 'cls-client',
  not_client_session: 'cls-not',
  personal: 'cls-personal',
  unclassified: 'cls-unclassified',
};

const CLS_LABEL: Record<string, string> = {
  client_session: 'CLIENT',
  not_client_session: 'EXCLUDED',
  personal: 'PERSONAL',
  unclassified: 'UNCLASSIFIED',
};

const CLS_HUMAN: Record<string, string> = {
  client_session: 'Client session',
  not_client_session: 'Not a client',
  personal: 'Personal · admin',
  unclassified: 'Unrecognised',
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const PREC: Record<string, number> = { client_session: 2, not_client_session: 1, unclassified: 0 };

// ── Utility functions ─────────────────────────────────────────────────────────

function fmtTime(isoStr: string | undefined): string {
  if (!isoStr || isoStr.length <= 10) return 'All day';
  try {
    return new Date(isoStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return isoStr;
  }
}

function fmtDateLong(isoStr: string | undefined): string {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr.length <= 10 ? isoStr + 'T00:00:00' : isoStr);
    return `${DAY_NAMES[d.getDay()]}, ${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
  } catch {
    return isoStr;
  }
}

function fmtDuration(minutes: number): string {
  if (minutes <= 0) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h} hr ${m} min`;
  if (h > 0) return h === 1 ? '1 hr' : `${h} hr`;
  return `${m} min`;
}

function joinLabel(url: string | undefined, providerName: string | undefined): string {
  if (providerName) return `Join ${providerName}`;
  if (!url) return 'Join meeting';
  if (url.includes('zoom.us')) return 'Join Zoom';
  if (url.includes('meet.google.com')) return 'Join Google Meet';
  if (url.includes('teams.microsoft.com') || url.includes('teams.live.com')) return 'Join Teams';
  return 'Join meeting';
}

function getInitials(name: string): string {
  return (
    String(name)
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w.charAt(0))
      .join('') || '?'
  );
}

function pickRepEmail(ev: ActiveEvent): AttendeeEntry | null {
  const atts = ev.attendees ?? [];
  let best: AttendeeEntry | null = null;
  for (const a of atts) {
    if (a.self) continue;
    if (!a.email) continue;
    if (a.organizer) {
      if (!best) best = a;
      continue;
    }
    return a; // first non-self, non-organiser with email
  }
  return best; // fallback: organiser-with-email
}

function buildEventObj(ev: ActiveEvent): Record<string, unknown> {
  return {
    providerEventId: ev.providerEventId ?? ev.id,
    id: ev.id,
    start: ev.start,
    end: ev.end,
    calendarId: ev.calendarId,
    meetingLink: ev.meetingLink ?? null,
    externalAccountId: ev.externalAccountId != null ? ev.externalAccountId : null,
    providerCalendarId: ev.providerCalendarId != null ? ev.providerCalendarId : null,
  };
}

function participantClassHint(ev: ActiveEvent): string {
  if (!ev.attendees || ev.attendees.length === 0) return '';
  const active = ev.attendees.filter((a) => a.responseStatus !== 'declined');
  const others = active.filter((a) => !a.self);
  const otherCount = others.length;
  if (otherCount === 0) return '';
  const hasSelf = active.some((a) => a.self);
  const total = otherCount + (hasSelf ? 1 : 0);
  const noun = total === 1 ? 'participant' : 'participants';
  if (otherCount === 1) return `${total} ${noun}`;
  return `Group · ${total} ${noun}`;
}

function copyToClipboard(text: string, onSuccess: () => void): void {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(onSuccess).catch(() => fallbackCopy(text, onSuccess));
  } else {
    fallbackCopy(text, onSuccess);
  }
}

function fallbackCopy(text: string, onSuccess?: () => void): void {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    if (ok && onSuccess) onSuccess();
  } catch {
    /* silently ignore */
  }
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({
  icon,
  label,
  children,
}: {
  icon: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="det-section">
      <div className="det-section-hdr">
        <span className="det-section-hdr-icon">
          <Icon name={icon} size={12} />
        </span>
        {label}
      </div>
      {children}
    </div>
  );
}

// ── ClientCard — linked client card with async name resolution ────────────────

function ClientCard({
  clientId,
  fallbackName,
  sub,
}: {
  clientId: string | null;
  fallbackName: string;
  sub: string;
}) {
  const q = useCapQuery('record.patient.query', '1.0', 'get', [clientId ?? ''], {
    enabled: !!clientId,
    staleTime: 60_000,
  });
  const rec = q.data as { displayName?: string } | null | undefined;
  const displayName = clientId && rec?.displayName ? rec.displayName : fallbackName;
  const initials = getInitials(displayName);

  return (
    <div className="det-linked-card">
      <div className="det-avatar">{initials}</div>
      <div className="det-linked-card-info">
        <div className="det-linked-card-name">{displayName}</div>
        <div className="det-linked-card-sub">{sub}</div>
      </div>
    </div>
  );
}

// ── RosterPicker — inline search + filtered patient list ──────────────────────

function RosterPicker({
  onSelect,
  onClose,
}: {
  onSelect: (id: string, name: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const q = useCapQuery('record.patient.query', '1.0', 'list', [], { staleTime: 60_000 });
  const patients = (q.data as Array<{ id: string; displayName?: string }> | undefined) ?? [];

  const filtered = patients.filter((p) => {
    if (!search) return true;
    return (p.displayName ?? p.id).toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="det-picker-wrap">
      <input
        className="det-picker-search"
        type="text"
        placeholder="Search roster…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
        autoFocus
      />
      <ul className="det-picker-list">
        {filtered.map((p) => (
          <li
            key={p.id}
            className="det-picker-item"
            onClick={() => onSelect(p.id, p.displayName ?? p.id)}
          >
            {p.displayName ?? p.id}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── LinkBlock — 5-state client-link action block ──────────────────────────────

type LinkOutcome =
  | { kind: 'idle' }
  | { kind: 'linked'; name: string }
  | { kind: 'suppressed' }
  | { kind: 'intakeScheduled'; name: string }
  | { kind: 'error'; msg: string };

interface LinkBlockProps {
  ev: ActiveEvent;
  bumpCalRev: () => void;
  setOverrideTitle: (name: string | null) => void;
}

function LinkBlock({ ev, bumpCalRev, setOverrideTitle }: LinkBlockProps) {
  const soamView = useSoamView();
  const [outcome, setOutcome] = useState<LinkOutcome>({ kind: 'idle' });
  const [busy, setBusy] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [showIntakeForm, setShowIntakeForm] = useState(false);

  // Derived from representative attendee
  const repAtt = pickRepEmail(ev);
  const repEmail = repAtt?.email ?? null;
  const repName = repAtt?.name ?? repEmail ?? null;

  const [intakeName, setIntakeName] = useState<string>(repName ?? '');

  // Cap proxy refs — bound lazily, stay stable for the lifetime of this block.
  const sessionsCmdRef = useRef<Promise<BoundProxy> | null>(null);
  const sessionsMQRef = useRef<Promise<BoundProxy> | null>(null);
  const recordCmdRef = useRef<Promise<BoundProxy> | null>(null);

  function getSessionsCmd(): Promise<BoundProxy> {
    if (!sessionsCmdRef.current)
      sessionsCmdRef.current = soamView.bindCommand('sessions.meeting', '1.0');
    return sessionsCmdRef.current;
  }
  function getSessionsMQ(): Promise<BoundProxy> {
    if (!sessionsMQRef.current)
      sessionsMQRef.current = soamView.bindQuery('sessions.meeting.query', '1.0');
    return sessionsMQRef.current;
  }
  function getRecordCmd(): Promise<BoundProxy> {
    if (!recordCmdRef.current)
      recordCmdRef.current = soamView.bindCommand('record.patient', '1.0');
    return recordCmdRef.current;
  }

  const cls = ev.classification ?? 'unclassified';
  const match = ev._match;
  const matchClientId = match?.matchClientId ?? null;
  const candidates = Array.isArray(match?.candidates) ? match.candidates : [];
  const linkedMeetingId = match?.linkedMeetingId ?? null;

  function handleError(err: unknown): void {
    setBusy(false);
    if (window.__viewBoot.isLockedError(err)) {
      setOutcome({ kind: 'error', msg: 'Workspace locked — unlock to continue.' });
    } else {
      const msg = err instanceof Error ? err.message : String(err);
      setOutcome({ kind: 'error', msg: `Failed: ${msg}` });
    }
  }

  async function doLink(clientId: string, clientName: string): Promise<void> {
    setBusy(true);
    setOutcome({ kind: 'idle' });
    setShowPicker(false);
    try {
      const evObj = buildEventObj(ev);
      const recordCmd = await getRecordCmd();
      if (repEmail) {
        try {
          await recordCmd.call('addAlias', clientId, { email: repEmail });
        } catch {
          /* non-fatal */
        }
      }
      const sessionsCmd = await getSessionsCmd();
      await sessionsCmd.call('linkProviderEvent', evObj, clientId);
      setBusy(false);
      setOutcome({ kind: 'linked', name: clientName });
      if (clientName) setOverrideTitle(clientName);
      bumpCalRev();
    } catch (err) {
      handleError(err);
    }
  }

  async function openInSessions(): Promise<void> {
    if (!matchClientId) {
      soamView.openActivity('ru-soam-sessions.container');
      return;
    }
    try {
      const mq = await getSessionsMQ();
      const rows = (await mq.call('listForPatient', matchClientId)) as Array<
        Record<string, unknown>
      >;
      const arr = Array.isArray(rows) ? rows : [];
      let found: Record<string, unknown> | null = null;
      const provEvId = ev.providerEventId ?? ev.id;
      if (provEvId) {
        for (const r of arr) {
          if (r['providerEventId'] !== provEvId) continue;
          // O493 triple match: prefer full (externalAccountId + providerCalendarId)
          if (
            ev.externalAccountId &&
            ev.providerCalendarId &&
            r['externalAccountId'] === ev.externalAccountId &&
            r['providerCalendarId'] === ev.providerCalendarId
          ) {
            found = r;
            break;
          }
          if (!found) found = r; // fallback: bare event id match (legacy rows)
        }
      }
      if (found) {
        soamView.openInEditor('meeting-record', {
          bundleId: 'ru-soam-sessions',
          query: `id=${encodeURIComponent(String(found['id'] ?? ''))}`,
          title: 'Client Meeting',
          entityId: String(found['id'] ?? ''),
        });
      } else {
        soamView.openActivity('ru-soam-sessions.container');
      }
    } catch {
      soamView.openActivity('ru-soam-sessions.container');
    }
  }

  // ── Success states (rendered after a mutation completes) ──

  if (outcome.kind === 'linked') {
    return (
      <div className="det-link-block">
        <div className="det-linked-card">
          <div className="det-avatar">{getInitials(outcome.name)}</div>
          <div className="det-linked-card-info">
            <div className="det-linked-card-name">{outcome.name}</div>
            <div className="det-linked-card-sub">Linked from roster ✓</div>
          </div>
        </div>
        <button className="det-act-btn primary-solid" type="button" onClick={openInSessions}>
          Open in Sessions
        </button>
      </div>
    );
  }

  if (outcome.kind === 'intakeScheduled') {
    return (
      <div className="det-link-block">
        <div className="det-linked-card">
          <div className="det-avatar">{getInitials(outcome.name)}</div>
          <div className="det-linked-card-info">
            <div className="det-linked-card-name">{outcome.name}</div>
            <div className="det-linked-card-sub">Intake scheduled ✓</div>
          </div>
        </div>
        <button className="det-act-btn primary-solid" type="button" onClick={openInSessions}>
          Open in Sessions
        </button>
      </div>
    );
  }

  if (outcome.kind === 'suppressed') {
    return (
      <div className="det-link-block">
        <div className="det-link-desc">Marked as not a client.</div>
      </div>
    );
  }

  // Error node (shared across entry states)
  const errNode =
    outcome.kind === 'error' ? (
      <div className="det-link-inline-msg err">{outcome.msg}</div>
    ) : null;

  // ── STATE 1: client_session (linked) ──

  if (cls === 'client_session') {
    const fallbackName = repName ?? 'Linked meeting';
    const cardSub = matchClientId ? 'Linked from roster ✓' : 'Linked ✓';
    return (
      <div className="det-link-block">
        <ClientCard clientId={matchClientId} fallbackName={fallbackName} sub={cardSub} />
        <button
          className="det-act-btn primary-solid"
          type="button"
          disabled={busy}
          onClick={openInSessions}
        >
          Open in Sessions
        </button>
        {(linkedMeetingId != null || repEmail != null) && (
          <div className="det-link-actions">
            <button
              className="det-act-btn"
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setOutcome({ kind: 'idle' });
                try {
                  if (linkedMeetingId) {
                    const sessCmd = await getSessionsCmd();
                    await sessCmd.call('delete', linkedMeetingId);
                  }
                  if (repEmail) {
                    const recCmd = await getRecordCmd();
                    await recCmd.call('suppressParticipant', {
                      email: repEmail,
                      calendarId: ev.calendarId ?? '',
                    });
                  }
                  setBusy(false);
                  setOutcome({ kind: 'suppressed' });
                  bumpCalRev();
                } catch (err) {
                  handleError(err);
                }
              }}
            >
              Not a client
            </button>
          </div>
        )}
        {errNode}
      </div>
    );
  }

  // ── STATE 2: unclassified + candidates ──

  if (cls === 'unclassified' && candidates.length > 0) {
    return (
      <div className="det-link-block">
        <div className="det-link-desc">
          {candidates.length === 1
            ? 'Possible roster match — confirm to link.'
            : 'Multiple roster matches.'}
        </div>
        <div className="det-link-actions">
          <button
            className="det-act-btn primary"
            type="button"
            disabled={busy}
            onClick={() => setShowPicker((p) => !p)}
          >
            Link to client
          </button>
          {repEmail != null && (
            <button
              className="det-act-btn"
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setOutcome({ kind: 'idle' });
                try {
                  const recCmd = await getRecordCmd();
                  await recCmd.call('suppressParticipant', {
                    email: repEmail,
                    calendarId: ev.calendarId ?? '',
                  });
                  setBusy(false);
                  setOutcome({ kind: 'suppressed' });
                  bumpCalRev();
                } catch (err) {
                  handleError(err);
                }
              }}
            >
              Not a client
            </button>
          )}
        </div>
        {showPicker && (
          <RosterPicker
            onSelect={(cid, cname) => {
              setShowPicker(false);
              void doLink(cid, cname);
            }}
            onClose={() => setShowPicker(false)}
          />
        )}
        {errNode}
      </div>
    );
  }

  // ── STATE 3: not_client_session (EXCLUDED) ──

  if (cls === 'not_client_session') {
    return (
      <div className="det-link-block">
        <div className="det-link-desc">Marked as not a client.</div>
        <div className="det-link-actions">
          <button
            className="det-act-btn primary"
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setOutcome({ kind: 'idle' });
              try {
                const recCmd = await getRecordCmd();
                if (repEmail) await recCmd.call('unsuppressParticipant', { email: repEmail });
                const createInput: Record<string, string> = {
                  givenName: repName ?? repEmail ?? 'Unknown',
                };
                if (repEmail) createInput['contactEmail'] = repEmail;
                const created = (await recCmd.call('create', createInput)) as {
                  id: string;
                } | null;
                const newId = created?.id;
                if (!newId) throw new Error('create returned no id');
                const sessCmd = await getSessionsCmd();
                await sessCmd.call('linkProviderEvent', buildEventObj(ev), newId, {
                  kind: 'intake',
                });
                await recCmd.call('setStage', newId, 'intake', 'Intake scheduled from calendar');
                const name = repName ?? repEmail ?? '?';
                setBusy(false);
                setOutcome({ kind: 'intakeScheduled', name });
                setOverrideTitle(name);
                bumpCalRev();
              } catch (err) {
                handleError(err);
              }
            }}
          >
            Add as a client
          </button>
        </div>
        {errNode}
      </div>
    );
  }

  // ── STATE 4: personal ──

  if (cls === 'personal') {
    return (
      <div className="det-link-block">
        <div className="det-link-desc">Marked as personal / admin.</div>
        <div className="det-link-actions">
          <button
            className="det-act-btn"
            type="button"
            disabled={busy}
            onClick={() => setShowPicker((p) => !p)}
          >
            Link to a client
          </button>
        </div>
        {showPicker && (
          <RosterPicker
            onSelect={(cid, cname) => {
              setShowPicker(false);
              void doLink(cid, cname);
            }}
            onClose={() => setShowPicker(false)}
          />
        )}
        {errNode}
      </div>
    );
  }

  // ── STATE 5: unclassified (no candidates) — new/unknown participant ──

  return (
    <div className="det-link-block">
      <div className="det-link-desc">Not recognised from your roster.</div>
      <div className="det-link-actions">
        <button
          className="det-act-btn primary"
          type="button"
          disabled={busy}
          onClick={() => {
            setShowIntakeForm((f) => !f);
            setShowPicker(false);
          }}
        >
          New intake client
        </button>
        <button
          className="det-act-btn"
          type="button"
          disabled={busy}
          onClick={() => {
            setShowIntakeForm(false);
            setShowPicker((p) => !p);
          }}
        >
          Link to existing
        </button>
        {repEmail != null && (
          <button
            className="det-act-btn"
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setOutcome({ kind: 'idle' });
              try {
                const recCmd = await getRecordCmd();
                await recCmd.call('suppressParticipant', {
                  email: repEmail,
                  calendarId: ev.calendarId ?? '',
                });
                setBusy(false);
                setOutcome({ kind: 'suppressed' });
                bumpCalRev();
              } catch (err) {
                handleError(err);
              }
            }}
          >
            Not a client
          </button>
        )}
      </div>
      {showIntakeForm && (
        <div className="det-intake-form">
          <input
            className="det-intake-input"
            type="text"
            placeholder="Client name…"
            value={intakeName}
            onChange={(e) => setIntakeName(e.target.value)}
            autoFocus
          />
          <button
            className="det-act-btn primary"
            type="button"
            disabled={busy}
            onClick={async () => {
              const name = intakeName.trim();
              if (!name) return;
              setBusy(true);
              setOutcome({ kind: 'idle' });
              try {
                const recCmd = await getRecordCmd();
                const createInput: Record<string, string> = { givenName: name };
                if (repEmail) createInput['contactEmail'] = repEmail;
                const created = (await recCmd.call('create', createInput)) as {
                  id: string;
                } | null;
                const newId = created?.id;
                if (!newId) throw new Error('create returned no id');
                const sessCmd = await getSessionsCmd();
                await sessCmd.call('linkProviderEvent', buildEventObj(ev), newId, {
                  kind: 'intake',
                });
                await recCmd.call('setStage', newId, 'intake', 'Intake scheduled from calendar');
                setBusy(false);
                setOutcome({ kind: 'intakeScheduled', name });
                setOverrideTitle(name);
                bumpCalRev();
              } catch (err) {
                handleError(err);
              }
            }}
          >
            Create & link
          </button>
        </div>
      )}
      {showPicker && (
        <RosterPicker
          onSelect={(cid, cname) => {
            setShowPicker(false);
            void doLink(cid, cname);
          }}
          onClose={() => setShowPicker(false)}
        />
      )}
      {errNode}
    </div>
  );
}

// ── ParticipantRow — single participant with optional async roster name ────────

function ParticipantRow({
  name,
  email,
  isSelf,
  isOrg,
  isMatchedClient,
  matchClientId,
}: {
  name: string;
  email?: string;
  isSelf: boolean;
  isOrg: boolean;
  isMatchedClient: boolean;
  matchClientId: string | null;
}) {
  const q = useCapQuery('record.patient.query', '1.0', 'get', [matchClientId ?? ''], {
    enabled: isMatchedClient && !!matchClientId,
    staleTime: 60_000,
  });
  const rec = q.data as { displayName?: string } | null | undefined;
  const displayName =
    isMatchedClient && matchClientId && rec?.displayName
      ? rec.displayName
      : name || email || '?';
  const initials = getInitials(displayName);

  const roleParts: string[] = [];
  if (isSelf) roleParts.push('You');
  if (isOrg) roleParts.push('Organiser');
  if (isMatchedClient) roleParts.push('Client');

  return (
    <div className="det-participant">
      <div className="det-avatar">{initials}</div>
      <div className="det-participant-info">
        <div className="det-participant-name">{displayName}</div>
        <div className="det-participant-role-line">{roleParts.join(' · ')}</div>
      </div>
    </div>
  );
}

// ── ParticipantsSection ───────────────────────────────────────────────────────

function ParticipantsSection({ ev }: { ev: ActiveEvent }) {
  const hasAttendees = !!(ev.attendees && ev.attendees.length > 0);
  const hasOrganizerOnly =
    !hasAttendees && !!(ev.organizer && (ev.organizer.email || ev.organizer.displayName));

  if (!hasAttendees && !hasOrganizerOnly) return null;

  const repAtt = pickRepEmail(ev);
  const repEmail = repAtt?.email ? repAtt.email.toLowerCase() : null;
  const matchClientId2 = ev._match?.matchClientId ?? null;

  const orgEmail =
    ev.organizer?.email ? String(ev.organizer.email).toLowerCase() : null;
  function isOrganiser(a: AttendeeEntry): boolean {
    return (
      a.organizer === true ||
      !!(orgEmail && String(a.email ?? '').toLowerCase() === orgEmail)
    );
  }

  const pcHint = participantClassHint(ev);

  return (
    <Section icon="account" label="Participants">
      {pcHint && <div className="det-participant-class">{pcHint}</div>}
      <div className="det-participants">
        {hasAttendees ? (
          <>
            {(ev.attendees ?? []).slice(0, 8).map((a, i) => {
              const aEmail = a.email ? a.email.toLowerCase() : null;
              const isMatchedParticipant = !!(matchClientId2 && repEmail && aEmail === repEmail);
              return (
                <ParticipantRow
                  key={i}
                  name={a.name ?? a.email ?? '?'}
                  email={a.email}
                  isSelf={!!a.self}
                  isOrg={isOrganiser(a)}
                  isMatchedClient={isMatchedParticipant}
                  matchClientId={isMatchedParticipant ? matchClientId2 : null}
                />
              );
            })}
            {(ev.attendees?.length ?? 0) > 8 && (
              <div className="det-participants-more">
                +{(ev.attendees?.length ?? 0) - 8} more
              </div>
            )}
          </>
        ) : ev.organizer ? (
          <ParticipantRow
            name={ev.organizer.displayName ?? ev.organizer.email ?? '?'}
            email={ev.organizer.email}
            isSelf={false}
            isOrg={true}
            isMatchedClient={false}
            matchClientId={null}
          />
        ) : null}
      </div>
    </Section>
  );
}

// ── MeetingSection — online meeting link, copy, and re-scan ──────────────────

function MeetingSection({
  ev,
  onRescanSuccess,
}: {
  ev: ActiveEvent;
  onRescanSuccess: (updated: ActiveEvent) => void;
}) {
  const soamView = useSoamView();
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [scanning, setScanning] = useState(false);
  const [rescanStatus, setRescanStatus] = useState<{ msg: string; isErr: boolean } | null>(null);
  const scheduleCmdRef = useRef<Promise<BoundProxy> | null>(null);

  function getScheduleCmd(): Promise<BoundProxy> {
    if (!scheduleCmdRef.current)
      scheduleCmdRef.current = soamView.bindCommand('schedule.calendar', '1.0');
    return scheduleCmdRef.current;
  }

  function showCopied(): void {
    setCopied(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(false), 1200);
  }

  async function doRescan(): Promise<void> {
    const extAcctId = ev.externalAccountId ?? null;
    const provCalId = ev.providerCalendarId ?? null;
    const provEvId = ev.id ?? null;
    if (!extAcctId || !provCalId || !provEvId) {
      setRescanStatus({ msg: 'Event identity missing. Try a full re-sync first.', isErr: true });
      return;
    }
    setScanning(true);
    setRescanStatus(null);
    try {
      const cmd = await getScheduleCmd();
      const result = (await cmd.call('rescanEvent', {
        externalAccountId: extAcctId,
        providerCalendarId: provCalId,
        providerEventId: provEvId,
      })) as {
        updated?: boolean;
        meetingLink?: string;
        meetingProvider?: string;
        location?: string;
      } | null;
      setScanning(false);
      if (result?.updated && result.meetingLink) {
        // Link found — update event in parent, bump schedule grid
        onRescanSuccess({
          ...ev,
          meetingLink: result.meetingLink,
          meetingProvider: result.meetingProvider ?? undefined,
          location: result.location ?? ev.location,
        });
        soamView.bumpScheduleData();
      } else {
        setRescanStatus({ msg: 'No meeting link found.', isErr: false });
      }
    } catch (err) {
      setScanning(false);
      const msg = err instanceof Error ? err.message : String(err);
      setRescanStatus({ msg: `Error: ${msg}`, isErr: true });
    }
  }

  const url = ev.meetingLink;

  if (url && typeof url === 'string') {
    return (
      <Section icon="globe" label="Online meeting">
        <button
          className="det-join-btn"
          type="button"
          onClick={() => soamView.openExternal(url)}
        >
          {joinLabel(url, ev.meetingProvider)}
        </button>
        <div className="det-join-url-row">
          <span className="det-join-url">{url}</span>
          <button
            className={`det-copy-btn${copied ? ' copied' : ''}`}
            type="button"
            title="Copy link"
            onClick={(e) => {
              e.stopPropagation();
              copyToClipboard(url, showCopied);
            }}
          >
            <Icon name={copied ? 'check' : 'copy'} size={13} />
          </button>
          <span className={`det-copy-confirm${copied ? ' show' : ''}`}>Copied</span>
        </div>
        <div className="det-rescan-row">
          <button
            className="det-rescan-btn"
            type="button"
            disabled={scanning}
            title="Re-fetch from Google to refresh the meeting link"
            onClick={doRescan}
          >
            {scanning ? 'Scanning…' : 'Re-scan'}
          </button>
          {rescanStatus && (
            <span className={`det-rescan-status${rescanStatus.isErr ? ' err' : ''}`}>
              {rescanStatus.msg}
            </span>
          )}
        </div>
      </Section>
    );
  }

  // No meeting link
  return (
    <Section icon="globe" label="Online meeting">
      <div className="det-no-meet-msg">No meeting link detected.</div>
      <button
        className="det-act-btn"
        type="button"
        disabled={scanning}
        onClick={doRescan}
      >
        {scanning ? 'Scanning…' : 'Re-scan for meeting link'}
      </button>
      {rescanStatus && (
        <div className={`det-rescan-status${rescanStatus.isErr ? ' err' : ''}`}>
          {rescanStatus.msg}
        </div>
      )}
    </Section>
  );
}

// ── TimeSection ───────────────────────────────────────────────────────────────

function TimeSection({ ev }: { ev: ActiveEvent }) {
  return (
    <Section icon="clockface" label="Time">
      <div className="det-kv">
        {ev.allDay ? (
          <div className="det-kv-row">
            <div className="det-kv-label">When</div>
            <div className="det-kv-value">All day</div>
          </div>
        ) : (
          <>
            <div className="det-kv-row">
              <div className="det-kv-label">When</div>
              <div className="det-kv-value">
                <strong>
                  {fmtTime(ev.start)}
                  {ev.end ? ` – ${fmtTime(ev.end)}` : ''}
                </strong>
              </div>
            </div>
            {ev.start &&
              ev.end &&
              String(ev.start).length > 10 &&
              String(ev.end).length > 10 && (() => {
                const durMin = Math.round(
                  (new Date(ev.end).getTime() - new Date(ev.start).getTime()) / 60000,
                );
                if (durMin <= 0) return null;
                return (
                  <div className="det-kv-row">
                    <div className="det-kv-label">Duration</div>
                    <div className="det-kv-value">{fmtDuration(durMin)}</div>
                  </div>
                );
              })()}
          </>
        )}
        {ev.location && typeof ev.location === 'string' && (
          <div className="det-kv-row">
            <div className="det-kv-label">Location</div>
            <div className="det-kv-value">{ev.location}</div>
          </div>
        )}
      </div>
    </Section>
  );
}

// ── SourceSection ─────────────────────────────────────────────────────────────

function SourceSection({ ev }: { ev: ActiveEvent }) {
  return (
    <Section icon="layers" label="Source">
      <div className="det-kv">
        {ev.calendarName && typeof ev.calendarName === 'string' && (
          <div className="det-kv-row">
            <div className="det-kv-label">Calendar</div>
            <div className="det-kv-value">
              <span
                className="det-cal-dot-inline"
                style={
                  ev.calendarColor && typeof ev.calendarColor === 'string'
                    ? { background: ev.calendarColor }
                    : { background: 'var(--color-fg-muted)', opacity: 0.5 }
                }
              />
              {ev.calendarName}
            </div>
          </div>
        )}
        {ev.title && typeof ev.title === 'string' && (
          <div className="det-kv-row">
            <div className="det-kv-label">Raw title</div>
            <div className="det-kv-value det-raw-title-value">{ev.title}</div>
          </div>
        )}
      </div>
      <div className="det-honesty">
        <span className="det-honesty-icon">
          <Icon name="warning" size={12} />
        </span>
        {"This title rides on Google. The client's identity shown above comes from your roster, not the raw title."}
      </div>
    </Section>
  );
}

// ── Reclassify logic (runs inside EventDetailApp via closure) ─────────────────

interface Participant {
  email?: string;
  name?: string;
}

function buildParticipantList(ev: ActiveEvent): Participant[] {
  const participants: Participant[] = [];

  if (ev.attendees) {
    for (const a of ev.attendees) {
      if (!a.self && (a.email || a.name)) {
        participants.push({ email: a.email ?? undefined, name: a.name ?? undefined });
      }
    }
  }

  if (ev.organizer?.email && !ev.organizer.self) {
    const orgEmail = String(ev.organizer.email).toLowerCase();
    const alreadySelf =
      ev.attendees?.some((a) => a.self && String(a.email ?? '').toLowerCase() === orgEmail) ??
      false;
    if (!alreadySelf) {
      const alreadyAdded = participants.some(
        (p) => p.email && p.email.toLowerCase() === orgEmail,
      );
      if (!alreadyAdded) {
        participants.push({ email: ev.organizer.email, name: ev.organizer.displayName });
      }
    }
  }

  return participants;
}

// ── EventDetailApp — root component ──────────────────────────────────────────

function EventDetailApp() {
  const soamView = useSoamView();

  // Channel subscriptions
  const channelActiveEvent = useViewChannel<ActiveEvent | null>('activeEvent');
  const scheduleViewState = useViewChannel<ScheduleViewState>('scheduleViewState');

  // Stable identity key for the current channel event.
  const currentEventId =
    channelActiveEvent?.providerEventId ?? channelActiveEvent?.id ?? null;

  // Keyed event patch: reclassify / rescan results stored with the event id they belong to.
  // When currentEventId changes the key no longer matches → auto-resets to raw channel event.
  // This avoids synchronous setState in effects.
  const [eventPatch, setEventPatch] = useState<{ eventId: string; ev: ActiveEvent } | null>(null);

  // Keyed title override: set by LinkBlock after a successful link.
  // Auto-resets when currentEventId changes (key mismatch → null).
  const [titleOverride, setTitleOverride] = useState<{
    eventId: string;
    name: string;
  } | null>(null);

  // Derived values — recomputed on every render
  const displayEvent: ActiveEvent | null =
    (eventPatch?.eventId === currentEventId ? eventPatch.ev : null) ??
    channelActiveEvent ??
    null;

  const overrideTitle: string | null =
    titleOverride?.eventId === currentEventId ? titleOverride.name : null;

  // Render token — used within a single reclassify call for early bail-out (performance).
  // Incremented when the event identity changes (see effect below).
  const renderTokenRef = useRef(0);

  // calRev tracking (mirrors vanilla _lastCalRev / _lastSvsView / _lastSvsFilter)
  const lastCalRevRef = useRef(-1); // -1 = not seeded yet
  const lastSvsViewRef = useRef<string>('week');
  const lastSvsFilterRef = useRef<string | null>(null);

  // Cap proxy refs for reclassify (separate from LinkBlock's own refs)
  const reclassSessionsMQRef = useRef<Promise<BoundProxy> | null>(null);
  const reclassRecordQRef = useRef<Promise<BoundProxy> | null>(null);

  // Effect: increment renderTokenRef when the event identity changes.
  // This is NOT a setState call — mutating a ref is fine in an effect body.
  useEffect(() => {
    renderTokenRef.current++;
  }, [currentEventId]);

  // ── bumpCalRev ──
  // Sends calRev+1 to the renderer. The echo triggers reclassify in our own
  // scheduleViewState effect below — this is intentional (post-mutation re-classify).
  function bumpCalRev(): void {
    if (lastCalRevRef.current < 0) return; // not yet seeded
    soamView.setScheduleViewState({
      view: lastSvsViewRef.current,
      calRev: lastCalRevRef.current + 1,
      classFilter: lastSvsFilterRef.current,
    });
  }

  // ── Reclassify on calRev change ──
  // Mirrors vanilla's reclassifyAndRender: re-derive classification from caps
  // without needing schedule.html to push a new setActiveEvent.
  async function reclassify(ev: ActiveEvent, token: number): Promise<void> {
    // Build participants list (same logic as schedule.html + vanilla)
    const participants = buildParticipantList(ev);

    const evId = ev.providerEventId ?? ev.id ?? '';

    if (participants.length === 0) {
      // No external participants → personal
      if (renderTokenRef.current !== token) return;
      const updated: ActiveEvent = { ...ev, classification: 'personal', _match: null };
      setEventPatch({ eventId: evId, ev: updated });
      return;
    }

    // Lazy-bind query caps for reclassify
    if (!reclassSessionsMQRef.current) {
      reclassSessionsMQRef.current = soamView
        .bindQuery('sessions.meeting.query', '1.0')
        .catch(() => null as unknown as BoundProxy);
    }
    if (!reclassRecordQRef.current) {
      reclassRecordQRef.current = soamView
        .bindQuery('record.patient.query', '1.0')
        .catch(() => null as unknown as BoundProxy);
    }

    const sessionsMQ = await reclassSessionsMQRef.current;
    const recordQ = await reclassRecordQRef.current;

    if (renderTokenRef.current !== token) return;

    // Check if linked first (highest precedence)
    let linkedRow: Record<string, unknown> | null = null;
    if (sessionsMQ) {
      try {
        const rows = (await sessionsMQ.call('listLinkedProvider', {
          providerId: 'google-calendar',
          from: ev.start ? new Date(ev.start).getTime() : 0,
          to: ev.end ? new Date(ev.end).getTime() : 0,
        })) as Array<Record<string, unknown>>;
        if (renderTokenRef.current !== token) return;
        const arr = Array.isArray(rows) ? rows : [];
        const provEvId = ev.providerEventId ?? ev.id;
        linkedRow = arr.find((r) => r['provider_event_id'] === provEvId) ?? null;
      } catch {
        /* best-effort — leave linkedRow null */
      }
    }

    if (renderTokenRef.current !== token) return;

    if (linkedRow) {
      const updated: ActiveEvent = {
        ...ev,
        classification: 'client_session',
        _match: {
          matchClientId: (linkedRow['patient_id'] as string | null | undefined) ?? null,
          source: 'linked',
          linkedMeetingId: (linkedRow['id'] as string | null | undefined) ?? null,
        },
      };
      if (renderTokenRef.current !== token) return;
      setEventPatch({ eventId: evId, ev: updated });
      return;
    }

    if (!recordQ) {
      // Record query unavailable — nothing to patch; leave displayEvent as-is.
      return;
    }

    // Sequential resolveParticipant (mirrors vanilla's resolveNext)
    // Fix: only ever SET bestMatch on 'match'; never null it (ADR-313 Am2 review fix:
    // the else{_bestMatch=null} clobbered captured candidates when a suppressed
    // participant followed at higher PREC — now we only set on match, never null).
    let bestCls = 'unclassified';
    let bestMatch: EventMatch | null = null;

    for (const p of participants) {
      if (bestCls === 'client_session') break;
      if (!p.email && !p.name) continue;

      const query: Record<string, string> = {};
      if (p.email) query['email'] = p.email;
      if (p.name) query['name'] = p.name;

      try {
        const result = (await recordQ.call('resolveParticipant', query)) as {
          outcome?: string;
          clientId?: string;
          candidates?: unknown[];
        } | null;

        if (renderTokenRef.current !== token) return;

        const outcome = result?.outcome ?? 'none';
        let cls = 'unclassified';
        if (outcome === 'match') cls = 'client_session';
        else if (outcome === 'suppressed') cls = 'not_client_session';
        // candidates + none → 'unclassified'

        if (PREC[cls] > PREC[bestCls]) {
          bestCls = cls;
          if (outcome === 'match' && result?.clientId) {
            bestMatch = { matchClientId: result.clientId, source: 'resolver' };
          }
          // No else{bestMatch=null} — preserves candidate enrichment from earlier participant
        }

        // Candidates: always capture enrichment regardless of precedence so the
        // candidate-resolution UI can offer disambiguation. Only set if no better
        // (client_session) match already captured.
        if (
          outcome === 'candidates' &&
          result?.candidates &&
          bestCls !== 'client_session' &&
          !bestMatch?.matchClientId
        ) {
          bestMatch = { candidates: result.candidates, source: 'resolver' };
        }
      } catch {
        /* skip this participant — continue with others */
      }
    }

    if (renderTokenRef.current !== token) return;
    const updated: ActiveEvent = { ...ev, classification: bestCls, _match: bestMatch };
    setEventPatch({ eventId: evId, ev: updated });
  }

  // ── Effect: handle calRev changes → reclassify ──
  // setState only happens inside the async `reclassify` callback — never synchronously
  // in the effect body — so react-hooks/set-state-in-effect does not apply here.
  useEffect(() => {
    if (!scheduleViewState) return;
    const { calRev, view, classFilter } = scheduleViewState;

    if (typeof view === 'string') lastSvsViewRef.current = view;
    if (classFilter !== undefined) lastSvsFilterRef.current = classFilter ?? null;
    if (typeof calRev !== 'number') return;

    if (lastCalRevRef.current < 0) {
      // First seed — mirror vanilla's `_lastCalRev === -1` branch:
      // just record the value, do NOT trigger reclassify (event is already classified).
      lastCalRevRef.current = calRev;
      return;
    }

    if (calRev === lastCalRevRef.current) return; // no change — skip
    lastCalRevRef.current = calRev;

    const ev = channelActiveEvent;
    if (!ev) return;

    const token = ++renderTokenRef.current;
    void reclassify(ev, token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleViewState, channelActiveEvent]);

  // ── Render ──

  if (!displayEvent) {
    return (
      <div id="empty-state">
        <span style={{ opacity: 0.5, color: 'var(--color-fg-muted)', display: 'flex' }}>
          <Icon name="calendar" size={22} />
        </span>
        <div>Select an event to see details</div>
      </div>
    );
  }

  const ev = displayEvent;
  const cls = ev.classification ?? 'unclassified';
  const clsCls = CLS_CLASS[cls] ?? 'cls-unclassified';

  const dateStr = ev.start ? fmtDateLong(ev.start) : '';
  const timeStr = ev.allDay ? 'All day' : fmtTime(ev.start);
  const metaStr = dateStr
    ? dateStr + (timeStr ? `  ·  ${timeStr}` : '')
    : timeStr;

  const displayTitle =
    overrideTitle ??
    (typeof ev.title === 'string' && ev.title.trim() ? ev.title : '(No title)');

  return (
    <div id="detail-scroll">
      {/* 1. Header */}
      <div className="det-header">
        <div className="det-title">{displayTitle}</div>
        {metaStr && <div className="det-meta">{metaStr}</div>}
      </div>

      {/* 2. Status bar */}
      <div className={`det-status-bar ${clsCls}`}>
        <div className={`det-cls-dot ${clsCls}`} />
        <div className="det-cls-human">{CLS_HUMAN[cls] ?? 'Unrecognised'}</div>
        <div className={`det-cls-badge ${clsCls}`}>{CLS_LABEL[cls] ?? 'UNCLASSIFIED'}</div>
      </div>

      {/* 3. Time section */}
      <TimeSection ev={ev} />

      {/* 4. Online meeting section */}
      <MeetingSection
        ev={ev}
        onRescanSuccess={(updated) => {
          if (currentEventId) setEventPatch({ eventId: currentEventId, ev: updated });
        }}
      />

      {/* 5. Participants section */}
      <ParticipantsSection ev={ev} />

      {/* 6. Client link section */}
      <Section icon="link" label="Client link">
        <LinkBlock
          key={ev.providerEventId ?? ev.id ?? ''}
          ev={ev}
          bumpCalRev={bumpCalRev}
          setOverrideTitle={(name) => {
            if (name == null) {
              setTitleOverride(null);
            } else if (currentEventId) {
              setTitleOverride({ eventId: currentEventId, name });
            }
          }}
        />
      </Section>

      {/* 7. Source section */}
      <SourceSection ev={ev} />
    </div>
  );
}

// ── Entry ─────────────────────────────────────────────────────────────────────

const rootEl = document.getElementById('root');
if (rootEl == null) throw new Error('[event-detail] missing #root element');

createRoot(rootEl).render(
  <ViewRoot>
    <EventDetailApp />
  </ViewRoot>,
);
