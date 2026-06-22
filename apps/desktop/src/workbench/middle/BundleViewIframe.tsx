import { useEffect, useLayoutEffect, useRef } from 'react';
import { useService } from '../../platform/services/hooks';
import { ActiveEventServiceId, ContributionServiceId, EditorServiceId, FontServiceId, LayoutServiceId, MaturityHighlightServiceId, MenuServiceId, OverviewViewModeServiceId, ScheduleCountsServiceId, ScheduleRefreshSettingsServiceId, ScheduleViewStateServiceId, ThemeServiceId } from '../../platform/services/ids';
import { SlotId } from '../../platform/layout/slots';
import { aspectFocus } from '../../platform/views/aspect-focus';
import type { SoamCapabilityProxy } from '../../../electron/preload/soam';
import type { ScheduleViewState } from '../../platform/view-mode/schedule-view-state';
import type { ScheduleCounts } from '../../platform/view-mode/schedule-counts';
import type { ActiveEvent } from '../../platform/view-mode/active-event';

/**
 * Renderer relay for ADR-411 bundle views.
 *
 * Owns one sandboxed iframe whose `src` is a `view://` URL. The Main-side
 * protocol handler injects the bridge script; the bridge posts messages to
 * `window.parent`. This component is that parent for one iframe.
 *
 * Job (per ADR-411 §Communication discipline):
 *   - Forward `cap.call` payloads to Main via `window.soam.bindCapability`.
 *   - Send `init` + `activate` after `view.ready`; `deactivate` on unmount.
 *   - Push current theme CSS vars at init and on every theme/dark-mode change.
 *   - Handle outbound `request.close` / `request.focus`.
 *
 * The renderer does not interpret payloads — it forwards them. Policy
 * (capability auth, audit) lives in Main.
 *
 * Sandbox flags: `allow-scripts allow-forms`. Notably no `allow-same-origin`,
 * `allow-top-navigation`, or `allow-popups`. That, combined with the iframe's
 * `view://<bundleId>` origin, structurally blocks DOM reach into `app://` and
 * cross-bundle access.
 */
interface Props {
  readonly resource: string;
  readonly instanceId: string;
  readonly entityId?: string | null;
  readonly focusSection?: string;
  readonly focusNonce?: number;
  readonly onRequestClose?: () => void;
  readonly onRequestFocus?: () => void;
}

interface ViewMessage {
  readonly __soamView: true;
  readonly kind: string;
  readonly [key: string]: unknown;
}

function isViewMessage(data: unknown): data is ViewMessage {
  return !!data && typeof data === 'object' && (data as { __soamView?: unknown }).__soamView === true
    && typeof (data as { kind?: unknown }).kind === 'string';
}

