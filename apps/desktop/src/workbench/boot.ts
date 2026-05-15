import { ServiceRegistry } from '../platform/services/registry';
import {
  CommandServiceId, ContextKeyServiceId, EditorServiceId, FontServiceId,
  KeybindingServiceId, LayoutServiceId, StatusBarServiceId, ThemeServiceId,
  WorkspaceServiceId,
} from '../platform/services/ids';
import { LayoutService } from '../platform/layout/layout-service';
import { ThemeService } from '../platform/theme/theme-service';
import { StatusBarService } from '../platform/statusbar/statusbar-service';
import { FontService } from '../platform/font/font-service';
import { ContextKeyService } from '../platform/context-key/context-key-service';
import { CommandService } from '../platform/command/command-service';
import { KeybindingService } from '../platform/keybinding/keybinding-service';
import { WorkspaceService } from '../platform/workspace/workspace-service';
import { EditorService } from '../platform/editor/editor-service';
import { BUILT_IN_THEMES } from '../platform/theme/themes/built-in';
import { BUILT_IN_FONT_SETS } from '../platform/font/font-sets/built-in';
import { ANCHORED_ENTRIES } from '../platform/statusbar/anchored-ids';
import { SlotId } from '../platform/layout/slots';
import { registerPlatformCommands } from './platform-commands';

const SLOT_TO_CTX_KEY: Partial<Record<SlotId, string>> = {
  [SlotId.PrimarySideBar]: 'sideBar.visible',
  [SlotId.Panel]:          'panel.visible',
  [SlotId.AuxSideBar]:     'auxSideBar.visible',
};

export function boot(): ServiceRegistry {
  const registry = new ServiceRegistry();

  // ── Phase 2 ───────────────────────────────────────────────────────────────

  const layout = new LayoutService();
  layout.setVisibility(SlotId.AuxSideBar, false);
  layout.setVisibility(SlotId.Panel, false);
  registry.register(LayoutServiceId, layout);

  const theme = new ThemeService(document.documentElement, BUILT_IN_THEMES);
  registry.register(ThemeServiceId, theme);

  const font = new FontService(document.documentElement, BUILT_IN_FONT_SETS);
  registry.register(FontServiceId, font);

  const statusBar = new StatusBarService();
  for (const entry of ANCHORED_ENTRIES) statusBar.register(entry);
  registry.register(StatusBarServiceId, statusBar);

  // ── Phase 3 ───────────────────────────────────────────────────────────────

  const contextKeys = new ContextKeyService();
  // Seed initial layout-driven keys
  contextKeys.set('sideBar.visible',    layout.isVisible(SlotId.PrimarySideBar));
  contextKeys.set('panel.visible',      layout.isVisible(SlotId.Panel));
  contextKeys.set('auxSideBar.visible', layout.isVisible(SlotId.AuxSideBar));
  contextKeys.set('commandPalette.open', false);
  registry.register(ContextKeyServiceId, contextKeys);

  // Keep layout context keys in sync with LayoutService
  layout.onDidChangePartVisibility((slotId, visible) => {
    const key = SLOT_TO_CTX_KEY[slotId];
    if (key !== undefined) contextKeys.set(key, visible);
  });

  const commands = new CommandService();
  registry.register(CommandServiceId, commands);

  const keybindings = new KeybindingService(commands, contextKeys);
  registry.register(KeybindingServiceId, keybindings);

  // ── Phase 4 ───────────────────────────────────────────────────────────────

  const workspace = new WorkspaceService(layout, contextKeys);
  registry.register(WorkspaceServiceId, workspace);

  workspace.onDidOpen(state => {
    statusBar.update('workbench.workspace.entity', {
      text: state.entityId,
      tooltip: `Workspace: ${state.entityId} (${state.entityType})`,
    });
  });
  workspace.onDidClose(() => {
    statusBar.update('workbench.workspace.entity', {
      text: 'No workspace',
      tooltip: 'No workspace open',
    });
  });

  // ── Phase 5 ───────────────────────────────────────────────────────────────

  const editor = new EditorService();
  registry.register(EditorServiceId, editor);
  contextKeys.set('editor.activeResource', '');
  editor.onDidChange(() => {
    const gid = editor.getFocusedGroupId();
    const group = gid ? editor.getGroup(gid) : undefined;
    const inst = group?.activeTabId ? group.tabs.find(t => t.id === group.activeTabId) : undefined;
    contextKeys.set('editor.activeResource', inst?.resource ?? '');
  });

  registerPlatformCommands(layout, contextKeys, commands, keybindings, theme, workspace, editor);

  // Open mock workspace — real identity comes in Phase 8+
  workspace.open('entity-mock-001', 'individual');

  return registry;
}
