/**
 * UserAvatar — small component in the TitleBar right area.
 *
 * Placement: injected into TitleBar's controls region via the UserAvatarSlot
 * export. Renders a ~26x26 circle with the user email initial.
 * Click opens a dropdown menu with workspace management actions.
 *
 * The avatar is only rendered when the workspace is unlocked
 * (workspace.kekLocked === false && workspace.setupComplete === true).
 */

import { useState, useEffect, useRef } from 'react';
import { useContextKey } from '../../platform/services/hooks';
import ChangePassphraseDialog from './ChangePassphraseDialog';
import '../../styles/setup.css';

export default function UserAvatar() {
  const kekLocked = useContextKey('workspace.kekLocked') as boolean;
  const setupComplete = useContextKey('workspace.setupComplete') as boolean;
  const nickname = useContextKey('workspace.nickname') as string;

  const [email, setEmail] = useState<string>('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [showChangePassphrase, setShowChangePassphrase] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // Fetch identity (email) once when unlocked
  useEffect(() => {
    if (!kekLocked && setupComplete) {
      window.soam.workspace.getIdentity().then((identity) => {
        if (identity) setEmail(identity.email);
      }).catch(() => { /* non-fatal */ });
    }
  }, [kekLocked, setupComplete]);

  // Close menu on outside click
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

  if (kekLocked || !setupComplete) return null;

  const initial = email ? email[0].toUpperCase() : nickname ? nickname[0].toUpperCase() : '?';

  async function handleRelock() {
    setMenuOpen(false);
    await window.soam.lock.relock();
  }

  async function handleSignOut() {
    setMenuOpen(false);
    await window.soam.workspace.signOut();
    // Phase 9b: routes back to setup/keys since there's no workspace picker yet.
    // Phase 9c will replace this with the workspace picker route.
    // TODO(9c): replace with navigate('/workspaces') picker route
  }

  function handleChangePassphrase() {
    setMenuOpen(false);
    setShowChangePassphrase(true);
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
          <div ref={menuRef} className="user-avatar-menu" role="menu">
            {/* Header */}
            <div className="user-avatar-menu-header">
              <p className="user-avatar-menu-nickname">{nickname}</p>
              <p className="user-avatar-menu-email">{email}</p>
            </div>

            {/* Actions */}
            <button
              className="user-avatar-menu-item"
              role="menuitem"
              onClick={handleRelock}
            >
              [L] Lock workspace
            </button>
            <button
              className="user-avatar-menu-item"
              role="menuitem"
              onClick={handleChangePassphrase}
            >
              Change passphrase…
            </button>
            <button
              className="user-avatar-menu-item"
              role="menuitem"
              onClick={handleSignOut}
            >
              Sign out
            </button>

            {/* DEV-mode warning (approximate: import.meta.env.DEV) */}
            {import.meta.env.DEV && (
              <div className="user-avatar-menu-item user-avatar-menu-item--disabled" role="none">
                DEV MODE — mock user
              </div>
            )}
          </div>
        )}
      </div>

      {showChangePassphrase && (
        <ChangePassphraseDialog onClose={() => setShowChangePassphrase(false)} />
      )}
    </>
  );
}
