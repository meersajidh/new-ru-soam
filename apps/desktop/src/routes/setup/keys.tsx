/**
 * Setup ceremony wizard — /setup/keys
 *
 * Full-screen route (NOT inside the Workbench shell). Five-step wizard:
 *   1. Sign in with Google (mocked)
 *   2. Choose nickname
 *   3. Set passphrase (zxcvbn strength-gated)
 *   4. Display recovery code (acknowledge checkbox required)
 *   5. Finish (calls setup.acknowledge, navigates to /)
 *
 * Orchestration:
 *   sign-in done       → store { email, googleId }
 *   nickname valid     → store nickname
 *   passphrase valid   → workspace.create → workspace.setActive →
 *                        setup.generate → display recovery code
 *   acknowledge + Finish → setup.acknowledge → navigate to /
 *
 * If the user interrupts after workspace.create but before acknowledge,
 * the workspace dir exists with meta.json but no lock.json.
 * On next boot PreWorkspaceRoute detects setup-pending state and routes
 * back here from step 1 (the 10-min staged setup is gone; safer to re-derive).
 *
 * Reached via the login modal "Create new account" link with `?addNew=true` — the fresh-create
 * flow shares this route. When addNew=true the wizard always runs all five steps
 * regardless of whether a workspace is currently active.
 */

/* eslint-disable react-refresh/only-export-components */
import { useState } from 'react';
import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router';
import { zxcvbn } from '@zxcvbn-ts/core';
import { Icon } from '../../platform/icons/Icon';
import { ProgressRail } from './-keys-components';
import StrengthMeter from '../../platform/auth/StrengthMeter';
import PasswordInput from '../../platform/auth/PasswordInput';
import GoogleMark from '../../platform/auth/GoogleMark';
import Wordmark from '../../workbench/parts/Wordmark';
import { useModalKeys } from '../../platform/hooks/useModalKeys';
import { Button } from '../../platform/ui/Button';
import { TextInput } from '../../platform/ui/TextInput';
import { FormField } from '../../platform/ui/FormField';
import { PageShell } from '../../platform/ui/PageShell';
import './keys.css';

export const Route = createFileRoute('/setup/keys')({
  validateSearch: (search: Record<string, unknown>): { addNew?: boolean } => ({
    addNew: search['addNew'] === true || search['addNew'] === 'true' || undefined,
  }),
  component: SetupKeysPage,
});

function SetupKeysPage() {
  return <SetupKeysContent />;
}

type Step = 1 | 2 | 3 | 4 | 5;

interface WizardState {
  step: Step;
  email: string;
  googleId: string;
  nickname: string;
  passphrase: string;
  recoveryWords: string[];
  workspaceId: string | null;
}

