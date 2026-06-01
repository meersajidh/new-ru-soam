/**
 * UserAvatar — account button anchored in the Activity Bar footer.
 *
 * Renders a small circle with the user email initial. Click opens a dropdown
 * menu with account management actions.
 *
 * The avatar is only rendered when the workspace is unlocked
 * (workspace.kekLocked === false && workspace.setupComplete === true).
 *
 * Items: Lock account, Change passphrase, Help / documentation, Sign out.
 * Delete account moved to SettingsMenu (Danger Zone).
 * Switch workspace removed (command removed — single-workspace MVP).
 */

import { useEffect, useRef, useState } from 'react';
import { HelpCircle, KeyRound, Lock, LogOut } from 'lucide-react';
import { useContextKey } from '../../platform/services/hooks';
import { usePopover } from '../../platform/popover/use-popover';
import Popover from '../../platform/popover/Popover';
import ChangePassphraseDialog from './ChangePassphraseDialog';
import './UserAvatar.css';

export default function UserAvatar() {
  const kekLocked = useContextKey('workspace.kekLocked') as boolean;
  const setupComplete = useContextKey('workspace.setupComplete') as boolean;
  const nickname = useContextKey('workspace.nickname') as string;

  const [email, setEmail] = useState<string>('');
  const [showChangePassphrase, setShowChangePassphrase] = useState(false);

  const btnRef = useRef<HTMLButtonElement>(null);

  const popover = usePopover({
    placement: 'right-end',
    gap: 12,
    estimatedWidth: 248,
    estimatedHeight: 300,
  });

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

  if (kekLocked || !setupComplete) return null;

  const initial = email ? email[0].toUpperCase() : nickname ? nickname[0].toUpperCase() : '?';

  async function handleRelock() {
    popover.close();
    await window.soam.lock.relock();
  }

  async function handleSignOut() {
    popover.close();
    await window.soam.workspace.signOut();
  }

  function handleChangePassphrase() {
    popover.close();
    setShowChangePassphrase(true);
  }

  async function handleHelp() {
    popover.close();
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
          onClick={() => (popover.isOpen ? popover.close() : popover.open(btnRef.current!))}
          aria-label={`Account — ${nickname || email || 'user'}`}
          aria-expanded={popover.isOpen}
          title={email || nickname}
        >
          {initial}
        </button>

        <Popover
          isOpen={popover.isOpen}
          position={popover.position}
          setPopoverElement={popover.setPopoverElement}
          role="menu"
          aria-label="Account menu"
          className="user-avatar-menu"
        >
          <div className="user-avatar-menu-header">
            <div className="user-avatar-menu-badge" aria-hidden="true">
              {initial}
            </div>
            <div className="user-avatar-menu-copy">
              <p className="user-avatar-menu-nickname">{nickname || 'Account'}</p>
              <p className="user-avatar-menu-email">{email || 'Signed in locally'}</p>
            </div>
          </div>

          <div className="user-avatar-menu-group">
            <button className="user-avatar-menu-item" role="menuitem" onClick={handleRelock}>
              <span className="user-avatar-menu-item-icon">
                <Lock size={14} />
              </span>
              <span className="user-avatar-menu-item-label">Lock account</span>
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

          {import.meta.env.DEV && (
            <>
              <div className="user-avatar-menu-divider" aria-hidden="true" />
              <div className="user-avatar-menu-footer" role="none">
                <span className="user-avatar-menu-dev-label">DEV BUILD</span>
              </div>
            </>
          )}
        </Popover>
      </div>

      {showChangePassphrase && (
        <ChangePassphraseDialog onClose={() => setShowChangePassphrase(false)} />
      )}
    </>
  );
}
