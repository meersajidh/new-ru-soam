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
import { zxcvbn } from '@zxcvbn-ts/core';
import { useContextKey } from '../../platform/services/hooks';
import type { UnlockResult, RecoveryUnlockResult } from '../../../electron/shared/lock-protocol';
import '../../styles/setup.css';

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

  const [mode, setMode] = useState<GateMode>(forceResetMode ? 'reset-passphrase' : 'passphrase');

  // Passphrase mode
  const [passphrase, setPassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [unlockError, setUnlockError] = useState('');
  const [unlocking, setUnlocking] = useState(false);

  // Recovery mode
  const [recoveryText, setRecoveryText] = useState('');
  const [recoveryError, setRecoveryError] = useState('');
  const [recoveryLoading, setRecoveryLoading] = useState(false);

  // Reset passphrase after recovery
  const [newPassphrase, setNewPassphrase] = useState('');
  const [confirmNewPassphrase, setConfirmNewPassphrase] = useState('');
  const [showNewPassphrase, setShowNewPassphrase] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  const newPassScore = newPassphrase.length > 0 ? zxcvbn(newPassphrase).score : 0;
  const newPassOk =
    newPassphrase.length >= 12 && newPassScore >= 3 && newPassphrase === confirmNewPassphrase;

  // ── Passphrase unlock ──────────────────────────────────────────────────────

  async function handleUnlock(e: React.FormEvent) {
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
        setUnlockError('Workspace not set up. Please complete setup.');
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

  async function handleRecoveryUnlock(e: React.FormEvent) {
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
        setRecoveryError('Workspace not set up. Please complete setup.');
      }
    } catch (err) {
      setRecoveryError(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRecoveryLoading(false);
    }
  }

  // ── Reset passphrase after recovery ────────────────────────────────────────

  async function handleResetPassphrase(e: React.FormEvent) {
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

  const cardTitle = forceResetMode ? 'Set a new passphrase' : '[L] Workspace locked';

  return (
    <div className="unlock-gate-overlay">
      <div className="unlock-gate-card">
        <div>
          <h2 className="unlock-gate-title">{cardTitle}</h2>
          {nickname && (
            <p className="unlock-gate-nickname">{nickname}</p>
          )}
        </div>

        {mode === 'passphrase' && (
          <form className="unlock-gate-form" onSubmit={handleUnlock}>
            <label htmlFor="unlock-passphrase" className="setup-label">
              Passphrase
            </label>
            <div className="setup-input-row">
              <input
                id="unlock-passphrase"
                type={showPassphrase ? 'text' : 'password'}
                className="setup-input"
                value={passphrase}
                onChange={(e) => { setPassphrase(e.target.value); setUnlockError(''); }}
                autoFocus
                autoComplete="current-password"
                placeholder="Enter your passphrase"
              />
              <button
                type="button"
                className="setup-btn-ghost setup-show-toggle"
                onClick={() => setShowPassphrase((v) => !v)}
                aria-label={showPassphrase ? 'Hide passphrase' : 'Show passphrase'}
              >
                {showPassphrase ? 'Hide' : 'Show'}
              </button>
            </div>
            {unlockError && <p className="unlock-gate-error">{unlockError}</p>}
            <div className="setup-actions">
              <button
                type="submit"
                className="setup-btn-primary"
                disabled={!passphrase || unlocking}
              >
                {unlocking ? 'Unlocking…' : 'Unlock'}
              </button>
            </div>
            <button
              type="button"
              className="unlock-recovery-toggle"
              onClick={() => { setMode('recovery'); setUnlockError(''); }}
            >
              Use recovery code instead
            </button>
          </form>
        )}

        {mode === 'recovery' && (
          <form className="unlock-gate-form" onSubmit={handleRecoveryUnlock}>
            <label htmlFor="recovery-entry" className="setup-label">
              Recovery code (12 words, space-separated)
            </label>
            <textarea
              id="recovery-entry"
              className="recovery-entry-area"
              value={recoveryText}
              onChange={(e) => { setRecoveryText(e.target.value); setRecoveryError(''); }}
              placeholder="word1 word2 word3 … word12"
              autoFocus
              rows={3}
            />
            {recoveryError && <p className="unlock-gate-error">{recoveryError}</p>}
            <div className="setup-actions">
              <button
                type="button"
                className="setup-btn-ghost"
                onClick={() => { setMode('passphrase'); setRecoveryError(''); }}
              >
                Back
              </button>
              <button
                type="submit"
                className="setup-btn-primary"
                disabled={!recoveryText.trim() || recoveryLoading}
              >
                {recoveryLoading ? 'Checking…' : 'Unlock with recovery code'}
              </button>
            </div>
          </form>
        )}

        {mode === 'reset-passphrase' && (
          <form className="unlock-gate-form" onSubmit={handleResetPassphrase}>
            <p className="setup-description" style={{ marginBottom: 'var(--space-2)' }}>
              {forceResetMode
                ? 'Your workspace was unlocked with a recovery code. Set a new passphrase to continue.'
                : 'Recovery successful. Set a new passphrase to continue.'}
            </p>
            <label htmlFor="new-passphrase" className="setup-label">
              New passphrase
            </label>
            <div className="setup-input-row">
              <input
                id="new-passphrase"
                type={showNewPassphrase ? 'text' : 'password'}
                className="setup-input"
                value={newPassphrase}
                onChange={(e) => { setNewPassphrase(e.target.value); setResetError(''); }}
                autoFocus
                autoComplete="new-password"
              />
              <button
                type="button"
                className="setup-btn-ghost setup-show-toggle"
                onClick={() => setShowNewPassphrase((v) => !v)}
                aria-label={showNewPassphrase ? 'Hide' : 'Show'}
              >
                {showNewPassphrase ? 'Hide' : 'Show'}
              </button>
            </div>
            {newPassphrase.length > 0 && (
              <ZxcvbnMeter score={newPassScore} />
            )}
            {newPassphrase.length > 0 && newPassphrase.length < 12 && (
              <p className="unlock-gate-error">At least 12 characters required.</p>
            )}
            {newPassphrase.length >= 12 && newPassScore < 3 && (
              <p className="unlock-gate-error">Passphrase too weak.</p>
            )}
            <label htmlFor="confirm-new-passphrase" className="setup-label">
              Confirm new passphrase
            </label>
            <input
              id="confirm-new-passphrase"
              type={showNewPassphrase ? 'text' : 'password'}
              className="setup-input"
              value={confirmNewPassphrase}
              onChange={(e) => { setConfirmNewPassphrase(e.target.value); setResetError(''); }}
              autoComplete="new-password"
            />
            {confirmNewPassphrase.length > 0 && newPassphrase !== confirmNewPassphrase && (
              <p className="unlock-gate-error">Passphrases do not match.</p>
            )}
            {resetError && <p className="unlock-gate-error">{resetError}</p>}
            <div className="setup-actions">
              <button
                type="submit"
                className="setup-btn-primary"
                disabled={!newPassOk || resetLoading}
              >
                {resetLoading ? 'Setting…' : 'Set passphrase'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Inline strength meter (mirrors setup wizard) ──────────────────────────────

function ZxcvbnMeter({ score }: { score: number }) {
  const labels = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'];
  const colors = [
    'var(--color-error)',
    'var(--color-warning)',
    'var(--color-warning)',
    'var(--color-success)',
    'var(--color-success)',
  ];
  return (
    <div className="strength-meter">
      <div className="strength-bars">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="strength-bar"
            style={{ background: i < score ? colors[score - 1] : 'var(--color-border)' }}
          />
        ))}
      </div>
      <span className="strength-label" style={{ color: score > 0 ? colors[score - 1] : 'var(--color-fg-muted)' }}>
        {labels[score]}
      </span>
    </div>
  );
}
