import { createContext, useContext, type ReactNode } from 'react';
import type { ServiceRegistry } from './registry';
import type { ServiceId } from './service-id';

const RegistryContext = createContext<ServiceRegistry | null>(null);

export function ServiceRegistryProvider({
  registry,
  children,
}: {
  registry: ServiceRegistry;
  children: ReactNode;
}) {
  return <RegistryContext.Provider value={registry}>{children}</RegistryContext.Provider>;
}

export function useService<T>(id: ServiceId<T>): T {
  const registry = useContext(RegistryContext);
  if (!registry) throw new Error('useService used outside ServiceRegistryProvider');
  return registry.get(id);
}
