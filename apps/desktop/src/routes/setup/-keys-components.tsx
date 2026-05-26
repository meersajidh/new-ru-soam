/**
 * Sub-components for the /setup/keys wizard.
 * Extracted to satisfy the react-refresh/only-export-components rule:
 * the keys.tsx file exports a non-component `Route` object, so all
 * co-located components must live in a separate module.
 */

import './-keys-components.css';
import { Check } from 'lucide-react';
import { STEPS, STEP_HEADLINES } from './-keys-constants';

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

