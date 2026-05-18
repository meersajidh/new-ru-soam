import { type ReactNode } from 'react';
import '../styles/workbench.css';
import TitleBar from './parts/TitleBar';
import Banner from './parts/Banner';
import Middle from './middle/Middle';
import StatusBar from './parts/StatusBar';
import CommandPalette from './command-palette/CommandPalette';
import UserAvatar from './middle/UserAvatar';
import PrefsDevPanel from './middle/PrefsDevPanel';
import { useContextKey, useService } from '../platform/services/hooks';
import { ContextKeyServiceId } from '../platform/services/ids';

interface WorkbenchProps {
  /**
   * When provided, replaces the entire Middle slot (editor area) with
   * this node. Used by PreWorkspaceRoute to inject UnlockGate.
   */
  renderMiddleOverride?: ReactNode;
}

export default function Workbench({ renderMiddleOverride }: WorkbenchProps = {}) {
  const ctxSvc = useService(ContextKeyServiceId);
  const prefsOpen = useContextKey('developer.prefs.open') === true;
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
      {prefsOpen && (
        <PrefsDevPanel onClose={() => ctxSvc.set('developer.prefs.open', false)} />
      )}
    </div>
  );
}
