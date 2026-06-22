import './Panel.css';
import { useEffect, useMemo } from 'react';
import {
  useContextKey,
  useContextVersion,
  useLayoutSizes,
  usePanelViews,
  useActivePanelViewId,
  useService,
} from '../../platform/services/hooks';
import { ContextKeyServiceId, ContributionServiceId, LayoutServiceId } from '../../platform/services/ids';
import { SlotId } from '../../platform/layout/slots';
import { Icon } from '../../platform/icons/Icon';
import BundleViewIframe from './BundleViewIframe';
import ResizeHandle from './ResizeHandle';

const MIN_HEIGHT = 120;

/**
 * Panel Part (ADR-408).
 *
 * Renders a tab strip from contributed panel.views filtered by their `when`
 * clause. Active tab mounts its view as a BundleViewIframe. Keyed by view id
 * (stable); entity id pushed via `context` postMessage, no remount on client switch.
 *
 * Panel does NOT auto-open itself — it only renders when the user has made
 * it visible (showPanel gate in Middle). Toggle via platform commands
 * (workbench.panel.toggle) or the status bar / keybinding system.
 */
export default function Panel() {
  const { panelHeight } = useLayoutSizes();
  const maxHeight = typeof window !== 'undefined' ? Math.floor(window.innerHeight * 0.6) : 600;

  const panelViews = usePanelViews();
  const ctxSvc = useService(ContextKeyServiceId);
  const contributions = useService(ContributionServiceId);
  const layout = useService(LayoutServiceId);

  // Reactive id read — useContextKey stores value in React state (compiler-safe).
  const activeId = (useContextKey('record.activeId') as string | undefined) ?? '';

  // useContextVersion increments on any context change; explicit useMemo with
  // ctxVersion in deps forces re-evaluation of when-clauses despite React Compiler
  // memoizing ctxSvc.evaluate (stable ref). Sanctioned exception to no-pre-memoize.
  const ctxVersion = useContextVersion();

  // Filter to qualifying views.
  const qualifying = useMemo(
    () => panelViews.filter((v) => !v.when || ctxSvc.evaluate(v.when)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ctxVersion is load-bearing: forces useMemo invalidation on context change (React Compiler safety; see hooks.ts useContextVersion)
    [panelViews, ctxSvc, ctxVersion],
  );

  // Managed active panel tab id (from ContributionService).
  const managedActiveId = useActivePanelViewId();

  // Compute effective active tab: managed id if it's still qualifying, else
  // default to first qualifying view.
  const effectiveActiveId: string | null = (() => {
    if (qualifying.length === 0) return null;
    if (managedActiveId && qualifying.some((v) => v.id === managedActiveId)) {
      return managedActiveId;
    }
    return qualifying[0]?.id ?? null;
  })();

  // When the effective active id differs from managed (e.g. after a context
  // change dropped the old tab), sync back so ContributionService stays current.
  useEffect(() => {
    if (effectiveActiveId !== managedActiveId) {
      contributions.setActivePanelViewId(effectiveActiveId);
    }
  }, [effectiveActiveId, managedActiveId, contributions]);

  const activeView = qualifying.find((v) => v.id === effectiveActiveId) ?? null;
  // Stable resource — no ?id= suffix. entityId travels out-of-band via context message.
  const resource = activeView?.viewUrl ?? null;

  if (qualifying.length === 0) {
    return (
      <div
        className="part-panel"
        aria-label="Panel"
        style={{ height: panelHeight, flex: '0 0 auto' }}
      >
        <p className="panel-empty-state">No panel views</p>
        <ResizeHandle
          sizeKey="panelHeight"
          axis="vertical"
          sign={-1}
          min={MIN_HEIGHT}
          max={maxHeight}
          edge="top"
        />
      </div>
    );
  }

  return (
    <div
      className="part-panel"
      aria-label="Panel"
      style={{ height: panelHeight, flex: '0 0 auto' }}
    >
      <div className="panel-tab-strip" role="tablist">
        {qualifying.map((v) => (
          <button
            key={v.id}
            role="tab"
            aria-selected={v.id === effectiveActiveId}
            className={'panel-tab' + (v.id === effectiveActiveId ? ' is-active' : '')}
            onClick={() => contributions.setActivePanelViewId(v.id)}
            type="button"
          >
            {v.title}
          </button>
        ))}
        <button
          type="button"
          className="panel-close-btn"
          title="Hide panel"
          aria-label="Hide panel"
          onClick={() => layout.setVisibility(SlotId.Panel, false)}
        >
          <Icon name="close" size={13} />
        </button>
      </div>
      <div className="panel-view-host">
        {resource && activeView && (
          <BundleViewIframe
            key={activeView.id}
            resource={resource}
            instanceId={activeView.id}
            entityId={activeId || null}
          />
        )}
      </div>
      <ResizeHandle
        sizeKey="panelHeight"
        axis="vertical"
        sign={-1}
        min={MIN_HEIGHT}
        max={maxHeight}
        edge="top"
      />
    </div>
  );
}
