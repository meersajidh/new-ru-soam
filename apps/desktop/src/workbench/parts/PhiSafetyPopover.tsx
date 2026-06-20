/**
 * PhiSafetyPopover — ADR-313 Am1 consent + score panel.
 *
 * Opened from the StatusBar `workbench.phi-safety` entry (click) or via the
 * `workbench.phi-safety.show` command (dispatches a custom DOM event picked up
 * by this component's effect).
 *
 * Fetches getSafetyScore from sessions.meeting.query@1.0 (POSITIONAL args).
 * Toggles PHI-read opt-in via sessions.meeting@1.0 setPhiReadOptIn (POSITIONAL).
 *
 * All hooks are unconditional (no early-return-before-hooks — WorkspaceSwitcher warning).
 */


import './PhiSafetyPopover.css';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../platform/icons/Icon';
import { usePopover } from '../../platform/popover/use-popover';
import Popover from '../../platform/popover/Popover';
import type { StatusBarEntry } from '../../platform/statusbar/statusbar-service';

export interface SafetyScore {
  score: number;
  factors: {
    readOptIn: boolean;
    writeOptIn: boolean;
    linkedMeetings: number;
    exposed: number;
  };
}

interface PhiSafetyPopoverProps {
  entry: StatusBarEntry;
  /** Called with the freshest score so StatusBar can update the entry text. */
  onScoreChange?: (score: SafetyScore | null) => void;
}

// ── Score display helpers ────────────────────────────────────────────────────

function scorePosture(score: SafetyScore): {
  label: string;
  colorClass: string;
} {
  if (!score.factors.readOptIn) {
    return { label: 'Local', colorClass: 'phi-score--local' };
  }
  if (score.score === 100) {
    // Opted in, nothing linked yet.
    return { label: 'Local', colorClass: 'phi-score--local' };
  }
  return { label: 'Reading provider PHI', colorClass: 'phi-score--reading' };
}

function honestyLine(score: SafetyScore): string {
  const { readOptIn, linkedMeetings } = score.factors;
  if (!readOptIn || linkedMeetings === 0) {
    return 'No provider-resident client PHI. Your calendar data stays local.';
  }
  // ADR-313 Am1 §A1.3 — never use "compliant" affirmatively.
  return `Accountable, not compliant — ${linkedMeetings} client meeting${linkedMeetings === 1 ? '' : 's'} carry identifying detail on your Google calendar.`;
}

// ── Data fetching helpers ────────────────────────────────────────────────────

async function fetchScore(): Promise<SafetyScore> {
  const q = await window.soam.bindQuery('sessions.meeting.query', '1.0');
  try {
    return (await q.call('getSafetyScore')) as SafetyScore;
  } finally {
    q.dispose();
  }
}

