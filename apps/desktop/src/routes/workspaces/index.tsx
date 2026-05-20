/**
 * Workspace picker — /workspaces
 *
 * Shown when:
 *   - The user has signed out with workspaces remaining (no active pointer).
 *   - The user invokes `workbench.workspace.switch` from the command palette
 *     while a workspace is currently active.
 *
 * Tiles are listed by nickname only (no emails — product decision).
 * Clicking a tile calls setActive(id), which fires workspace.changed, which
 * causes PreWorkspaceRoute to re-evaluate and land the user at UnlockGate.
 *
 * "Add new workspace" navigates to /setup/keys?addNew=true so the ceremony
 * route creates a second workspace rather than short-circuiting on an existing
 * active pointer.
 *
 * Reached via /workspaces add-new from picker — fresh-create flow shares the
 * setup route with `?addNew=true`.
 */

/* eslint-disable react-refresh/only-export-components */
import { useState, useEffect } from 'react';
import { createFileRoute, useNavigate, Navigate } from '@tanstack/react-router';
import type { WorkspaceMeta } from '../../../electron/shared/lock-protocol';
import WorkspaceTileGrid from '../../workbench/middle/WorkspaceTileGrid';
import Wordmark from '../../workbench/parts/Wordmark';
import { PageShell } from '../../platform/ui/PageShell';

export const Route = createFileRoute('/workspaces/')({
  component: WorkspacePickerPage,
});

function WorkspacePickerPage() {
  return <WorkspacePickerContent />;
}

function WorkspacePickerContent() {
  const navigate = useNavigate();
  const [workspaces, setWorkspaces] = useState<WorkspaceMeta[] | null>(null);
  const [activating, setActivating] = useState<string | null>(null);
  const [error, setError] = useState<string>('');

  // Fetch workspace list on mount; re-fetch when workspace.changed fires.
  useEffect(() => {
    let cancelled = false;

    function fetchList() {
      window.soam.workspace
        .list()
        .then((list) => {
          if (!cancelled) setWorkspaces(list);
        })
        .catch(() => {
          if (!cancelled) setWorkspaces([]);
        });
    }

    fetchList();

    const dispose = window.soam.workspace.onChange(() => {
      fetchList();
    });

    return () => {
      cancelled = true;
      dispose();
    };
  }, []);

  // Suspend render until list is loaded — spacer keeps StatusBar pinned to bottom.
  if (workspaces === null) return <div className="flex-auto" />;

  // Defensive: zero workspaces → setup ceremony (should not happen normally).
  if (workspaces.length === 0) {
    return <Navigate to="/setup/keys" />;
  }

  async function handleSelectWorkspace(workspaceId: string) {
    setActivating(workspaceId);
    setError('');
    try {
      const res = await window.soam.workspace.setActive(workspaceId);
      if (!res.ok) {
        setError('Could not activate workspace. Please try again.');
        setActivating(null);
        return;
      }
      // setActive fires workspace.changed → PreWorkspaceRoute at / re-evaluates
      // and routes to UnlockGate. Navigate to / to let it take over.
      await navigate({ to: '/' });
    } catch (err) {
      setError(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
      setActivating(null);
    }
  }

  function handleAddNew() {
    void navigate({ to: '/setup/keys', search: { addNew: true } });
  }

  return (
    <PageShell topbar={<Wordmark />} className="justify-start overflow-auto">
      <div className="flex flex-col m-auto items-start gap-6 w-full max-w-3xl p-10">
        <div>
          <h1 className="t-h2 font-display">Choose a workspace</h1>
          <p className="t-description max-w-[48ch]">Select a workspace to unlock, or add a new one.</p>
        </div>
        {error && <p className="text-xs text-error flex items-center gap-1.5">{error}</p>}
        <WorkspaceTileGrid
          workspaces={workspaces}
          activating={activating}
          onSelect={(id) => void handleSelectWorkspace(id)}
          onAddNew={handleAddNew}
        />
      </div>
    </PageShell>
  );
}
