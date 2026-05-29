/**
 * ResizeHandle — thin drag strip for resizable workbench Parts.
 *
 * Attaches document mousemove/mouseup listeners on drag start and cleans up on
 * mouseup or unmount (disposable pattern). Sets user-select:none on body during
 * drag to prevent text selection. Double-click resets to the default size.
 */

import './ResizeHandle.css';
import { useRef, useEffect } from 'react';
import { useService } from '../../platform/services/hooks';
import { LayoutServiceId } from '../../platform/services/ids';
import type { LayoutSizes } from '../../platform/layout/layout-service';
import { LAYOUT_SIZE_DEFAULTS } from '../../platform/layout/layout-service';

interface ResizeHandleProps {
  /** Which size dimension this handle controls. */
  sizeKey: keyof LayoutSizes;
  /** Drag axis. */
  axis: 'horizontal' | 'vertical';
  /**
   * Sign of the delta: +1 means dragging right/down increases size,
   * -1 means dragging right/down decreases size (aux sidebar left-edge drag).
   */
  sign?: 1 | -1;
  min: number;
  max: number;
  /** Position on the part: 'right' | 'left' | 'top'. */
  edge: 'right' | 'left' | 'top';
}

const PERSIST_KEY_MAP: Record<keyof LayoutSizes, string> = {
  primarySideBarWidth: 'workbench.layout.primarySideBarWidth',
  auxSideBarWidth: 'workbench.layout.auxSideBarWidth',
  panelHeight: 'workbench.layout.panelHeight',
};

export default function ResizeHandle({
  sizeKey,
  axis,
  sign = 1,
  min,
  max,
  edge,
}: ResizeHandleProps) {
  const layout = useService(LayoutServiceId);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Clean up listeners on unmount
  useEffect(() => {
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, []);

  function handleMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    const startCoord = axis === 'horizontal' ? e.clientX : e.clientY;
    const startSize = layout.getSizes()[sizeKey];

    document.body.style.userSelect = 'none';
    const cursor = axis === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.cursor = cursor;

    // Drag shield: full-viewport overlay above all iframes. Without it, the
    // cursor passing over a bundle iframe mid-drag swallows the parent
    // document's mousemove (narrowing the Primary Side Bar over the roster
    // iframe stalled). The shield keeps mouse events flowing to document.
    const shield = document.createElement('div');
    shield.style.cssText = `position:fixed;inset:0;z-index:99999;cursor:${cursor};`;
    document.body.appendChild(shield);

    let rafId: number | null = null;
    let pendingSize: number | null = null;

    const onMouseMove = (ev: MouseEvent) => {
      const coord = axis === 'horizontal' ? ev.clientX : ev.clientY;
      const delta = (coord - startCoord) * sign;
      pendingSize = Math.min(max, Math.max(min, startSize + delta));

      if (rafId === null) {
        rafId = requestAnimationFrame(() => {
          rafId = null;
          if (pendingSize !== null) {
            layout.setSize(sizeKey, pendingSize);
          }
        });
      }
    };

    const onMouseUp = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      // Flush final size if pending
      if (pendingSize !== null) {
        layout.setSize(sizeKey, pendingSize);
      }
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      shield.remove();
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      cleanupRef.current = null;
      // Persist final size
      void window.soam.bindCapability('prefs', '1.0').then((proxy) => {
        const key = PERSIST_KEY_MAP[sizeKey];
        void proxy.call('set', key, String(layout.getSizes()[sizeKey])).then(() => {
          proxy.dispose();
        });
      });
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    cleanupRef.current = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      shield.remove();
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }

  function handleDoubleClick() {
    layout.setSize(sizeKey, LAYOUT_SIZE_DEFAULTS[sizeKey]);
    // Persist reset
    void window.soam.bindCapability('prefs', '1.0').then((proxy) => {
      const key = PERSIST_KEY_MAP[sizeKey];
      void proxy.call('set', key, String(LAYOUT_SIZE_DEFAULTS[sizeKey])).then(() => {
        proxy.dispose();
      });
    });
  }

  return (
    <div
      className={`resize-handle resize-handle--${edge}`}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      role="separator"
      aria-orientation={axis === 'horizontal' ? 'vertical' : 'horizontal'}
      title="Drag to resize. Double-click to reset."
    />
  );
}
