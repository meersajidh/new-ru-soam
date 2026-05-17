/**
 * PreWorkspaceRoute — top-level decision component that gates access to the
 * Workbench shell based on workspace and lock state.
 *
 * Reads context keys set by boot.ts and decides:
 *   - !activeId && list().length === 0  → Navigate to /setup/keys (zero-workspaces)
 *   - activeId && !setupComplete        → Navigate to /setup/keys (setup-pending;
 *                                         ceremony interrupted before acknowledge)
 *   - activeId && setupComplete && locked → render <UnlockGate />
 *   - activeId && setupComplete && !locked → render <Workbench /> (workspace shell)
 *
 * NOTE: If activeId is absent but list().length > 0, this is an unhandled UX in
 * Phase 9b (multi-workspace UX lands in 9c). For now we route to /setup/keys and
 * add a TODO to replace with the workspace picker in Phase 9c.
 * TODO(9c): replace !activeId && list().length > 0 path with navigate('/workspaces')
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

  // No active pointer but workspaces exist (Phase 9b stub — 9c replaces with picker)
  // TODO(9c): replace with <Navigate to="/workspaces" />
  if (!activeId && workspaceCount > 0) {
    return <Navigate to="/setup/keys" />;
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