// ── Main wizard component ─────────────────────────────────────────────────────
function SetupKeysContent() {
  const navigate = useNavigate();
  // addNew=true when reached via the workspace picker's "Add new workspace" button.
  const { addNew } = useSearch({ from: '/setup/keys' });

  useModalKeys(addNew ? () => void navigate({ to: '/' }) : undefined);

  const [state, setState] = useState<WizardState>({
    step: 1,
    email: '',
    googleId: '',
    nickname: '',
    passphrase: '',
    recoveryWords: [],
    workspaceId: null,
  });

  const [step1Loading, setStep1Loading] = useState(false);
  const [step1Error, setStep1Error] = useState('');

  // Step 3 passphrase fields
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [passphraseError, setPassphraseError] = useState('');
  const [step3Loading, setStep3Loading] = useState(false);

  // Step 4 acknowledge
  const [acknowledged, setAcknowledged] = useState(false);

  // Step 5 / finish
  const [finishLoading, setFinishLoading] = useState(false);
  const [finishError, setFinishError] = useState('');

  // Nickname validation
  const nicknameValid = state.nickname.length >= 4 && state.nickname.length <= 64;

  // Passphrase strength
  const passStrength = state.passphrase.length > 0 ? zxcvbn(state.passphrase).score : 0;
  const passphraseOk =
    state.passphrase.length >= 12 && passStrength >= 3 && state.passphrase === confirmPassphrase;

  // ── Handlers ────────────────────────────────────────────────────────────────

  async function handleGoogleSignIn() {
    setStep1Loading(true);
    setStep1Error('');
    try {
      const cap = await window.soam.bindCapability('platform.auth', '1.0');
      try {
        const result = (await cap.call('signInWithGoogle')) as
          | { ok: true; email: string; googleId: string }
          | { ok: false; code: string; message?: string };
        if (result.ok) {
          setState((s) => ({ ...s, email: result.email, googleId: result.googleId, step: 2 }));
          return;
        }
        setStep1Error(result.message ?? `Sign-in failed (${result.code}).`);
      } finally {
        cap.dispose();
      }
    } catch (err) {
      setStep1Error(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setStep1Loading(false);
    }
  }

  async function handlePassphraseNext() {
    if (!passphraseOk) return;
    if (state.passphrase !== confirmPassphrase) {
      setPassphraseError('Passphrases do not match.');
      return;
    }
    setStep3Loading(true);
    setPassphraseError('');
    try {
      // Create workspace, set active, generate recovery code
      const createRes = await window.soam.workspace.create({
        nickname: state.nickname,
        email: state.email,
      });
      if (!createRes.ok) {
        setPassphraseError(
          createRes.code === 'invalid-nickname'
            ? 'Nickname is invalid (4-64 chars).'
            : 'Invalid email address.',
        );
        return;
      }
      const { workspaceId } = createRes;

      const setActiveRes = await window.soam.workspace.setActive(workspaceId);
      if (!setActiveRes.ok) {
        setPassphraseError('Failed to activate account. Please try again.');
        return;
      }

      const genRes = await window.soam.setup.generate({ passphrase: state.passphrase });
      if (!genRes.ok) {
        setPassphraseError(
          genRes.code === 'no-active-workspace'
            ? 'No active account. Please restart setup.'
            : 'Setup already complete. Please restart.',
        );
        return;
      }

      setState((s) => ({
        ...s,
        workspaceId,
        recoveryWords: genRes.recoveryCode,
        step: 4,
      }));
    } catch (err) {
      setPassphraseError(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setStep3Loading(false);
    }
  }

  async function handleFinish() {
    setFinishLoading(true);
    setFinishError('');
    try {
      const res = await window.soam.setup.acknowledge({
        identity: {
          email: state.email,
          ...(state.googleId ? { googleId: state.googleId } : {}),
        },
      });
      if (res.ok) {
        await navigate({ to: '/' });
        return;
      }
      if (res.code === 'expired') {
        // 10-min TTL expired — must re-run from step 3 (re-generate produces
        // a fresh KEK + fresh recovery code; the workspace dir already exists).
        setFinishError(
          'Setup session expired (10-minute limit). Please set your passphrase again.',
        );
        setState((s) => ({ ...s, recoveryWords: [], step: 3 }));
        setConfirmPassphrase('');
        return;
      }
      setFinishError(`Setup error: ${res.code}. Please try again.`);
    } catch (err) {
      setFinishError(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setFinishLoading(false);
    }
  }

  async function handleRetryGenerate() {
    // Re-run generate from step 3 after a TTL expiry
    if (!state.passphrase) return;
    setStep3Loading(true);
    setFinishError('');
    try {
      const genRes = await window.soam.setup.generate({ passphrase: state.passphrase });
      if (!genRes.ok) {
        setFinishError('Could not restart setup. Please reload the app.');
        return;
      }
      setState((s) => ({ ...s, recoveryWords: genRes.recoveryCode, step: 4 }));
    } finally {
      setStep3Loading(false);
    }
  }

  async function handleCopyRecovery() {
    try {
      await navigator.clipboard.writeText(state.recoveryWords.join(' '));
    } catch {
      // clipboard API may be blocked; fail silently
    }
  }

  function handleDownloadRecovery() {
    const blob = new Blob([state.recoveryWords.join(' ')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ru-soam-recovery.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Step renderers ───────────────────────────────────────────────────────────

  function renderStep1() {
    return (
      <div className="setup-step">
        <h1 className="t-h2 font-display">{addNew ? 'Add a new account' : 'Welcome to Ru-Soam'}</h1>
        <p className="t-description max-w-[48ch]">
          {addNew
            ? 'Sign in to create an additional account. Your data stays on this device — encrypted end-to-end by a passphrase only you hold.'
            : 'Create your secure account. Your data stays on this device — encrypted end-to-end by a passphrase only you hold.'}
        </p>
        <button
          className="btn-google setup-btn-google"
          onClick={() => void handleGoogleSignIn()}
          disabled={step1Loading}
        >
          <GoogleMark size={18} />
          {step1Loading ? 'Signing in…' : 'Continue with Google'}
        </button>
        {step1Error && (
          <p className="text-xs text-error m-0 flex items-center gap-1.5">{step1Error}</p>
        )}
        {addNew && (
          // <div className="setup-actions border-2">
          <Button variant="ghost" onClick={() => void navigate({ to: '/' })}>
            Cancel
          </Button>
          // </div>
        )}
      </div>
    );
  }

  function renderStep2() {
    return (
      <div className="setup-step">
        <h1 className="t-h2 font-display">Choose a nickname</h1>
        <p className="t-description max-w-[48ch]">
          This is a local label for this account. It is not shared with anyone.
        </p>
        <FormField
          label="Nickname"
          htmlFor="nickname"
          error={state.nickname.length > 0 && !nicknameValid ? 'Nickname must be 4-64 characters.' : null}
        >
          <TextInput
            id="nickname"
            type="text"
            value={state.nickname}
            onChange={(e) => setState((s) => ({ ...s, nickname: e.target.value }))}
            maxLength={64}
            placeholder="e.g. My Practice"
            autoFocus
          />
        </FormField>
        <div className="setup-actions">
          <Button variant="ghost" onClick={() => setState((s) => ({ ...s, step: 1 }))}>
            <Icon name="arrow-left" size={14} /> Back
          </Button>
          {addNew && (
            <Button
              variant="ghost"
              onClick={() => void navigate({ to: '/' })}
            >
              Cancel
            </Button>
          )}
          <Button
            variant="primary"
            onClick={() => setState((s) => ({ ...s, step: 3 }))}
            disabled={!nicknameValid}
          >
            Next step <Icon name="arrow-right" size={14} />
          </Button>
        </div>
      </div>
    );
  }

  function renderStep3() {
    const lengthOk = state.passphrase.length >= 12;
    const scoreOk = passStrength >= 3;

    return (
      <div className="setup-step">
        <h1 className="t-h2 font-display">Set your passphrase</h1>
        <p className="t-description max-w-[48ch]">
          This passphrase encrypts all your data locally. Minimum 12 characters; strength 3/4
          required.
        </p>

        <FormField label="Passphrase" htmlFor="passphrase">
          <PasswordInput
            id="passphrase"
            value={state.passphrase}
            onChange={(v) => {
              setState((s) => ({ ...s, passphrase: v }));
              setPassphraseError('');
            }}
            autoFocus
            autoComplete="new-password"
          />
        </FormField>

        {state.passphrase.length > 0 && <StrengthMeter score={passStrength} />}

        {state.passphrase.length > 0 && !lengthOk && (
          <p className="text-xs text-error m-0 flex items-center gap-1.5">Passphrase must be at least 12 characters.</p>
        )}
        {state.passphrase.length >= 12 && !scoreOk && (
          <p className="text-xs text-error m-0 flex items-center gap-1.5">
            Passphrase is too weak. Please choose something harder to guess.
          </p>
        )}

        <FormField label="Confirm passphrase" htmlFor="confirm-passphrase" className="mt-4">
          <PasswordInput
            id="confirm-passphrase"
            value={confirmPassphrase}
            onChange={(v) => {
              setConfirmPassphrase(v);
              setPassphraseError('');
            }}
            autoComplete="new-password"
          />
        </FormField>

        {confirmPassphrase.length > 0 && state.passphrase !== confirmPassphrase && (
          <p className="text-xs text-error m-0 flex items-center gap-1.5">Passphrases do not match.</p>
        )}
        {passphraseError && <p className="text-xs text-error m-0 flex items-center gap-1.5">{passphraseError}</p>}

        <div className="setup-actions">
          <Button
            variant="ghost"
            onClick={() => setState((s) => ({ ...s, step: 2 }))}
            disabled={step3Loading}
          >
            <Icon name="arrow-left" size={14} /> Back
          </Button>
          {addNew && (
            <Button
              variant="ghost"
              onClick={() => void navigate({ to: '/' })}
              disabled={step3Loading}
            >
              Cancel
            </Button>
          )}
          <Button
            variant="primary"
            onClick={handlePassphraseNext}
            disabled={!passphraseOk || step3Loading}
          >
            {step3Loading ? (
              'Working…'
            ) : (
              <>
                Next step <Icon name="arrow-right" size={14} />
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  function renderStep4() {
    return (
      <div className="setup-step">
        <h1 className="t-h2 font-display">Save your recovery code</h1>

        <div className="recovery" role="group" aria-labelledby="rec-warn">
          <div className="recovery-banner">
            <span className="ico">
              <Icon name="shield" size={16} />
            </span>
            <div>
              <span id="rec-warn" className="recovery-banner-title">
                Sensitive · Write down once
              </span>
              <span className="recovery-banner-body">
                These 12 words are the <strong>only</strong> way to recover this account. Anyone
                with them can decrypt every note. Store them offline — never in email, screenshots,
                or chat.
              </span>
            </div>
          </div>
          <div className="recovery-grid">
            {state.recoveryWords.map((word, i) => (
              <div key={i} className="recovery-word">
                <span className="recovery-index">{String(i + 1).padStart(2, '0')}</span>
                <span className="recovery-text">{word}</span>
              </div>
            ))}
          </div>
          <div className="recovery-footer">
            <span className="recovery-footnote">
              12 words · BIP-39 word list · case-insensitive on entry
            </span>
            <div className="recovery-actions">
              <button className="recovery-btn" onClick={handleCopyRecovery}>
                <Icon name="copy" size={13} /> Copy
              </button>
              <button className="recovery-btn" onClick={handleDownloadRecovery}>
                <Icon name="cloud-download" size={13} /> Download .txt
              </button>
            </div>
          </div>
        </div>

        <label className="setup-checkbox-label">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
          />
          I have recorded these words. I understand they are the only way to recover access if I
          forget my passphrase or lose this device.
        </label>

        <div className="setup-actions">
          <Button
            variant="primary"
            onClick={() => setState((s) => ({ ...s, step: 5 }))}
            disabled={!acknowledged}
          >
            Continue <Icon name="arrow-right" size={14} />
          </Button>
        </div>
      </div>
    );
  }

  function renderStep5() {
    return (
      <div className="setup-step">
        <div className="setup-finish-mark">
          <Icon name="check" size={42} />
        </div>
        <h1 className="setup-finish-title">Setup complete</h1>
        <p className="setup-finish-desc">
          Your account <strong>{state.nickname || 'Practice'}</strong> is ready. Everything you
          write here is encrypted on this device and never leaves it without your passphrase.
        </p>
        {finishError && <p className="text-xs text-error m-0 flex items-center gap-1.5">{finishError}</p>}
        <div className="setup-actions justify-center">
          {finishError && finishError.includes('expired') && (
            <Button
              variant="ghost"
              onClick={handleRetryGenerate}
              disabled={step3Loading}
            >
              Restart passphrase step
            </Button>
          )}
          <Button variant="primary" onClick={handleFinish} disabled={finishLoading}>
            {finishLoading ? (
              'Finishing…'
            ) : (
              <>
                Open account <Icon name="arrow-right" size={14} />
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <PageShell
      topbar={
        <>
          <Wordmark />
          <button className="setup-help-btn" aria-label="Help">
            <Icon name="help" size={18} />
          </button>
        </>
      }
    >
      <main className="setup-main">
        <div className="setup-container">
          <ProgressRail step={state.step} />

          <div className="setup-content">
            {state.step === 1 && renderStep1()}
            {state.step === 2 && renderStep2()}
            {state.step === 3 && renderStep3()}
            {state.step === 4 && renderStep4()}
            {state.step === 5 && renderStep5()}
          </div>

          <div className="setup-trust">
            <div className="setup-trust-badge">
              <span className="ico">
                <Icon name="shield-check" size={18} />
              </span>
              <span>
                <strong>End-to-end encrypted.</strong> Your notes never leave this device
                unencrypted.
              </span>
            </div>
            <div className="setup-trust-badge">
              <span className="ico">
                <Icon name="lock" size={18} />
              </span>
              <span>
                <strong>Zero-knowledge.</strong> Only your passphrase can unlock your account.
              </span>
            </div>
          </div>
        </div>
      </main>

      <div className="setup-foot">
        Ru-Soam · <strong>local-first clinical practice.</strong> Your data stays on this device.
      </div>
    </PageShell>
  );
}
