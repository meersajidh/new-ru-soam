import { useEffect, useLayoutEffect, useRef } from 'react';
import { useService } from '../../platform/services/hooks';
import { EditorServiceId, FontServiceId, MenuServiceId, ThemeServiceId } from '../../platform/services/ids';
import type { SoamCapabilityProxy } from '../../../electron/preload/soam';

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

export default function BundleViewIframe({ resource, instanceId, entityId, onRequestClose, onRequestFocus }: Props) {
  const theme = useService(ThemeServiceId);
  const font = useService(FontServiceId);
  const editor = useService(EditorServiceId);
  const menu = useService(MenuServiceId);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // Ref so the view.ready handler always sees the latest entityId without re-running main effect.
  const entityIdRef = useRef<string | null | undefined>(entityId);
  // Track whether view.ready has been received (to guard the context push effect).
  const viewReadyRef = useRef(false);

  // Keep entityIdRef current without triggering re-render (safe: layout effect, not render).
  useLayoutEffect(() => {
    entityIdRef.current = entityId;
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

    const getProxy = (name: string, version: string): Promise<SoamCapabilityProxy> => {
      const key = `${name}@${version}`;
      let p = proxyCache.get(key);
      if (!p) {
        p = window.soam.bindCapability(name, version);
        proxyCache.set(key, p);
      }
      return p;
    };

    // Appearance snapshot = theme colours + active font-set vars, merged onto
    // the one bridge channel (the bridge applies any CSS var generically). Font
    // sets ride the same path as theme/dark-mode — they are just more CSS vars.
    const appearance = () => ({ ...theme.getTokenSnapshot(), ...font.getFontSnapshot() });
    const pushTheme = () => post({ __soamView: true, kind: 'theme', theme: appearance() });

    const onMessage = async (e: MessageEvent) => {
      if (disposed) return;
      if (e.source !== iframe.contentWindow) return;
      if (!isViewMessage(e.data)) return;
      const m = e.data;

      switch (m.kind) {
        case 'view.ready': {
          viewReadyRef.current = true;
          clearTimeout(readyTimeout);
          post({ __soamView: true, kind: 'init', theme: appearance() });
          if (!activated) {
            activated = true;
            // Include entityId in activate payload so view gets it on first load.
            post({ __soamView: true, kind: 'activate', entityId: entityIdRef.current ?? null });
          }
          // Push initial context message with current entityId.
          post({ __soamView: true, kind: 'context', entityId: entityIdRef.current ?? null });
          break;
        }
        case 'cap.call': {
          const requestId = m.requestId as number;
          const capability = m.capability as string;
          const version = m.version as string;
          const method = m.method as string;
          const args = (m.args as ReadonlyArray<unknown>) ?? [];
          try {
            const proxy = await getProxy(capability, version);
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
            const bundleId = new URL(resource).hostname;
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
          const bundleId = new URL(resource).hostname;
          if (!menuId.startsWith(bundleId + '/')) {
            console.warn('[BundleViewIframe] rejected out-of-scope contextMenu menuId:', menuId);
            break;
          }
          const rect = iframe.getBoundingClientRect();
          const x = rect.left + vx;
          const y = rect.top + vy;
          menu.showContextMenu({ menuId, anchor: { x, y }, ctx: { args: [context] } });
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

    return () => {
      disposed = true;
      clearTimeout(readyTimeout);
      if (activated) post({ __soamView: true, kind: 'deactivate' });
      window.removeEventListener('message', onMessage);
      offStoreEvents();
      offTheme();
      offDark();
      offFont();
      for (const p of proxyCache.values()) {
        p.then((proxy) => proxy.dispose()).catch(() => undefined);
      }
      proxyCache.clear();
    };
  }, [resource, instanceId, theme, font, editor, menu, onRequestClose, onRequestFocus]); // entityId intentionally excluded: handled by separate effect to avoid re-handshake

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
