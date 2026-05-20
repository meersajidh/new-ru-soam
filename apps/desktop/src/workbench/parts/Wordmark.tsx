import './Wordmark.css';

/**
 * Ru-Soam wordmark — display-family text + glowing dash separator.
 * Used by the setup ceremony and the workspace picker.
 */
interface WordmarkProps {
  variant?: 'inline' | 'display';
}

export default function Wordmark({ variant = 'inline' }: WordmarkProps = {}) {
  const className = `setup-wordmark${variant === 'display' ? ' setup-wordmark--display' : ''}`;

  return (
    <div className={className} aria-label="Ru-Soam">
      <span>Ru</span>
      <span className="dash" aria-hidden="true" />
      <span className="soam">Soam</span>
    </div>
  );
}
