import './Wordmark.css';

/**
 * Ru-Soam wordmark — display-family text + glowing dash separator.
 * Used by the setup ceremony and the workspace picker.
 */
export default function Wordmark() {
  return (
    <div className="setup-wordmark" aria-label="Ru-Soam">
      <span>Ru</span>
      <span className="dash" aria-hidden="true" />
      <span className="soam">Soam</span>
    </div>
  );
}
