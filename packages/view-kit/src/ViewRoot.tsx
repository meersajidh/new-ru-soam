import { type ReactNode, useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ViewContext } from './hooks.js';

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
 *
 * Theme CSS vars are applied by the injected bridge before <body> is parsed;
 * ViewRoot does NOT re-apply them — just let Tailwind / CSS read the vars.
 */
export function ViewRoot({ children, queryClient }: ViewRootProps) {
  const [bridgeReady, setBridgeReady] = useState(false);
  const [entityId, setEntityId] = useState<string | undefined>(undefined);

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

      // Seed entityId from the bridge's buffered context. The initial 'context'
      // message can be delivered (and its DOMContentLoaded replay fired) BEFORE
      // this effect attaches the window listener below — so for a view that
      // mounts with an entity already active (e.g. a panel/aux contextual view),
      // the live listener alone would miss it. Reading the buffer covers that.
      const buffered = view.currentContext?.();
      if (buffered) {
        setEntityId(typeof buffered.entityId === 'string' ? buffered.entityId : undefined);
      }

      // Invalidate all queries whenever the protected store changes.
      const sub = view.events.onStoreChange(() => {
        void qc.invalidateQueries();
      });
      cleanups.push(() => sub.dispose());
    });

    // Listen for 'context' messages from the parent renderer.
    // The bridge buffers the last 'context' and replays it on DOMContentLoaded,
    // so this listener will always catch the initial entity id even when added
    // after the first push.
    const handleMessage = (e: MessageEvent) => {
      const d: unknown = e.data;
      if (!d || typeof d !== 'object') return;
      const msg = d as Record<string, unknown>;
      if (msg.__soamView !== true || msg.kind !== 'context') return;
      setEntityId(typeof msg.entityId === 'string' ? msg.entityId : undefined);
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
      <ViewContext.Provider value={{ entityId }}>{children}</ViewContext.Provider>
    </QueryClientProvider>
  );
}
