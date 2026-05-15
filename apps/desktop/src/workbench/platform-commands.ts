import type { ILayoutService } from '../platform/layout/layout-service';
import type { ICommandService } from '../platform/command/command-service';
import type { IContextKeyService } from '../platform/context-key/context-key-service';
import type { IKeybindingService } from '../platform/keybinding/keybinding-service';
import type { IThemeService } from '../platform/theme/theme-service';
import type { IWorkspaceService } from '../platform/workspace/workspace-service';
import type { IEditorService } from '../platform/editor/editor-service';
import { SlotId } from '../platform/layout/slots';

export function registerPlatformCommands(
  layout: ILayoutService,
  contextKeys: IContextKeyService,
  commands: ICommandService,
  keybindings: IKeybindingService,
  theme: IThemeService,
  workspace: IWorkspaceService,
  editor: IEditorService,
): void {
  commands.register(
    'workbench.togglePrimarySideBar',
    'View: Toggle Primary Side Bar',
    () => layout.toggleVisibility(SlotId.PrimarySideBar),
    { category: 'View' },
  );
  commands.register(
    'workbench.togglePanel',
    'View: Toggle Panel',
    () => layout.toggleVisibility(SlotId.Panel),
    { category: 'View' },
  );
  commands.register(
    'workbench.toggleAuxSideBar',
    'View: Toggle Auxiliary Side Bar',
    () => layout.toggleVisibility(SlotId.AuxSideBar),
    { category: 'View' },
  );
  commands.register(
    'workbench.openCommandPalette',
    'Show All Commands',
    () => contextKeys.set('commandPalette.open', true),
    { category: 'View' },
  );
  commands.register(
    'workbench.openSettings',
    'Open Settings',
    () => { /* Phase 11 */ },
    { category: 'Preferences' },
  );
  commands.register(
    'workbench.developer.listContextKeys',
    'Developer: List Context Keys',
    () => console.log('[context-keys]', contextKeys.snapshot()),
    { category: 'Developer' },
  );

  commands.register(
    'workbench.theme.bamboo',
    'Color Theme: Bamboo',
    () => theme.setTheme('bamboo'),
    { category: 'Preferences' },
  );
  commands.register(
    'workbench.theme.stone',
    'Color Theme: Stone',
    () => theme.setTheme('stone'),
    { category: 'Preferences' },
  );
  commands.register(
    'workbench.theme.geist',
    'Color Theme: Geist',
    () => theme.setTheme('geist'),
    { category: 'Preferences' },
  );
  commands.register(
    'workbench.toggleDarkMode',
    'Toggle Dark Mode',
    () => theme.setDarkMode(!theme.isDark()),
    { category: 'Preferences' },
  );

  commands.register(
    'workbench.workspace.close',
    'Workspace: Close',
    () => workspace.close(),
    { category: 'Workspace' },
  );
  commands.register(
    'workbench.workspace.openMock',
    'Workspace: Open Mock',
    () => workspace.open('entity-mock-001', 'individual'),
    { category: 'Workspace' },
  );

  let placeholderCounter = 0;
  commands.register(
    'editors.openPlaceholder',
    'Editor: New Placeholder Tab',
    () => editor.open(`placeholder://new-tab-${++placeholderCounter}`, { title: 'New Tab' }),
    { category: 'View' },
  );
  commands.register(
    'editors.splitRight',
    'Editor: Split Right',
    () => {
      const gid = editor.getFocusedGroupId();
      if (!gid) return;
      const source = editor.getGroup(gid);
      const activeTab = source?.tabs.find(t => t.id === source.activeTabId);
      const newGroupId = editor.splitGroup(gid, 'horizontal');
      if (activeTab) editor.open(activeTab.resource, { groupId: newGroupId, title: activeTab.title });
    },
    { category: 'View' },
  );
  commands.register(
    'editors.closeActive',
    'Editor: Close Active Tab',
    () => {
      const gid = editor.getFocusedGroupId();
      const group = gid ? editor.getGroup(gid) : undefined;
      if (group?.activeTabId) editor.close(group.activeTabId);
    },
    { category: 'View' },
  );
  commands.register(
    'editors.nextTab',
    'Editor: Next Tab',
    () => {
      const gid = editor.getFocusedGroupId();
      if (!gid) return;
      const group = editor.getGroup(gid);
      if (!group || group.tabs.length === 0) return;
      const idx = group.tabs.findIndex(t => t.id === group.activeTabId);
      const nextIdx = idx === -1 ? 0 : (idx + 1) % group.tabs.length;
      editor.setActiveTab(gid, group.tabs[nextIdx].id);
    },
    { category: 'View' },
  );
  commands.register(
    'editors.previousTab',
    'Editor: Previous Tab',
    () => {
      const gid = editor.getFocusedGroupId();
      if (!gid) return;
      const group = editor.getGroup(gid);
      if (!group || group.tabs.length === 0) return;
      const idx = group.tabs.findIndex(t => t.id === group.activeTabId);
      const prevIdx = idx === -1 ? group.tabs.length - 1 : (idx - 1 + group.tabs.length) % group.tabs.length;
      editor.setActiveTab(gid, group.tabs[prevIdx].id);
    },
    { category: 'View' },
  );

  keybindings.registerKeybinding('ctrl+b',       'workbench.togglePrimarySideBar');
  keybindings.registerKeybinding('ctrl+j',       'workbench.togglePanel');
  keybindings.registerKeybinding('ctrl+alt+b',   'workbench.toggleAuxSideBar');
  keybindings.registerKeybinding('ctrl+shift+p', 'workbench.openCommandPalette');
  keybindings.registerKeybinding('ctrl+,',       'workbench.openSettings');
  keybindings.registerKeybinding('ctrl+\\',      'editors.splitRight');
  keybindings.registerKeybinding('ctrl+w',       'editors.closeActive');
  keybindings.registerKeybinding('ctrl+tab',       'editors.nextTab');
  keybindings.registerKeybinding('ctrl+shift+tab', 'editors.previousTab');
}
