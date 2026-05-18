/**
 * PreWorkspaceRoute — top-level decision component that gates access to the
 * Workbench shell based on workspace and lock state.
 *
 * Reads context keys set by boot.ts and decides:
 *   - !activeId && list().length === 0  → Navigate to /setup/keys (zero-workspaces)
 *   - !activeId && list().length > 0    → Navigate to /workspaces (multi-workspace picker)
 *   - activeId && !setupComplete        → Navigate to /setup/keys (setup-pending;
 *                                         ceremony interrupted before acknowledge)
 *   - activeId && setupComplete && locked → render <UnlockGate />
 *   - activeId && setupComplete && !locked → render <Workbench /> (workspace shell)
 */

import { useState, useEffect } from 'react';
import { Navigate } from '@tanstack/react-router';
import { useContextKey } from '../../platform/services/hooks';
import Workbench from '../Workbench';
import UnlockGate from './UnlockGate';

export default function PreWorkspaceRoute() {
  const activeId = useContextKey('workspace.activeId') as string;
  const setupComplete = useContextKey('workspace.setupComplete') as boolean;
  const kekLocked = useContextKey('workspace.kekLocked') as boolean;
  const mustResetPassphrase = useContextKey('workspace.mustResetPassphrase') as boolean;

  // List check: only needed for the zero-workspaces redirect; fetch once at mount.
  // Refresh on workspace.changed events (handled by context-key subscription in boot.ts).
  const [workspaceCount, setWorkspaceCount] = useState<number | null>(null);

  useEffect(() => {
    window.soam.workspace.list().then((list) => {
      setWorkspaceCount(list.length);
    }).catch(() => {
      setWorkspaceCount(0);
    });
  }, [activeId]); // re-fetch when activeId changes (sign-out etc.)

  // While we haven't loaded the list yet, suspend with nothing (avoids flash)
  if (workspaceCount === null) return null;

  // Zero-workspaces: route to setup ceremony
  if (!activeId && workspaceCount === 0) {
    return <Navigate to="/setup/keys" />;
  }

  // No active pointer but workspaces exist → show the workspace picker
  if (!activeId && workspaceCount > 0) {
    return <Navigate to="/workspaces" />;
  }

  // Active workspace exists but setup was never completed (ceremony interrupted)
  if (activeId && !setupComplete) {
    return <Navigate to="/setup/keys" />;
  }

  // Setup complete but workspace is locked
  if (activeId && setupComplete && kekLocked) {
    return (
      <Workbench renderMiddleOverride={<UnlockGate />} />
    );
  }

  // Unlocked via recovery code — force passphrase reset before workspace access
  if (activeId && setupComplete && !kekLocked && mustResetPassphrase) {
    return (
      <Workbench renderMiddleOverride={<UnlockGate forceResetMode />} />
    );
  }

  // Fully unlocked — render the normal workspace shell
  return <Workbench />;
}
