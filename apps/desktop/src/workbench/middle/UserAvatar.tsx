/**
 * UserAvatar — workspace account button anchored in the Activity Bar footer.
 *
 * Renders a small circle with the user email initial. Click opens a dropdown
 * menu with workspace management actions.
 *
 * The avatar is only rendered when the workspace is unlocked
 * (workspace.kekLocked === false && workspace.setupComplete === true).
 */

import { useEffect, useRef, useState } from 'react';
import {
  ArrowRightLeft,
  HelpCircle,
  KeyRound,
  Lock,
  LogOut,
  Trash2,
} from 'lucide-react';
import { useContextKey, useService } from '../../platform/services/hooks';
import { CommandServiceId } from '../../platform/services/ids';
import ChangePassphraseDialog from './ChangePassphraseDialog';
import DeleteWorkspaceDialog from './DeleteWorkspaceDialog';
import './UserAvatar.css';

export default function UserAvatar() {
  const kekLocked = useContextKey('workspace.kekLocked') as boolean;
  const setupComplete = useContextKey('workspace.setupComplete') as boolean;
  const nickname = useContextKey('workspace.nickname') as string;
  const commands = useService(CommandServiceId);

  const [email, setEmail] = useState<string>('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [showChangePassphrase, setShowChangePassphrase] = useState(false);
  const [showDeleteWorkspace, setShowDeleteWorkspace] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!kekLocked && setupComplete) {
      window.soam.workspace
        .getIdentity()
        .then((identity) => {
          if (identity) setEmail(identity.email);
        })
        .catch(() => {
          /* non-fatal */
        });
    }
  }, [kekLocked, setupComplete]);

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

  useEffect(() => {
    if (!menuOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [menuOpen]);

  if (kekLocked || !setupComplete) return null;

  const initial = email ? email[0].toUpperCase() : nickname ? nickname[0].toUpperCase() : '?';

  async function handleRelock() {
    setMenuOpen(false);
    await window.soam.lock.relock();
  }

  async function handleSignOut() {
    setMenuOpen(false);
    await window.soam.workspace.signOut();
  }

  function handleChangePassphrase() {
    setMenuOpen(false);
    setShowChangePassphrase(true);
  }

  function handleDeleteWorkspace() {
    setMenuOpen(false);
    setShowDeleteWorkspace(true);
  }

  async function handleSwitchWorkspace() {
    setMenuOpen(false);
    await commands.execute('workbench.workspace.switch');
  }

  async function handleHelp() {
    setMenuOpen(false);
    const cap = await window.soam.bindCapability('platform.shell', '1.0');
    try {
      await cap.call('openExternal', 'https://ru-soam.com');
    } catch (err) {
      console.warn('[avatar] openExternal failed:', err);
    } finally {
      cap.dispose();
    }
  }

  return (
    <>
      <div className="user-avatar-container">
        <button
          ref={btnRef}
          className="user-avatar-btn"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={`User menu — ${nickname || email || 'user'}`}
          aria-expanded={menuOpen}
          title={email || nickname}
        >
          {initial}
        </button>

        {menuOpen && (
          <div ref={menuRef} className="user-avatar-menu" role="menu" aria-label="User menu">
            <div className="user-avatar-menu-header">
              <div className="user-avatar-menu-badge" aria-hidden="true">
                {initial}
              </div>
              <div className="user-avatar-menu-copy">
                <p className="user-avatar-menu-nickname">{nickname || 'Workspace user'}</p>
                <p className="user-avatar-menu-email">{email || 'Signed in locally'}</p>
              </div>
            </div>

            <div className="user-avatar-menu-group">
              <button className="user-avatar-menu-item" role="menuitem" onClick={handleRelock}>
                <span className="user-avatar-menu-item-icon">
                  <Lock size={14} />
                </span>
                <span className="user-avatar-menu-item-label">Lock workspace</span>
              </button>
              <button
                className="user-avatar-menu-item"
                role="menuitem"
                onClick={handleChangePassphrase}
              >
                <span className="user-avatar-menu-item-icon">
                  <KeyRound size={14} />
                </span>
                <span className="user-avatar-menu-item-label">Change passphrase</span>
              </button>
              <button
                className="user-avatar-menu-item"
                role="menuitem"
                onClick={handleSwitchWorkspace}
              >
                <span className="user-avatar-menu-item-icon">
                  <ArrowRightLeft size={14} />
                </span>
                <span className="user-avatar-menu-item-label">Switch workspace</span>
              </button>
            </div>

            <div className="user-avatar-menu-divider" aria-hidden="true" />

            <div className="user-avatar-menu-group">
              <button className="user-avatar-menu-item" role="menuitem" onClick={handleHelp}>
                <span className="user-avatar-menu-item-icon">
                  <HelpCircle size={14} />
                </span>
                <span className="user-avatar-menu-item-label">Help / documentation</span>
              </button>
            </div>

            <div className="user-avatar-menu-divider" aria-hidden="true" />

            <button
              className="user-avatar-menu-item user-avatar-menu-item--destructive"
              role="menuitem"
              onClick={handleSignOut}
            >
              <span className="user-avatar-menu-item-icon">
                <LogOut size={14} />
              </span>
              <span className="user-avatar-menu-item-label">Sign out</span>
            </button>

            <button
              className="user-avatar-menu-item user-avatar-menu-item--destructive"
              role="menuitem"
              onClick={handleDeleteWorkspace}
            >
              <span className="user-avatar-menu-item-icon">
                <Trash2 size={14} />
              </span>
              <span className="user-avatar-menu-item-label">Delete workspace…</span>
            </button>

            {import.meta.env.DEV && (
              <>
                <div className="user-avatar-menu-divider" aria-hidden="true" />
                <div className="user-avatar-menu-footer" role="none">
                  <span className="user-avatar-menu-dev-label">DEV MODE</span>
                  <span className="user-avatar-menu-dev-copy">mock user</span>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {showChangePassphrase && (
        <ChangePassphraseDialog onClose={() => setShowChangePassphrase(false)} />
      )}

      {showDeleteWorkspace && (
        <DeleteWorkspaceDialog
          nickname={nickname}
          onClose={() => setShowDeleteWorkspace(false)}
        />
      )}
    </>
  );
}
