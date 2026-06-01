/**
 * WorkspaceSwitcher — StatusBar workspace nickname entry, enriched as a
 * dropdown switcher when >1 workspace exists.
 *
 * When ≤1 workspace: renders as a plain non-interactive span (current behaviour).
 * When >1 workspaces: renders as a button that opens an upward-flipping popover
 * listing all workspaces, marks the active one, and switches on selection.
 *
 * Switch flow (ADR-307 / ADR-504):
 *   setActive(targetId) → relock()
 *   lock.onChange fires in boot.ts → kekLocked=true → UnlockGate shows for target.
 *
 * Renderer-only (ADR-102): all workspace + lock ops via window.soam.*.
 */

import { useEffect, useRef, useState } from 'react';
import { Briefcase, Check, ChevronUp } from 'lucide-react';
import type { StatusBarEntry } from '../../platform/statusbar/statusbar-service';
import type { WorkspaceMeta } from '../../../electron/shared/lock-protocol';
import { usePopover } from '../../platform/popover/use-popover';
import Popover from '../../platform/popover/Popover';
import './WorkspaceSwitcher.css';

interface WorkspaceSwitcherProps {
  entry: StatusBarEntry;
}

const ITEM_HEIGHT = 32;
const PADDING_V = 6;
const HEADER_H = 28;
const MAX_VISIBLE = 8;

export default function WorkspaceSwitcher({ entry }: WorkspaceSwitcherProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  const [workspaces, setWorkspaces] = useState<WorkspaceMeta[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [triggerWidth, setTriggerWidth] = useState(180);
  // activeIdx tracks keyboard highlight; initialized to current workspace idx on open
  const [activeIdx, setActiveIdx] = useState(0);

  // Load workspace list + active id once on mount
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      window.soam.workspace.list(),
      window.soam.workspace.getActive(),
    ])
      .then(([list, id]) => {
        if (cancelled) return;
        setWorkspaces(list);
        setActiveId(id);
      })
      .catch((err) => {
        console.warn('[WorkspaceSwitcher] could not load workspaces:', err);
      });
    return () => { cancelled = true; };
  }, []);

  const estimatedH =
    Math.min(workspaces.length, MAX_VISIBLE) * ITEM_HEIGHT + PADDING_V * 2 + HEADER_H;

  const popover = usePopover({
    estimatedHeight: estimatedH,
    estimatedWidth: triggerWidth,
    edgeMargin: 6,
  });

  const setListRef = (el: HTMLUListElement | null) => {
    listRef.current = el;
    popover.setPopoverElement(el);
  };

  function openSwitcher() {
    if (!triggerRef.current || workspaces.length <= 1) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setTriggerWidth(rect.width);
    // Set keyboard highlight to current workspace
    const currentIdx = workspaces.findIndex((w) => w.workspaceId === activeId);
    setActiveIdx(Math.max(0, currentIdx));
    popover.open(triggerRef.current);
  }

  async function selectWorkspace(id: string) {
    if (id === activeId || switching) return;
    setSwitching(true);
    popover.close();
    try {
      const setRes = await window.soam.workspace.setActive(id);
      if (!setRes.ok) {
        console.warn('[WorkspaceSwitcher] setActive failed:', setRes);
        setSwitching(false);
        return;
      }
      // Relock — triggers lock.onChange in boot.ts → kekLocked=true → UnlockGate shows
      await window.soam.lock.relock();
      // After relock the UI transitions to unlock gate for the new workspace.
    } catch (err) {
      console.warn('[WorkspaceSwitcher] switch failed:', err);
      setSwitching(false);
    }
  }

  // Focus list on open
  useEffect(() => {
    if (popover.isOpen) {
      requestAnimationFrame(() => listRef.current?.focus());
    }
  }, [popover.isOpen]);

  // List keyboard nav
  useEffect(() => {
    if (!popover.isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      switch (e.key) {
        case 'ArrowDown':
        case 'ArrowUp': {
          e.preventDefault();
          const dir = e.key === 'ArrowDown' ? 1 : -1;
          setActiveIdx((i) => {
            const next = i + dir;
            return next < 0 ? workspaces.length - 1 : next >= workspaces.length ? 0 : next;
          });
          break;
        }
        case 'Home':
          e.preventDefault();
          setActiveIdx(0);
          break;
        case 'End':
          e.preventDefault();
          setActiveIdx(workspaces.length - 1);
          break;
        case 'Enter':
        case ' ': {
          e.preventDefault();
          const ws = workspaces[activeIdx];
          if (ws) void selectWorkspace(ws.workspaceId);
          break;
        }
        // Esc handled by usePopover
      }
    }
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [popover.isOpen, workspaces, activeIdx, activeId, switching]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll active option into view
  useEffect(() => {
    if (!popover.isOpen || !listRef.current) return;
    const opt = listRef.current.querySelector<HTMLElement>(
      `[data-ws-idx="${activeIdx}"]`,
    );
    opt?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx, popover.isOpen]);

  const entryClassName = `statusbar-entry${entry.text ? '' : ' statusbar-entry--icon-only'}`;

  // Single workspace or no data yet → plain non-interactive entry
  if (workspaces.length <= 1) {
    return (
      <span className={entryClassName} title={entry.tooltip}>
        <Briefcase size={entry.iconSize ?? 13} aria-hidden="true" />
        {entry.text && <span>{entry.text}</span>}
      </span>
    );
  }

  // Multi-workspace → interactive button + dropdown
  return (
    <>
      <button
        ref={triggerRef}
        className={[
          entryClassName,
          'workspace-switcher__trigger',
          popover.isOpen ? 'workspace-switcher__trigger--open' : '',
          switching ? 'workspace-switcher__trigger--switching' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        title={switching ? 'Switching account…' : (entry.tooltip ?? 'Switch account')}
        onClick={() => (popover.isOpen ? popover.close() : openSwitcher())}
        aria-haspopup="listbox"
        aria-expanded={popover.isOpen}
        disabled={switching}
      >
        <Briefcase size={entry.iconSize ?? 13} aria-hidden="true" />
        {entry.text && <span>{entry.text}</span>}
        <ChevronUp
          size={10}
          className="workspace-switcher__chevron"
          aria-hidden="true"
        />
      </button>

      <Popover
        isOpen={popover.isOpen}
        position={popover.position}
        setPopoverElement={popover.setPopoverElement}
        role="none"
      >
        <ul
          ref={setListRef}
          className="workspace-switcher__list"
          role="listbox"
          tabIndex={-1}
          aria-label="Switch account"
          style={{ minWidth: triggerWidth }}
        >
          <li className="workspace-switcher__list-header" role="none" aria-hidden="true">
            Accounts
          </li>
          {workspaces.map((ws, idx) => {
            const isCurrent = ws.workspaceId === activeId;
            return (
              <li
                key={ws.workspaceId}
                role="option"
                aria-selected={isCurrent}
                data-ws-idx={idx}
                className={[
                  'workspace-switcher__option',
                  isCurrent ? 'workspace-switcher__option--current' : '',
                  idx === activeIdx ? 'workspace-switcher__option--active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onMouseEnter={() => setActiveIdx(idx)}
                onClick={() => void selectWorkspace(ws.workspaceId)}
              >
                <span className="workspace-switcher__option-check" aria-hidden="true">
                  {isCurrent && <Check size={11} strokeWidth={2.5} />}
                </span>
                <span className="workspace-switcher__option-label">{ws.nickname}</span>
              </li>
            );
          })}
        </ul>
      </Popover>
    </>
  );
}
