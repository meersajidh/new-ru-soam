import { useState, useEffect, useRef, type ReactNode } from 'react';
import type { SoamCapabilityProxy } from '../../../electron/preload/soam';

interface TitleBarProps {
  /**
   * Optional slot for the user-avatar dropdown (Phase 9b).
   * Rendered between the drag region and the window controls.
   */
  avatarSlot?: ReactNode;
}

export default function TitleBar({ avatarSlot }: TitleBarProps = {}) {
  const [maximized, setMaximized] = useState(false);
  const proxy = useRef<SoamCapabilityProxy | null>(null);

  useEffect(() => {
    void window.soam.bindCapability('platform.window', '1.0').then(async (p) => {
      proxy.current = p;
      setMaximized((await p.call('isMaximized')) as boolean);
    });

    return window.soam.events.on((event) => {
      if (event.name === 'window.maximized') setMaximized(event.payload as boolean);
    });
  }, []);

  return (
    <div className="part-titlebar">
      <div className="titlebar-drag-region">
        <span className="titlebar-name">Ru-Soam</span>
      </div>
      {avatarSlot != null && (
        <div className="titlebar-avatar-slot">
          {avatarSlot}
        </div>
      )}
      <div className="titlebar-controls">
        <button
          className="titlebar-btn"
          onClick={() => void proxy.current?.call('minimize')}
          aria-label="Minimize"
        >
          &#x2212;
        </button>
        <button
          className="titlebar-btn"
          onClick={() => void proxy.current?.call('toggleMaximize')}
          aria-label={maximized ? 'Restore' : 'Maximize'}
        >
          {maximized ? '⧉' : '□'}
        </button>
        <button
          className="titlebar-btn titlebar-btn-close"
          onClick={() => void proxy.current?.call('close')}
          aria-label="Close"
        >
          &#x2715;
        </button>
      </div>
    </div>
  );
}
