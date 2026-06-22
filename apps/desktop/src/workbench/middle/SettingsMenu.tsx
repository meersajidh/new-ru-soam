/**
 * SettingsMenu — gear button anchored in the Activity Bar footer (above UserAvatar).
 *
 * Opens a two-level drill-down popover:
 *   root     → Appearance | System
 *   appearance → Mode / Theme / Font / Activity Bar density
 *   system   → Usage analytics + Danger Zone
 *
 * TelemetryModeService is the single source of truth for cloud.telemetryMode.
 */

import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../platform/icons/Icon';
import { useContextKey, useService } from '../../platform/services/hooks';
import {
  ActivityBarDensityServiceId,
  CloudSessionServiceId,
  FontServiceId,
  ScheduleRefreshSettingsServiceId,
  ThemeServiceId,
  TelemetryModeServiceId,
} from '../../platform/services/ids';
import type { FontSetDescriptor } from '../../platform/font/font-service';
import type { ThemeDescriptor } from '../../platform/theme/tokens';
import type { Density } from '../../platform/activity-bar/density-service';
import type { TelemetryMode } from '../../platform/telemetry/telemetry-mode-service';
import type { RefreshSettings } from '../../platform/view-mode/schedule-refresh-settings';
import { usePopover } from '../../platform/popover/use-popover';
import Popover from '../../platform/popover/Popover';
import DeleteWorkspaceDialog from './DeleteWorkspaceDialog';
import './SettingsMenu.css';

type PanelView = 'root' | 'appearance' | 'system' | 'schedule';

