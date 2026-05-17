import { type ReactNode } from 'react';
import '../styles/workbench.css';
import TitleBar from './parts/TitleBar';
import Banner from './parts/Banner';
import Middle from './middle/Middle';
import StatusBar from './parts/StatusBar';
import CommandPalette from './command-palette/CommandPalette';
import UserAvatar from './middle/UserAvatar';

interface WorkbenchProps {
  /**
   * When provided, replaces the entire Middle slot (editor area) with
   * this node. Used by PreWorkspaceRoute to inject UnlockGate.
   */
  renderMiddleOverride?: ReactNode;
}

export default function Workbench({ renderMiddleOverride }: WorkbenchProps = {}) {
  return (
    <div className="workbench">
      <TitleBar avatarSlot={<UserAvatar />} />
      <Banner />
      {renderMiddleOverride != null ? (
        <div className="part-middle" style={{ alignItems: 'stretch' }}>
          {renderMiddleOverride}
        </div>
      ) : (
        <Middle />
      )}
      <StatusBar />
      <CommandPalette />
    </div>
  );
}
