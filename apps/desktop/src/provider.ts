import { QueryClient } from '@tanstack/react-query';
import { createRouter, createHashHistory } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
    },
  },
});

export const router = createRouter({
  routeTree,
  history: createHashHistory(),
  context: { queryClient },
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