export default function SettingsMenu() {
  const kekLocked = useContextKey('workspace.kekLocked') as boolean;
  const setupComplete = useContextKey('workspace.setupComplete') as boolean;
  const nickname = useContextKey('workspace.nickname') as string;

  const themeSvc = useService(ThemeServiceId);
  const fontSvc = useService(FontServiceId);
  const densitySvc = useService(ActivityBarDensityServiceId);
  const telemetrySvc = useService(TelemetryModeServiceId);
  const cloudSessionSvc = useService(CloudSessionServiceId);
  const refreshSettingsSvc = useService(ScheduleRefreshSettingsServiceId);

  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [panelView, setPanelView] = useState<PanelView>('root');

  // Cloud session state — live via CloudSessionService.
  const [cloudStatus, setCloudStatus] = useState(() => cloudSessionSvc.getState());
  const [reconnectLoading, setReconnectLoading] = useState(false);
  const [reconnectError, setReconnectError] = useState('');

  // Telemetry mode — driven by TelemetryModeService.
  const [telemetryMode, setTelemetryModeState] = useState<TelemetryMode>(
    () => telemetrySvc.getMode(),
  );

  // Schedule refresh settings — driven by ScheduleRefreshSettingsService.
  const [refreshSettings, setRefreshSettingsState] = useState<RefreshSettings>(
    () => refreshSettingsSvc.getSettings(),
  );

  // Appearance state — live-subscribed so active highlight stays in sync.
  const [themes, setThemes] = useState<ThemeDescriptor[]>(() => themeSvc.list());
  const [activeTheme, setActiveTheme] = useState<ThemeDescriptor>(() => themeSvc.getActive());
  const [dark, setDark] = useState<boolean>(() => themeSvc.isDark());
  const [fontSets, setFontSets] = useState<FontSetDescriptor[]>(() => fontSvc.list());
  const [activeFont, setActiveFont] = useState<FontSetDescriptor>(() => fontSvc.getActive());
  const [density, setDensity] = useState<Density>(() => densitySvc.getDensity());

  const btnRef = useRef<HTMLButtonElement>(null);

  const popover = usePopover({
    placement: 'right-end',
    gap: 12,
    estimatedWidth: 232,
    estimatedHeight: 320,
  });

  // Subscribe to theme/dark/font/density/telemetry/cloud-session changes.
  useEffect(() => {
    const offTheme = themeSvc.onThemeChange((t) => {
      setActiveTheme(t);
      setThemes(themeSvc.list());
    });
    const offDark = themeSvc.onDarkModeChange(setDark);
    const offFont = fontSvc.onFontSetChange((fs) => {
      setActiveFont(fs);
      setFontSets(fontSvc.list());
    });
    const offDensity = densitySvc.onDidChangeDensity(setDensity);
    const offTelemetry = telemetrySvc.onChange(setTelemetryModeState);
    const offCloud = cloudSessionSvc.onChange(setCloudStatus);
    const offRefresh = refreshSettingsSvc.onDidChange(setRefreshSettingsState);
    return () => {
      offTheme();
      offDark();
      offFont();
      offDensity();
      offTelemetry();
      offCloud();
      offRefresh();
    };
  }, [themeSvc, fontSvc, densitySvc, telemetrySvc, cloudSessionSvc, refreshSettingsSvc]);

  // Reset to root view each time popover opens.
  const prevOpen = useRef(false);
  useEffect(() => {
    if (popover.isOpen && !prevOpen.current) {
      setPanelView('root');
    }
    prevOpen.current = popover.isOpen;
  }, [popover.isOpen]);

  // Reconnect to sync handler — delegates to CloudSessionService.
  const handleReconnect = async () => {
    setReconnectLoading(true);
    setReconnectError('');
    try {
      const result = await cloudSessionSvc.reconnect();
      if (!result.ok) {
        setReconnectError(result.error);
      }
    } catch (err) {
      setReconnectError(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setReconnectLoading(false);
    }
  };

  if (kekLocked || !setupComplete) return null;

  const backButton = (label: string, onClick: () => void) => (
    <div className="settings-panel-header">
      <button
        className="settings-back-btn"
        onClick={onClick}
        aria-label="Back to Settings menu"
      >
        <Icon name="chevron-left" size={13} />
        Back
      </button>
      <span className="settings-panel-title">{label}</span>
    </div>
  );

  return (
    <>
      <div className="settings-menu-container">
        <button
          ref={btnRef}
          className="settings-gear-btn"
          onClick={() => (popover.isOpen ? popover.close() : popover.open(btnRef.current!))}
          aria-label="Settings"
          aria-expanded={popover.isOpen}
          title="Settings"
        >
          <Icon name="settings" size={20} />
        </button>

        <Popover
          isOpen={popover.isOpen}
          position={popover.position}
          setPopoverElement={popover.setPopoverElement}
          role="menu"
          aria-label="Settings"
          className="settings-popover"
        >
          {panelView === 'root' && (
            <>
              {/* Header */}
              <div className="settings-popover-header">
                <span className="settings-popover-title">Settings</span>
              </div>

              {/* Navigation rows */}
              <div className="settings-section settings-section--nav">
                <button
                  className="settings-nav-row"
                  role="menuitem"
                  onClick={() => setPanelView('appearance')}
                >
                  <span className="settings-nav-label">Appearance</span>
                  <span className="settings-nav-chevron" aria-hidden="true">
                    <Icon name="chevron-right" size={13} />
                  </span>
                </button>
                <button
                  className="settings-nav-row"
                  role="menuitem"
                  onClick={() => setPanelView('schedule')}
                >
                  <span className="settings-nav-label">Schedule</span>
                  <span className="settings-nav-chevron" aria-hidden="true">
                    <Icon name="chevron-right" size={13} />
                  </span>
                </button>
                <button
                  className="settings-nav-row"
                  role="menuitem"
                  onClick={() => setPanelView('system')}
                >
                  <span className="settings-nav-label">System</span>
                  <span className="settings-nav-chevron" aria-hidden="true">
                    <Icon name="chevron-right" size={13} />
                  </span>
                </button>
              </div>
            </>
          )}

          {panelView === 'appearance' && (
            <>
              {backButton('Appearance', () => setPanelView('root'))}

              {/* ── Appearance controls ────────────────────────────────────── */}
              <div className="settings-section">
                {/* Mode toggle */}
                <div className="settings-subsection-label">Mode</div>
                <div className="settings-mode-row">
                  <button
                    className="settings-mode-btn"
                    data-active={!dark || undefined}
                    onClick={() => dark && themeSvc.setDarkMode(false)}
                    role="menuitem"
                    aria-pressed={!dark}
                  >
                    <Icon name="theme-light" size={13} />
                    Light
                  </button>
                  <button
                    className="settings-mode-btn"
                    data-active={dark || undefined}
                    onClick={() => !dark && themeSvc.setDarkMode(true)}
                    role="menuitem"
                    aria-pressed={dark}
                  >
                    <Icon name="theme-dark" size={13} />
                    Dark
                  </button>
                </div>

                {/* Theme swatches */}
                <div className="settings-subsection-label">Theme</div>
                <div className="settings-theme-grid">
                  {themes.map((t) => (
                    <button
                      key={t.id}
                      className={`settings-theme-swatch theme-${t.id}`}
                      data-active={activeTheme.id === t.id || undefined}
                      onClick={() => themeSvc.setTheme(t.id)}
                      title={t.label}
                      role="menuitemradio"
                      aria-checked={activeTheme.id === t.id}
                      aria-label={t.label}
                    >
                      <span className="settings-swatch-dot" aria-hidden="true" />
                    </button>
                  ))}
                </div>

                {/* Font list */}
                <div className="settings-subsection-label">Font</div>
                <div className="settings-font-list">
                  {fontSets.map((fs) => (
                    <button
                      key={fs.id}
                      className="settings-font-row"
                      data-active={activeFont.id === fs.id || undefined}
                      onClick={() => fontSvc.setFontSet(fs.id)}
                      role="menuitemradio"
                      aria-checked={activeFont.id === fs.id}
                    >
                      <span className="settings-font-name">{fs.label}</span>
                    </button>
                  ))}
                </div>

                {/* Activity bar density */}
                <div className="settings-subsection-label">Activity Bar</div>
                <div className="settings-mode-row">
                  {(['compact', 'default', 'large'] as const).map((d) => (
                    <button
                      key={d}
                      className="settings-mode-btn"
                      data-active={density === d || undefined}
                      onClick={() => densitySvc.setDensity(d)}
                      role="menuitemradio"
                      aria-checked={density === d}
                    >
                      {d.charAt(0).toUpperCase() + d.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {panelView === 'schedule' && (
            <>
              {backButton('Schedule', () => setPanelView('root'))}

              {/* ── Calendar auto-refresh ─────────────────────────────────────── */}
              <div className="settings-section">
                <div className="settings-section-label">Calendar</div>

                {/* Auto-refresh toggle row */}
                <div className="settings-toggle-row">
                  <div className="settings-toggle-label-group">
                    <span className="settings-toggle-label">Auto-refresh</span>
                    <span className="settings-toggle-hint">
                      Check your calendars for changes on a timer.
                    </span>
                  </div>
                  <button
                    role="switch"
                    aria-checked={refreshSettings.mode === 'auto'}
                    className="settings-switch"
                    data-on={refreshSettings.mode === 'auto' || undefined}
                    onClick={() => {
                      const next = refreshSettings.mode === 'auto' ? 'manual' : 'auto';
                      refreshSettingsSvc.setSettings({ mode: next, intervalMin: refreshSettings.intervalMin });
                    }}
                    aria-label="Auto-refresh calendars"
                  >
                    <span className="settings-switch-knob" aria-hidden="true" />
                  </button>
                </div>

                {/* Refresh interval row */}
                <div
                  className="settings-toggle-row settings-interval-row"
                  aria-disabled={refreshSettings.mode === 'manual'}
                  data-disabled={refreshSettings.mode === 'manual' || undefined}
                >
                  <span className="settings-toggle-label">Refresh interval</span>
                  <div className="settings-stepper">
                    <button
                      className="settings-stepper-btn"
                      aria-label="Decrease refresh interval"
                      disabled={refreshSettings.mode === 'manual' || refreshSettings.intervalMin <= 1}
                      onClick={() => {
                        const next = Math.max(1, refreshSettings.intervalMin - 1);
                        refreshSettingsSvc.setSettings({ mode: refreshSettings.mode, intervalMin: next });
                      }}
                    >
                      −
                    </button>
                    <span className="settings-stepper-value" aria-live="polite">
                      {refreshSettings.intervalMin}
                    </span>
                    <button
                      className="settings-stepper-btn"
                      aria-label="Increase refresh interval"
                      disabled={refreshSettings.mode === 'manual'}
                      onClick={() => {
                        const next = refreshSettings.intervalMin + 1;
                        refreshSettingsSvc.setSettings({ mode: refreshSettings.mode, intervalMin: next });
                      }}
                    >
                      +
                    </button>
                    <span className="settings-stepper-unit">min</span>
                  </div>
                </div>

                {refreshSettings.mode === 'manual' && (
                  <p className="settings-analytics-notice">
                    Refresh manually from the calendar toolbar.
                  </p>
                )}
              </div>
            </>
          )}

          {panelView === 'system' && (
            <>
              {backButton('System', () => setPanelView('root'))}

              {/* ── Reconnect to sync ────────────────────────────────────────── */}
              {cloudStatus.configured && !cloudStatus.signedIn && (
                <>
                  <div className="settings-section">
                    <div className="settings-section-label">Sync</div>
                    <button
                      className="settings-reconnect-btn"
                      role="menuitem"
                      onClick={() => void handleReconnect()}
                      disabled={reconnectLoading}
                    >
                      <span className="settings-reconnect-icon">
                        <Icon name="cloud" size={13} />
                      </span>
                      {reconnectLoading ? 'Connecting…' : 'Reconnect to sync'}
                    </button>
                    {reconnectError && (
                      <p className="settings-reconnect-error">{reconnectError}</p>
                    )}
                  </div>
                  <div className="settings-popover-divider" aria-hidden="true" />
                </>
              )}

              {/* ── Usage analytics ──────────────────────────────────────────── */}
              <div className="settings-section">
                <div className="settings-section-label">Usage analytics</div>

                <div className="settings-mode-row">
                  {(
                    [
                      { value: 'off', label: 'Off', hint: 'Nothing sent.' },
                      {
                        value: 'online-only',
                        label: 'Online only',
                        hint: 'Sent when connected; not queued offline.',
                      },
                      { value: 'on', label: 'On', hint: 'Queued when offline, sent later.' },
                    ] as const
                  ).map(({ value, label, hint }) => (
                    <button
                      key={value}
                      className="settings-mode-btn"
                      data-active={telemetryMode === value || undefined}
                      onClick={() => telemetrySvc.setMode(value)}
                      role="menuitemradio"
                      aria-checked={telemetryMode === value}
                      title={hint}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <p className="settings-analytics-notice">
                  Anonymous usage events — <strong>no PHI ever sent</strong>, kept up to 90 days.
                </p>
              </div>

              <div className="settings-popover-divider" aria-hidden="true" />

              {/* ── Danger Zone ──────────────────────────────────────────────── */}
              <div className="settings-section">
                <div className="settings-section-label settings-section-label--danger">Danger Zone</div>
                <button
                  className="settings-danger-btn"
                  role="menuitem"
                  onClick={() => {
                    popover.close();
                    setShowDeleteAccount(true);
                  }}
                >
                  <span className="settings-danger-icon">
                    <Icon name="trash" size={13} />
                  </span>
                  Delete account…
                </button>
              </div>
            </>
          )}
        </Popover>
      </div>

      {showDeleteAccount && (
        <DeleteWorkspaceDialog nickname={nickname} onClose={() => setShowDeleteAccount(false)} />
      )}
    </>
  );
}
