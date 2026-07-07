/**
 * UserAvatar — account button anchored in the Activity Bar footer.
 *
 * Renders a small circle with the user email initial. Click opens a dropdown
 * menu with account management actions (Base UI Menu via DropdownMenu — modal,
 * so it dismisses correctly over bundle iframes; ADR-421 F4 4e-ii).
 *
 * The avatar is only rendered when the workspace is unlocked
 * (workspace.kekLocked === false && workspace.setupComplete === true).
 *
 * Items: Lock account, Change passphrase, Help / documentation, Sign out.
 * Delete account moved to SettingsMenu (Danger Zone).
 */

import { useEffect, useState } from 'react';
import {
  Icon,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@basebench/ui';
import { useContextKey } from '../../platform/services/hooks';
import ChangePassphraseDialog from './ChangePassphraseDialog';
import './UserAvatar.css';

export default function UserAvatar() {
  const kekLocked = useContextKey('workspace.kekLocked') as boolean;
  const setupComplete = useContextKey('workspace.setupComplete') as boolean;
  const nickname = useContextKey('workspace.nickname') as string;

  const [email, setEmail] = useState<string>('');
  const [showChangePassphrase, setShowChangePassphrase] = useState(false);

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
    await window.soam.lock.relock();
  }

  async function handleSignOut() {
    await window.soam.workspace.signOut();
  }

  function handleChangePassphrase() {
    setShowChangePassphrase(true);
  }

  async function handleHelp() {
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
        <DropdownMenu>
          <DropdownMenuTrigger
            className="user-avatar-btn"
            aria-label={`Account — ${nickname || email || 'user'}`}
            title={email || nickname}
          >
            {initial}
          </DropdownMenuTrigger>

          <DropdownMenuContent side="right" align="end" sideOffset={12} className="user-avatar-menu">
            <div className="user-avatar-menu-header">
              <div className="user-avatar-menu-badge" aria-hidden="true">
                {initial}
              </div>
              <div className="user-avatar-menu-copy">
                <p className="user-avatar-menu-nickname">{nickname || 'Account'}</p>
                <p className="user-avatar-menu-email">{email || 'Signed in locally'}</p>
              </div>
            </div>

            <DropdownMenuItem onClick={handleRelock}>
              <Icon name="lock" size={14} />
              Lock account
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleChangePassphrase}>
              <Icon name="key" size={14} />
              Change passphrase
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem onClick={handleHelp}>
              <Icon name="help" size={14} />
              Help / documentation
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem variant="destructive" onClick={handleSignOut}>
              <Icon name="sign-out" size={14} />
              Sign out
            </DropdownMenuItem>

            {import.meta.env.DEV && (
              <>
                <DropdownMenuSeparator />
                <div className="user-avatar-menu-footer" role="none">
                  <span className="user-avatar-menu-dev-label">DEV BUILD</span>
                </div>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {showChangePassphrase && (
        <ChangePassphraseDialog onClose={() => setShowChangePassphrase(false)} />
      )}
    </>
  );
}
