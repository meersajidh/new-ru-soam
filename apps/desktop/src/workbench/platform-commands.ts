import type { ILayoutService } from '../platform/layout/layout-service';
import type { ICommandService } from '../platform/command/command-service';
import type { IContextKeyService } from '../platform/context-key/context-key-service';
import type { IKeybindingService } from '../platform/keybinding/keybinding-service';
import { DEFAULT_KEYBINDINGS } from '../platform/keybinding/default-keybindings';
import type { IThemeService } from '../platform/theme/theme-service';
import type { IFontService } from '../platform/font/font-service';
import type { IWorkspaceService } from '../platform/workspace/workspace-service';
import type { IEditorService } from '../platform/editor/editor-service';
import type { ISnippetService } from '../platform/snippet/snippet-service';
import type { INotificationService } from '../platform/notification/notification-service';
import type { IMenuService } from '../platform/menu/menu-service';
import { SlotId } from '../platform/layout/slots';

export function registerPlatformCommands(
  layout: ILayoutService,
  contextKeys: IContextKeyService,
  commands: ICommandService,
  keybindings: IKeybindingService,
  theme: IThemeService,
  font: IFontService,
  workspace: IWorkspaceService,
  editor: IEditorService,
  snippets: ISnippetService,
  notificationSvc: INotificationService,
  menu: IMenuService,
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
    'workbench.theme.primer',
    'Color Theme: Primer',
    () => theme.setTheme('primer'),
    { category: 'Preferences' },
  );
  commands.register(
    'workbench.theme.spectrum',
    'Color Theme: Spectrum',
    () => theme.setTheme('spectrum'),
    { category: 'Preferences' },
  );
  commands.register(
    'workbench.theme.iris',
    'Color Theme: Iris',
    () => theme.setTheme('iris'),
    { category: 'Preferences' },
  );
  commands.register(
    'workbench.theme.stone',
    'Color Theme: Stone',
    () => theme.setTheme('stone'),
    { category: 'Preferences' },
  );
  commands.register(
    'workbench.toggleDarkMode',
    'Toggle Dark Mode',
    () => theme.setDarkMode(!theme.isDark()),
    { category: 'Preferences' },
  );
  commands.register(
    'workbench.font.systemSans',
    'Font Set: System Sans',
    () => font.setFontSet('system-sans'),
    { category: 'Preferences' },
  );
  commands.register(
    'workbench.font.ruDisplay',
    'Font Set: Ru Display',
    () => font.setFontSet('ru-display'),
    { category: 'Preferences' },
  );
  commands.register(
    'workbench.font.ruEditorial',
    'Font Set: Ru Editorial',
    () => font.setFontSet('ru-editorial'),
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

  let scratchCounter = 0;
  commands.register(
    'developer.editor.openScratch',
    'Developer: Open RuEdit Scratch',
    () => editor.open(`ru-edit-scratch://scratch-${++scratchCounter}`, {
      title: `RuEdit Scratch ${scratchCounter}`,
    }),
    { category: 'Developer' },
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
      if (activeTab) editor.open(activeTab.resource, { groupId: newGroupId, title: activeTab.title, entityId: activeTab.entityId });
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

  // ── Phase 8: Snippet seed command ─────────────────────────────────────────
  commands.register(
    'developer.snippets.seed',
    'Developer: Seed Snippet Registry',
    () => {
      const reg = snippets.registry();
      // Snippet 1: plain text, no placeholders.
      reg.add({
        id: 'seed-hello',
        abbrev: 'hello',
        label: 'Hello World',
        body: { kind: 'text', template: 'Hello, world!' },
        placeholders: [],
      });
      // Snippet 2: text placeholder.
      reg.add({
        id: 'seed-hpi',
        abbrev: 'hpi',
        label: 'History of Present Illness',
        body: { kind: 'text', template: 'Patient reports {{chief_complaint}} and has had symptoms for {{duration}}.' },
        placeholders: [
          { name: 'chief_complaint', type: 'text', default: 'chief complaint' },
          { name: 'duration', type: 'text', default: '3 days' },
        ],
      });
      // Snippet 3: picklist placeholder.
      reg.add({
        id: 'seed-disp',
        abbrev: 'disp',
        label: 'Disposition',
        body: { kind: 'text', template: 'Disposition: {{disposition}}.' },
        placeholders: [
          {
            name: 'disposition',
            type: 'picklist',
            default: 'discharge home',
            options: ['discharge home', 'admit to observation', 'admit inpatient', 'transfer to ED', 'refer to specialist'],
          },
        ],
      });
      console.log('[snippets] seeded 3 snippets (hello, hpi, disp). Type /hello, /hpi, or /disp in a scratch tab.');
    },
    { category: 'Developer' },
  );

  // ── Phase 9: Developer lock commands ──────────────────────────────────────

  commands.register(
    'developer.lock.dumpState',
    'Developer: Dump Lock State',
    async () => {
      const state = await window.soam.lock.state();
      console.log('[lock] state:', state);
    },
    { category: 'Developer' },
  );

  commands.register(
    'developer.lock.forceRelock',
    'Developer: Force Relock Workspace',
    async () => {
      await window.soam.lock.relock();
      console.log('[lock] workspace relocked');
    },
    { category: 'Developer' },
  );

  commands.register(
    'developer.lock.simulateIdle',
    'Developer: Simulate Idle Timeout',
    async () => {
      // Relock via the relock IPC path — equivalent to what the idle handler does.
      await window.soam.lock.relock();
      console.log('[lock] simulated idle — workspace relocked');
    },
    { category: 'Developer' },
  );

  commands.register(
    'developer.workspace.list',
    'Developer: List Workspaces',
    async () => {
      const list = await window.soam.workspace.list();
      console.log('[workspace] list:', list);
    },
    { category: 'Developer' },
  );

  commands.register(
    'developer.workspace.signOut',
    'Developer: Sign Out of Workspace',
    async () => {
      await window.soam.workspace.signOut();
      console.log('[workspace] signed out');
    },
    { category: 'Developer' },
  );

  commands.register(
    'developer.workspace.dumpIdentity',
    'Developer: Dump Workspace Identity',
    async () => {
      const identity = await window.soam.workspace.getIdentity();
      console.log('[workspace] identity:', identity);
    },
    { category: 'Developer' },
  );

  if (import.meta.env.DEV) {
    commands.register(
      'developer.setup.reset',
      'Developer: Reset Workspace Setup (DEV ONLY)',
      async () => {
        try {
          const proxy = await window.soam.bindCapability('platform.dev', '1.0');
          try {
            await proxy.call('resetActiveWorkspace');
            // app.relaunch() + app.quit() are called by the capability; no further action needed.
          } catch (err) {
            const code = (err as { code?: string }).code;
            if (code === 'cap.not_found') {
              console.warn('[setup] developer.setup.reset: platform.dev capability not available (production build?)');
            } else {
              console.error('[setup] developer.setup.reset failed:', err);
            }
          } finally {
            proxy.dispose();
          }
        } catch (err) {
          console.error('[setup] could not bind platform.dev capability:', err);
        }
      },
      { category: 'Developer' },
    );
  }

  // ── Phase 10b: Audit dev command ─────────────────────────────────────────
  commands.register(
    'developer.audit.dump',
    'Developer: Dump Audit Log',
    async () => {
      const proxy = await window.soam.bindCapability('audit', '1.0');
      try {
        const entries = await proxy.call('list', { limit: 50 });
        console.table(entries);
      } catch (err) {
        console.error('[audit] dump failed:', err);
      } finally {
        proxy.dispose();
      }
    },
    { category: 'Developer' },
  );

  // ── Phase 10a: Prefs dev panel ────────────────────────────────────────────
  commands.register(
    'workbench.developer.openPrefs',
    'Developer: Open Preferences Panel',
    () => contextKeys.set('developer.prefs.open', true),
    { category: 'Developer' },
  );

  // ── Phase 9: Notification commands ───────────────────────────────────────
  commands.register(
    'workbench.notifications.toggle',
    'Notifications: Toggle Panel',
    () => notificationSvc.togglePanel(),
    { category: 'View' },
  );

  // ── Unit 3: Update commands ───────────────────────────────────────────────
  commands.register(
    'workbench.update.downloadNow',
    'Update: Download Available Update',
    () => void window.soam.update.downloadNow(),
    { category: 'Update' },
  );
  commands.register(
    'workbench.update.installAndRestart',
    'Update: Install and Restart',
    () => void window.soam.update.installAndRestart(),
    { category: 'Update' },
  );

  // ── Unit 3: What's New modal ──────────────────────────────────────────────
  // Also consumed by the workbench.version status-bar entry (Unit 1).
  commands.register(
    'workbench.showWhatsNew',
    "What's New",
    () => contextKeys.set('whatsNew.open', true),
    { category: 'Help' },
  );

  if (import.meta.env.DEV) {
    // DEV ONLY — push a sample notification for each severity to exercise
    // the toast stack and panel. Accessible via Command Palette as
    // "Developer: Push Test Notifications". Remove or keep — it is harmless
    // in prod (gated by import.meta.env.DEV).
    commands.register(
      'developer.notifications.pushTest',
      'Developer: Push Test Notifications',
      () => {
        notificationSvc.push({ severity: 'info',    title: 'Test info',    message: 'Info notification body', sticky: false });
        notificationSvc.push({ severity: 'success', title: 'Test success', message: 'Action completed',        sticky: false });
        notificationSvc.push({ severity: 'warning', title: 'Test warning', message: 'Something may be wrong',  sticky: false });
        notificationSvc.push({ severity: 'error',   title: 'Test error',   message: 'An error occurred',       sticky: true,
          actions: [{ label: 'Retry', onClick: () => console.log('[notif] retry') }],
        });
        notificationSvc.push({ severity: 'alarm',   title: 'Test alarm',   sticky: false });
      },
      { category: 'Developer' },
    );

    // DEV ONLY — simulate update state cycle (available → downloading → ready)
    // to exercise the update-alerts wiring without a real update.
    // Accessible via Command Palette as "Developer: Simulate Update States".
    // Each invocation advances to the next stage.
    let _simStage = 0;
    commands.register(
      'developer.update.simulate',
      'Developer: Simulate Update States',
      () => {
        const version = '99.0.0';
        switch (_simStage % 3) {
          case 0:
            notificationSvc.push({
              severity: 'info',
              title: 'Update available',
              message: `Version ${version} is ready to download.`,
              sticky: true,
              actions: [{ label: 'Download', onClick: () => void window.soam.update.downloadNow() }],
            });
            console.log('[update-sim] available — pushed notification');
            break;
          case 1:
            notificationSvc.push({
              severity: 'info',
              title: 'Downloading update…',
              message: `Version ${version} — 42% complete`,
              sticky: false,
            });
            console.log('[update-sim] downloading — 42% (status-bar would show Updating… 42%)');
            break;
          case 2:
            notificationSvc.push({
              severity: 'success',
              title: 'Update ready to install',
              message: `Version ${version} has been downloaded.`,
              sticky: true,
              actions: [{ label: 'Restart to update', onClick: () => void window.soam.update.installAndRestart() }],
            });
            console.log('[update-sim] ready — pushed success notification');
            break;
        }
        _simStage++;
      },
      { category: 'Developer' },
    );
  }

  commands.register(
    'workbench.workspace.relock',
    'Workspace: Lock',
    async () => {
      await window.soam.lock.relock();
    },
    { category: 'Workspace' },
  );

  commands.register(
    'workbench.workspace.signOut',
    'Workspace: Sign Out',
    async () => {
      await window.soam.workspace.signOut();
    },
    { category: 'Workspace' },
  );

  commands.register(
    'workbench.workspace.changePassphrase',
    'Workspace: Change Passphrase',
    () => {
      // Opens via the UserAvatar menu directly (no separate dialog service yet).
      // This command is here for completeness; the UI path is UserAvatar → ChangePassphraseDialog.
      // A full DialogService per ADR-412 is deferred to a later phase.
      console.log('[workspace] change-passphrase command: use the user avatar menu to access this feature.');
    },
    { category: 'Workspace' },
  );

  // ── ADR-417: Editor tab context-menu commands ─────────────────────────────
  //
  // Args array convention (editor/title/context menu):
  //   args[0] = instanceId  (the tab being right-clicked)
  //   args[1] = groupId     (the group containing the tab)
  //
  // All three handlers receive [instanceId, groupId]; each reads what it needs.

  commands.register(
    'workbench.editors.close',
    'Close',
    (instanceId: unknown) => {
      if (typeof instanceId === 'string') editor.close(instanceId);
    },
    { category: 'View' },
  );

  commands.register(
    'workbench.editors.closeOthers',
    'Close Others',
    (instanceId: unknown, groupId: unknown) => {
      if (typeof groupId !== 'string' || typeof instanceId !== 'string') return;
      const group = editor.getGroup(groupId);
      if (!group) return;
      // Close every tab in the group whose id !== instanceId (the kept tab)
      for (const tab of group.tabs) {
        if (tab.id !== instanceId) editor.close(tab.id);
      }
    },
    { category: 'View' },
  );

  commands.register(
    'workbench.editors.closeAll',
    'Close All',
    (_instanceId: unknown, groupId: unknown) => {
      if (typeof groupId !== 'string') return;
      const group = editor.getGroup(groupId);
      if (!group) return;
      // Snapshot tab ids before iterating (close mutates the group)
      for (const tab of [...group.tabs]) {
        editor.close(tab.id);
      }
    },
    { category: 'View' },
  );

  // Register menu items for editor/title/context slot (O112)
  menu.register('editor/title/context', [
    { command: 'workbench.editors.close',       group: '1_close', order: 1 },
    { command: 'workbench.editors.closeOthers', group: '1_close', order: 2 },
    { command: 'workbench.editors.closeAll',    group: '1_close', order: 3 },
  ]);

  keybindings.seedDefaults(DEFAULT_KEYBINDINGS);
}