async function setReadOptIn(enabled: boolean): Promise<void> {
  const c = await window.soam.bindCommand('sessions.meeting', '1.0');
  try {
    await c.call('setPhiReadOptIn', enabled);
  } finally {
    c.dispose();
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export default function PhiSafetyPopover({ entry, onScoreChange }: PhiSafetyPopoverProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // All state unconditional — no early return before hooks.
  const [score, setScore] = useState<SafetyScore | null>(null);
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const popover = usePopover({
    estimatedHeight: 280,
    estimatedWidth: 300,
    edgeMargin: 8,
  });

  // ── Load score on open ─────────────────────────────────────────────────────

  const onScoreChangeRef = useRef(onScoreChange);
  useEffect(() => {
    onScoreChangeRef.current = onScoreChange;
  });

  // Prefetch once on mount (independent of popover open) so the status-bar entry
  // shows the score at a glance — ADR-313 / SD-4: "the score is always visible."
  // The entry only mounts while unlocked (workspace mode), so this also serves as
  // the on-unlock refresh. setState lives in the async callback (no sync-body set).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const s = await fetchScore();
        if (!cancelled) {
          setScore(s);
          onScoreChangeRef.current?.(s);
        }
      } catch (err) {
        if (!cancelled) {
          console.warn('[PhiSafetyPopover] initial getSafetyScore failed:', err);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // When popover opens: mark loading (via state initializer) then fire async fetch.
  // We set loading=true as part of opening logic (in the trigger click handler) so
  // the effect only needs to subscribe for external-state changes (the fetch result).
  useEffect(() => {
    if (!popover.isOpen) return;
    let cancelled = false;
    // Kick off the fetch; setState only happens in async callbacks (not sync body).
    const go = async () => {
      try {
        const s = await fetchScore();
        if (!cancelled) {
          setScore(s);
          setLoading(false);
          onScoreChangeRef.current?.(s);
        }
      } catch (err) {
        if (!cancelled) {
          setError('Could not load score — bundle may be inactive.');
          setLoading(false);
          console.warn('[PhiSafetyPopover] getSafetyScore failed:', err);
        }
      }
    };
    void go();
    return () => {
      cancelled = true;
    };
  }, [popover.isOpen]);

  // ── Listen for programmatic open (workbench.phi-safety.show command) ───────

  useEffect(() => {
    function handleOpenEvent() {
      if (!popover.isOpen && triggerRef.current) {
        setScore(null);
        setLoading(true);
        setError(null);
        popover.open(triggerRef.current);
      }
    }
    window.addEventListener('phi-safety:open', handleOpenEvent);
    return () => window.removeEventListener('phi-safety:open', handleOpenEvent);
  }, [popover]);

  // ── Toggle handler ─────────────────────────────────────────────────────────

  async function handleToggleReadOptIn(enabled: boolean) {
    if (toggling) return;
    setToggling(true);
    try {
      await setReadOptIn(enabled);
      // Refetch score after toggle.
      const s = await fetchScore();
      setScore(s);
      onScoreChange?.(s);
    } catch (err) {
      console.warn('[PhiSafetyPopover] setPhiReadOptIn failed:', err);
    } finally {
      setToggling(false);
    }
  }

  // ── Trigger render ─────────────────────────────────────────────────────────

  const entryClass = `statusbar-entry${entry.text ? '' : ' statusbar-entry--icon-only'} phi-safety-trigger`;

  const posture = score ? scorePosture(score) : null;

  function handleTriggerClick() {
    if (popover.isOpen) {
      popover.close();
    } else {
      setScore(null);
      setLoading(true);
      setError(null);
      popover.open(triggerRef.current!);
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        className={[
          entryClass,
          posture?.colorClass ?? '',
          popover.isOpen ? 'phi-safety-trigger--open' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        title={entry.tooltip}
        onClick={handleTriggerClick}
        aria-haspopup="dialog"
        aria-expanded={popover.isOpen}
      >
        <Icon name="shield" size={entry.iconSize ?? 13} />
        {entry.text && <span>{entry.text}</span>}
      </button>

      <Popover
        isOpen={popover.isOpen}
        position={popover.position}
        setPopoverElement={popover.setPopoverElement}
        className="phi-safety-popover"
        role="dialog"
        aria-label="PHI Safety Score"
      >
        <div className="phi-safety-popover__inner">
          {/* ── Header ──────────────────────────────────────────────────── */}
          <div className="phi-safety-popover__header">
            <Icon name="shield" size={14} className="phi-safety-popover__header-icon" />
            <span className="phi-safety-popover__title">PHI Safety Score</span>
            <button
              className="phi-safety-popover__close"
              onClick={() => popover.close()}
              title="Close"
              aria-label="Close"
            >
              <Icon name="close" size={12} />
            </button>
          </div>

          {/* ── Score section ────────────────────────────────────────────── */}
          {loading && (
            <div className="phi-safety-popover__loading">Loading…</div>
          )}

          {error && !loading && (
            <div className="phi-safety-popover__error">{error}</div>
          )}

          {score && !loading && (
            <>
              <div className={`phi-safety-popover__score-row ${posture!.colorClass}`}>
                <span className="phi-safety-popover__score-number">{score.score}</span>
                <div className="phi-safety-popover__score-meta">
                  <span className="phi-safety-popover__score-pct">% kept local</span>
                  <span className={`phi-safety-popover__posture-label ${posture!.colorClass}`}>
                    {posture!.label}
                  </span>
                </div>
              </div>

              {/* ── Honesty line ─────────────────────────────────────────── */}
              <p className="phi-safety-popover__honesty">{honestyLine(score)}</p>

              <hr className="phi-safety-popover__divider" />

              {/* ── PHI-read consent toggle ──────────────────────────────── */}
              <div className="phi-safety-popover__row">
                <div className="phi-safety-popover__row-label">
                  <span className="phi-safety-popover__row-title">Read provider calendar PHI</span>
                  <span className="phi-safety-popover__row-sub">
                    {score.factors.readOptIn
                      ? 'On — participant names read from your calendar. Disabling stops new links.'
                      : 'Off — participant matching and client-linking are disabled.'}
                  </span>
                </div>
                <button
                  role="switch"
                  aria-checked={score.factors.readOptIn}
                  className={[
                    'phi-safety-popover__toggle',
                    score.factors.readOptIn ? 'phi-safety-popover__toggle--on' : '',
                    toggling ? 'phi-safety-popover__toggle--busy' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  disabled={toggling}
                  onClick={() => void handleToggleReadOptIn(!score.factors.readOptIn)}
                  title={score.factors.readOptIn ? 'Turn off PHI read' : 'Turn on PHI read'}
                />
              </div>

              {/* ── PHI-write row (disabled, O499 deferred) ─────────────── */}
              <div className="phi-safety-popover__row phi-safety-popover__row--disabled">
                <div className="phi-safety-popover__row-label">
                  <span className="phi-safety-popover__row-title">Write opaque blocks to calendar</span>
                  <span className="phi-safety-popover__row-sub">Coming soon — write PHI-free "Busy" blocks (O499)</span>
                </div>
                <button
                  role="switch"
                  aria-checked={false}
                  className="phi-safety-popover__toggle"
                  disabled
                  title="Not yet available"
                />
              </div>
            </>
          )}
        </div>
      </Popover>
    </>
  );
}
