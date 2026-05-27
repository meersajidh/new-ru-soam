/**
 * PreWorkspaceRoute — top-level decision component that gates access to the
 * Workbench shell based on workspace and lock state.
 *
 * Reads context keys set by boot.ts and decides:
 *   - !activeId && list().length === 0  → Navigate to /setup/keys (zero-workspaces)
 *   - !activeId && list().length > 0    → <LoginModal mode="identify" />
 *   - activeId && !setupComplete        → Navigate to /setup/keys (setup-pending;
 *                                         ceremony interrupted before acknowledge)
 *   - activeId && setupComplete && locked → <LoginModal mode="default" />
 *   - activeId && setupComplete && mustResetPassphrase → <LoginModal mode="default" forceResetMode />
 *   - activeId && setupComplete && !locked → render <Workbench /> (workspace shell, lazy-loaded)
 *
 * Race-condition guard: the `workspace.setupComplete` context key is seeded
 * `false` at boot and corrected asynchronously by `lock.changed`. When
 * setActive() is called then the route renders, this component can render
 * before `lock.changed` arrives — reading the stale `false` would misroute to
 * /setup/keys. To guard against this, we fetch `lock.state()` directly for the
 * current `activeId` before evaluating the setup-pending branch. While that
 * confirmation is in-flight we render <LoadingSplash embedded />.
 */

import { useState, useEffect, lazy, Suspense } from 'react';
import { Navigate } from '@tanstack/react-router';
import type { LockState } from '../../../electron/shared/lock-protocol';
import { useContextKey } from '../../platform/services/hooks';
import LoadingSplash from './LoadingSplash';
import LoginModal from './LoginModal';

// Lazy-load the workbench shell so its code is NOT in the pre-auth bundle.
const Middle = lazy(() => import('./Middle'));

export default function PreWorkspaceRoute() {
  const activeId = useContextKey('workspace.activeId') as string;
  // NOTE: setupComplete is NOT read from context key — it's stale on cold boot.
  // We fetch it fresh via lock.state() and store in `confirmed`. See below.
  const kekLocked = useContextKey('workspace.kekLocked') as boolean;
  const mustResetPassphrase = useContextKey('workspace.mustResetPassphrase') as boolean;

  // List check: needed for the zero-workspaces and identify-mode branches.
  // Refresh on workspace.changed events (handled by context-key subscription in boot.ts).
  const [workspaceCount, setWorkspaceCount] = useState<number | null>(null);

  // Confirmed lock state fetched directly from Main for the current activeId.
  // Stores { state, forId } together so the confirmation check is atomic.
  // `null` means "not yet confirmed for current activeId" — show splash while waiting.
  const [confirmed, setConfirmed] = useState<{ state: LockState; forId: string } | null>(null);

  useEffect(() => {
    let cancelled = false;

    window.soam.workspace.list().then((list) => {
      if (!cancelled) setWorkspaceCount(list.length);
    }).catch(() => {
      if (!cancelled) setWorkspaceCount(0);
    });

    if (activeId) {
      // Fetch confirmed lock state to guard against stale context-key on cold boot.
      window.soam.lock.state().then((state) => {
        if (!cancelled) {
          setConfirmed({ state, forId: activeId });
        }
      }).catch(() => {
        if (!cancelled) {
          // On error fall back to treating as locked + setupComplete so we land
          // on LoginModal (default) rather than looping through setup.
          setConfirmed({
            state: { locked: true, setupComplete: true, mustResetPassphrase: false },
            forId: activeId,
          });
        }
      });
    }

    return () => {
      cancelled = true;
    };
  }, [activeId]); // re-fetch when activeId changes (sign-out etc.)

  // Show splash only while route is still resolving.
  if (workspaceCount === null && !activeId) {
    return <LoadingSplash embedded />;
  }

  // Zero-workspaces: route to setup ceremony
  if (!activeId && workspaceCount === 0) {
    return <Navigate to="/setup/keys" />;
  }

  // No active pointer but workspaces exist → identify mode login modal
  if (!activeId && (workspaceCount ?? 0) > 0) {
    return <LoginModal mode="identify" />;
  }

  // activeId is set from here on. Wait for lock-state confirmation before
  // branching on setupComplete — avoids cold-boot race to /setup/keys.
  if (confirmed === null || confirmed.forId !== activeId) {
    return <LoadingSplash embedded />;
  }

  const confirmedSetupComplete = confirmed.state.setupComplete;

  // Active workspace exists but setup was never completed (ceremony interrupted).
  // Use confirmed setupComplete, not the (potentially stale) context key.
  if (activeId && !confirmedSetupComplete) {
    return <Navigate to="/setup/keys" />;
  }

  // Setup complete but workspace is locked → default mode login modal.
  // kekLocked from context key drives live unlock transitions (re-renders on lock.changed).
  if (activeId && confirmedSetupComplete && kekLocked) {
    return <LoginModal mode="default" />;
  }

  // Unlocked via recovery code — force passphrase reset before workspace access.
  if (activeId && confirmedSetupComplete && !kekLocked && mustResetPassphrase) {
    return <LoginModal mode="default" forceResetMode />;
  }

  // Fully unlocked — lazy-load the workspace shell.
  return (
    <Suspense fallback={<LoadingSplash embedded />}>
      <Middle />
    </Suspense>
  );
}
