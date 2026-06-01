/**
 * LoginModal — pre-workbench auth surface replacing the workspace picker.
 *
 * Two modes:
 *   - DEFAULT (activeId set, locked): passphrase only → lock.unlock.
 *     Wraps UnlockGate logic; reuses recovery / forceResetMode paths.
 *   - IDENTIFY (no activeId, workspaces exist): nickname text field + passphrase.
 *     Looks up the workspace by nickname (no list rendered), calls setActive → unlock.
 *
 * Strings use "account" not "workspace" (product language per brief).
 * All unlock crypto delegated to UnlockGate — no duplication.
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Icon } from '../../platform/icons/Icon';
import { zxcvbn } from '@zxcvbn-ts/core';
import { useContextKey, useService } from '../../platform/services/hooks';
import { ProductConfigServiceId } from '../../platform/services/ids';
import type { UnlockResult, RecoveryUnlockResult, WorkspaceMeta } from '../../../electron/shared/lock-protocol';
import StrengthMeter from '../../platform/auth/StrengthMeter';
import PasswordInput from '../../platform/auth/PasswordInput';
import { useModalKeys } from '../../platform/hooks/useModalKeys';
import { Button } from '../../platform/ui/Button';
import { FormField } from '../../platform/ui/FormField';
import BridgeMark from '../parts/BridgeMark';
import Wordmark from '../parts/Wordmark';
import AccountSelect from './AccountSelect';
import './LoginModal.css';

type InnerMode = 'passphrase' | 'recovery' | 'reset-passphrase';

// Survives the identify→default modal remount. After identify-mode submit calls
// setActive(), PreWorkspaceRoute flips activeId and swaps this modal out (through
// LoadingSplash) for a fresh default-mode instance — React state is lost across
// that gap. This module-scoped slot carries the unlock-error message from a
// failed identify attempt so the remounted instance can surface it. Consumed +
// cleared on the next mount (see the unlockError useState initialiser).
let pendingUnlockError = '';

interface LoginModalProps {
  /**
   * 'default' — activeId is set; show passphrase only (wraps UnlockGate behaviour).
   * 'identify' — no activeId; show nickname + passphrase.
   */
  mode: 'default' | 'identify';
  /**
   * When true, open directly in reset-passphrase mode (mustResetPassphrase path).
   * Only valid when mode='default'.
   */
  forceResetMode?: boolean;
}

