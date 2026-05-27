import { ServiceRegistry } from '../platform/services/registry';
import {
  CommandServiceId, ContextKeyServiceId, EditorServiceId, FontServiceId,
  KeybindingServiceId, LayoutServiceId, NotificationServiceId, ProductConfigServiceId,
  RuEditServiceId, SnippetServiceId, StatusBarServiceId, ThemeServiceId, WorkspaceServiceId,
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
import { NotificationService } from '../platform/notification/notification-service';
import { BUILT_IN_THEMES } from '../platform/theme/themes/built-in';
import { BUILT_IN_FONT_SETS } from '../platform/font/font-sets/built-in';
import { ANCHORED_ENTRIES } from '../platform/statusbar/anchored-ids';
import { SlotId } from '../platform/layout/slots';
import { registerPlatformCommands } from './platform-commands';
import { mountHeartbeat } from './heartbeat';
import { installUpdateAlerts } from '../platform/update/update-alerts';
import { ProductConfigService } from '../platform/product-config/product-config-service';

const SLOT_TO_CTX_KEY: Partial<Record<SlotId, string>> = {
  [SlotId.PrimarySideBar]: 'sideBar.visible',
  [SlotId.Panel]:          'panel.visible',
  [SlotId.AuxSideBar]:     'auxSideBar.visible',
};

export function boot(): ServiceRegistry {
  const registry = new ServiceRegistry();

  // ── ADR-106: product-config seam (domain overrides after boot via domainBootstrap) ──
  const productConfig = new ProductConfigService();
  registry.register(ProductConfigServiceId, productConfig);

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

  // ── Phase 9: NotificationService ──────────────────────────────────────────
  const notifications = new NotificationService();
  registry.register(NotificationServiceId, notifications);

  // Keep the bell badge in sync with unread count.
  function syncNotificationBadge(): void {
    statusBar.update('workbench.notifications', { badge: notifications.getUnreadCount() });
  }
  syncNotificationBadge();
  notifications.onDidChange(syncNotificationBadge);

  // ── Unit 3: Update alerts ─────────────────────────────────────────────────
  // Subscribes to update state changes; drives notification + status-bar entry.
  // Disposable returned but not tracked — lives for the session (no teardown needed).
  installUpdateAlerts(notifications, statusBar);

  registerPlatformCommands(layout, contextKeys, commands, keybindings, theme, font, workspace, editor, snippet, notifications);

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
  contextKeys.set('workspace.mustResetPassphrase', false);
  contextKeys.set('workspace.activeId', '');
  contextKeys.set('workspace.nickname', '');

  // ── Phase 10a: Prefs dev panel toggle ────────────────────────────────────
  contextKeys.set('developer.prefs.open', false);

  // ── Unit 3: What's-new modal context key ─────────────────────────────────
  contextKeys.set('whatsNew.open', false);

  // ── Dark-mode toggle StatusBar entry ─────────────────────────────────────
  function syncDarkModeEntry(dark: boolean): void {
    statusBar.update('workbench.theme.darkMode', {
      icon: dark ? 'sun' : 'moon',
      tooltip: dark ? 'Switch to light mode' : 'Switch to dark mode',
    });
  }
  syncDarkModeEntry(theme.isDark());
  theme.onDarkModeChange(syncDarkModeEntry);

  // ── Phase 9b: DEV-mode StatusBar entry ────────────────────────────────────
  // Use import.meta.env.DEV as an approximation of "not packaged".
  // Note: this is a build-time constant, so the entry will never appear in a
  // production bundle even without the app.isPackaged check.
  if (import.meta.env.DEV) {
    statusBar.update('workbench.dev-mode', { visible: true });
  }

  // ── Unit 1: version status-bar entry ─────────────────────────────────────
  // Fire-and-forget — does not block boot; populates entry when resolved.
  window.soam.app.getVersion().then((version) => {
    statusBar.update('workbench.version', {
      text: 'v' + version,
      tooltip: "Ru-Soam " + version + " — what’s new",
    });
  }).catch((err) => {
    console.error('[workbench] failed to fetch app version:', err);
  });

  // Heartbeat — mount once; will be disposed on sign-out
  let heartbeatDisposable = mountHeartbeat();

  // Helper to update lock-related StatusBar entries from the current context key state
  function syncLockStatusBar(locked: boolean, setupComplete: boolean, nickname: string): void {
    if (setupComplete) {
      // Show lock indicator
      statusBar.update('workbench.lock', {
        visible: true,
        icon: locked ? 'lock' : 'unlock',
        text: '',
        tooltip: locked ? 'Workspace locked — enter passphrase to unlock' : 'Workspace unlocked — click to lock',
        command: locked ? undefined : 'workbench.workspace.relock',
      });
      // Show nickname only when unlocked
      statusBar.update('workbench.workspace.nickname', {
        visible: !locked && nickname.length > 0,
        text: nickname,
        tooltip: `Active workspace: ${nickname}`,
        icon: 'briefcase',
      });
      statusBar.update('workbench.sync.state', {
        visible: !locked && nickname.length > 0,
        tooltip: `Sync state for ${nickname}`,
      });
    } else {
      // Pre-setup: hide status entries tied to workspace identity
      statusBar.update('workbench.lock', { visible: false });
      statusBar.update('workbench.workspace.nickname', { visible: false });
      statusBar.update('workbench.sync.state', { visible: false });
    }
  }

  // Subscribe to lock state changes emitted by Main
  window.soam.lock.onChange((state) => {
    contextKeys.set('workspace.kekLocked', state.locked);
    contextKeys.set('workspace.setupComplete', state.setupComplete);
    contextKeys.set('workspace.mustResetPassphrase', state.mustResetPassphrase);
    const nick = contextKeys.get('workspace.nickname') as string ?? '';
    syncLockStatusBar(state.locked, state.setupComplete, nick);

    // Mount/unmount heartbeat based on whether we have an active workspace
    if (state.locked) {
      heartbeatDisposable.dispose();
      heartbeatDisposable = { dispose: () => { /* already disposed */ } };
    } else {
      // Re-mount heartbeat when workspace becomes unlocked
      heartbeatDisposable.dispose();
      heartbeatDisposable = mountHeartbeat();
    }
  });

  // Subscribe to workspace changes emitted by Main
  window.soam.workspace.onChange((e) => {
    contextKeys.set('workspace.activeId', e.activeId ?? '');
    contextKeys.set('workspace.nickname', e.nickname);
    const locked = contextKeys.get('workspace.kekLocked') as boolean ?? true;
    const setupComplete = contextKeys.get('workspace.setupComplete') as boolean ?? false;
    syncLockStatusBar(locked, setupComplete, e.nickname);

    // If no active workspace, ensure heartbeat is stopped
    if (!e.activeId) {
      heartbeatDisposable.dispose();
      heartbeatDisposable = { dispose: () => { /* no-op */ } };
    }
  });

  // Fetch the current lock state immediately (in case the initial event already fired)
  window.soam.lock.state().then((state) => {
    contextKeys.set('workspace.kekLocked', state.locked);
    contextKeys.set('workspace.setupComplete', state.setupComplete);
    contextKeys.set('workspace.mustResetPassphrase', state.mustResetPassphrase);
    const nick = contextKeys.get('workspace.nickname') as string ?? '';
    syncLockStatusBar(state.locked, state.setupComplete, nick);
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
        const locked = contextKeys.get('workspace.kekLocked') as boolean ?? true;
        const setupComplete = contextKeys.get('workspace.setupComplete') as boolean ?? false;
        syncLockStatusBar(locked, setupComplete, meta.nickname);
      }
    }
  }).catch((err) => {
    console.error('[workbench] failed to fetch initial workspace state:', err);
  });

  return registry;
}