export default function BundleViewIframe({ resource, instanceId, entityId, focusSection, focusNonce, onRequestClose, onRequestFocus }: Props) {
  const theme = useService(ThemeServiceId);
  const font = useService(FontServiceId);
  const editor = useService(EditorServiceId);
  const menu = useService(MenuServiceId);
  const maturity = useService(MaturityHighlightServiceId);
  const overviewViewMode = useService(OverviewViewModeServiceId);
  const scheduleViewState = useService(ScheduleViewStateServiceId);
  const scheduleCounts = useService(ScheduleCountsServiceId);
  const activeEvent = useService(ActiveEventServiceId);
  const scheduleRefreshSettings = useService(ScheduleRefreshSettingsServiceId);
  const contributions = useService(ContributionServiceId);
  const layout = useService(LayoutServiceId);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // Ref so the view.ready handler always sees the latest entityId without re-running main effect.
  const entityIdRef = useRef<string | null | undefined>(entityId);
  // Ref so the view.ready handler always sees the latest focusSection without re-running main effect.
  const focusSectionRef = useRef<string | undefined>(focusSection);
  // Track whether view.ready has been received (to guard the context push effect).
  const viewReadyRef = useRef(false);

  // Keep entityIdRef + focusSectionRef current without triggering re-render (safe: layout effect, not render).
  useLayoutEffect(() => {
    entityIdRef.current = entityId;
    focusSectionRef.current = focusSection;
  });

  // Main bridge effect — does NOT depend on entityId. Changing entityId must not re-handshake.
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    let disposed = false;
    let activated = false;
    viewReadyRef.current = false;
    const proxyCache = new Map<string, Promise<SoamCapabilityProxy>>();

    const post = (msg: unknown) => {
      iframe.contentWindow?.postMessage(msg, '*');
    };

    const getProxy = (
      name: string,
      version: string,
      expectKind?: 'command' | 'query',
    ): Promise<SoamCapabilityProxy> => {
      // Include expectKind in the key so command/query/unclassified proxies never collide.
      const key = `${name}@${version}${expectKind !== undefined ? `#${expectKind}` : ''}`;
      let p = proxyCache.get(key);
      if (!p) {
        if (expectKind === 'query') {
          p = window.soam.bindQuery(name, version);
        } else if (expectKind === 'command') {
          p = window.soam.bindCommand(name, version);
        } else {
          p = window.soam.bindCapability(name, version);
        }
        proxyCache.set(key, p);
      }
      return p;
    };

    // Appearance snapshot = theme colours + active font-set vars, merged onto
    // the one bridge channel (the bridge applies any CSS var generically). Font
    // sets ride the same path as theme/dark-mode — they are just more CSS vars.
    // maturityHighlight is pushed alongside — view-bridge.ts applies it to body.classList.
    const appearance = () => ({ ...theme.getTokenSnapshot(), ...font.getFontSnapshot() });
    const pushTheme = () =>
      post({
        __soamView: true,
        kind: 'theme',
        theme: appearance(),
        maturityHighlight: maturity.isEnabled(),
      });

    const onMessage = async (e: MessageEvent) => {
      if (disposed) return;
      if (e.source !== iframe.contentWindow) return;
      if (!isViewMessage(e.data)) return;
      const m = e.data;

      switch (m.kind) {
        case 'view.ready': {
          viewReadyRef.current = true;
          clearTimeout(readyTimeout);
          post({ __soamView: true, kind: 'init', theme: appearance(), maturityHighlight: maturity.isEnabled(), overviewViewMode: overviewViewMode.getMode(), scheduleViewState: scheduleViewState.getState(), scheduleCounts: scheduleCounts.getCounts(), activeEvent: activeEvent.getActiveEvent(), scheduleRefreshSettings: scheduleRefreshSettings.getSettings(), auxVisible: layout.isVisible(SlotId.AuxSideBar) });
          if (!activated) {
            activated = true;
            // Include entityId in activate payload so view gets it on first load.
            post({ __soamView: true, kind: 'activate', entityId: entityIdRef.current ?? null });
          }
          // Push initial context message with current entityId.
          // Include overviewViewMode here (not just init) because this context message is
          // replayed on DOMContentLoaded by the bridge — large docs whose listener registers
          // after init fires would otherwise silently revert to the default mode.
          post({ __soamView: true, kind: 'context', entityId: entityIdRef.current ?? null, overviewViewMode: overviewViewMode.getMode(), scheduleViewState: scheduleViewState.getState(), scheduleCounts: scheduleCounts.getCounts(), activeEvent: activeEvent.getActiveEvent(), scheduleRefreshSettings: scheduleRefreshSettings.getSettings(), auxVisible: layout.isVisible(SlotId.AuxSideBar) });
          // If a focus request is already pending (e.g. aspects iframe freshly mounted after
          // "Open record" set patient.activeId for the first time), deliver it now.
          if (focusSectionRef.current) {
            post({ __soamView: true, kind: 'focusAspect', sectionId: focusSectionRef.current });
          }
          break;
        }
        case 'cap.call': {
          const requestId = m.requestId as number;
          const capability = m.capability as string;
          const version = m.version as string;
          const method = m.method as string;
          const args = (m.args as ReadonlyArray<unknown>) ?? [];
          const expectKind = m.expectKind as 'command' | 'query' | undefined;
          try {
            const proxy = await getProxy(capability, version, expectKind);
            const data = await proxy.call(method, ...args);
            post({ __soamView: true, kind: 'cap.response', requestId, ok: true, data });
          } catch (err) {
            const code = (err as { code?: string } | null)?.code ?? 'cap.handler_threw';
            const message = err instanceof Error ? err.message : String(err);
            post({
              __soamView: true,
              kind: 'cap.response',
              requestId,
              ok: false,
              error: { code, message },
            });
          }
          break;
        }
        case 'request.openEditor': {
          const viewId = m.viewId as string;
          const query = m.query as string | undefined;
          const title = m.title as string | undefined;
          const incomingEntityId = m.entityId as string | null | undefined;
          const incomingPreview = m.preview as boolean | undefined;
          try {
            const bundleId = (typeof m.targetBundleId === 'string' && m.targetBundleId) || new URL(resource).hostname;
            const viewsProxy = await getProxy('platform.views', '1.0');
            const result = await viewsProxy.call('resolve', bundleId, viewId) as { found: boolean; url?: string };
            if (result.found && result.url) {
              // Entity views: use stable url (no ?id=). Non-entity views keep query append.
              const finalUrl = result.url + (query ? '?' + query : '');
              editor.open(finalUrl, {
                title: title ?? viewId,
                ...(incomingEntityId !== undefined ? { entityId: incomingEntityId } : {}),
                ...(incomingPreview !== undefined ? { preview: incomingPreview } : {}),
              });
            } else {
              console.error('[BundleViewIframe] request.openEditor: view not found', bundleId, viewId);
            }
          } catch (err) {
            console.error('[BundleViewIframe] request.openEditor failed:', err);
          }
          break;
        }
        case 'keydown': {
          window.dispatchEvent(new KeyboardEvent('keydown', {
            key: m.key as string,
            ctrlKey: !!m.ctrlKey,
            metaKey: !!m.metaKey,
            altKey: !!m.altKey,
            shiftKey: !!m.shiftKey,
            bubbles: true,
            cancelable: true,
          }));
          break;
        }
        case 'request.close': {
          if (onRequestClose) {
            onRequestClose();
          } else {
            editor.close(instanceId);
          }
          break;
        }
        case 'request.focus': {
          if (onRequestFocus) {
            onRequestFocus();
          } else {
            iframe.focus();
          }
          break;
        }
        case 'request.contextMenu': {
          const menuId = m.menuId as string;
          const vx = m.x as number;
          const vy = m.y as number;
          const context = m.context;
          const rawOverrides = m.contextOverrides;
          const bundleId = new URL(resource).hostname;
          if (!menuId.startsWith(bundleId + '/')) {
            console.warn('[BundleViewIframe] rejected out-of-scope contextMenu menuId:', menuId);
            break;
          }
          const rect = iframe.getBoundingClientRect();
          const x = rect.left + vx;
          const y = rect.top + vy;
          // Validate contextOverrides: plain object with string/number/boolean values only.
          let safeOverrides: Record<string, string | number | boolean> | undefined;
          if (rawOverrides !== null && typeof rawOverrides === 'object' && !Array.isArray(rawOverrides)) {
            const candidate = rawOverrides as Record<string, unknown>;
            const valid = Object.keys(candidate).every(
              (k) => typeof candidate[k] === 'string' || typeof candidate[k] === 'number' || typeof candidate[k] === 'boolean',
            );
            if (valid) safeOverrides = candidate as Record<string, string | number | boolean>;
          }
          menu.showContextMenu({ menuId, anchor: { x, y }, ctx: { args: [context], ...(safeOverrides !== undefined ? { contextOverrides: safeOverrides } : {}) } });
          break;
        }
        case 'request.setOverviewViewMode': {
          overviewViewMode.setMode(m.mode as 'dense' | 'focused' | 'timeline');
          break;
        }
        case 'request.setScheduleViewState': {
          scheduleViewState.setState(m.state as ScheduleViewState);
          break;
        }
        case 'request.setScheduleCounts': {
          scheduleCounts.setCounts(m.counts as ScheduleCounts);
          break;
        }
        case 'request.bumpScheduleData': {
          // An iframe (e.g. Sessions needs-linking triage) mutated roster/link state
          // that affects Schedule classification. Bump calRev so an open schedule
          // calendar + aux event-detail re-classify on current in-memory events.
          scheduleViewState.bumpCalRev();
          break;
        }
        case 'request.setActiveEvent': {
          const ev = (m.event as ActiveEvent | null | undefined) ?? null;
          activeEvent.setActiveEvent(ev);
          // When an event is selected and the aux sidebar is currently hidden, reveal it
          // so the user sees event-detail.html without a manual toggle.
          if (ev !== null && !layout.isVisible(SlotId.AuxSideBar)) {
            layout.setVisibility(SlotId.AuxSideBar, true);
          }
          break;
        }
        case 'request.openExternal': {
          if (typeof m.url !== 'string') break;
          window.soam.bindCapability('platform.shell', '1.0').then((cap) => {
            cap.call('openExternal', m.url).catch((err: unknown) => {
              console.error('[BundleViewIframe] openExternal failed:', err);
            }).finally(() => {
              cap.dispose();
            });
          }).catch((err: unknown) => {
            console.error('[BundleViewIframe] could not bind platform.shell for openExternal:', err);
          });
          break;
        }
        case 'request.openActivity': {
          if (typeof m.containerId !== 'string') break;
          contributions.setActiveContainerId(m.containerId);
          layout.setVisibility(SlotId.PrimarySideBar, true);
          break;
        }
        case 'request.setTabDescription': {
          editor.updateTab(instanceId, { description: m.text as string });
          break;
        }
        case 'request.focusAspect': {
          layout.setVisibility(SlotId.AuxSideBar, true);
          aspectFocus.request(m.sectionId as string);
          break;
        }
      }
    };

    window.addEventListener('message', onMessage);

    // Forward store.changed events from the renderer to the iframe.
    const offStoreEvents = window.soam.events.on((event) => {
      if (event.name === 'store.changed') {
        post({ __soamView: true, kind: 'store.changed', payload: event.payload });
      }
    });

    const readyTimeout = setTimeout(() => {
      if (!viewReadyRef.current && !disposed) {
        console.warn(
          '[BundleViewIframe]',
          resource,
          'did not post view.ready within 2000ms — bridge may be blocked (CSP regression, sandbox flag misconfiguration, or asset 404). See ADR-411 + O139.',
        );
      }
    }, 2000);
    const offTheme = theme.onThemeChange(() => requestAnimationFrame(pushTheme));
    const offDark = theme.onDarkModeChange(() => requestAnimationFrame(pushTheme));
    const offFont = font.onFontSetChange(() => requestAnimationFrame(pushTheme));
    const offMaturity = maturity.onDidChange(() => requestAnimationFrame(pushTheme));
    const offViewMode = overviewViewMode.onDidChange((mode) =>
      requestAnimationFrame(() => post({ __soamView: true, kind: 'overviewViewMode', mode })),
    );
    const offScheduleViewState = scheduleViewState.onDidChange((state) =>
      requestAnimationFrame(() => post({ __soamView: true, kind: 'scheduleViewState', state })),
    );
    const offScheduleCounts = scheduleCounts.onDidChange((counts) =>
      requestAnimationFrame(() => post({ __soamView: true, kind: 'scheduleCounts', counts })),
    );
    const offActiveEvent = activeEvent.onDidChange((event) =>
      requestAnimationFrame(() => post({ __soamView: true, kind: 'activeEvent', event })),
    );
    const offScheduleRefreshSettings = scheduleRefreshSettings.onDidChange((settings) =>
      requestAnimationFrame(() => post({ __soamView: true, kind: 'scheduleRefreshSettings', settings })),
    );
    const offLayoutVisibility = layout.onDidChangePartVisibility((slotId, visible) => {
      if (slotId === SlotId.AuxSideBar) {
        requestAnimationFrame(() => post({ __soamView: true, kind: 'auxVisible', visible }));
      }
    });

    return () => {
      disposed = true;
      clearTimeout(readyTimeout);
      if (activated) post({ __soamView: true, kind: 'deactivate' });
      window.removeEventListener('message', onMessage);
      offStoreEvents();
      offTheme();
      offDark();
      offFont();
      offMaturity();
      offViewMode();
      offScheduleViewState();
      offScheduleCounts();
      offActiveEvent();
      offScheduleRefreshSettings();
      offLayoutVisibility();
      for (const p of proxyCache.values()) {
        p.then((proxy) => proxy.dispose()).catch(() => undefined);
      }
      proxyCache.clear();
    };
  }, [resource, instanceId, theme, font, editor, menu, maturity, overviewViewMode, scheduleViewState, scheduleCounts, activeEvent, scheduleRefreshSettings, contributions, layout, onRequestClose, onRequestFocus]); // entityId intentionally excluded: handled by separate effect to avoid re-handshake

  // Separate effect: push context message when entityId changes while mounted.
  // Does NOT trigger re-handshake — only sends a lightweight context update.
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    if (!viewReadyRef.current) return; // guard: view not ready yet (main effect sends initial)
    iframe.contentWindow?.postMessage(
      { __soamView: true, kind: 'context', entityId: entityId ?? null },
      '*',
    );
  }, [entityId]);

  // Separate effect: re-fire focusAspect when nonce changes while already mounted+ready.
  // The view.ready handler covers the fresh-mount case; this covers the already-mounted case.
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    if (!viewReadyRef.current) return; // fresh mount handled by view.ready handler — no double-post
    if (!focusSection) return;
    iframe.contentWindow?.postMessage({ __soamView: true, kind: 'focusAspect', sectionId: focusSection }, '*');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nonce is the fire trigger; focusSection read intentionally
  }, [focusNonce]);

  return (
    <iframe
      ref={iframeRef}
      src={resource}
      sandbox="allow-scripts allow-forms"
      className="bundle-view-iframe"
      title={`bundle view: ${resource}`}
    />
  );
}
