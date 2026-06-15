/**
 * SettingsMenu — gear button anchored in the Activity Bar footer (above UserAvatar).
 *
 * Opens a popover to the right of the left-edge rail with:
 *   1. Appearance controls (mode, theme, font) — wired to ThemeService / FontService.
 *   2. Danger Zone — "Delete account…" (relabeled DeleteWorkspaceDialog).
 *
 * Only rendered when workspace is unlocked + setup complete (same gate as UserAvatar).
 */

import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../platform/icons/Icon';
import { useContextKey, useService } from '../../platform/services/hooks';
import {
  ActivityBarDensityServiceId,
  FontServiceId,
  ThemeServiceId,
} from '../../platform/services/ids';
import type { FontSetDescriptor } from '../../platform/font/font-service';
import type { ThemeDescriptor } from '../../platform/theme/tokens';
import type { Density } from '../../platform/activity-bar/density-service';
import { usePopover } from '../../platform/popover/use-popover';
import Popover from '../../platform/popover/Popover';
import DeleteWorkspaceDialog from './DeleteWorkspaceDialog';
import { usePrefsCapability } from '../../platform/data/use-capability';
import './SettingsMenu.css';

type TelemetryMode = 'off' | 'online-only' | 'on';

export default function SettingsMenu() {
  const kekLocked = useContextKey('workspace.kekLocked') as boolean;
  const setupComplete = useContextKey('workspace.setupComplete') as boolean;
  const nickname = useContextKey('workspace.nickname') as string;

  const themeSvc = useService(ThemeServiceId);
  const fontSvc = useService(FontServiceId);
  const densitySvc = useService(ActivityBarDensityServiceId);

  const [showDeleteAccount, setShowDeleteAccount] = useState(false);

  // Prefs capability — used to read/write cloud.telemetryMode.
  const prefsCap = usePrefsCapability();
  const [telemetryMode, setTelemetryMode] = useState<TelemetryMode>('off');

  // Read cloud.telemetryMode on mount (once cap is available).
  useEffect(() => {
    if (!prefsCap) return;
    prefsCap.get('cloud.telemetryMode').then(({ value }) => {
      if (value === 'online-only' || value === 'on' || value === 'off') {
        setTelemetryMode(value);
      }
    }).catch(() => {/* use default 'off' */});
  }, [prefsCap]);

  function handleTelemetryMode(mode: TelemetryMode) {
    if (!prefsCap || mode === telemetryMode) return;
    setTelemetryMode(mode); // optimistic
    prefsCap.set('cloud.telemetryMode', mode).catch(() => {
      // revert on failure
      setTelemetryMode(telemetryMode);
    });
  }

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
    estimatedHeight: 360,
  });

  // Subscribe to theme/dark/font/density changes.
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
    return () => {
      offTheme();
      offDark();
      offFont();
      offDensity();
    };
  }, [themeSvc, fontSvc, densitySvc]);

  if (kekLocked || !setupComplete) return null;

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
          {/* Header */}
          <div className="settings-popover-header">
            <span className="settings-popover-title">Settings</span>
          </div>

          {/* ── Appearance ──────────────────────────────────────────────── */}
          <div className="settings-section">
            <div className="settings-section-label">Appearance</div>

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

          <div className="settings-popover-divider" aria-hidden="true" />

          {/* ── Usage analytics ─────────────────────────────────────────── */}
          <div className="settings-section">
            <div className="settings-section-label">Usage analytics</div>

            <div className="settings-mode-row">
              {(
                [
                  { value: 'off', label: 'Off' },
                  { value: 'online-only', label: 'Online only' },
                  { value: 'on', label: 'On' },
                ] as const
              ).map(({ value, label }) => (
                <button
                  key={value}
                  className="settings-mode-btn"
                  data-active={telemetryMode === value || undefined}
                  onClick={() => handleTelemetryMode(value)}
                  role="menuitemradio"
                  aria-checked={telemetryMode === value}
                >
                  {label}
                </button>
              ))}
            </div>

            <p className="settings-analytics-notice">
              Share anonymous usage events (sign-in, refresh, sign-out) with an
              anonymous per-install device ID and app version to help improve
              ru-soam. <strong>No personal or clinical data (PHI) is ever
              sent.</strong>
              <br />
              <span className="settings-analytics-modes">
                <span>Off</span> — nothing sent.{' '}
                <span>Online only</span> — sent when connected; not queued.{' '}
                <span>On</span> — queued offline and sent later.
              </span>
              <br />
              Default is Off. You can change this at any time. Events are kept
              for up to 90 days.
            </p>
          </div>

          <div className="settings-popover-divider" aria-hidden="true" />

          {/* ── Danger Zone ─────────────────────────────────────────────── */}
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
        </Popover>
      </div>

      {showDeleteAccount && (
        <DeleteWorkspaceDialog nickname={nickname} onClose={() => setShowDeleteAccount(false)} />
      )}
    </>
  );
}
