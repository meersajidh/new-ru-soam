import type { StatusBarEntry } from './statusbar-service';

// Anchored StatusBar entries — updated in Phase 10b Chrome elevation.
export const ANCHORED_ENTRIES: StatusBarEntry[] = [
  // ── Left region (highest priority = leftmost) ────────────────────────────
  {
    // O426: shown mid-chord ("(ctrl+k) waiting for second key…"), hidden otherwise.
    id: 'workbench.pendingChord',
    region: 'left',
    priority: 1100,
    text: '',
    visible: false,
    scope: 'always',
  },
  {
    id: 'workbench.lock',
    region: 'left',
    priority: 1000,
    text: '',
    tooltip: 'Account locked — enter passphrase to unlock',
    command: 'workbench.workspace.relock',
    visible: false, // made visible once a workspace is active (set in boot.ts)
    icon: 'lock',
  },
  {
    id: 'workbench.workspace.nickname',
    region: 'left',
    priority: 900,
    text: '',
    tooltip: 'Active account',
    visible: false, // shown when unlocked and nickname available
    icon: 'briefcase',
  },
  {
    id: 'workbench.sync.state',
    region: 'left',
    priority: 850,
    text: '',
    tooltip: 'Sync state',
    visible: false,
    icon: 'cloud',
  },
  {
    id: 'workbench.dev-mode',
    region: 'left',
    priority: 800,
    text: 'DEV',
    tooltip: 'Running in development mode with a mock user',
    visible: false, // set to true in boot.ts when import.meta.env.DEV
    icon: 'triangle-alert',
    severity: 'warning',
    scope: 'always',
  },
  {
    id: 'workbench.editor.dirty',
    region: 'left',
    priority: 700,
    text: 'Unsaved',
    tooltip: 'Unsaved changes',
    visible: false, // gated: editor.dirty (Phase 5)
    icon: 'dot',
  },

  // ── Right region (highest priority = rightmost / corner) ─────────────────
  {
    id: 'workbench.theme.darkMode',
    region: 'right',
    priority: 50,
    text: '',
    tooltip: 'Toggle dark / light mode',
    command: 'workbench.toggleDarkMode',
    visible: true,
    icon: 'moon',
    scope: 'always',
  },
  {
    id: 'workbench.version',
    region: 'right',
    priority: 100,
    text: '',
    tooltip: '',
    command: 'workbench.showWhatsNew',
    visible: true,
    severity: 'ok',
    scope: 'always',
  },
  {
    id: 'workbench.notifications',
    region: 'right',
    priority: 10,
    text: '',
    tooltip: 'Notifications',
    command: 'workbench.notifications.toggle',
    visible: true,
    icon: 'bell',
    iconSize: 15,
    badge: 0,
  },
  {
    id: 'workbench.update',
    region: 'right',
    priority: 75,
    text: '',
    tooltip: '',
    command: 'workbench.update.downloadNow',
    visible: false, // shown by update-alerts when available/downloading/ready
    icon: 'download',
    iconSize: 13,
    scope: 'always',
  },
  {
    id: 'workbench.bundle.activity',
    region: 'right',
    priority: 700,
    text: 'Bundle',
    tooltip: 'Bundle activity',
    visible: false, // gated: bundle.active (Phase 6)
    icon: 'circle-dot',
  },
];
