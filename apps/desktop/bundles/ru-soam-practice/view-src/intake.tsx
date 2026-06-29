/* eslint-disable react-refresh/only-export-components */
// Entry file — createRoot called at bottom; fast-refresh does not apply here.
import './intake.css';
import { createRoot } from 'react-dom/client';
import {
  ViewRoot,
  useSoamView,
  useViewQuery,
  useCapQuery,
  Icon,
  type SoamView,
} from '@ru-soam/view-kit';

// ── Types ──────────────────────────────────────────────────────────────────────

interface IntakeItem {
  key: string;
  label: string;
  done: boolean;
}

interface IntakeCompleteness {
  doneCount: number;
  total: number;
  complete: boolean;
  displayName?: string;
  items: IntakeItem[];
}

// ── Aspect deep-link map (O465) ────────────────────────────────────────────────

const ITEM_ASPECT: Record<string, string> = {
  demographics: 'section-profile',
  language: 'section-profile',
  diagnosis: 'section-profile',
  circle: 'section-circle',
  informedConsent: 'section-consent',
  teleConsent: 'section-consent',
  advanceDirective: 'section-consent',
  capacity: 'section-consent',
  riskScreen: 'section-risk',
  documents: 'section-documents',
};

// ── Intake component ───────────────────────────────────────────────────────────

function Intake() {
  const params = useViewQuery();
  const clientId = params.id ?? null;
  const titleParam = params.title ? decodeURIComponent(params.title) : null;
  const soamView = useSoamView();

  const completenessQuery = useCapQuery(
    'record.patient.query',
    '1.0',
    'getIntakeCompleteness',
    [clientId],
    { enabled: clientId != null },
  );

  // Best-effort cross-bundle query (O484). Error → treat as empty, no banner.
  const sessionsQuery = useCapQuery(
    'sessions.meeting.query',
    '1.0',
    'listForPatient',
    [clientId],
    { enabled: clientId != null },
  );

  // No-id guard — render error + minimal header, no data load.
  if (clientId == null) {
    return (
      <>
        <div id="status-bar" className="visible" role="alert">
          No client id in URL — open via the intake checklist button.
        </div>
        <div id="header-strip">
          <span className="hs-icon">
            <Icon name="inbox" size={15} />
          </span>
          <span className="hs-title">Intake</span>
        </div>
      </>
    );
  }

  const data = completenessQuery.data as IntakeCompleteness | null | undefined;

  // Sessions: treat any error or non-array as empty (cap may be inactive).
  const meetings: unknown[] =
    !sessionsQuery.isError && Array.isArray(sessionsQuery.data)
      ? (sessionsQuery.data as unknown[])
      : [];
  const hasMeeting = meetings.length > 0;

  const isLocked =
    completenessQuery.isError && window.__viewBoot.isLockedError(completenessQuery.error);

  // Derived totals include the 11th view-side item (O484).
  const derivedDone = data != null ? data.doneCount + (hasMeeting ? 1 : 0) : 0;
  const derivedTotal = data != null ? data.total + 1 : 1;

  // Client display name: prefer cap result, fall back to URL title param.
  const clientTitle = data?.displayName || titleParam;

  const headerTitle =
    data != null ? `Intake — ${derivedDone}/${derivedTotal} complete` : 'Intake';

  return (
    <>
      {/* Status bars — at most one renders */}
      {isLocked && (
        <div id="status-bar" className="visible is-locked" role="alert">
          Workspace locked — unlock to view.
        </div>
      )}
      {completenessQuery.isError && !isLocked && (
        <div id="status-bar" className="visible" role="alert">
          {`Failed to load: ${(completenessQuery.error as Error)?.message ?? 'Unknown error'}`}
        </div>
      )}

      {/* Header strip */}
      <div id="header-strip">
        <span className="hs-icon">
          <Icon name="inbox" size={15} />
        </span>
        <span className="hs-title">{headerTitle}</span>
        {clientTitle && <span className="hs-client">{clientTitle}</span>}
      </div>

      {/* Scroll area */}
      <div id="ic-scroll">
        <div id="ic-card" data-maturity-id="intake-checklist">
          {/* Loading state — only while first fetch is in flight */}
          {completenessQuery.isPending && (
            <div style={{ color: 'var(--color-fg-muted)', fontSize: '12px' }}>Loading…</div>
          )}
          {/* Data card — only when completeness query succeeded with data */}
          {data != null && (
            <IntakeCard
              data={data}
              hasMeeting={hasMeeting}
              derivedDone={derivedDone}
              derivedTotal={derivedTotal}
              clientId={clientId}
              clientTitle={clientTitle ?? clientId}
              soamView={soamView}
            />
          )}
        </div>
        {/* Empty state — query succeeded but returned null/falsy */}
        {completenessQuery.isSuccess && (data == null || !data) && (
          <div id="ic-empty" className="visible">
            No data for this client.
          </div>
        )}
      </div>
    </>
  );
}

