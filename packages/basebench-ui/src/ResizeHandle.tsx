/**
 * ResizeHandle — thin drag strip for resizable panels/sidebars.
 *
 * Pure primitive (ADR-420 D3): callers supply the current size (`getSize`)
 * and receive resize callbacks (`onResize`/`onResizeEnd`/`onReset`); this
 * component owns no app state — no service lookups, no persistence.
 *
 * Attaches document mousemove/mouseup listeners on drag start and cleans up
 * on mouseup or unmount (disposable pattern). Sets user-select:none on body
 * during drag to prevent text selection. Double-click resets to default.
 */

import './ResizeHandle.css';
import { useRef, useEffect } from 'react';

export interface ResizeHandleProps {
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
  /** Read the current size at drag start. */
  getSize: () => number;
  /** Called (rAF-throttled) with the clamped size during drag. */
  onResize: (size: number) => void;
  /** Called with the final clamped size on mouseup — use to persist. */
  onResizeEnd?: (size: number) => void;
  /** Called on double-click — use to reset to a default size. */
  onReset?: () => void;
}

export function ResizeHandle({
  axis,
  sign = 1,
  min,
  max,
  edge,
  getSize,
  onResize,
  onResizeEnd,
  onReset,
}: ResizeHandleProps) {
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
    const startSize = getSize();

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
            onResize(pendingSize);
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
        onResize(pendingSize);
      }
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      shield.remove();
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      cleanupRef.current = null;
      // Persist final size
      onResizeEnd?.(pendingSize ?? startSize);
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
    onReset?.();
  }

  return (
    <div
      className={`resize-handle resize-handle--${edge}`}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      role="separator"
      aria-orientation={axis === 'horizontal' ? 'vertical' : 'horizontal'}
      title="Drag to resize. Double-click to reset."
    >
      <span className="resize-handle__grip" aria-hidden="true" />
    </div>
  );
}
