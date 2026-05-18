/**
 * Shared zxcvbn passphrase strength meter.
 * Used by the setup wizard (/setup/keys) and UnlockGate.
 *
 * CSS classes (.strength-meter, .strength-bars, .strength-bar, .strength-label)
 * are defined in styles/setup.css.
 */

export default function StrengthMeter({ score }: { score: number }) {
  const labels = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'];
  const colors = [
    'var(--color-error)',
    'var(--color-warning)',
    'var(--color-warning)',
    'var(--color-success)',
    'var(--color-success)',
  ];
  return (
    <div className="strength-meter" aria-label={`Passphrase strength: ${labels[score]}`}>
      <div className="strength-bars">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="strength-bar"
            style={{
              background: i < score ? colors[score - 1] : 'var(--color-border)',
            }}
          />
        ))}
      </div>
      <span
        className="strength-label"
        style={{ color: score > 0 ? colors[score - 1] : 'var(--color-fg-muted)' }}
      >
        {labels[score]}
      </span>
    </div>
  );
}
