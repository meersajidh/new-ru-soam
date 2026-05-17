import { useState, useEffect } from 'react';
import { RouterProvider } from '@tanstack/react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient, router } from './provider';
import { ServiceRegistryProvider } from './platform/services/context';
import { boot } from './workbench/boot';

export default function App() {
  const [registry] = useState(() => boot());

  useEffect(() => {
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__soamRegistry = registry;
    }
  }, [registry]);

  return (
    <ServiceRegistryProvider registry={registry}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} context={{ queryClient }} />
      </QueryClientProvider>
    </ServiceRegistryProvider>
  );
}
