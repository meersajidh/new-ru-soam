import { useState, useEffect } from 'react';
import { RouterProvider } from '@tanstack/react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient, router } from './provider';
import { ServiceRegistryProvider } from './platform/services/context';
import { boot } from './workbench/boot';
import { mountStoreEventsBridge } from './platform/data/store-events-bridge';

export default function App() {
  const [registry] = useState(() => boot());

  useEffect(() => {
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__soamRegistry = registry;
    }
  }, [registry]);

  // Phase 10a: Local Store change-event → TanStack Query invalidation bridge.
  // Mounted alongside the existing service registry (no extra Provider tree).
  useEffect(() => {
    const dispose = mountStoreEventsBridge(queryClient);
    return dispose;
  }, []);

  return (
    <ServiceRegistryProvider registry={registry}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} context={{ queryClient }} />
      </QueryClientProvider>
    </ServiceRegistryProvider>
  );
}
