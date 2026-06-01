/**
 * UnlockGate — rendered in the workbench middle slot when the workspace is
 * locked (workspace.kekLocked && workspace.setupComplete).
 *
 * Provides:
 *   - Passphrase entry (primary path)
 *   - Recovery-code entry (secondary path, expands on demand)
 *   - "Set new passphrase" step when mustResetPassphrase: true after recovery
 *
 * NOT a route — it is a Part that replaces the workspace editor area content.
 */

import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { zxcvbn } from '@zxcvbn-ts/core';
import { Icon } from '../../platform/icons/Icon';
import { useContextKey } from '../../platform/services/hooks';
import type { UnlockResult, RecoveryUnlockResult } from '../../../electron/shared/lock-protocol';
import StrengthMeter from '../../platform/auth/StrengthMeter';
import PasswordInput from '../../platform/auth/PasswordInput';
import { useModalKeys } from '../../platform/hooks/useModalKeys';
import { Button } from '../../platform/ui/Button';
import { FormField } from '../../platform/ui/FormField';
import './UnlockGate.css';

type GateMode = 'passphrase' | 'recovery' | 'reset-passphrase';

interface UnlockGateProps {
  /**
   * When true, the gate opens directly in 'reset-passphrase' mode and does not
   * allow the user to navigate to the passphrase or recovery branches.
   * Used by PreWorkspaceRoute when mustResetPassphrase is true after recovery unlock.
   */
  forceResetMode?: boolean;
}

