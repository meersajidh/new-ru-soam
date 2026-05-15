import { useState, useEffect } from 'react';
import '../styles/workbench.css';
import { ServiceRegistryProvider } from '../platform/services/context';
import { boot } from './boot';
import TitleBar from './parts/TitleBar';
import Banner from './parts/Banner';
import Middle from './middle/Middle';
import StatusBar from './parts/StatusBar';
import CommandPalette from './command-palette/CommandPalette';

export default function Workbench() {
  const [registry] = useState(() => boot());

  useEffect(() => {
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__soamRegistry = registry;
    }
  }, [registry]);

  return (
    <ServiceRegistryProvider registry={registry}>
      <div className="workbench">
        <TitleBar />
        <Banner />
        <Middle />
        <StatusBar />
        <CommandPalette />
      </div>
    </ServiceRegistryProvider>
  );
}
