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
import { Moon, Settings, Sun, Trash2 } from 'lucide-react';
import { useContextKey, useService } from '../../platform/services/hooks';
import { FontServiceId, ThemeServiceId } from '../../platform/services/ids';
import type { FontSetDescriptor } from '../../platform/font/font-service';
import type { ThemeDescriptor } from '../../platform/theme/tokens';
import DeleteWorkspaceDialog from './DeleteWorkspaceDialog';
import './SettingsMenu.css';

export default function SettingsMenu() {
  const kekLocked = useContextKey('workspace.kekLocked') as boolean;
  const setupComplete = useContextKey('workspace.setupComplete') as boolean;
  const nickname = useContextKey('workspace.nickname') as string;

  const themeSvc = useService(ThemeServiceId);
  const fontSvc = useService(FontServiceId);

  const [menuOpen, setMenuOpen] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);

  // Appearance state — live-subscribed so active highlight stays in sync.
  const [themes, setThemes] = useState<ThemeDescriptor[]>(() => themeSvc.list());
  const [activeTheme, setActiveTheme] = useState<ThemeDescriptor>(() => themeSvc.getActive());
  const [dark, setDark] = useState<boolean>(() => themeSvc.isDark());
  const [fontSets, setFontSets] = useState<FontSetDescriptor[]>(() => fontSvc.list());
  const [activeFont, setActiveFont] = useState<FontSetDescriptor>(() => fontSvc.getActive());

  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // Subscribe to theme/dark/font changes.
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
    return () => {
      offTheme();
      offDark();
      offFont();
    };
  }, [themeSvc, fontSvc]);

  // Click-outside close.
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  // Escape close.
  useEffect(() => {
    if (!menuOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [menuOpen]);

  if (kekLocked || !setupComplete) return null;

  return (
    <>
      <div className="settings-menu-container">
        <button
          ref={btnRef}
          className="settings-gear-btn"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Settings"
          aria-expanded={menuOpen}
          title="Settings"
        >
          <Settings size={16} strokeWidth={1.8} />
        </button>

        {menuOpen && (
          <div
            ref={menuRef}
            className="settings-popover"
            role="menu"
            aria-label="Settings"
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
                  <Sun size={13} strokeWidth={1.8} />
                  Light
                </button>
                <button
                  className="settings-mode-btn"
                  data-active={dark || undefined}
                  onClick={() => !dark && themeSvc.setDarkMode(true)}
                  role="menuitem"
                  aria-pressed={dark}
                >
                  <Moon size={13} strokeWidth={1.8} />
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
            </div>

            <div className="settings-popover-divider" aria-hidden="true" />

            {/* ── Danger Zone ─────────────────────────────────────────────── */}
            <div className="settings-section">
              <div className="settings-section-label settings-section-label--danger">
                Danger Zone
              </div>
              <button
                className="settings-danger-btn"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  setShowDeleteAccount(true);
                }}
              >
                <span className="settings-danger-icon">
                  <Trash2 size={13} strokeWidth={1.8} />
                </span>
                Delete account…
              </button>
            </div>
          </div>
        )}
      </div>

      {showDeleteAccount && (
        <DeleteWorkspaceDialog
          nickname={nickname}
          onClose={() => setShowDeleteAccount(false)}
        />
      )}
    </>
  );
}
