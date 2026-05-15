import { useState, useEffect } from 'react';
import '../styles/workbench.css';
import { ServiceRegistryProvider } from '../platform/services/context';
import { LayoutServiceId } from '../platform/services/ids';
import { installBasicShortcuts } from '../platform/keybindings/basic-shortcuts';
import { boot } from './boot';
import TitleBar from './parts/TitleBar';
import Banner from './parts/Banner';
import Middle from './middle/Middle';
import StatusBar from './parts/StatusBar';

export default function Workbench() {
  const [registry] = useState(() => boot());
  const layout = registry.get(LayoutServiceId);

  useEffect(() => {
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__soamRegistry = registry;
    }
    return installBasicShortcuts(layout);
  }, [registry, layout]);

  return (
    <ServiceRegistryProvider registry={registry}>
      <div className="workbench">
        <TitleBar />
        <Banner />
        <Middle />
        <StatusBar />
      </div>
    </ServiceRegistryProvider>
  );
}
