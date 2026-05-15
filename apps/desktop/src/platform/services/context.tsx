import { type ReactNode } from 'react';
import type { ServiceRegistry } from './registry';
import { RegistryContext } from './ids';

export function ServiceRegistryProvider({
  registry,
  children,
}: {
  registry: ServiceRegistry;
  children: ReactNode;
}) {
  return <RegistryContext.Provider value={registry}>{children}</RegistryContext.Provider>;
}
