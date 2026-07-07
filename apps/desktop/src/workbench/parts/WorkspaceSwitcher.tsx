/**
 * WorkspaceSwitcher — StatusBar workspace nickname entry, enriched as a
 * dropdown switcher when >1 workspace exists.
 *
 * When ≤1 workspace: renders as a plain non-interactive span (current behaviour).
 * When >1 workspaces: a StatusBar button opening an upward `DropdownMenu`
 * (Base UI Menu — modal, dismisses over bundle iframes; ADR-421 F4 4e-ii)
 * listing all workspaces, marking the active one, switching on selection.
 *
 * Switch flow (ADR-307 / ADR-504):
 *   setActive(targetId) → relock()
 *   lock.onChange fires in boot.ts → kekLocked=true → UnlockGate shows for target.
 *
 * Renderer-only (ADR-102): all workspace + lock ops via window.soam.*.
 */

import { useEffect, useState } from 'react';
import {
  Icon,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
} from '@basebench/ui';
import type { StatusBarEntry } from '../../platform/statusbar/statusbar-service';
import type { WorkspaceMeta } from '../../../electron/shared/lock-protocol';
import './WorkspaceSwitcher.css';

interface WorkspaceSwitcherProps {
  entry: StatusBarEntry;
}

export default function WorkspaceSwitcher({ entry }: WorkspaceSwitcherProps) {
  const [workspaces, setWorkspaces] = useState<WorkspaceMeta[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);

  // Load workspace list + active id once on mount
  useEffect(() => {
    let cancelled = false;
    Promise.all([window.soam.workspace.list(), window.soam.workspace.getActive()])
      .then(([list, id]) => {
        if (cancelled) return;
        setWorkspaces(list);
        setActiveId(id);
      })
      .catch((err) => {
        console.warn('[WorkspaceSwitcher] could not load workspaces:', err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function selectWorkspace(id: string) {
    if (id === activeId || switching) return;
    setSwitching(true);
    try {
      const setRes = await window.soam.workspace.setActive(id);
      if (!setRes.ok) {
        console.warn('[WorkspaceSwitcher] setActive failed:', setRes);
        setSwitching(false);
        return;
      }
      // Relock — triggers lock.onChange in boot.ts → kekLocked=true → UnlockGate shows
      await window.soam.lock.relock();
    } catch (err) {
      console.warn('[WorkspaceSwitcher] switch failed:', err);
      setSwitching(false);
    }
  }

  const entryClassName = `statusbar-entry${entry.text ? '' : ' statusbar-entry--icon-only'}`;

  // Single workspace or no data yet → plain non-interactive entry
  if (workspaces.length <= 1) {
    return (
      <span className={entryClassName} title={entry.tooltip}>
        <Icon name="briefcase" size={entry.iconSize ?? 13} />
        {entry.text && <span>{entry.text}</span>}
      </span>
    );
  }

  // Multi-workspace → interactive button + dropdown
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={[entryClassName, 'workspace-switcher__trigger'].join(' ')}
        title={switching ? 'Switching account…' : (entry.tooltip ?? 'Switch account')}
        disabled={switching}
      >
        <Icon name="briefcase" size={entry.iconSize ?? 13} />
        {entry.text && <span>{entry.text}</span>}
        <Icon name="chevron-up" size={10} className="workspace-switcher__chevron" />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        side="top"
        align="start"
        className="workspace-switcher__menu"
        aria-label="Switch account"
      >
        <DropdownMenuLabel>Accounts</DropdownMenuLabel>
        {workspaces.map((ws) => {
          const isCurrent = ws.workspaceId === activeId;
          return (
            <DropdownMenuItem
              key={ws.workspaceId}
              onClick={() => void selectWorkspace(ws.workspaceId)}
            >
              <span className="workspace-switcher__option-check" aria-hidden="true">
                {isCurrent && <Icon name="check" size={12} />}
              </span>
              <span className="workspace-switcher__option-label">{ws.nickname}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
