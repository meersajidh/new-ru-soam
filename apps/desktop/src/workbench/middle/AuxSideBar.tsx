import { useMemo } from 'react';
import './AuxSideBar.css';
import {
  useAspectFocus,
  useAuxViewContainers,
  useContextKey,
  useContextVersion,
  useLayoutSizes,
  useService,
} from '../../platform/services/hooks';
import { ContextKeyServiceId } from '../../platform/services/ids';
import BundleViewIframe from './BundleViewIframe';
import ResizeHandle from './ResizeHandle';

const MIN_WIDTH = 180;
const MAX_WIDTH = 480;

/**
 * Auxiliary Side Bar (ADR-402/407).
 *
 * Renders the first auxiliary view container whose `when` clause evaluates true.
 * Visibility is controlled by Middle's useAuxSideBarController — this component
 * only mounts when showAux is true, so it need not manage its own visibility.
 *
 * Entity binding: reads `record.activeId` (generic key, set by domain bootstrap)
 * and passes it as `entityId` prop to BundleViewIframe. The iframe src stays
 * stable (no `?id=` suffix); the id is pushed via a `context` postMessage so
 * the view re-renders in place with no remount on client switch.
 */
export default function AuxSideBar() {
  const { auxSideBarWidth } = useLayoutSizes();
  const auxContainers = useAuxViewContainers();
  const ctxSvc = useService(ContextKeyServiceId);
  const focus = useAspectFocus();

  // Reactive id read — useContextKey stores value in React state (compiler-safe).
  const activeId = (useContextKey('record.activeId') as string | undefined) ?? '';

  // useContextVersion increments on any context change; explicit useMemo with
  // ctxVersion in deps forces re-evaluation of when-clauses despite React Compiler
  // memoizing ctxSvc.evaluate (stable ref). Sanctioned exception to no-pre-memoize.
  const ctxVersion = useContextVersion();
  const active = useMemo(
    () => auxContainers.find((c) => !c.when || ctxSvc.evaluate(c.when)) ?? null,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ctxVersion is load-bearing: forces useMemo invalidation on context change (React Compiler safety; see hooks.ts useContextVersion)
    [auxContainers, ctxSvc, ctxVersion],
  );

  // Stable resource — no ?id= suffix. entityId travels out-of-band via context message.
  const resource = active?.viewUrl ?? null;

  if (resource && active) {
    return (
      <div
        className="part-sidebar part-sidebar-aux"
        aria-label="Auxiliary Side Bar"
        style={{ width: auxSideBarWidth, flex: '0 0 auto' }}
      >
        <div className="sidebar-view-host">
          <BundleViewIframe
            key={active.id}
            resource={resource}
            instanceId={active.id}
            entityId={activeId || null}
            focusSection={focus?.sectionId}
            focusNonce={focus?.nonce}
          />
        </div>
        <ResizeHandle
          sizeKey="auxSideBarWidth"
          axis="horizontal"
          sign={-1}
          min={MIN_WIDTH}
          max={MAX_WIDTH}
          edge="left"
        />
      </div>
    );
  }

  return (
    <div
      className="part-sidebar part-sidebar-aux"
      aria-label="Auxiliary Side Bar"
      style={{ width: auxSideBarWidth, flex: '0 0 auto' }}
    >
      <p className="sidebar-empty-state">No views</p>
      <ResizeHandle
        sizeKey="auxSideBarWidth"
        axis="horizontal"
        sign={-1}
        min={MIN_WIDTH}
        max={MAX_WIDTH}
        edge="left"
      />
    </div>
  );
}
