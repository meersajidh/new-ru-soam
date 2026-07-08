/* eslint-disable react-refresh/only-export-components */
// Entry file — createRoot called at bottom; fast-refresh does not apply here.
import './overview.css';
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ViewRoot,
  useSoamView,
  useViewContext,
  useViewChannel,
  useCapQuery,
} from '@ru-soam/view-kit';
import {
  Icon,
  Card as UiCard,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
  CardAction,
  Badge,
} from '@basebench/ui';

// ── Types ──────────────────────────────────────────────────────────────────────

interface PatientRecord {
  id: string;
  displayName: string;
  givenName?: string;
  familyName?: string;
  dob?: string;
}
interface PatientProfile {
  preferredLanguage?: string;
  diagnosis?: string;
  medicationAwareness?: string;
}
interface PatientLifecycle {
  stage?: string;
}
interface CircleMember {
  kind: string;
  displayName: string;
  relationship?: string;
  isPrimaryNr?: boolean;
}
interface ConsentState {
  confidentialityExceptionActive?: boolean;
  capacityStatus?: string;
  advanceDirectiveStatus?: string;
  teleConsentMode?: string;
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
interface Meeting {
  startsAt?: number;
  kind?: string;
  modality?: string;
}

type Density = 'dense' | 'focused' | 'timeline';

// ── Mock data (ported from data.jsx ACTIVE block) ───────────────────────────────

const MOCK = {
  nextAppt: { when: 'Thu 04 Jun · 11:00', modality: 'video', label: 'Tele-session (video)' },
  lastNote: {
    when: '28 May 2026',
    author: 'you',
    summary:
      'Sleep improving on sertraline 100 mg. Mood reactive. SI passive, no intent — safety plan revisited and shared with NR. Continue BA homework.',
  },
  goals: [
    { label: 'Behavioural activation — 3 valued activities / week', progress: 0.6, status: 'On track' },
    { label: 'Sleep restoration — consistent wake time', progress: 0.4, status: 'Slipping' },
    { label: 'Graded return to work', progress: 0.2, status: 'Not started' },
  ],
  scores: [
    { instrument: 'PHQ-9', series: [21, 18, 14, 11], latest: 11, band: 'Moderate', dir: 'down' },
    { instrument: 'GAD-7', series: [16, 13, 11, 11], latest: 11, band: 'Moderate', dir: 'flat' },
  ],
  payment: { status: 'pending', amount: '₹1,500', detail: '28 May session · self-pay' },
  timeline: [
    { when: 'Thu 04 Jun', iconName: 'calendar', tone: 'accent', title: 'Upcoming — Tele-session 11:00', body: 'Session prep ready.' },
    { when: '28 May', iconName: 'shield-warning', tone: 'error', title: 'Risk — passive SI noted', body: 'Safety plan revisited & shared with NR. Capacity intact.' },
    { when: '28 May', iconName: 'file-text', tone: '', title: 'Progress note', body: 'Sleep improving on sertraline 100 mg. Continue BA homework.' },
    { when: '24 May', iconName: 'activity', tone: '', title: 'PHQ-9 recorded — 11', body: 'Down from 14. Moderate band.' },
    { when: '14 May', iconName: 'file-text', tone: '', title: 'Progress note', body: 'Sertraline titrated to 100 mg. Tele-consent recorded.' },
    { when: '12 Jan', iconName: 'note', tone: '', title: 'Advance Directive filed', body: 'Names treatment preferences. NR: R. Deshpande.' },
  ],
} as const;

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

function relDateOv(ts?: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const days = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 31) return `${Math.floor(days / 7)}w ago`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

const RISK_SEV_CONCERN = new Set(['elevated', 'critical']);
const CAPACITY_LABELS_OV: Record<string, string> = {
  intact: 'Capacity intact',
  diminished: 'Capacity diminished',
  lacks: 'Lacks capacity',
  unassessed: 'Capacity unassessed',
};
const CIRCLE_KIND_LABELS: Record<string, string> = {
  nominated_rep: 'Nominated Rep',
  caregiver: 'Caregiver',
  family: 'Family',
  emergency_contact: 'Emergency Contact',
};

function getRiskActiveConcern(
  consent: ConsentState | null,
  safetyPlan: SafetyPlan | null,
  riskEvents: RiskEvent[] | null,
): 's23' | 'plan' | 'event' | null {
  if (consent?.confidentialityExceptionActive) return 's23';
  if (safetyPlan?.status === 'active') return 'plan';
  if (riskEvents && riskEvents.length > 0) {
    const sev = riskEvents[0].severity;
    if (sev && RISK_SEV_CONCERN.has(sev)) return 'event';
  }
  return null;
}

// ── Risk banner ──────────────────────────────────────────────────────────────────

interface RiskBannerProps {
  consent: ConsentState | null;
  safetyPlan: SafetyPlan | null;
  riskEvents: RiskEvent[] | null;
  open: boolean;
  onToggle: () => void;
  onOpenSafetyPlan: () => void;
}

function RiskBanner({
  consent,
  safetyPlan,
  riskEvents,
  open,
  onToggle,
  onOpenSafetyPlan,
}: RiskBannerProps) {
  const concern = getRiskActiveConcern(consent, safetyPlan, riskEvents);
  if (!concern) return null;

  const latestEvent = riskEvents && riskEvents.length > 0 ? riskEvents[0] : null;
  const s23Active = !!consent?.confidentialityExceptionActive;
  const planActive = safetyPlan?.status === 'active';

  let headline: string;
  if (s23Active) {
    headline = 'MHA §23 confidentiality exception is active';
  } else if (planActive && latestEvent) {
    headline =
      latestEvent.summary && latestEvent.summary.indexOf('|') === -1
        ? latestEvent.summary
        : 'Safety plan active — risk event noted';
  } else if (latestEvent) {
    headline = latestEvent.summary || `Risk event: ${latestEvent.kind}`;
  } else {
    headline = 'Safety plan active';
  }

  const capLabel = consent?.capacityStatus
    ? CAPACITY_LABELS_OV[consent.capacityStatus] || consent.capacityStatus
    : 'Capacity unassessed';
  const s23Label = s23Active ? 'MHA §23 INVOKED' : 'MHA §23 not invoked';
  const metaParts: string[] = [];
  if (latestEvent) metaParts.push(`Noted ${relDateOv(latestEvent.occurredAt)}`);
  metaParts.push(capLabel);
  metaParts.push(s23Label);

  const eventsToShow = (riskEvents ?? []).slice(0, 5);

  return (
    <div className="risk-banner" data-maturity-id="risk-banner">
      <div className="risk-banner-bar" onClick={onToggle}>
        <div className="risk-banner-ico">
          <Icon name="shield-warning" size={16} />
        </div>
        <div className="risk-banner-text">
          <span className="risk-banner-headline">{headline}</span>
          <span className="risk-banner-meta">{metaParts.join(' · ')}</span>
        </div>
        <div className="risk-banner-cmds">
          <button
            className="cmd-btn ghost"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenSafetyPlan();
            }}
          >
            <Icon name="shield" size={12} /> Safety plan
          </button>
          <button
            className="cmd-btn ghost"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
          >
            <Icon name="chevron-right" size={12} />
            <span className={`aspect-caret${open ? ' is-open' : ''}`} />
            <span>{open ? 'Less' : 'Details'}</span>
          </button>
        </div>
      </div>
      {open && (
        <div className="risk-banner-detail">
          <ul className="risk-items">
            {eventsToShow.map((ev, i) => (
              <li className="risk-item" key={i}>
                <span className="risk-item-dot" />
                <span>{ev.summary || ev.kind}</span>
                <span className="risk-item-when">{relDateOv(ev.occurredAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Header ───────────────────────────────────────────────────────────────────────

interface HeaderProps {
  record: PatientRecord;
  profile: PatientProfile | null;
  lifecycle: PatientLifecycle | null;
  consent: ConsentState | null;
  nextMeeting: Meeting | null;
}

function Header({ record, profile, lifecycle, consent, nextMeeting }: HeaderProps) {
  const age = computeAge(record.dob);
  const lang = profile?.preferredLanguage ?? null;
  const identityParts: string[] = [];
  if (age !== null) identityParts.push(String(age));
  if (lang) identityParts.push(`${lang} (preferred)`);
  const identityLine = identityParts.join(' · ');

  const stageLabel = lifecycle?.stage ? lifecycle.stage.replace(/_/g, ' ') : null;
  const diag = profile?.diagnosis ?? null;

  let nm: { date: string; time: string; parts: string } | null = null;
  if (nextMeeting?.startsAt) {
    const d = new Date(nextMeeting.startsAt);
    const date = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    const parts = [date, time, nextMeeting.kind || 'session'];
    if (nextMeeting.modality) parts.push(nextMeeting.modality);
    nm = { date, time, parts: parts.join(' · ') };
  }

  return (
    <header className="ov-header" data-maturity-id="overview-header">
      <div className="ov-avatar">{initials(record)}</div>
      <div className="ov-id">
        <h1 className="ov-name">{record.displayName}</h1>
        <div className="ov-id-sub">{identityLine}</div>
        <div className="ov-problems">
          {stageLabel && <Badge variant="outline">{stageLabel}</Badge>}
          {diag && <Badge variant="secondary">{diag}</Badge>}
        </div>
      </div>
      <div className="ov-badges">
        {consent?.advanceDirectiveStatus && (
          <span className="ov-badge ok" data-maturity-id="badge-advance-directive">
            <Icon name="note" size={12} /> AD: {consent.advanceDirectiveStatus}
          </span>
        )}
        {consent?.capacityStatus && (
          <span className="ov-badge ok" data-maturity-id="badge-capacity">
            <Icon name="pass" size={12} /> {consent.capacityStatus}
          </span>
        )}
        {consent?.teleConsentMode && (
          <span className="ov-badge ok" data-maturity-id="badge-tele-consent">
            <Icon name="video" size={12} /> Tele: {consent.teleConsentMode}
          </span>
        )}
      </div>
      {nm && (
        <div className="ov-next-meeting" data-maturity-id="next-meeting-line">
          <span className="ov-next-meeting-label">Next meeting</span>
          <span className="ov-next-meeting-value">{nm.parts}</span>
        </div>
      )}
    </header>
  );
}

// ── Card shell ───────────────────────────────────────────────────────────────────

interface CardProps {
  iconName: string;
  title: string;
  source?: string;
  foot?: React.ReactNode;
  maturityId?: string;
  children: React.ReactNode;
}

function Card({ iconName, title, source, foot, maturityId, children }: CardProps) {
  return (
    <UiCard size="sm" data-maturity-id={maturityId} className="rounded-2xl">
      <CardHeader>
        <CardTitle className="flex min-w-0 items-center gap-[7px] text-xs font-semibold text-foreground [&_svg]:text-muted-foreground">
          <Icon name={iconName} size={13} />
          <span className="truncate">{title}</span>
        </CardTitle>
        {source && (
          <CardAction>
            <Badge variant="outline" className="text-2xs tracking-wider uppercase">
              {source}
            </Badge>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>{children}</CardContent>
      {foot && <CardFooter>{foot}</CardFooter>}
    </UiCard>
  );
}

// ── Shared sub-bodies ────────────────────────────────────────────────────────────

function ScoresBody() {
  return (
    <div className="scores">
      {MOCK.scores.map((s) => {
        const maxVal = Math.max(...s.series);
        return (
          <div className="score-block" key={s.instrument}>
            <div className="score-head">
              <span className="score-name">{s.instrument}</span>
              <span className="score-latest">
                {s.latest}
                {s.dir === 'down' && (
                  <small style={{ fontSize: '12px', color: 'var(--color-success)' }}>↓</small>
                )}
              </span>
            </div>
            <div className="spark">
              {s.series.map((v, i) => (
                <div
                  className="spark-bar"
                  key={i}
                  style={{ height: `${Math.round((v / maxVal) * 40)}px` }}
                />
              ))}
            </div>
            <div className="score-band">{s.band}</div>
          </div>
        );
      })}
    </div>
  );
}

function GoalsBody() {
  return (
    <div>
      {MOCK.goals.map((g) => {
        const statusVariant =
          g.status === 'On track'
            ? 'secondary'
            : g.status === 'Slipping'
              ? 'default'
              : 'outline';
        return (
          <div className="goal-row" key={g.label}>
            <div className="goal-top">
              <span className="goal-label">{g.label}</span>
              <Badge variant={statusVariant}>{g.status}</Badge>
            </div>
            <div className="goal-track">
              <span className="goal-fill" style={{ width: `${Math.round(g.progress * 100)}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PaymentBody() {
  const p = MOCK.payment;
  return (
    <div className="payment">
      <div className="payment-amt">
        <span className={`payment-status ${p.status}`}>
          <Icon name="rupee" size={12} />
          <span> {p.status.charAt(0).toUpperCase() + p.status.slice(1)}</span>
        </span>
        <span className="payment-figure">{p.amount}</span>
      </div>
      <div className="aspect-meta">{p.detail}</div>
    </div>
  );
}

function CircleMini({ circle }: { circle: CircleMember[] | null }) {
  if (!circle || circle.length === 0) {
    return (
      <ul className="circle-mini" data-maturity-id="card-circle-mini">
        <li>
          <span className="aspect-meta">No circle members recorded.</span>
        </li>
      </ul>
    );
  }
  const shown = circle.slice(0, 3);
  const more = circle.length - shown.length;
  return (
    <ul className="circle-mini" data-maturity-id="card-circle-mini">
      {shown.map((m, i) => {
        const iconName = m.kind === 'nominated_rep' ? 'shield' : 'person';
        const kindLabel = CIRCLE_KIND_LABELS[m.kind] || m.kind;
        return (
          <li key={i}>
            <Icon name={iconName} size={13} />
            <span>
              <b>
                {kindLabel}
                {m.isPrimaryNr ? ' (NR)' : ''}
              </b>
              {` — ${m.displayName}`}
              {m.relationship && <span className="aspect-meta">{` · ${m.relationship}`}</span>}
            </span>
          </li>
        );
      })}
      {more > 0 && (
        <li>
          <span className="aspect-meta">+{more} more</span>
        </li>
      )}
    </ul>
  );
}

// ── Density grids ────────────────────────────────────────────────────────────────

function NextSessionCard() {
  const a = MOCK.nextAppt;
  return (
    <Card
      iconName="calendar"
      title="Next session"
      source="Schedule"
      maturityId="card-next-session"
      foot={
        <button className="link-btn" type="button">
          Open session prep <Icon name="link-external" size={12} />
        </button>
      }
    >
      <div className="next-appt">
        <Icon name={a.modality === 'video' ? 'video' : 'location'} size={18} />
        <div>
          <div className="next-when">{a.when}</div>
          <div className="next-label">{a.label}</div>
        </div>
      </div>
    </Card>
  );
}

function LastNoteCard() {
  const n = MOCK.lastNote;
  return (
    <Card
      iconName="file-text"
      title="Most recent note"
      source="Sessions"
      maturityId="card-last-note"
      foot={
        <button className="link-btn" type="button">
          Read full note <Icon name="link-external" size={12} />
        </button>
      }
    >
      <div>
        <div className="last-note-meta">
          {n.when} · by {n.author}
        </div>
        <p className="last-note-summary">{n.summary}</p>
      </div>
    </Card>
  );
}

function DenseGrid({ circle }: { circle: CircleMember[] | null }) {
  return (
    <div className="ov-grid dense">
      <NextSessionCard />
      <LastNoteCard />
      <Card iconName="activity" title="Assessment trend" source="Assessments" maturityId="card-scores">
        <ScoresBody />
      </Card>
      <Card iconName="check-square" title="Treatment goals" source="Planner" maturityId="card-goals">
        <GoalsBody />
      </Card>
      <Card iconName="rupee" title="Payment" source="Billing" maturityId="card-payment">
        <PaymentBody />
      </Card>
      <Card iconName="users" title="People / Circle" source="Practice" maturityId="card-circle">
        <CircleMini circle={circle} />
      </Card>
    </div>
  );
}

const GLANCE_STATS = [
  { iconName: 'activity', label: 'PHQ-9', value: '11', sub: '↓ improving', tone: 'ok' },
  { iconName: 'activity', label: 'GAD-7', value: '11', sub: 'moderate', tone: 'warn' },
  { iconName: 'check-square', label: 'Goals', value: '3', sub: '1 slipping', tone: 'warn' },
  { iconName: 'rupee', label: 'Payment', value: '₹1,500', sub: 'pending', tone: 'warn' },
] as const;

function FocusedGrid() {
  return (
    <div className="ov-grid focused">
      <NextSessionCard />
      <LastNoteCard />
      <div className="ov-more" data-maturity-id="glance-row">
        <span className="ov-more-head">At a glance</span>
        <div className="ov-more-row">
          {GLANCE_STATS.map((s) => (
            <div className="mini-stat" key={s.label}>
              <span className="mini-stat-label">
                <Icon name={s.iconName} size={12} /> {s.label}
              </span>
              <span className="mini-stat-value">{s.value}</span>
              <span className={`mini-stat-sub ${s.tone}`}>{s.sub}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Timeline({
  profile,
  circle,
}: {
  profile: PatientProfile | null;
  circle: CircleMember[] | null;
}) {
  const medText = profile?.medicationAwareness ?? null;
  const langText = profile?.preferredLanguage ? `${profile.preferredLanguage} (preferred)` : null;
  return (
    <div className="ov-timeline-wrap" data-maturity-id="timeline-wrap">
      <ul className="ov-timeline">
        {MOCK.timeline.map((ev, i) => (
          <li className="tl-event" key={i}>
            <span className="tl-when">{ev.when}</span>
            <span className={`tl-dot${ev.tone ? ` tone-${ev.tone}` : ''}`}>
              <Icon name={ev.iconName} size={13} />
            </span>
            <div className="tl-card">
              <div className="tl-title">{ev.title}</div>
              <p className="tl-body">{ev.body}</p>
            </div>
          </li>
        ))}
      </ul>
      <aside className="tl-facts">
        <div className="tl-facts-head">Standing facts</div>
        <CircleMini circle={circle} />
        {medText && (
          <div className="tl-fact">
            <Icon name="pill" size={12} /> {medText}
          </div>
        )}
        {langText && (
          <div className="tl-fact">
            <Icon name="translate" size={12} /> {langText}
          </div>
        )}
      </aside>
    </div>
  );
}

// ── Density switcher ─────────────────────────────────────────────────────────────

const DENSITY_OPTIONS: { id: Density; label: string }[] = [
  { id: 'dense', label: 'Dense' },
  { id: 'focused', label: 'Focused' },
  { id: 'timeline', label: 'Timeline' },
];

function DensitySwitcher({
  density,
  onPick,
}: {
  density: Density;
  onPick: (d: Density) => void;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener('click', close);
    window.addEventListener('blur', close);
    return () => {
      document.removeEventListener('click', close);
      window.removeEventListener('blur', close);
    };
  }, [open]);

  return (
    <>
      <button
        id="density-btn"
        type="button"
        className={open ? 'is-open' : ''}
        aria-label="Change overview density"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        <Icon name="settings" size={13} />
      </button>
      {open && (
        <div id="density-menu" role="menu" aria-label="Overview density">
          {DENSITY_OPTIONS.map((opt) => {
            const active = opt.id === density;
            return (
              <button
                key={opt.id}
                className={`density-item${active ? ' is-active' : ''}`}
                type="button"
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  onPick(opt.id);
                  setOpen(false);
                }}
              >
                <span className={active ? 'density-item-check' : 'density-item-check--empty'}>
                  {active && <Icon name="check" size={12} />}
                </span>
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

// ── Overview ─────────────────────────────────────────────────────────────────────

function Overview() {
  const soamView = useSoamView();
  const { entityId } = useViewContext();
  const channelMode = useViewChannel<string>('overviewViewMode');
  // Stable "now" for the upcoming-meeting filter — Date.now() is impure in render.
  const [now] = useState(() => Date.now());
  const [localMode, setLocalMode] = useState<Density | null>(null);
  const density: Density = localMode ?? (channelMode as Density) ?? 'dense';
  const [riskOpen, setRiskOpen] = useState(false);

  const enabled = entityId != null && entityId !== 'new';

  const recordQ = useCapQuery('record.patient.query', '1.0', 'get', [entityId], { enabled });
  const profileQ = useCapQuery('record.patient.query', '1.0', 'getProfile', [entityId], { enabled });
  const lifecycleQ = useCapQuery('record.patient.query', '1.0', 'getLifecycle', [entityId], { enabled });
  const circleQ = useCapQuery('record.patient.query', '1.0', 'getCircle', [entityId], { enabled });
  const consentQ = useCapQuery('record.patient.query', '1.0', 'getConsentState', [entityId], { enabled });
  const riskQ = useCapQuery('record.patient.query', '1.0', 'listRiskEvents', [entityId], { enabled });
  const safetyQ = useCapQuery('record.patient.query', '1.0', 'getSafetyPlan', [entityId], { enabled });
  // Best-effort O484 projection — Sessions may be inactive/locked; degrade gracefully.
  const meetingQ = useCapQuery('sessions.meeting.query', '1.0', 'listForPatient', [entityId], { enabled });

  const record = (recordQ.data as PatientRecord | null) ?? null;
  const profile = (profileQ.data as PatientProfile | null) ?? null;
  const lifecycle = (lifecycleQ.data as PatientLifecycle | null) ?? null;
  const circle = (circleQ.data as CircleMember[] | null) ?? null;
  const consent = (consentQ.data as ConsentState | null) ?? null;
  const riskEvents = (riskQ.data as RiskEvent[] | null) ?? null;
  const safetyPlan = (safetyQ.data as SafetyPlan | null) ?? null;

  // Derive earliest upcoming meeting from the best-effort list.
  let nextMeeting: Meeting | null = null;
  if (!meetingQ.isError && Array.isArray(meetingQ.data)) {
    const upcoming = (meetingQ.data as Meeting[])
      .filter((m) => m.startsAt != null && m.startsAt > now)
      .sort((a, b) => (a.startsAt ?? 0) - (b.startsAt ?? 0));
    nextMeeting = upcoming.length > 0 ? upcoming[0] : null;
  }

  function pickDensity(d: Density) {
    soamView.setOverviewViewMode(d);
    setLocalMode(d);
  }

  function openSafetyPlan() {
    if (!entityId) return;
    soamView.openInEditor('safety-plan', {
      query: `id=${encodeURIComponent(entityId)}`,
      title: 'Safety Plan',
      entityId,
    });
  }

  const isLocked = recordQ.isError && window.__viewBoot.isLockedError(recordQ.error);

  // ── No active client ──────────────────────────────────────────────────────────
  if (!enabled) {
    return <DensitySwitcher density={density} onPick={pickDensity} />;
  }

  // ── Locked ──────────────────────────────────────────────────────────────────
  if (isLocked) {
    return (
      <>
        <div id="status-bar" className="is-locked" role="alert">
          Workspace locked — unlock to view client.
        </div>
        <DensitySwitcher density={density} onPick={pickDensity} />
      </>
    );
  }

  // ── Error (non-locked) ─────────────────────────────────────────────────────────
  if (recordQ.isError) {
    return (
      <>
        <div id="status-bar" role="alert">
          {`Failed to load: ${(recordQ.error as Error)?.message ?? 'Unknown error'}`}
        </div>
        <DensitySwitcher density={density} onPick={pickDensity} />
      </>
    );
  }

  // ── Loading first record ───────────────────────────────────────────────────────
  if (recordQ.isPending || !record) {
    return (
      <>
        <DensitySwitcher density={density} onPick={pickDensity} />
        <div id="ov-scroll">
          <div className="ov-loading">
            <span className="spinner" />
            Loading…
          </div>
        </div>
      </>
    );
  }

  // ── Loaded ─────────────────────────────────────────────────────────────────────
  return (
    <>
      <DensitySwitcher density={density} onPick={pickDensity} />
      <div id="ov-scroll">
        <div className="ov-inner">
          <RiskBanner
            consent={consent}
            safetyPlan={safetyPlan}
            riskEvents={riskEvents}
            open={riskOpen}
            onToggle={() => setRiskOpen((o) => !o)}
            onOpenSafetyPlan={openSafetyPlan}
          />
          <Header
            record={record}
            profile={profile}
            lifecycle={lifecycle}
            consent={consent}
            nextMeeting={nextMeeting}
          />
          {density === 'dense' && <DenseGrid circle={circle} />}
          {density === 'focused' && <FocusedGrid />}
          {density === 'timeline' && <Timeline profile={profile} circle={circle} />}
        </div>
      </div>
    </>
  );
}

// ── Entry ──────────────────────────────────────────────────────────────────────

const rootEl = document.getElementById('root');
if (rootEl == null) throw new Error('[overview] missing #root element');

createRoot(rootEl).render(
  <ViewRoot>
    <Overview />
  </ViewRoot>,
);
