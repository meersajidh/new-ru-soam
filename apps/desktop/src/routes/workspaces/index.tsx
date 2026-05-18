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

import { useState, useEffect } from 'react';
import { createFileRoute, useNavigate, Navigate } from '@tanstack/react-router';
import type { WorkspaceMeta } from '../../../electron/shared/lock-protocol';
import '../../styles/workbench.css';
import '../../styles/setup.css';

export const Route = createFileRoute('/workspaces/')({
  component: WorkspacePickerPage,
});

// eslint-disable-next-line react-refresh/only-export-components
function WorkspacePickerPage() {
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

  // Suspend render until list is loaded.
  if (workspaces === null) return null;

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
    <div className="setup-page">
      <div className="workspace-picker-container">
        <div className="workspace-picker-header">
          <h1 className="setup-title">Choose a workspace</h1>
          <p className="setup-description">
            Select a workspace to unlock, or add a new one.
          </p>
        </div>

        {error && <p className="setup-error">{error}</p>}

        <ul className="workspace-picker-list" role="list">
          {workspaces.map((ws) => (
            <li key={ws.workspaceId}>
              <button
                className={`workspace-picker-tile${activating === ws.workspaceId ? ' workspace-picker-tile--loading' : ''}`}
                onClick={() => void handleSelectWorkspace(ws.workspaceId)}
                disabled={activating !== null}
                aria-busy={activating === ws.workspaceId}
              >
                <span className="workspace-picker-avatar" aria-hidden="true">
                  {ws.nickname.charAt(0).toUpperCase()}
                </span>
                <span className="workspace-picker-info">
                  <span className="workspace-picker-nickname">{ws.nickname}</span>
                  {ws.lastSignedIn && (
                    <span className="workspace-picker-last-seen">
                      {'Last signed in '}
                      {new Date(ws.lastSignedIn).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                  )}
                </span>
                {activating === ws.workspaceId && (
                  <span className="workspace-picker-loading-indicator" aria-hidden="true" />
                )}
              </button>
            </li>
          ))}
        </ul>

        <div className="workspace-picker-add">
          <button
            className="setup-btn-ghost"
            onClick={handleAddNew}
            disabled={activating !== null}
          >
            + Add new workspace
          </button>
        </div>
      </div>
    </div>
  );
}
