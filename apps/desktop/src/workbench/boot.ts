import { ServiceRegistry } from '../platform/services/registry';
import {
  CommandServiceId, ContributionServiceId, ContextKeyServiceId, EditorServiceId, FontServiceId,
  KeybindingServiceId, LayoutServiceId, NotificationServiceId, ProductConfigServiceId,
  RuEditServiceId, SnippetServiceId, StatusBarServiceId, ThemeServiceId, WorkspaceServiceId,
} from '../platform/services/ids';
import { LayoutService } from '../platform/layout/layout-service';
import type { LayoutSizes } from '../platform/layout/layout-service';
import { ThemeService } from '../platform/theme/theme-service';
import { StatusBarService } from '../platform/statusbar/statusbar-service';
import { FontService } from '../platform/font/font-service';
import { ContextKeyService } from '../platform/context-key/context-key-service';
import { CommandService } from '../platform/command/command-service';
import { KeybindingService } from '../platform/keybinding/keybinding-service';
import { readUserKeybindings } from '../platform/keybinding/user-keybindings-store';
import { WorkspaceService } from '../platform/workspace/workspace-service';
import { EditorService } from '../platform/editor/editor-service';
import { RuEditService } from '../platform/ru-edit/ru-edit-service';
import { SnippetService } from '../platform/snippet/snippet-service';
import { NotificationService } from '../platform/notification/notification-service';
import { ContributionService } from '../platform/contributions/contribution-service';
import { BUILT_IN_THEMES } from '../platform/theme/themes/built-in';
import { BUILT_IN_FONT_SETS } from '../platform/font/font-sets/built-in';
import { ANCHORED_ENTRIES } from '../platform/statusbar/anchored-ids';
import { SlotId } from '../platform/layout/slots';
import { registerPlatformCommands } from './platform-commands';
import { mountHeartbeat } from './heartbeat';
import { installUpdateAlerts } from '../platform/update/update-alerts';
import { ProductConfigService } from '../platform/product-config/product-config-service';
import { MenuService } from '../platform/menu/menu-service';
import { MenuServiceId } from '../platform/services/ids';
import { ActivityBarDensityService, readPersistedDensity } from '../platform/activity-bar/density-service';
import { ActivityBarDensityServiceId } from '../platform/services/ids';
import {
  MaturityHighlightService,
  readPersistedMaturityHighlight,
} from '../platform/maturity/maturity-highlight';
import { MaturityHighlightServiceId } from '../platform/services/ids';
import {
  OverviewViewModeService,
  readPersistedOverviewViewMode,
} from '../platform/view-mode/overview-view-mode';
import { OverviewViewModeServiceId } from '../platform/services/ids';
import {
  ScheduleViewStateService,
  readPersistedScheduleViewState,
} from '../platform/view-mode/schedule-view-state';
import { ScheduleViewStateServiceId } from '../platform/services/ids';
import { ScheduleCountsService } from '../platform/view-mode/schedule-counts';
import { ScheduleCountsServiceId } from '../platform/services/ids';
import { ActiveEventService } from '../platform/view-mode/active-event';
import { ActiveEventServiceId } from '../platform/services/ids';
import { TelemetryModeService } from '../platform/telemetry/telemetry-mode-service';
import type { TelemetryMode } from '../platform/telemetry/telemetry-mode-service';
import { TelemetryModeServiceId } from '../platform/services/ids';
import { CloudSessionService } from '../platform/cloud/cloud-session-service';
import { CloudSessionServiceId } from '../platform/services/ids';

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

  // ── Layout persistence (sizes + visibility) via prefs capability ─────────
  // Keys must not collide with any existing pref keys.
  const SIZE_PREF_KEYS: Record<keyof LayoutSizes, string> = {
    primarySideBarWidth: 'workbench.layout.primarySideBarWidth',
    auxSideBarWidth: 'workbench.layout.auxSideBarWidth',
    panelHeight: 'workbench.layout.panelHeight',
  };
  const VISIBILITY_PREF_KEYS: Partial<Record<SlotId, string>> = {
    [SlotId.AuxSideBar]: 'workbench.layout.auxSideBarVisible',
    [SlotId.Panel]: 'workbench.layout.panelVisible',
  };
  // Bind a single prefs proxy kept alive for the session (not disposed) so the
  // visibility-change saver can write to it throughout the session lifetime.
  window.soam.bindCapability('prefs', '1.0').then((proxy) => {
    // Restore sizes
    const sizeKeys = Object.entries(SIZE_PREF_KEYS) as Array<[keyof LayoutSizes, string]>;
    const sizeRestores = sizeKeys.map(([sizeKey, prefKey]) =>
      (proxy.call('get', prefKey) as Promise<{ value: string | null }>)
        .then((result) => ({ sizeKey, value: result.value }))
        .catch(() => ({ sizeKey, value: null })),
    );
    // Restore visibility
    const visSlots = Object.entries(VISIBILITY_PREF_KEYS) as Array<[SlotId, string]>;
    const visRestores = visSlots.map(([slotId, prefKey]) =>
      (proxy.call('get', prefKey) as Promise<{ value: string | null }>)
        .then((result) => ({ slotId, value: result.value }))
        .catch(() => ({ slotId, value: null })),
    );
    Promise.all([Promise.all(sizeRestores), Promise.all(visRestores)]).then(([sizeResults, visResults]) => {
      // Apply size restores
      const restored: Partial<LayoutSizes> = {};
      for (const { sizeKey, value } of sizeResults) {
        if (value !== null) {
          const n = Number(value);
          if (Number.isFinite(n) && n > 0) restored[sizeKey] = n;
        }
      }
      layout.restoreSizes(restored);
      // Apply visibility restores
      for (const { slotId, value } of visResults) {
        if (value === 'true') layout.setVisibility(slotId, true);
        else if (value === 'false') layout.setVisibility(slotId, false);
        // null/absent → leave boot default (false)
      }
      // Register visibility-change saver (live for session, proxy kept open)
      layout.onDidChangePartVisibility((slotId, visible) => {
        const prefKey = VISIBILITY_PREF_KEYS[slotId];
        if (prefKey !== undefined) {
          proxy.call('set', prefKey, String(visible)).catch((err: unknown) => {
            console.warn('[workbench] could not persist layout visibility:', err);
          });
        }
      });
    }).catch((err: unknown) => {
      console.warn('[workbench] could not restore layout state from prefs:', err);
    });
  }).catch((err: unknown) => {
    console.warn('[workbench] could not bind prefs for layout persistence:', err);
  });

  const theme = new ThemeService(document.documentElement, BUILT_IN_THEMES);
  registry.register(ThemeServiceId, theme);

  const font = new FontService(document.documentElement, BUILT_IN_FONT_SETS);
  registry.register(FontServiceId, font);

  // Activity bar density — read localStorage, default 'default', class set in constructor.
  const initialDensity = readPersistedDensity() ?? 'default';
  const activityBarDensity = new ActivityBarDensityService(document.documentElement, initialDensity);
  registry.register(ActivityBarDensityServiceId, activityBarDensity);

  // Maturity-highlight — localStorage-backed; default off.
  const maturityHighlight = new MaturityHighlightService(readPersistedMaturityHighlight());
  registry.register(MaturityHighlightServiceId, maturityHighlight);

  // Overview view-mode — localStorage-backed; default 'dense'.
  const overviewViewMode = new OverviewViewModeService(readPersistedOverviewViewMode());
  registry.register(OverviewViewModeServiceId, overviewViewMode);

  // Schedule view-state — localStorage-backed; default { view: 'week', calRev: 0, classFilter: {} }.
  const scheduleViewState = new ScheduleViewStateService(readPersistedScheduleViewState());
  registry.register(ScheduleViewStateServiceId, scheduleViewState);

  // Schedule counts — non-persisted; relayed from schedule.html after classify pass.
  const scheduleCounts = new ScheduleCountsService();
  registry.register(ScheduleCountsServiceId, scheduleCounts);

  // Active event — non-persisted; relayed from schedule.html on event selection.
  const activeEvent = new ActiveEventService();
  registry.register(ActiveEventServiceId, activeEvent);

  // Telemetry mode — prefs-cap-backed; default 'off'. Reloads on workspace change.
  const telemetryMode = new TelemetryModeService();
  registry.register(TelemetryModeServiceId, telemetryMode);

  // Cloud session state — event-backed; reflects live signedIn/configured from Main.
  const cloudSession = new CloudSessionService();
  registry.register(CloudSessionServiceId, cloudSession);

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

  // ADR-406: wire remote executor for bundle-hosted commands.
  // Fire-and-forget; does not block boot. Tolerates absent capability.
  window.soam.bindCapability('commands', '1.0').then((proxy) => {
    commands.setRemoteExecutor((id, args) =>
      proxy.call('execute', id, ...args) as Promise<unknown>,
    );
  }).catch((err: unknown) => {
    console.warn('[workbench] could not bind commands capability for remote execution:', err);
  });

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

  // ── Stage 2: ContributionService ─────────────────────────────────────────
  const contributions = new ContributionService();
  registry.register(ContributionServiceId, contributions);

  // ── ADR-417: MenuService ──────────────────────────────────────────────────
  const menu = new MenuService(commands, contextKeys);
  registry.register(MenuServiceId, menu);

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

  // Maturity-highlight toggle command — registered before platform-commands so
  // it's available immediately; no category so it doesn't pollute the palette.
  commands.register(
    'workbench.toggleMaturityHighlight',
    'View: Toggle Build-State Highlight',
    () => maturityHighlight.setEnabled(!maturityHighlight.isEnabled()),
    { category: 'Developer' },
  );

  registerPlatformCommands(layout, contextKeys, commands, keybindings, theme, font, workspace, editor, snippet, notifications, menu);

  // O426: load persisted user keybinding overrides (global, localStorage) +
  // drive the pending-chord StatusBar indicator mid multi-stroke chord.
  keybindings.seedUserKeybindings(readUserKeybindings());
  keybindings.onDidChangePendingChord((first) => {
    statusBar.update(
      'workbench.pendingChord',
      first
        ? { visible: true, text: `(${first}) waiting for second key…` }
        : { visible: false, text: '' },
    );
  });

  // Open mock workspace — real identity comes in Phase 8+
  workspace.open('entity-mock-001', 'individual');

  // Stage 2: seed contributions from platform.contributions capability.
  // Re-exposed as a helper so bundle.crashed can trigger a fresh seed.
  function reseedContributions(): void {
    window.soam
      .bindCapability('platform.contributions', '1.0')
      .then((p) =>
        p
          .call('list')
          .then((snap) => {
            contributions.seed(snap as Parameters<typeof contributions.seed>[0]);
            const snapWithCmds = snap as {
              commands?: Array<{ id: string; title: string; category?: string; icon?: string; when?: string }>;
              menus?: Array<{ menuId: string; command: string; group: string; order?: number; when?: string; toggled?: string; title?: string; alt?: string; submenu?: string; radioGroup?: string }>;
              keybindings?: Array<{ key: string; command: string; when?: string; args?: ReadonlyArray<unknown> }>;
            };
            commands.seedContributedCommands(snapWithCmds.commands ?? []);
            menu.seedContributedMenus(snapWithCmds.menus ?? []);
            keybindings.seedContributedKeybindings(snapWithCmds.keybindings ?? []);
            p.dispose();
          })
          .catch((err) => {
            console.error('[workbench] contributions.seed list failed:', err);
            p.dispose();
          }),
      )
      .catch(console.error);
  }
  reseedContributions();

  // Phase 6: surface bundle-crash events so a host crash is observable in the
  // renderer. Banner contribution lands Phase 7; for now console + context key.
  contextKeys.set('bundles.lastCrash', '');
  window.soam.events.on((event) => {
    if (event.name === 'bundle.crashed') {
      const payload = event.payload as { bundleIds?: ReadonlyArray<string> };
      const ids = payload?.bundleIds ?? [];
      console.error('[workbench] bundle(s) crashed, marked inactive:', ids);
      contextKeys.set('bundles.lastCrash', ids.join(','));
      // Re-seed contributions so crashed bundle's items drop out.
      reseedContributions();
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
      // Always the filled `theme-dark` mark (matches the Settings Dark button):
      // in light it reads as the switch-to-dark affordance, in dark as the
      // current mode. State lives in the tooltip, not the glyph fill.
      icon: 'moon',
      tooltip: dark ? 'Switch to light mode' : 'Switch to dark mode',
    });
  }
  syncDarkModeEntry(theme.isDark());
  theme.onDarkModeChange(syncDarkModeEntry);

  // ── O425: workbench.colorTheme context key ───────────────────────────────
  // Tracks the active palette id so radio-group `toggled` when-clauses work.
  contextKeys.set('workbench.colorTheme', theme.getActive().id);
  theme.onThemeChange((t) => contextKeys.set('workbench.colorTheme', t.id));

  // ── Phase 0: maturity-highlight StatusBar + command ──────────────────────
  function syncMaturityHighlightEntry(on: boolean): void {
    statusBar.update('workbench.maturityHighlight', {
      icon: 'target',
      severity: on ? 'warning' : undefined,
      tooltip: on
        ? 'Build-state highlight ON — click to turn off'
        : 'Toggle build-state highlight (maturity marks)',
    });
  }
  syncMaturityHighlightEntry(maturityHighlight.isEnabled());
  maturityHighlight.onDidChange(syncMaturityHighlightEntry);

  // ── Telemetry mode StatusBar indicator ───────────────────────────────────
  const TELEMETRY_ICON: Record<TelemetryMode, string> = {
    'off': 'telemetry-off',
    'online-only': 'telemetry-online-only',
    'on': 'telemetry-on',
  };
  const TELEMETRY_TOOLTIP: Record<TelemetryMode, string> = {
    'off': 'Usage analytics: Off — click to change',
    'online-only': 'Usage analytics: Online only — click to change',
    'on': 'Usage analytics: On — click to change',
  };
  function syncTelemetryEntry(mode: TelemetryMode): void {
    statusBar.update('workbench.telemetry', {
      icon: TELEMETRY_ICON[mode],
      tooltip: TELEMETRY_TOOLTIP[mode],
    });
  }
  syncTelemetryEntry(telemetryMode.getMode());
  telemetryMode.onChange(syncTelemetryEntry);

  // Click cycles the mode Off → Online only → On → Off.
  const TELEMETRY_CYCLE: Record<TelemetryMode, TelemetryMode> = {
    'off': 'online-only',
    'online-only': 'on',
    'on': 'off',
  };
  commands.register(
    'workbench.cycleTelemetryMode',
    'Usage Analytics: Cycle Mode',
    () => {
      telemetryMode.setMode(TELEMETRY_CYCLE[telemetryMode.getMode()]);
    },
    { category: 'Cloud' },
  );

  // ── Sync-state StatusBar indicator (folds the cloud-session disconnect) ────
  // The existing workbench.sync.state entry (left region, cloud icon) reflects
  // cloud session health: normal "Sync state" when signed in; 'warning' severity
  // + a reconnect action when the session token is dead (proactive rotation found
  // it expired/revoked). Visibility is still gated on unlocked + nickname, set by
  // syncLockStatusBar — these mirrors let updateSyncStateEntry() recompute from
  // either a lock-state change or a cloud-session change.
  let syncLocked = true;
  let syncSetupComplete = false;
  let syncNickname = '';
  function updateSyncStateEntry(): void {
    const show = syncSetupComplete && !syncLocked && syncNickname.length > 0;
    if (!show) {
      statusBar.update('workbench.sync.state', { visible: false });
      return;
    }
    const s = cloudSession.getState();
    const disconnected = s.configured && !s.signedIn;
    statusBar.update('workbench.sync.state', {
      visible: true,
      icon: disconnected ? 'cloud-disconnected' : 'cloud',
      severity: disconnected ? 'warning' : undefined,
      tooltip: disconnected
        ? 'Cloud sync disconnected — click to reconnect'
        : `Sync state for ${syncNickname}`,
      command: disconnected ? 'workbench.cloudReconnect' : undefined,
    });
  }
  cloudSession.onChange(updateSyncStateEntry);

  // ── Cloud-session disconnect notification ─────────────────────────────────
  // Toast + Notification-panel entry when a LIVE session goes dead (refresh token
  // expired / rejected / revoked — proactive rotation found it unusable). Gated on
  // a genuine signed-in → signed-out transition so we don't toast the initial
  // boot-disconnected state (the status-bar icon already flags that) and only while
  // the workspace is unlocked + visible. Auto-dismissed once reconnected.
  let prevSignedIn: boolean | null = null;
  let deadSessionNotifId: string | null = null;
  cloudSession.onChange((s) => {
    const unlockedVisible = syncSetupComplete && !syncLocked && syncNickname.length > 0;
    if (prevSignedIn === true && !s.signedIn && unlockedVisible && deadSessionNotifId === null) {
      deadSessionNotifId = notifications.push({
        severity: 'warning',
        title: 'Cloud sync disconnected',
        message: 'Your session expired or was revoked. Reconnect to keep syncing.',
        sticky: true,
        actions: [
          { label: 'Reconnect', onClick: () => void commands.execute('workbench.cloudReconnect') },
        ],
      });
    }
    if (s.signedIn && deadSessionNotifId !== null) {
      notifications.dismiss(deadSessionNotifId);
      deadSessionNotifId = null;
    }
    prevSignedIn = s.signedIn;
  });

  // ── workbench.cloudReconnect command ──────────────────────────────────────
  commands.register(
    'workbench.cloudReconnect',
    'Cloud: Reconnect to sync',
    async () => {
      try {
        const result = await cloudSession.reconnect();
        if (!result.ok) {
          console.warn('[workbench] cloudReconnect failed:', result.error);
          // Surface the failure (e.g. identity-mismatch) — the status-bar click
          // path has no inline error area like SettingsMenu does.
          notifications.push({
            severity: 'warning',
            title: 'Reconnect failed',
            message: result.error,
            sticky: false,
          });
        }
      } catch (err) {
        console.error('[workbench] cloudReconnect: unexpected error:', err);
      }
    },
    { category: 'Cloud' },
  );

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
    // Mirror current lock state so updateSyncStateEntry() can recompute the
    // sync.state entry on either a lock-state or a cloud-session change.
    syncLocked = locked;
    syncSetupComplete = setupComplete;
    syncNickname = nickname;
    if (setupComplete) {
      // Show lock indicator
      statusBar.update('workbench.lock', {
        visible: true,
        icon: locked ? 'lock' : 'unlock',
        text: '',
        tooltip: locked ? 'Account locked — enter passphrase to unlock' : 'Account unlocked — click to lock',
        command: locked ? undefined : 'workbench.workspace.relock',
      });
      // Show nickname only when unlocked
      statusBar.update('workbench.workspace.nickname', {
        visible: !locked && nickname.length > 0,
        text: nickname,
        tooltip: `Active account: ${nickname}`,
        icon: 'briefcase',
      });
    } else {
      // Pre-setup: hide status entries tied to workspace identity
      statusBar.update('workbench.lock', { visible: false });
      statusBar.update('workbench.workspace.nickname', { visible: false });
    }
    // Sync-state entry reflects both lock gating and cloud-session health.
    updateSyncStateEntry();
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
