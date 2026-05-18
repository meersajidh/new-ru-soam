/**
 * Sub-components for the /setup/keys wizard.
 * Extracted to satisfy the react-refresh/only-export-components rule:
 * the keys.tsx file exports a non-component `Route` object, so all
 * co-located components must live in a separate module.
 */

import { useState, useEffect, useRef } from 'react';
import { generateMockGoogleId } from '../../platform/auth/mock-oauth';

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

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') onCancel();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!/.+@.+\..+/.test(trimmed)) {
      setError('Please enter a valid email address.');
      return;
    }
    onSuccess(trimmed, generateMockGoogleId());
  }

  return (
    <div
      className="setup-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mock-oauth-title"
      onKeyDown={handleKeyDown}
    >
      <div className="setup-modal-card">
        <div className="setup-modal-header">
          <div className="google-logo" aria-hidden="true">G</div>
          <h2 id="mock-oauth-title" className="setup-modal-title">
            Sign in with Google
          </h2>
          <p className="setup-modal-subtitle">
            (mock — real OAuth lands in a future release)
          </p>
        </div>
        <form onSubmit={handleSubmit} className="setup-modal-form">
          <label htmlFor="mock-email" className="setup-label">
            Email address
          </label>
          <input
            id="mock-email"
            ref={inputRef}
            type="email"
            className="setup-input"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(''); }}
            placeholder="you@example.com"
            autoComplete="email"
          />
          {error && <p className="setup-error">{error}</p>}
          <div className="setup-modal-actions">
            <button type="button" className="setup-btn-ghost" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="setup-btn-primary">
              Sign in
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


