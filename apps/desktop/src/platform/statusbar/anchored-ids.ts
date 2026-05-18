import type { StatusBarEntry } from './statusbar-service';

// Anchored StatusBar entries — updated in Phase 10b Chrome elevation.
export const ANCHORED_ENTRIES: StatusBarEntry[] = [
  // ── Left region (highest priority = leftmost) ────────────────────────────
  {
    id: 'workbench.lock',
    region: 'left',
    priority: 1000,
    text: 'Locked',
    tooltip: 'Workspace locked — enter passphrase to unlock',
    command: 'workbench.workspace.relock',
    visible: false, // made visible once a workspace is active (set in boot.ts)
    icon: 'lock',
  },
  {
    id: 'workbench.workspace.nickname',
    region: 'left',
    priority: 900,
    text: '',
    tooltip: '',
    visible: false, // shown when unlocked and nickname available
    icon: 'circle-user',
  },
  {
    id: 'workbench.workspace.entity',
    region: 'left',
    priority: 800,
    text: 'No workspace',
    tooltip: 'No workspace open',
    visible: true,
    icon: 'hash',
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
    id: 'workbench.notifications',
    region: 'right',
    priority: 1000,
    text: 'Alerts',
    tooltip: 'Notifications',
    visible: true,
    icon: 'bell',
    badge: 0,
  },
  {
    id: 'workbench.dev-mode',
    region: 'right',
    priority: 900,
    text: 'Dev build',
    tooltip: 'Running in development mode with a mock user',
    visible: false, // set to true in boot.ts when import.meta.env.DEV
    icon: 'triangle-alert',
    severity: 'warning',
  },
  {
    id: 'workbench.sync.state',
    region: 'right',
    priority: 800,
    text: 'Sync —',
    tooltip: 'Sync state',
    visible: true,
    icon: 'cloud',
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
