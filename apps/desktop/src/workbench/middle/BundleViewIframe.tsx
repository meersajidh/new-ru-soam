import { useEffect, useRef } from 'react';
import { useService } from '../../platform/services/hooks';
import { EditorServiceId, ThemeServiceId } from '../../platform/services/ids';
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

export default function BundleViewIframe({ resource, instanceId }: Props) {
  const theme = useService(ThemeServiceId);
  const editor = useService(EditorServiceId);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    let disposed = false;
    let activated = false;
    let viewReady = false;
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

    const pushTheme = () => post({ __soamView: true, kind: 'theme', theme: theme.getTokenSnapshot() });

    const onMessage = async (e: MessageEvent) => {
      if (disposed) return;
      if (e.source !== iframe.contentWindow) return;
      if (!isViewMessage(e.data)) return;
      const m = e.data;

      switch (m.kind) {
        case 'view.ready': {
          viewReady = true;
          clearTimeout(readyTimeout);
          post({ __soamView: true, kind: 'init', theme: theme.getTokenSnapshot() });
          if (!activated) {
            activated = true;
            post({ __soamView: true, kind: 'activate' });
          }
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
        case 'request.close': {
          editor.close(instanceId);
          break;
        }
        case 'request.focus': {
          iframe.focus();
          break;
        }
      }
    };

    window.addEventListener('message', onMessage);
    const readyTimeout = setTimeout(() => {
      if (!viewReady && !disposed) {
        console.warn(
          '[BundleViewIframe]',
          resource,
          'did not post view.ready within 2000ms — bridge may be blocked (CSP regression, sandbox flag misconfiguration, or asset 404). See ADR-411 + O139.',
        );
      }
    }, 2000);
    const offTheme = theme.onThemeChange(() => requestAnimationFrame(pushTheme));
    const offDark = theme.onDarkModeChange(() => requestAnimationFrame(pushTheme));

    return () => {
      disposed = true;
      clearTimeout(readyTimeout);
      if (activated) post({ __soamView: true, kind: 'deactivate' });
      window.removeEventListener('message', onMessage);
      offTheme();
      offDark();
      for (const p of proxyCache.values()) {
        p.then((proxy) => proxy.dispose()).catch(() => undefined);
      }
      proxyCache.clear();
    };
  }, [resource, instanceId, theme, editor]);

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
