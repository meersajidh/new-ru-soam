import { ServiceRegistry } from '../platform/services/registry';
import {
  CommandServiceId, ContextKeyServiceId, EditorServiceId, FontServiceId,
  KeybindingServiceId, LayoutServiceId, RuEditServiceId, SnippetServiceId,
  StatusBarServiceId, ThemeServiceId, WorkspaceServiceId,
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
import { RuEditService } from '../platform/ru-edit/ru-edit-service';
import { SnippetService } from '../platform/snippet/snippet-service';
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

  // ── Phase 7.5b ────────────────────────────────────────────────────────────

  const ruEdit = new RuEditService();
  registry.register(RuEditServiceId, ruEdit);
  contextKeys.set('ruEdit.activeInstance', '');

  // ── Phase 8 ────────────────────────────────────────────────────────────────

  const snippet = new SnippetService();
  registry.register(SnippetServiceId, snippet);
  contextKeys.set('snippet.active', false);
  contextKeys.set('snippet.placeholder.type', '');

  // Sync active RuEdit instance to focused editor tab when applicable.
  let snippetSub: (() => void) | null = null;
  editor.onDidChange(() => {
    const gid = editor.getFocusedGroupId();
    const group = gid ? editor.getGroup(gid) : undefined;
    const inst = group?.activeTabId ? group.tabs.find(t => t.id === group.activeTabId) : undefined;
    if (snippetSub) {
      snippetSub();
      snippetSub = null;
    }
    if (!inst) {
      ruEdit.setActive(null);
      contextKeys.set('ruEdit.activeInstance', '');
      contextKeys.set('snippet.active', false);
      contextKeys.set('snippet.placeholder.type', '');
      return;
    }
    const reg = ruEdit.forInstance(inst.id);
    ruEdit.setActive(reg ? inst.id : null);
    contextKeys.set('ruEdit.activeInstance', reg ? inst.id : '');
    if (reg) {
      const initial = reg.handle.getActiveState();
      contextKeys.set('snippet.active', initial.snippet.active);
      contextKeys.set('snippet.placeholder.type', initial.snippet.placeholderType ?? '');
      snippetSub = reg.handle.subscribe(state => {
        contextKeys.set('snippet.active', state.snippet.active);
        contextKeys.set('snippet.placeholder.type', state.snippet.placeholderType ?? '');
      });
    } else {
      contextKeys.set('snippet.active', false);
      contextKeys.set('snippet.placeholder.type', '');
    }
  });

  registerPlatformCommands(layout, contextKeys, commands, keybindings, theme, workspace, editor, snippet);

  // Open mock workspace — real identity comes in Phase 8+
  workspace.open('entity-mock-001', 'individual');

  // Phase 6: surface bundle-crash events so a host crash is observable in the
  // renderer. Banner contribution lands Phase 7; for now console + context key.
  contextKeys.set('bundles.lastCrash', '');
  window.soam.events.on((event) => {
    if (event.name === 'bundle.crashed') {
      const payload = event.payload as { bundleIds?: ReadonlyArray<string> };
      const ids = payload?.bundleIds ?? [];
      console.error('[workbench] bundle(s) crashed, marked inactive:', ids);
      contextKeys.set('bundles.lastCrash', ids.join(','));
    }
  });

  // ── Phase 9: Lock + workspace context keys ────────────────────────────────
  // Seed initial values; updated on every lock.changed / workspace.changed event.
  contextKeys.set('workspace.kekLocked', true);
  contextKeys.set('workspace.setupComplete', false);
  contextKeys.set('workspace.activeId', '');
  contextKeys.set('workspace.nickname', '');

  // Subscribe to lock state changes emitted by Main
  window.soam.lock.onChange((state) => {
    contextKeys.set('workspace.kekLocked', state.locked);
    contextKeys.set('workspace.setupComplete', state.setupComplete);
  });

  // Subscribe to workspace changes emitted by Main
  window.soam.workspace.onChange((e) => {
    contextKeys.set('workspace.activeId', e.activeId ?? '');
    contextKeys.set('workspace.nickname', e.nickname);
  });

  // Fetch the current lock state immediately (in case the initial event already fired)
  window.soam.lock.state().then((state) => {
    contextKeys.set('workspace.kekLocked', state.locked);
    contextKeys.set('workspace.setupComplete', state.setupComplete);
  }).catch((err) => {
    console.error('[workbench] failed to fetch initial lock state:', err);
  });

  // Fetch initial workspace state
  window.soam.workspace.getActive().then(async (activeId) => {
    if (activeId) {
      contextKeys.set('workspace.activeId', activeId);
      const allWorkspaces = await window.soam.workspace.list();
      const meta = allWorkspaces.find((w) => w.workspaceId === activeId);
      if (meta) {
        contextKeys.set('workspace.nickname', meta.nickname);
      }
    }
  }).catch((err) => {
    console.error('[workbench] failed to fetch initial workspace state:', err);
  });

  return registry;
}
