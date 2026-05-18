import { Lock } from 'lucide-react';
import type { WorkspaceMeta } from '../../../electron/shared/lock-protocol';
import './WorkspaceTileGrid.css';

// Captured once at module load — acceptable staleness for a 24-hour threshold check.
const MODULE_LOAD_TIME = Date.now();

const AVATAR_PALETTE = [
  'oklch(0.58 0.14 130)',
  'oklch(0.68 0.16 55)',
  'oklch(0.60 0.17 290)',
  'oklch(0.65 0.14 195)',
  'oklch(0.62 0.18 25)',
  'oklch(0.65 0.13 220)',
];

const MS_IN_24H = 24 * 60 * 60 * 1000;

interface WorkspaceTileGridProps {
  workspaces: WorkspaceMeta[];
  activating: string | null;
  onSelect: (id: string) => void;
  onAddNew: () => void;
}

export default function WorkspaceTileGrid({
  workspaces,
  activating,
  onSelect,
  onAddNew,
}: WorkspaceTileGridProps) {
  // Find workspace with latest lastSignedIn
  let mruId: string | null = null;
  let mruIsRecent = false;
  let latestMs = -Infinity;
  for (const ws of workspaces) {
    if (ws.lastSignedIn) {
      const ms = new Date(ws.lastSignedIn).getTime();
      if (ms > latestMs) {
        latestMs = ms;
        mruId = ws.workspaceId;
        mruIsRecent = MODULE_LOAD_TIME - ms < MS_IN_24H;
      }
    }
  }

  return (
    <div className="wtg-grid">
      {workspaces.map((ws, idx) => {
        const isMru = ws.workspaceId === mruId;
        const isActivating = activating === ws.workspaceId;
        const avatarColor = AVATAR_PALETTE[idx % AVATAR_PALETTE.length];
        const dateLabel = ws.lastSignedIn
          ? new Date(ws.lastSignedIn).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })
          : null;

        return (
          <button
            key={ws.workspaceId}
            className={`wtg-tile${isMru ? ' wtg-tile--mru' : ''}`}
            onClick={() => onSelect(ws.workspaceId)}
            disabled={activating !== null}
            aria-busy={isActivating}
          >
            {isMru && mruIsRecent && <span className="wtg-mru-dot" aria-hidden="true" />}
            <span className="wtg-avatar" style={{ background: avatarColor }} aria-hidden="true">
              {ws.nickname.charAt(0).toUpperCase()}
            </span>
            <span className="wtg-body">
              <span className="wtg-name">{ws.nickname}</span>
              {dateLabel && <span className="wtg-date">{dateLabel}</span>}
            </span>
            <span className="wtg-footer">
              <span className="wtg-notes">—</span>
              {isActivating ? (
                <span className="wtg-spinner" aria-hidden="true" />
              ) : isMru && mruIsRecent ? (
                <span className="wtg-pill wtg-pill--recent">RECENT</span>
              ) : (
                <span className="wtg-pill wtg-pill--locked">
                  <Lock size={10} aria-hidden="true" />
                  LOCKED
                </span>
              )}
            </span>
          </button>
        );
      })}
      <button
        className="wtg-tile wtg-tile--add"
        onClick={onAddNew}
        disabled={activating !== null}
      >
        <span className="wtg-add-icon" aria-hidden="true">+</span>
        <span className="wtg-add-label">Add workspace</span>
      </button>
    </div>
  );
}
