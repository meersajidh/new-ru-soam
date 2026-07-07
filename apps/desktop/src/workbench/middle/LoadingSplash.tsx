import './LoadingSplash.css';
import BridgeMark from '../parts/BridgeMark';
import Wordmark from '../parts/Wordmark';
import { useService } from '../../platform/services/hooks';
import { ProductConfigServiceId } from '../../platform/services/ids';

interface LoadingSplashProps {
  embedded?: boolean;
}

export default function LoadingSplash({ embedded = false }: LoadingSplashProps) {
  const productConfig = useService(ProductConfigServiceId);
  const { tagline } = productConfig.get();
  return (
    <div
      className={`loading-splash${embedded ? ' loading-splash--embedded' : ''}`}
      role="status"
      aria-live="polite"
      aria-label="Loading account"
    >
      {/* eslint-disable-next-line no-restricted-syntax -- decorative catenary-arc background, not an icon */}
      <svg
        className="loading-splash__background"
        viewBox="0 0 1280 800"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <path d="M0 610 Q 640 400 1280 610" />
        <path d="M0 690 Q 640 500 1280 690" opacity="0.65" />
        <path d="M120 470 V690 M1160 470 V690" />
      </svg>

      <div className="loading-splash__content">
        <div className="loading-splash__mark" aria-hidden="true">
          <BridgeMark size={72} />
        </div>

        <Wordmark variant="display" />

        {tagline && <div className="loading-splash__subtitle">{tagline}</div>}

        <div className="loading-splash__rail" aria-hidden="true">
          <div className="loading-splash__rail-fill" />
        </div>

        <div className="loading-splash__status">Suspending your account…</div>
      </div>
    </div>
  );
}