// ── IntakeCard ─────────────────────────────────────────────────────────────────

interface IntakeCardProps {
  data: IntakeCompleteness;
  hasMeeting: boolean;
  derivedDone: number;
  derivedTotal: number;
  clientId: string;
  clientTitle: string;
  soamView: SoamView;
}

function IntakeCard({
  data,
  hasMeeting,
  derivedDone,
  derivedTotal,
  clientId,
  clientTitle,
  soamView,
}: IntakeCardProps) {
  const progressPct = Math.round((derivedDone / derivedTotal) * 100);

  function handleOpen(itemKey: string) {
    soamView.openInEditor('overview', {
      entityId: clientId,
      title: clientTitle,
    });
    const aspect = ITEM_ASPECT[itemKey];
    if (aspect) {
      soamView.focusAspect(aspect);
    }
  }

  return (
    <>
      {/* Progress header */}
      <div id="ic-progress-header">
        <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <div className="ic-count">
            {derivedDone}/{derivedTotal}
          </div>
          <div className="ic-count-label">{data.complete ? 'Complete' : 'items complete'}</div>
        </div>
        <div className="ic-progress-bar-wrap">
          <div
            className="ic-progress-bar-fill"
            style={{
              width: `${progressPct}%`,
              ...(data.complete ? { background: 'var(--color-success)' } : {}),
            }}
          />
        </div>
      </div>

      {/* Item list — base items from cap + 11th derived item */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {data.items.map((item) => (
          <div key={item.key} className={`ic-item${item.done ? ' done-row' : ''}`}>
            <span className={`ic-item-icon ${item.done ? 'done' : 'missing'}`}>
              <Icon name={item.done ? 'check' : 'circle-large-outline'} size={13} />
            </span>
            <span className="ic-item-label">{item.label}</span>
            {!item.done && (
              <button type="button" className="ic-open-btn" onClick={() => handleOpen(item.key)}>
                Open record
              </button>
            )}
          </div>
        ))}

        {/* 11th derived item: "First appointment scheduled" (O484, view-side Sessions projection) */}
        <div className={`ic-item${hasMeeting ? ' done-row' : ''}`}>
          <span className={`ic-item-icon ${hasMeeting ? 'done' : 'missing'}`}>
            <Icon name={hasMeeting ? 'check' : 'circle-large-outline'} size={13} />
          </span>
          <span className="ic-item-label">First appointment scheduled</span>
        </div>
      </div>

      {/* Complete banner — shown when base completeness is true */}
      {data.complete && (
        <div id="ic-complete-banner" className="visible">
          <Icon name="check-all" size={14} />
          <span>Intake checklist complete</span>
        </div>
      )}
    </>
  );
}

// ── Entry ──────────────────────────────────────────────────────────────────────

const rootEl = document.getElementById('root');
if (rootEl == null) throw new Error('[intake] missing #root element');

createRoot(rootEl).render(
  <ViewRoot>
    <Intake />
  </ViewRoot>,
);
