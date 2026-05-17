import type { StatusBarEntry } from './statusbar-service';

// Six original anchored StatusBar entries per ADR-409.
// Phase 9b adds three more: workbench.lock, workbench.workspace.nickname, workbench.dev-mode.
export const ANCHORED_ENTRIES: StatusBarEntry[] = [
  {
    id: 'workbench.workspace.entity',
    region: 'left',
    priority: 1000,
    text: 'No workspace',
    tooltip: 'No workspace open',
    visible: true,
  },
  {
    id: 'workbench.editor.dirty',
    region: 'left',
    priority: 900,
    text: '●',
    tooltip: 'Unsaved changes',
    visible: false, // gated: editor.dirty (Phase 5)
  },
  // Phase 9b: lock indicator — left, below entity
  {
    id: 'workbench.lock',
    region: 'left',
    priority: 800,
    text: '[L]',
    tooltip: 'Workspace locked',
    command: 'workbench.workspace.relock',
    visible: false, // made visible once a workspace is active (set in boot.ts)
  },
  // Phase 9b: active workspace nickname — left, below lock
  {
    id: 'workbench.workspace.nickname',
    region: 'left',
    priority: 700,
    text: '',
    tooltip: '',
    visible: false, // shown when unlocked and nickname available
  },
  {
    id: 'workbench.sync.state',
    region: 'right',
    priority: 1000,
    text: 'Sync —',
    tooltip: 'Sync state',
    visible: true,
  },
  {
    id: 'workbench.kek.lock',
    region: 'right',
    priority: 900,
    text: '[L]',
    tooltip: 'Workspace locked',
    visible: false, // kept for back-compat; workbench.lock is the new canonical entry
  },
  {
    id: 'workbench.notifications',
    region: 'right',
    priority: 800,
    text: '0',
    tooltip: 'Notifications',
    visible: true,
  },
  {
    id: 'workbench.bundle.activity',
    region: 'right',
    priority: 700,
    text: '◉',
    tooltip: 'Bundle activity',
    visible: false, // gated: bundle.active (Phase 6)
  },
  // Phase 9b: DEV-mode warning — right, lowest priority
  // Visible only in dev mode (import.meta.env.DEV); boot.ts sets this at runtime.
  {
    id: 'workbench.dev-mode',
    region: 'right',
    priority: 100,
    text: 'DEV MODE — mock user',
    tooltip: 'Running in development mode with a mock user',
    visible: false, // set to true in boot.ts when import.meta.env.DEV
  },
];
