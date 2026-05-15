import type { StatusBarEntry } from './statusbar-service';

// Six anchored StatusBar entries per ADR-409.
// All rendered as inert stubs in Phase 2; when-clause gating lands Phase 3.
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
    text: '🔒',
    tooltip: 'Workspace locked',
    visible: false, // gated: kek.locked (Phase 8)
  },
  {
    id: 'workbench.notifications',
    region: 'right',
    priority: 800,
    text: '🔔 0',
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
];