export default function UnlockGate({ forceResetMode = false }: UnlockGateProps = {}) {
  const nickname = useContextKey('workspace.nickname') as string;
  const navigate = useNavigate();

  const [mode, setMode] = useState<GateMode>(forceResetMode ? 'reset-passphrase' : 'passphrase');

  useModalKeys(!forceResetMode ? () => void navigate({ to: '/' }) : undefined);

  // Passphrase mode
  const [passphrase, setPassphrase] = useState('');
  const [unlockError, setUnlockError] = useState('');
  const [unlocking, setUnlocking] = useState(false);

  // Recovery mode
  const [recoveryText, setRecoveryText] = useState('');
  const [recoveryError, setRecoveryError] = useState('');
  const [recoveryLoading, setRecoveryLoading] = useState(false);

  // Reset passphrase after recovery
  const [newPassphrase, setNewPassphrase] = useState('');
  const [confirmNewPassphrase, setConfirmNewPassphrase] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  const newPassScore = newPassphrase.length > 0 ? zxcvbn(newPassphrase).score : 0;
  const newPassOk =
    newPassphrase.length >= 12 && newPassScore >= 3 && newPassphrase === confirmNewPassphrase;

  // ── Passphrase unlock ──────────────────────────────────────────────────────

  async function handleUnlock(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!passphrase) return;
    setUnlocking(true);
    setUnlockError('');
    try {
      const result = await window.soam.lock.unlock(passphrase);
      if (result.ok) return; // lock.onChange will fire → PreWorkspaceRoute unmounts gate
      if (result.code === 'bad-passphrase') {
        setUnlockError(
          `Incorrect passphrase (${result.attemptsRemaining} attempt${result.attemptsRemaining === 1 ? '' : 's'} remaining).`,
        );
      } else if (result.code === 'rate-limited') {
        const mins = Math.ceil((result.backoffUntilMs - Date.now()) / 60_000);
        setUnlockError(`Too many attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`);
      } else if (result.code === 'not-set-up') {
        setUnlockError('Account not set up. Please complete setup.');
      } else {
        setUnlockError('Unlock failed. Please try again.');
      }
    } catch (err) {
      setUnlockError(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setUnlocking(false);
      setPassphrase('');
    }
  }

  // ── Recovery code unlock ────────────────────────────────────────────────────

  function normaliseRecoveryWords(raw: string): string[] {
    return raw
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 0);
  }

  async function handleRecoveryUnlock(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const words = normaliseRecoveryWords(recoveryText);
    if (words.length !== 12) {
      setRecoveryError(`Expected 12 words, got ${words.length}.`);
      return;
    }
    setRecoveryLoading(true);
    setRecoveryError('');
    try {
      const result: RecoveryUnlockResult = await window.soam.lock.unlockWithRecoveryCode(words);
      if (result.ok) {
        if (result.mustResetPassphrase) {
          setMode('reset-passphrase');
        }
        // Otherwise lock state flips unlocked → gate unmounts automatically
        return;
      }
      if (result.code === 'bad-recovery-code') {
        setRecoveryError('Recovery code is incorrect. Please check every word and try again.');
      } else {
        setRecoveryError('Account not set up. Please complete setup.');
      }
    } catch (err) {
      setRecoveryError(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRecoveryLoading(false);
    }
  }

  // ── Reset passphrase after recovery ────────────────────────────────────────

  async function handleResetPassphrase(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!newPassOk) return;
    setResetLoading(true);
    setResetError('');
    try {
      const result: UnlockResult = await window.soam.lock.setPassphraseAfterRecovery(newPassphrase);
      if (result.ok) {
        // Lock state already flipped unlocked by the recovery step; gate will unmount
        return;
      }
      if (result.code === 'no-recovery-pending') {
        // Should not happen normally (renderer out of sync with Main after relock).
        // In forceResetMode the workspace is already unlocked so we cannot go back to passphrase.
        setResetError('No recovery session active. Please try again or reload the app.');
        if (!forceResetMode) {
          setMode('passphrase');
        }
      } else {
        setResetError('Failed to set new passphrase. Please try again.');
      }
    } catch (err) {
      setResetError(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setResetLoading(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="unlock-gate-overlay">
      <div className="unlock-gate-card">
        <div>
          <h2 className="unlock-gate-title">
            {forceResetMode ? (
              <>
                <Icon name="key" size={20} />
                Set a new passphrase
              </>
            ) : (
              <>
                <Icon name="lock" size={20} />
                Account locked
              </>
            )}
          </h2>
          {nickname && <p className="unlock-gate-nickname">{nickname}</p>}
        </div>

        {mode === 'passphrase' && (
          <form className="unlock-gate-form" onSubmit={handleUnlock}>
            <FormField
              label="Passphrase"
              htmlFor="unlock-passphrase"
              error={unlockError || null}
            >
              <PasswordInput
                id="unlock-passphrase"
                value={passphrase}
                onChange={(v) => {
                  setPassphrase(v);
                  setUnlockError('');
                }}
                autoFocus
                autoComplete="current-password"
                placeholder="Enter your passphrase"
              />
            </FormField>
            <div className="setup-actions">
              {!forceResetMode && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => void navigate({ to: '/' })}
                  disabled={unlocking}
                >
                  Cancel
                </Button>
              )}
              <Button
                type="submit"
                variant="primary"
                disabled={!passphrase || unlocking}
              >
                {unlocking ? 'Unlocking…' : 'Unlock'}
              </Button>
            </div>
            <button
              type="button"
              className="unlock-recovery-toggle"
              onClick={() => {
                setMode('recovery');
                setUnlockError('');
              }}
            >
              Use recovery code instead
            </button>
          </form>
        )}

        {mode === 'recovery' && (
          <form className="unlock-gate-form" onSubmit={handleRecoveryUnlock}>
            <label htmlFor="recovery-entry" className="text-xs font-semibold text-fg-secondary block" style={{ letterSpacing: '0.02em' }}>
              Recovery code (12 words, space-separated)
            </label>
            <textarea
              id="recovery-entry"
              className="recovery-entry-area"
              value={recoveryText}
              onChange={(e) => {
                setRecoveryText(e.target.value);
                setRecoveryError('');
              }}
              placeholder="word1 word2 word3 … word12"
              autoFocus
              rows={3}
            />
            {recoveryError && <p className="unlock-gate-error">{recoveryError}</p>}
            <div className="setup-actions">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setMode('passphrase');
                  setRecoveryError('');
                }}
              >
                Back
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={!recoveryText.trim() || recoveryLoading}
              >
                {recoveryLoading ? 'Checking…' : 'Unlock with recovery code'}
              </Button>
            </div>
          </form>
        )}

        {mode === 'reset-passphrase' && (
          <form className="unlock-gate-form" onSubmit={handleResetPassphrase}>
            <p className="t-description max-w-[48ch] mb-2">
              {forceResetMode
                ? 'Your account was unlocked with a recovery code. Set a new passphrase to continue.'
                : 'Recovery successful. Set a new passphrase to continue.'}
            </p>
            <FormField label="New passphrase" htmlFor="new-passphrase">
              <PasswordInput
                id="new-passphrase"
                value={newPassphrase}
                onChange={(v) => {
                  setNewPassphrase(v);
                  setResetError('');
                }}
                autoFocus
                autoComplete="new-password"
              />
            </FormField>
            {newPassphrase.length > 0 && <StrengthMeter score={newPassScore} />}
            {newPassphrase.length > 0 && newPassphrase.length < 12 && (
              <p className="unlock-gate-error">At least 12 characters required.</p>
            )}
            {newPassphrase.length >= 12 && newPassScore < 3 && (
              <p className="unlock-gate-error">Passphrase too weak.</p>
            )}
            <FormField label="Confirm new passphrase" htmlFor="confirm-new-passphrase">
              <PasswordInput
                id="confirm-new-passphrase"
                value={confirmNewPassphrase}
                onChange={(v) => {
                  setConfirmNewPassphrase(v);
                  setResetError('');
                }}
                autoComplete="new-password"
              />
            </FormField>
            {confirmNewPassphrase.length > 0 && newPassphrase !== confirmNewPassphrase && (
              <p className="unlock-gate-error">Passphrases do not match.</p>
            )}
            {resetError && <p className="unlock-gate-error">{resetError}</p>}
            <div className="setup-actions">
              <Button
                type="submit"
                variant="primary"
                disabled={!newPassOk || resetLoading}
              >
                {resetLoading ? 'Setting…' : 'Set passphrase'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
