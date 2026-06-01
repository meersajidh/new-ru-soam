import './TitleBar.css';
import { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Search,
  ChevronDown,
  PanelLeft,
  PanelBottom,
  PanelRight,
  Minus,
  Square,
  X,
} from 'lucide-react';
import type { SoamCapabilityProxy } from '../../../electron/preload/soam';
import { useService, useLayoutVisible } from '../../platform/services/hooks';
import { CommandServiceId, ContextKeyServiceId, MenuServiceId } from '../../platform/services/ids';
import { SlotId } from '../../platform/layout/slots';
import BridgeMark from './BridgeMark';
import type { WorkbenchMode } from '../hooks/useWorkbenchMode';

const MENUS = ['File', 'Edit', 'View', 'Patient', 'Snippets', 'Window', 'Help'] as const;

interface TitleBarSections {
  menu: boolean;
  nav: boolean;
  quickOpen: boolean;
  panelToggles: boolean;
  divider: boolean;
}

const TITLEBAR_SECTIONS: Record<WorkbenchMode, TitleBarSections> = {
  setup: {
    menu: false,
    nav: false,
    quickOpen: false,
    panelToggles: false,
    divider: false,
  },
  locked: {
    menu: false,
    nav: false,
    quickOpen: false,
    panelToggles: false,
    divider: false,
  },
  workspace: {
    menu: true,
    nav: true,
    quickOpen: true,
    panelToggles: true,
    divider: true,
  },
};

interface TitleBarProps {
  variant?: WorkbenchMode;
  activeResource?: string;
}

export default function TitleBar({
  variant = 'workspace',
  activeResource = 'Open a file…',
}: TitleBarProps = {}) {
  const [maximized, setMaximized] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const proxy = useRef<SoamCapabilityProxy | null>(null);

  const commands = useService(CommandServiceId);
  const contextKeys = useService(ContextKeyServiceId);
  const menu = useService(MenuServiceId);
  const cfg = TITLEBAR_SECTIONS[variant];

  const primarySideBarVisible = useLayoutVisible(SlotId.PrimarySideBar);
  const panelVisible = useLayoutVisible(SlotId.Panel);
  const auxSideBarVisible = useLayoutVisible(SlotId.AuxSideBar);

  useEffect(() => {
    void window.soam.bindCapability('platform.window', '1.0').then(async (p) => {
      proxy.current = p;
      setMaximized((await p.call('isMaximized')) as boolean);
    });

    return window.soam.events.on((event) => {
      if (event.name === 'window.maximized') setMaximized(event.payload as boolean);
    });
  }, []);

  return (
    <div
      className="part-titlebar"
      onContextMenu={(e) => {
        e.preventDefault();
        menu.showContextMenu({ menuId: 'workbench/title/context', anchor: { x: e.clientX, y: e.clientY } });
      }}
    >
      {/* App icon — cane suspension bridge */}
      <div className="tb-app" title="Ru-Soam">
        <BridgeMark size={32} />
      </div>

      {/* Menu strip */}
      {cfg.menu && (
        <div className="tb-menu">
          {MENUS.map((m) => (
            <button
              key={m}
              className={`tb-menu-item${openMenu === m ? ' tb-menu-item--open' : ''}`}
              onClick={() => setOpenMenu(openMenu === m ? null : m)}
              aria-label={m}
            >
              {m}
            </button>
          ))}
        </div>
      )}

      {/* Drag region — left of nav */}
      <div className="titlebar-drag-region tb-flex" />

      {/* Back / forward */}
      {cfg.nav && (
        <div className="tb-nav">
          <button className="tb-icon-btn" aria-label="Go back" title="Back">
            <ArrowLeft size={14} />
          </button>
          <button className="tb-icon-btn" aria-label="Go forward" title="Forward" disabled>
            <ArrowRight size={14} />
          </button>
        </div>
      )}

      {/* Quick-open pill */}
      {cfg.quickOpen && (
        <button
          className="quick-open"
          onClick={() => contextKeys.set('commandPalette.open', true)}
          title="Quick open · ⌘P"
          aria-label="Quick open"
        >
          <span className="lead">
            <Search size={13} />
          </span>
          <span className="label">{activeResource}</span>
          <span className="meta">⌘P</span>
          <span className="trail">
            <ChevronDown size={12} />
          </span>
        </button>
      )}

      {/* Drag region — right of quick-open */}
      <div className="titlebar-drag-region tb-flex" />

      {/* Right cluster */}
      <div className="tb-right">
        {cfg.panelToggles && (
          <>
            <button
              className={`tb-icon-btn${primarySideBarVisible ? ' is-active' : ''}`}
              title="Toggle Primary Side Bar"
              aria-label="Toggle Primary Side Bar"
              aria-pressed={primarySideBarVisible}
              onClick={() => void commands.execute('workbench.togglePrimarySideBar')}
            >
              <PanelLeft size={14} />
            </button>
            <button
              className={`tb-icon-btn${panelVisible ? ' is-active' : ''}`}
              title="Toggle Panel"
              aria-label="Toggle Panel"
              aria-pressed={panelVisible}
              onClick={() => void commands.execute('workbench.togglePanel')}
            >
              <PanelBottom size={14} />
            </button>
            <button
              className={`tb-icon-btn${auxSideBarVisible ? ' is-active' : ''}`}
              title="Toggle Auxiliary Side Bar"
              aria-label="Toggle Auxiliary Side Bar"
              aria-pressed={auxSideBarVisible}
              onClick={() => void commands.execute('workbench.toggleAuxSideBar')}
            >
              <PanelRight size={14} />
            </button>
          </>
        )}
        {cfg.divider && <span className="tb-divider" aria-hidden="true" />}
        <div className="tb-win">
          <button
            className="tb-win-btn"
            aria-label="Minimize"
            onClick={() => void proxy.current?.call('minimize')}
          >
            <Minus size={12} />
          </button>
          <button
            className="tb-win-btn"
            aria-label={maximized ? 'Restore' : 'Maximize'}
            onClick={() => void proxy.current?.call('toggleMaximize')}
          >
            <Square size={10} />
          </button>
          <button
            className="tb-win-btn tb-win-btn--close"
            aria-label="Close"
            onClick={() => void proxy.current?.call('close')}
          >
            <X size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}
