import { type ReactNode, useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ViewContext,
  ChannelContext,
  CHANNEL_NAMES,
  CHANNEL_KIND_PAYLOAD,
  type ChannelStore,
  type ViewChannelName,
} from './hooks.js';

interface ViewRootProps {
  children: ReactNode;
  /**
   * Optional pre-built QueryClient. Provide one if you need custom defaultOptions
   * or devtools integration. When omitted, a shared default client is used.
   */
  queryClient?: QueryClient;
}

/** Shared default — created once at module load; consumers may override via prop. */
const defaultQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

/**
 * Mandatory root wrapper for all React bundle views (ADR-419).
 *
 * Responsibilities:
 *   1. Awaits `window.__viewBoot.awaitBridge()` before rendering children
 *      (renders null while the bridge is initialising).
 *   2. Provides a QueryClient via QueryClientProvider.
 *   3. Subscribes to `soamView.events.onStoreChange` → invalidates all queries
 *      so views automatically refetch when protected-store rows change.
 *   4. Listens for 'context' window messages and provides the current entity id
 *      to descendants via useViewContext().
 *   5. Maintains a channel store seeded from init + context payloads and updated
 *      by dedicated channel messages; provides via useViewChannel().
 *
 * Theme CSS vars are applied by the injected bridge before <body> is parsed;
 * ViewRoot does NOT re-apply them — just let Tailwind / CSS read the vars.
 */
export function ViewRoot({ children, queryClient }: ViewRootProps) {
  const [bridgeReady, setBridgeReady] = useState(false);
  const [entityId, setEntityId] = useState<string | undefined>(undefined);
  const [channelStore, setChannelStore] = useState<ChannelStore>({});

  // Stable QueryClient reference for the lifetime of this root.
  const qcRef = useRef<QueryClient>(queryClient ?? defaultQueryClient);
  const qc = qcRef.current;

  useEffect(() => {
    let cancelled = false;
    const cleanups: Array<() => void> = [];

    // Wait for the bridge 'init' handshake before rendering children.
    void window.__viewBoot.awaitBridge().then((view) => {
      if (cancelled) return;
      setBridgeReady(true);

      // Seed channel store from the buffered 'init' payload. The parent may
      // inject schedule-specific channel values (scheduleViewState, scheduleCounts,
      // etc.) as extra fields on the 'init' message. By the time awaitBridge()
      // resolves, the 'init' message has already been processed, so reading
      // initPayload() here is reliable. This seeds channels that arrive only
      // once at init time and are never re-delivered via 'context'.
      const initMsg = view.initPayload?.() as Record<string, unknown> | null | undefined;
      if (initMsg) {
        const patch: ChannelStore = {};
        for (const name of CHANNEL_NAMES) {
          if (initMsg[name] !== undefined) patch[name] = initMsg[name];
        }
        if (Object.keys(patch).length > 0) {
          setChannelStore((prev) => ({ ...prev, ...patch }));
        }
      }

      // Seed entityId from the bridge's buffered context. The initial 'context'
      // message can be delivered (and its DOMContentLoaded replay fired) BEFORE
      // this effect attaches the window listener below — so for a view that
      // mounts with an entity already active (e.g. a panel/aux contextual view),
      // the live listener alone would miss it. Reading the buffer covers that.
      // Also seed any channel values co-delivered on the context message.
      const buffered = view.currentContext?.();
      if (buffered) {
        setEntityId(typeof buffered.entityId === 'string' ? buffered.entityId : undefined);
        const bufMsg = buffered as Record<string, unknown>;
        const patch: ChannelStore = {};
        for (const name of CHANNEL_NAMES) {
          if (bufMsg[name] !== undefined) patch[name] = bufMsg[name];
        }
        if (Object.keys(patch).length > 0) {
          setChannelStore((prev) => ({ ...prev, ...patch }));
        }
      }

      // Invalidate all queries whenever the protected store changes.
      const sub = view.events.onStoreChange(() => {
        void qc.invalidateQueries();
      });
      cleanups.push(() => sub.dispose());
    });

    // Listen for messages from the parent renderer.
    //
    // Handles three cases:
    //   1. kind:'context'  — update entityId + any co-delivered channel fields.
    //   2. kind:<ViewChannelName>  — dedicated channel push, update channel store.
    //      e.g. { __soamView:true, kind:'scheduleViewState', state:{...} }
    //
    // The bridge buffers 'context' and replays it on DOMContentLoaded, so this
    // listener will always catch the initial entity id even when added after the
    // first push (for vanilla views; React views also seed from the buffer above).
    const handleMessage = (e: MessageEvent) => {
      const d: unknown = e.data;
      if (!d || typeof d !== 'object') return;
      const msg = d as Record<string, unknown>;
      if (msg.__soamView !== true) return;

      if (msg.kind === 'context') {
        setEntityId(typeof msg.entityId === 'string' ? msg.entityId : undefined);
        // Also extract any channel fields co-delivered on the context message.
        const patch: ChannelStore = {};
        for (const name of CHANNEL_NAMES) {
          if (msg[name] !== undefined) patch[name] = msg[name];
        }
        if (Object.keys(patch).length > 0) {
          setChannelStore((prev) => ({ ...prev, ...patch }));
        }
      }

      // Dedicated channel message: kind matches a ViewChannelName.
      const kind = msg.kind as string;
      if (Object.prototype.hasOwnProperty.call(CHANNEL_KIND_PAYLOAD, kind)) {
        const payloadKey = CHANNEL_KIND_PAYLOAD[kind as ViewChannelName];
        if (msg[payloadKey] !== undefined) {
          setChannelStore((prev) => ({ ...prev, [kind]: msg[payloadKey] }));
        }
      }
    };

    window.addEventListener('message', handleMessage);
    cleanups.push(() => window.removeEventListener('message', handleMessage));

    return () => {
      cancelled = true;
      cleanups.forEach((fn) => fn());
    };
  }, [qc]);

  if (!bridgeReady) return null;

  return (
    <QueryClientProvider client={qc}>
      <ChannelContext.Provider value={channelStore}>
        <ViewContext.Provider value={{ entityId }}>{children}</ViewContext.Provider>
      </ChannelContext.Provider>
    </QueryClientProvider>
  );
}
