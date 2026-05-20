/**
 * Sub-components for the /setup/keys wizard.
 * Extracted to satisfy the react-refresh/only-export-components rule:
 * the keys.tsx file exports a non-component `Route` object, so all
 * co-located components must live in a separate module.
 */

import './-keys-components.css';
import { useState, useEffect, useRef } from 'react';
import { Check } from 'lucide-react';
import { generateMockGoogleId } from '../../platform/auth/mock-oauth';
import GoogleMark from '../../platform/auth/GoogleMark';
import { STEPS, STEP_HEADLINES } from './-keys-constants';
import { useModalKeys } from '../../platform/hooks/useModalKeys';
import { Button } from '../../platform/ui/Button';
import { TextInput } from '../../platform/ui/TextInput';
import { FormField } from '../../platform/ui/FormField';
import { Dialog } from '../../platform/ui/Dialog';

export { STEPS, STEP_HEADLINES };

export function ProgressRail({ step }: { step: number }) {
  return (
    <div className="setup-progress" role="group" aria-label="Setup progress">
      <div className="progress-eyebrow">
        <span>Setup progress</span>
        <span className="progress-counter">
          Step{' '}
          <span className="now">{String(step).padStart(2, '0')}</span>
          <span className="sep">/</span>
          <span className="total">{String(STEPS.length).padStart(2, '0')}</span>
        </span>
      </div>
      <div className="progress-rail" aria-hidden="true">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const cls = n < step ? 'setup-seg--done' : n === step ? 'setup-seg--active' : '';
          return <div key={label} className={`setup-seg ${cls}`} />;
        })}
      </div>
      <div className="setup-steps">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const cls = n < step ? 'step--done' : n === step ? 'step--active' : '';
          return (
            <div
              key={label}
              className={`step ${cls}`}
              aria-current={n === step ? 'step' : undefined}
            >
              <div className="step-node">
                {n < step ? (
                  <Check size={13} strokeWidth={3} />
                ) : (
                  String(n).padStart(2, '0')
                )}
              </div>
              <span className="step-label">{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Mock OAuth Modal ──────────────────────────────────────────────────────────

export function MockOAuthModal({
  onSuccess,
  onCancel,
}: {
  onSuccess: (email: string, googleId: string) => void;
  onCancel: () => void;
}) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useModalKeys(onCancel);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!/.+@.+\..+/.test(trimmed)) {
      setError('Please enter a valid email address.');
      return;
    }
    onSuccess(trimmed, generateMockGoogleId());
  }

  return (
    <Dialog open={true} onClose={onCancel} width={360} aria-labelledby="mock-oauth-title">
      <div className="setup-modal-header">
        <GoogleMark size={32} />
        <h2 id="mock-oauth-title" className="setup-modal-title">
          Sign in with Google
        </h2>
        <p className="setup-modal-subtitle">
          (mock — real OAuth lands in a future release)
        </p>
      </div>
      <form onSubmit={handleSubmit} className="setup-modal-form">
        <FormField label="Email address" htmlFor="mock-email" error={error || null}>
          <TextInput
            id="mock-email"
            ref={inputRef}
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError('');
            }}
            placeholder="you@example.com"
            autoComplete="email"
          />
        </FormField>
        <div className="setup-modal-actions">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" variant="primary">
            Sign in
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
