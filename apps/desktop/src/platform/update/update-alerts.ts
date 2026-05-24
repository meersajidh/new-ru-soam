/**
 * update-alerts.ts — boot-level update state watcher.
 *
 * Subscribes to window.soam.update.onChange and translates UpdateState
 * transitions into NotificationService pushes + a status-bar indicator entry.
 *
 * Platform detection for the ready branch: getCopyInstallCommand() returning
 * a non-null string is the Linux signal (ADR-204 §5). Renderer never imports
 * process.platform (ADR-202). This heuristic is tracked as O190 in
 * docs/Open_Items.md (expose window.soam.app.platform for a clean signal).
 *
 * Returns an IDisposable per the disposable-pattern convention.
 */

import type { INotificationService } from '../notification/notification-service';
import type { IStatusBarService } from '../statusbar/statusbar-service';
import type { IDisposable } from '../../workbench/heartbeat';

export function installUpdateAlerts(
  notifications: INotificationService,
  statusBar: IStatusBarService,
): IDisposable {
  let disposed = false;
  // Track the "available" notification id so we don't re-push it on every
  // tick (state-changed fires on all transitions, not just unique ones).
  let availableNotifId: string | null = null;
  let readyNotifId: string | null = null;

  const unsubscribe = window.soam.update.onChange((payload) => {
    if (disposed) return;
    const state = payload.state;

    switch (state.status) {
      case 'available': {
        // Only push once per available version to avoid duplicates.
        if (availableNotifId != null) break;
        availableNotifId = notifications.push({
          severity: 'info',
          title: 'Update available',
          message: `Version ${state.version} is ready to download.`,
          sticky: true,
          actions: [
            {
              label: 'Download',
              onClick: () => void window.soam.update.downloadNow(),
            },
          ],
        });
        statusBar.update('workbench.update', {
          visible: true,
          text: 'Update available',
          tooltip: `Version ${state.version} available — click to download`,
          command: 'workbench.update.downloadNow',
          severity: 'ok',
        });
        break;
      }

      case 'downloading': {
        const pct = Math.round(state.percent);
        // Update status-bar with percent — 250 ms rate-limiter in StatusBarService
        // absorbs rapid ticks. No notification spam.
        statusBar.update('workbench.update', {
          visible: true,
          text: `Updating… ${pct}%`,
          tooltip: `Downloading update — ${pct}% complete`,
          command: undefined,
          severity: 'ok',
        });
        break;
      }

      case 'ready': {
        if (readyNotifId != null) break;
        // Linux detection: getCopyInstallCommand() non-null → guided install path.
        // O190: expose window.soam.app.platform as a clean signal if needed.
        void (async () => {
          const installCmd = await window.soam.update.getCopyInstallCommand();
          if (disposed) return;

          if (installCmd != null) {
            // Linux guided install
            readyNotifId = notifications.push({
              severity: 'success',
              title: 'Update ready to install',
              message: `Run the following command to install:\n${installCmd}`,
              sticky: true,
            });
          } else {
            // Windows — restart action
            readyNotifId = notifications.push({
              severity: 'success',
              title: 'Update ready to install',
              message: `Version ${state.version} has been downloaded.`,
              sticky: true,
              actions: [
                {
                  label: 'Restart to update',
                  onClick: () => void window.soam.update.installAndRestart(),
                },
              ],
            });
          }
          statusBar.update('workbench.update', {
            visible: true,
            text: 'Restart to update',
            tooltip: `Version ${state.version} downloaded — ready to install`,
            command: installCmd != null ? undefined : 'workbench.update.installAndRestart',
            severity: 'ok',
          });
        })();
        break;
      }

      case 'error': {
        notifications.push({
          severity: 'warning',
          title: 'Update check failed',
          message: state.message,
          sticky: false,
        });
        // Hide the status-bar entry on error (it was never shown, or clear it)
        statusBar.update('workbench.update', {
          visible: false,
          text: '',
        });
        break;
      }

      case 'idle':
      case 'checking':
        // No user-visible change for these states.
        break;
    }
  });

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe();
    },
  };
}
