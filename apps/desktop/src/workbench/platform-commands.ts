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
    'developer.bundles.pingEcho',
    'Developer: Ping echo-test bundle',
    async () => {
      const proxy = await window.soam.bindCapability('echo.ping', '1.0');
      try {
        const reply = await proxy.call('echo', `hello @ ${new Date().toISOString()}`);
        console.log('[echo-test] pong:', reply);
      } catch (err) {
        console.error('[echo-test] ping failed:', err);
      } finally {
        proxy.dispose();
      }
    },
    { category: 'Developer' },
  );
  commands.register(
    'developer.bundles.echoCrashHandler',
    'Developer: echo-test crash inside handler',
    async () => {
      const proxy = await window.soam.bindCapability('echo.ping', '1.0');
      try {
        await proxy.call('crash');
      } catch (err) {
        console.warn('[echo-test] handler-crash surfaced (expected):', err);
      } finally {
        proxy.dispose();
      }
    },
    { category: 'Developer' },
  );
  commands.register(
    'developer.bundles.echoKillHost',
    'Developer: echo-test crash Bundle Host',
    async () => {
      const proxy = await window.soam.bindCapability('echo.ping', '1.0');
      try {
        await proxy.call('fatal');
      } catch (err) {
        console.warn('[echo-test] fatal call surfaced (expected reject):', err);
      } finally {
        proxy.dispose();
      }
    },
    { category: 'Developer' },
  );

  // ── Phase 6.5 ─────────────────────────────────────────────────────────────
  // Hardening probes — every try-* method must return ok=false. A truthy ok
  // means the deny-list patch is bypassed and is a regression to escalate.

  async function runTryProbe(label: string, method: string): Promise<void> {
    const proxy = await window.soam.bindCapability('echo.ping', '1.0');
    try {
      const result = await proxy.call(method);
      console.log(`[hardening] ${label}:`, result);
    } catch (err) {
      console.error(`[hardening] ${label} call failed:`, err);
    } finally {
      proxy.dispose();
    }
  }

  commands.register(
    'developer.bundles.tryElectron',
    'Developer: hardening — try import("electron")',
    () => runTryProbe('try-electron', 'try-electron'),
    { category: 'Developer' },
  );
  commands.register(
    'developer.bundles.tryFs',
    'Developer: hardening — try import("fs")',
    () => runTryProbe('try-fs', 'try-fs'),
    { category: 'Developer' },
  );
  commands.register(
    'developer.bundles.tryChildProcess',
    'Developer: hardening — try import("child_process")',
    () => runTryProbe('try-child-process', 'try-child-process'),
    { category: 'Developer' },
  );
  commands.register(
    'developer.bundles.tryProcessExit',
    'Developer: hardening — try process.exit()',
    () => runTryProbe('try-process-exit', 'try-process-exit'),
    { category: 'Developer' },
  );

  commands.register(
    'developer.bundles.pingLazy',
    'Developer: Ping echo-lazy bundle',
    async () => {
      const proxy = await window.soam.bindCapability('echo.lazy', '1.0');
      try {
        const reply = await proxy.call('whoami', `hello @ ${new Date().toISOString()}`);
        console.log('[echo-lazy] whoami:', reply);
      } catch (err) {
        console.error('[echo-lazy] ping failed:', err);
      } finally {
        proxy.dispose();
      }
    },
    { category: 'Developer' },
  );

  commands.register(
    'developer.bundles.openEchoView',
    'Developer: Open echo-test view',
    async () => {
      const proxy = await window.soam.bindCapability('platform.views', '1.0');
      try {
        const res = (await proxy.call('resolve', 'echo-test', 'main')) as
          | { found: false }
          | { found: true; url: string };
        if (!res.found) {
          console.error('[echo-view] resolve returned not-found for echo-test/main');
          return;
        }
        editor.open(res.url, { title: 'echo-test view' });
      } catch (err) {
        console.error('[echo-view] open failed:', err);
      } finally {
        proxy.dispose();
      }
    },
    { category: 'Developer' },
  );

  commands.register(
    'developer.bundles.dumpOutput',
    'Developer: Dump bundle Output ring buffer',
    async () => {
      const proxy = await window.soam.bindCapability('platform.bundles', '1.0');
      try {
        const [echoTest, echoLazy, activated] = await Promise.all([
          proxy.call('getOutput', 'echo-test'),
          proxy.call('getOutput', 'echo-lazy'),
          proxy.call('listActivated'),
        ]);
        console.log('[platform.bundles] listActivated:', activated);
        console.log('[platform.bundles] echo-test output:', echoTest);
        console.log('[platform.bundles] echo-lazy output:', echoLazy);
      } catch (err) {
        console.error('[platform.bundles] dumpOutput failed:', err);
      } finally {
        proxy.dispose();
      }
    },
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
