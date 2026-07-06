/**
 * LayoutResizeHandle — app-side binding of the pure `ResizeHandle` primitive
 * (`@basebench/ui`, ADR-420 D3) to LayoutService + persisted prefs.
 *
 * Keeps the same public prop API the old app-local ResizeHandle exposed
 * (`sizeKey`/`axis`/`sign`/`min`/`max`/`edge`) so Parts change only the
 * import + component name.
 */

import { ResizeHandle } from '@basebench/ui';
import { useService } from '../../platform/services/hooks';
import { LayoutServiceId } from '../../platform/services/ids';
import type { LayoutSizes } from '../../platform/layout/layout-service';
import { LAYOUT_SIZE_DEFAULTS } from '../../platform/layout/layout-service';

interface LayoutResizeHandleProps {
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

function persist(sizeKey: keyof LayoutSizes, size: number) {
  void window.soam.bindCapability('prefs', '1.0').then((proxy) => {
    const key = PERSIST_KEY_MAP[sizeKey];
    void proxy.call('set', key, String(size)).then(() => {
      proxy.dispose();
    });
  });
}

export default function LayoutResizeHandle({
  sizeKey,
  axis,
  sign = 1,
  min,
  max,
  edge,
}: LayoutResizeHandleProps) {
  const layout = useService(LayoutServiceId);

  return (
    <ResizeHandle
      axis={axis}
      sign={sign}
      min={min}
      max={max}
      edge={edge}
      getSize={() => layout.getSizes()[sizeKey]}
      onResize={(size) => layout.setSize(sizeKey, size)}
      onResizeEnd={(size) => persist(sizeKey, size)}
      onReset={() => {
        layout.setSize(sizeKey, LAYOUT_SIZE_DEFAULTS[sizeKey]);
        persist(sizeKey, LAYOUT_SIZE_DEFAULTS[sizeKey]);
      }}
    />
  );
}