export default function LoginModal({ mode, forceResetMode = false }: LoginModalProps) {
  const nickname = useContextKey('workspace.nickname') as string;
  const navigate = useNavigate();
  const productConfig = useService(ProductConfigServiceId);
  const { tagline } = productConfig.get();

  // Inner unlock step
  const [innerMode, setInnerMode] = useState<InnerMode>(
    forceResetMode ? 'reset-passphrase' : 'passphrase',
  );

  // In 'identify' mode: account list + selection state.
  const [accounts, setAccounts] = useState<WorkspaceMeta[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('');
  const [identifyError, setIdentifyError] = useState('');
  // Whether we've found the account and are now in passphrase entry within identify flow.
  const [identifyResolved, setIdentifyResolved] = useState(false);
  const [identifying, setIdentifying] = useState(false);

  // Passphrase state (shared for default + identify post-resolve)
  const [passphrase, setPassphrase] = useState('');
  // Consume any error stashed by a failed identify-mode unlock whose instance
  // was torn down before it could render; clears the slot on read.
  const [unlockError, setUnlockError] = useState(() => {
    const stashed = pendingUnlockError;
    pendingUnlockError = '';
    return stashed;
  });
  const [unlocking, setUnlocking] = useState(false);

  // Recovery state
  const [recoveryText, setRecoveryText] = useState('');
  const [recoveryError, setRecoveryError] = useState('');
  const [recoveryLoading, setRecoveryLoading] = useState(false);

  // Reset-passphrase state
  const [newPassphrase, setNewPassphrase] = useState('');
  const [confirmNewPassphrase, setConfirmNewPassphrase] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  // App version for the badge
  const [appVersion, setAppVersion] = useState('');

  // Identify-mode focus targets (focused once the account list resolves).
  const selectTriggerRef = useRef<HTMLButtonElement>(null);
  const passphraseRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    window.soam.app
      .getVersion()
      .then((v) => setAppVersion(v))
      .catch(() => {
        /* fire-and-forget: silently ignore */
      });
  }, []);

  // Fetch account list once on mount (identify mode only).
  useEffect(() => {
    if (mode !== 'identify') return;
    window.soam.workspace
      .list()
      .then((list) => {
        setAccounts(list);
        // Pick default: greatest lastSignedIn; null treated as oldest.
        // Tie-break / all-null fallback: greatest createdAt.
        const sorted = [...list].sort((a, b) => {
          const aTime = a.lastSignedIn ?? a.createdAt;
          const bTime = b.lastSignedIn ?? b.createdAt;
          // Null lastSignedIn → push to end (oldest).
          if (a.lastSignedIn === null && b.lastSignedIn !== null) return 1;
          if (b.lastSignedIn === null && a.lastSignedIn !== null) return -1;
          return bTime.localeCompare(aTime);
        });
        if (sorted.length > 0) {
          setSelectedWorkspaceId((prev) => (prev ? prev : sorted[0].workspaceId));
        }
      })
      .catch(() => {
        /* fire-and-forget: leave accounts empty */
      });
  }, [mode]);

  // Once the account list resolves, place focus: passphrase when there's a single
  // account (nothing to choose), the account picker when there are several.
  useEffect(() => {
    if (mode !== 'identify' || identifyResolved || accounts.length === 0) return;
    if (accounts.length === 1) {
      passphraseRef.current?.focus();
    } else {
      selectTriggerRef.current?.focus();
    }
  }, [mode, identifyResolved, accounts.length]);

  const newPassScore = newPassphrase.length > 0 ? zxcvbn(newPassphrase).score : 0;
  const newPassOk =
    newPassphrase.length >= 12 && newPassScore >= 3 && newPassphrase === confirmNewPassphrase;

  // Escape key: no-op in default mode (no "back" surface); in identify pre-resolve, also no-op.
  useModalKeys(undefined);

  // ── Identify: look up workspace by nickname, then setActive + unlock atomically ──

  async function handleIdentifySubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedWorkspaceId || !passphrase) return;
    setIdentifying(true);
    setIdentifyError('');
    setUnlockError('');
    try {
      // setActive → unlock as one atomic sequence to avoid flash between identify/default modes.
      const setRes = await window.soam.workspace.setActive(selectedWorkspaceId);
      if (!setRes.ok) {
        setIdentifyError('Could not activate account. Please try again.');
        return;
      }
      setIdentifyResolved(true);
      // Now unlock with the passphrase the user already typed. fromIdentify=true
      // so a failure stashes its error across the impending remount.
      await runUnlock(passphrase, true);
    } catch (err) {
      setIdentifyError(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIdentifying(false);
    }
  }

  // ── Passphrase unlock (default mode) ──────────────────────────────────────────

  async function handleUnlock(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!passphrase) return;
    await runUnlock(passphrase);
  }

  async function runUnlock(phrase: string, fromIdentify = false) {
    setUnlocking(true);
    setUnlockError('');
    try {
      const result: UnlockResult = await window.soam.lock.unlock(phrase);
      if (result.ok) return; // lock.onChange fires → PreWorkspaceRoute unmounts modal
      let msg: string;
      if (result.code === 'bad-passphrase') {
        msg = `Incorrect passphrase (${result.attemptsRemaining} attempt${result.attemptsRemaining === 1 ? '' : 's'} remaining).`;
      } else if (result.code === 'rate-limited') {
        const mins = Math.ceil((result.backoffUntilMs - Date.now()) / 60_000);
        msg = `Too many attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`;
      } else if (result.code === 'not-set-up') {
        msg = 'Account not set up. Please complete setup.';
      } else {
        msg = 'Unlock failed. Please try again.';
      }
      setUnlockError(msg);
      // Identify-mode failure happens after setActive flipped activeId, so this
      // instance is about to unmount — stash the message for the remounted one.
      if (fromIdentify) pendingUnlockError = msg;
    } catch (err) {
      const msg = `Error: ${err instanceof Error ? err.message : String(err)}`;
      setUnlockError(msg);
      if (fromIdentify) pendingUnlockError = msg;
    } finally {
      setUnlocking(false);
      setPassphrase('');
      if (identifyResolved) setIdentifyResolved(false);
    }
  }

  // ── Recovery code unlock ──────────────────────────────────────────────────────

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
          setInnerMode('reset-passphrase');
        }
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

  // ── Reset passphrase after recovery ──────────────────────────────────────────

  async function handleResetPassphrase(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!newPassOk) return;
    setResetLoading(true);
    setResetError('');
    try {
      const result: UnlockResult = await window.soam.lock.setPassphraseAfterRecovery(newPassphrase);
      if (result.ok) return;
      if (result.code === 'no-recovery-pending') {
        setResetError('No recovery session active. Please try again or reload the app.');
        if (!forceResetMode) {
          setInnerMode('passphrase');
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

  // ── Title + subtitle logic ────────────────────────────────────────────────────

  const isResetMode = innerMode === 'reset-passphrase';
  const displayNickname = mode === 'default' ? nickname : '';
  const cardTitle = isResetMode ? 'Set a new passphrase' : 'Welcome back';

  const cardSubtitle = isResetMode
    ? null
    : mode === 'identify'
      ? 'Sign in to your practice account'
      : displayNickname || null;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="login-modal-overlay">
      {/* Version badge — top-right of overlay, outside card */}
      {appVersion && (
        <div className="login-modal-version-badge" aria-label={`Version ${appVersion}`}>
          V{appVersion}
        </div>
      )}

      {/* Catenary arc SVG background — same idiom as LoadingSplash */}
      <svg
        className="login-modal-overlay__arcs"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <path d="M-100 280 Q 720 760 1540 280" />
        <path d="M-100 360 Q 720 820 1540 360" opacity="0.6" />
        <line x1="-100" y1="660" x2="1540" y2="660" strokeDasharray="2 5" />
      </svg>

      <div className="login-modal-card">
        {/* ── Card header: logo tile + wordmark + tagline (left-aligned row) ── */}
        <div className="login-modal-header">
          <div className="login-modal-logo-tile" aria-hidden="true">
            <BridgeMark size={28} />
          </div>
          <div className="login-modal-wordmark-group">
            <Wordmark variant="inline" />
            {tagline && <p className="login-modal-tagline">{tagline}</p>}
          </div>
        </div>

        {/* ── Mode heading (left-aligned) ── */}
        <div className="login-modal-heading-block">
          <h2 className="login-modal-title">
            {isResetMode && (
              <span className="login-modal-title__icon" aria-hidden="true">
                <Icon name="key" size={20} />
              </span>
            )}
            {cardTitle}
          </h2>
          {cardSubtitle && <p className="login-modal-subtitle">{cardSubtitle}</p>}
        </div>

        {/* ── IDENTIFY mode: nickname + passphrase ── */}
        {mode === 'identify' && !identifyResolved && innerMode === 'passphrase' && (
          <form className="login-modal-form" onSubmit={handleIdentifySubmit}>
            <FormField label="Account name" htmlFor="identify-account" error={identifyError || null}>
              <AccountSelect
                id="identify-account"
                accounts={accounts}
                value={selectedWorkspaceId}
                onChange={(wsId) => {
                  setSelectedWorkspaceId(wsId);
                  setIdentifyError('');
                }}
                triggerRef={selectTriggerRef}
              />
            </FormField>

            {/* Passphrase field with inline "Forgot?" link at label right */}
            <div className="login-modal-passphrase-field">
              <div className="login-modal-passphrase-label-row">
                <label
                  htmlFor="identify-passphrase"
                  className="login-modal-passphrase-label"
                >
                  Passphrase
                </label>
                <button
                  type="button"
                  className="login-modal-forgot-link"
                  onClick={() => {
                    setInnerMode('recovery');
                    setIdentifyError('');
                    setUnlockError('');
                  }}
                >
                  Forgot?
                </button>
              </div>
              <PasswordInput
                id="identify-passphrase"
                inputRef={passphraseRef}
                value={passphrase}
                onChange={(v) => {
                  setPassphrase(v);
                  setUnlockError('');
                }}
                autoComplete="current-password"
                placeholder="Enter your passphrase"
              />
              {unlockError && (
                <p className="text-xs text-error m-0 flex items-center gap-1.5">{unlockError}</p>
              )}
            </div>

            <Button
              type="submit"
              variant="primary"
              className="login-modal-submit"
              disabled={!selectedWorkspaceId || !passphrase || identifying || unlocking}
            >
              {identifying || unlocking ? (
                'Signing in…'
              ) : (
                <>
                  Sign in <Icon name="arrow-right" size={16} />
                </>
              )}
            </Button>

            {/* Footer link row */}
            <div className="login-modal-footer-links">
              <button
                type="button"
                className="login-modal-recovery-link"
                onClick={() => {
                  setInnerMode('recovery');
                  setIdentifyError('');
                  setUnlockError('');
                }}
              >
                Use recovery code
              </button>
              <button
                type="button"
                className="login-modal-create-link"
                onClick={() => void navigate({ to: '/setup/keys', search: { addNew: true } })}
              >
                Create account →
              </button>
            </div>
          </form>
        )}

        {/* ── DEFAULT mode: passphrase only ── */}
        {(mode === 'default' || identifyResolved) && innerMode === 'passphrase' && (
          <form className="login-modal-form" onSubmit={handleUnlock}>
            {/* Passphrase field with inline "Forgot?" link at label right */}
            <div className="login-modal-passphrase-field">
              <div className="login-modal-passphrase-label-row">
                <label
                  htmlFor="unlock-passphrase"
                  className="login-modal-passphrase-label"
                >
                  Passphrase
                </label>
                {!forceResetMode && (
                  <button
                    type="button"
                    className="login-modal-forgot-link"
                    onClick={() => {
                      setInnerMode('recovery');
                      setUnlockError('');
                    }}
                  >
                    Forgot?
                  </button>
                )}
              </div>
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
              {unlockError && (
                <p className="text-xs text-error m-0 flex items-center gap-1.5">{unlockError}</p>
              )}
            </div>

            <Button
              type="submit"
              variant="primary"
              className="login-modal-submit"
              disabled={!passphrase || unlocking}
            >
              {unlocking ? (
                'Unlocking…'
              ) : (
                <>
                  Sign in <Icon name="arrow-right" size={16} />
                </>
              )}
            </Button>

            {/* Footer link row — recovery only; no create-account in default mode */}
            {!forceResetMode && (
              <div className="login-modal-footer-links">
                <button
                  type="button"
                  className="login-modal-recovery-link"
                  onClick={() => {
                    setInnerMode('recovery');
                    setUnlockError('');
                  }}
                >
                  Use recovery code
                </button>
              </div>
            )}
          </form>
        )}

        {/* ── Recovery ── */}
        {innerMode === 'recovery' && (
          <form className="login-modal-form" onSubmit={handleRecoveryUnlock}>
            <label
              htmlFor="recovery-entry"
              className="text-xs font-semibold text-fg-secondary block"
              style={{ letterSpacing: '0.02em' }}
            >
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
                  setInnerMode('passphrase');
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

        {/* ── Reset passphrase after recovery ── */}
        {innerMode === 'reset-passphrase' && (
          <form className="login-modal-form" onSubmit={handleResetPassphrase}>
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

        {/* ── Thin divider above trust footer ── */}
        <div className="login-modal-divider" aria-hidden="true" />

        {/* ── Trust footer row ── */}
        <div className="login-modal-trust" aria-hidden="true">
          <span className="login-modal-trust__label">
            <span className="login-modal-trust__bullet" aria-hidden="true">●</span>
            Local-first · Encrypted
          </span>
          <Icon name="newline" size={13} className="login-modal-trust__glyph" />
        </div>
      </div>
    </div>
  );
}
