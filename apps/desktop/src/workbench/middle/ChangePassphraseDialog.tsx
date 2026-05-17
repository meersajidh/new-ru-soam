/**
 * ChangePassphraseDialog — modal Part for changing the workspace passphrase.
 *
 * Fields: current passphrase + new passphrase + confirm new passphrase + zxcvbn meter.
 * On submit calls window.soam.lock.changePassphrase(current, next).
 *
 * Result codes handled:
 *   ok              → close dialog
 *   bad-passphrase  → inline error on current field
 *   rate-limited    → show backoff message
 *   not-set-up      → generic error
 */

import { useState, useRef, useEffect } from 'react';
import { zxcvbn } from '@zxcvbn-ts/core';
import '../../styles/setup.css';

interface Props {
  onClose: () => void;
}

export default function ChangePassphraseDialog({ onClose }: Props) {
  const [currentPassphrase, setCurrentPassphrase] = useState('');
  const [newPassphrase, setNewPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [currentError, setCurrentError] = useState('');
  const [generalError, setGeneralError] = useState('');
  const [loading, setLoading] = useState(false);

  const currentRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    currentRef.current?.focus();
  }, []);

  const newScore = newPassphrase.length > 0 ? zxcvbn(newPassphrase).score : 0;
  const newOk =
    newPassphrase.length >= 12 &&
    newScore >= 3 &&
    newPassphrase === confirmPassphrase;

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!currentPassphrase || !newOk) return;
    setLoading(true);
    setCurrentError('');
    setGeneralError('');
    try {
      const result = await window.soam.lock.changePassphrase(currentPassphrase, newPassphrase);
      if (result.ok) {
        onClose();
        return;
      }
      if (result.code === 'bad-passphrase') {
        setCurrentError(
          `Incorrect passphrase (${result.attemptsRemaining} attempt${result.attemptsRemaining === 1 ? '' : 's'} remaining).`,
        );
      } else if (result.code === 'rate-limited') {
        const mins = Math.ceil((result.backoffUntilMs - Date.now()) / 60_000);
        setGeneralError(`Too many attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`);
      } else {
        setGeneralError('Failed to change passphrase. Please try again.');
      }
    } catch (err) {
      setGeneralError(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
      setCurrentPassphrase('');
    }
  }

  const scoreLabels = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'];
  const scoreColors = [
    'var(--color-error)',
    'var(--color-warning)',
    'var(--color-warning)',
    'var(--color-success)',
    'var(--color-success)',
  ];

  return (
    <div
      className="change-passphrase-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="change-passphrase-title"
      onKeyDown={handleKeyDown}
    >
      <div className="change-passphrase-card">
        <h2 id="change-passphrase-title" className="change-passphrase-title">
          Change passphrase
        </h2>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {/* Current passphrase */}
          <label htmlFor="cp-current" className="setup-label">
            Current passphrase
          </label>
          <div className="setup-input-row">
            <input
              id="cp-current"
              ref={currentRef}
              type={showCurrent ? 'text' : 'password'}
              className="setup-input"
              value={currentPassphrase}
              onChange={(e) => { setCurrentPassphrase(e.target.value); setCurrentError(''); }}
              autoComplete="current-password"
            />
            <button
              type="button"
              className="setup-btn-ghost setup-show-toggle"
              onClick={() => setShowCurrent((v) => !v)}
              aria-label={showCurrent ? 'Hide' : 'Show'}
            >
              {showCurrent ? 'Hide' : 'Show'}
            </button>
          </div>
          {currentError && <p className="setup-error">{currentError}</p>}

          {/* New passphrase */}
          <label htmlFor="cp-new" className="setup-label" style={{ marginTop: 'var(--space-2)' }}>
            New passphrase
          </label>
          <div className="setup-input-row">
            <input
              id="cp-new"
              type={showNew ? 'text' : 'password'}
              className="setup-input"
              value={newPassphrase}
              onChange={(e) => { setNewPassphrase(e.target.value); setGeneralError(''); }}
              autoComplete="new-password"
            />
            <button
              type="button"
              className="setup-btn-ghost setup-show-toggle"
              onClick={() => setShowNew((v) => !v)}
              aria-label={showNew ? 'Hide' : 'Show'}
            >
              {showNew ? 'Hide' : 'Show'}
            </button>
          </div>

          {/* Strength meter */}
          {newPassphrase.length > 0 && (
            <div className="strength-meter">
              <div className="strength-bars">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="strength-bar"
                    style={{
                      background: i < newScore ? scoreColors[newScore - 1] : 'var(--color-border)',
                    }}
                  />
                ))}
              </div>
              <span className="strength-label" style={{ color: newScore > 0 ? scoreColors[newScore - 1] : 'var(--color-fg-muted)' }}>
                {scoreLabels[newScore]}
              </span>
            </div>
          )}

          {newPassphrase.length > 0 && newPassphrase.length < 12 && (
            <p className="setup-error">At least 12 characters required.</p>
          )}
          {newPassphrase.length >= 12 && newScore < 3 && (
            <p className="setup-error">Passphrase too weak.</p>
          )}

          {/* Confirm */}
          <label htmlFor="cp-confirm" className="setup-label">
            Confirm new passphrase
          </label>
          <input
            id="cp-confirm"
            type={showNew ? 'text' : 'password'}
            className="setup-input"
            value={confirmPassphrase}
            onChange={(e) => { setConfirmPassphrase(e.target.value); setGeneralError(''); }}
            autoComplete="new-password"
          />
          {confirmPassphrase.length > 0 && newPassphrase !== confirmPassphrase && (
            <p className="setup-error">Passphrases do not match.</p>
          )}

          {generalError && <p className="setup-error">{generalError}</p>}

          <div className="setup-actions">
            <button type="button" className="setup-btn-ghost" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button
              type="submit"
              className="setup-btn-primary"
              disabled={!currentPassphrase || !newOk || loading}
            >
              {loading ? 'Changing…' : 'Change passphrase'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
