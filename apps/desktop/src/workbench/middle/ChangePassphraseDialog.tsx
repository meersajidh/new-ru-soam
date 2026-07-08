/**
 * ChangePassphraseDialog — modal Part for changing the account passphrase.
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
  Input,
  FormField,
} from '@basebench/ui';

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

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
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
    'var(--destructive)',
    'var(--color-warning)',
    'var(--color-warning)',
    'var(--color-success)',
    'var(--color-success)',
  ];

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Change passphrase</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {/* Current passphrase */}
        <FormField label="Current passphrase" htmlFor="cp-current" error={currentError || null}>
          <div className="flex gap-2 items-center">
            <Input
              id="cp-current"
              ref={currentRef}
              type={showCurrent ? 'text' : 'password'}
              value={currentPassphrase}
              onChange={(e) => { setCurrentPassphrase(e.target.value); setCurrentError(''); }}
              autoComplete="current-password"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowCurrent((v) => !v)}
              aria-label={showCurrent ? 'Hide' : 'Show'}
            >
              {showCurrent ? 'Hide' : 'Show'}
            </Button>
          </div>
        </FormField>

        {/* New passphrase */}
        <FormField label="New passphrase" htmlFor="cp-new">
          <div className="flex gap-2 items-center">
            <Input
              id="cp-new"
              type={showNew ? 'text' : 'password'}
              value={newPassphrase}
              onChange={(e) => { setNewPassphrase(e.target.value); setGeneralError(''); }}
              autoComplete="new-password"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowNew((v) => !v)}
              aria-label={showNew ? 'Hide' : 'Show'}
            >
              {showNew ? 'Hide' : 'Show'}
            </Button>
          </div>
        </FormField>

        {/* Strength meter */}
        {newPassphrase.length > 0 && (
          <div className="strength-meter">
            <div className="strength-bars">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="strength-bar"
                  style={{
                    background: i < newScore ? scoreColors[newScore - 1] : 'var(--border)',
                  }}
                />
              ))}
            </div>
            <span className="strength-label" style={{ color: newScore > 0 ? scoreColors[newScore - 1] : 'var(--muted-foreground)' }}>
              {scoreLabels[newScore]}
            </span>
          </div>
        )}

        {newPassphrase.length > 0 && newPassphrase.length < 12 && (
          <p className="text-xs text-destructive m-0 flex items-center gap-1.5">At least 12 characters required.</p>
        )}
        {newPassphrase.length >= 12 && newScore < 3 && (
          <p className="text-xs text-destructive m-0 flex items-center gap-1.5">Passphrase too weak.</p>
        )}

        {/* Confirm */}
        <FormField
          label="Confirm new passphrase"
          htmlFor="cp-confirm"
          error={confirmPassphrase.length > 0 && newPassphrase !== confirmPassphrase ? 'Passphrases do not match.' : null}
        >
          <Input
            id="cp-confirm"
            type={showNew ? 'text' : 'password'}
            value={confirmPassphrase}
            onChange={(e) => { setConfirmPassphrase(e.target.value); setGeneralError(''); }}
            autoComplete="new-password"
          />
        </FormField>

        {generalError && <p className="text-xs text-destructive m-0 flex items-center gap-1.5">{generalError}</p>}

        <DialogFooter className="mt-1">
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="default"
            disabled={!currentPassphrase || !newOk || loading}
          >
            {loading ? 'Changing…' : 'Change passphrase'}
          </Button>
        </DialogFooter>
      </form>
      </DialogContent>
    </Dialog>
  );
}
