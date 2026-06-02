import { useState, useEffect } from 'react';
import { useService } from '../services/hooks';
import { MenuServiceId } from '../services/ids';
import type { OpenMenuState, ResolvedMenuItem } from './menu-service';
import ContextMenu from './ContextMenu';

/**
 * MenuHost — mounted once in Workbench.tsx.
 * Subscribes to MenuService open-state; renders the shell ContextMenu when
 * a menu is open; routes item selection and dismiss back to the service.
 */
export default function MenuHost() {
  const menuSvc = useService(MenuServiceId);
  const [openMenu, setOpenMenu] = useState<OpenMenuState | null>(() => menuSvc.getOpenMenu());

  useEffect(
    () => menuSvc.onDidChangeOpenMenu((state) => setOpenMenu(state)),
    [menuSvc],
  );

  if (!openMenu) return null;

  function handleSelect(item: ResolvedMenuItem, useAlt?: boolean) {
    void menuSvc.executeItem(item, openMenu?.args, useAlt);
  }

  function handleDismiss() {
    menuSvc.closeOpenMenu();
  }

  return (
    <ContextMenu
      items={openMenu.items}
      x={openMenu.x}
      y={openMenu.y}
      onSelect={handleSelect}
      onDismiss={handleDismiss}
      menuSvc={menuSvc}
      ctxArgs={openMenu.args}
    />
  );
}
