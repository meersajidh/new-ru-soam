import { Fragment, useEffect, useState } from 'react';
import {
  Icon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@basebench/ui';
import type { IMenuService, ResolvedMenuItem } from './menu-service';

/**
 * ContextMenu — a recipe over Base UI `DropdownMenu` (Menu) rendering the
 * menu-service's `ResolvedMenuItem[]` at programmatic {x,y} (ADR-421 F4 4e-ii,
 * replacing the hand-rolled usePopover engine).
 *
 * Base UI (modal Menu) provides for free: keyboard nav + type-ahead, submenu
 * flyouts (Sub/SubTrigger/SubContent), Esc/focus-restore, and — critically —
 * dismiss over bundle iframes (the modal backdrop intercepts the click before
 * the sandboxed iframe can swallow it; spike-verified). Coord anchoring uses a
 * virtual element on the Positioner.
 *
 * App-specific behaviour kept here: Alt-key alt-commands (O424) and the
 * radio/checkbox check glyphs (the menu-service supplies per-item `checked`).
 */

interface Props {
  items: ResolvedMenuItem[];
  x: number;
  y: number;
  onSelect: (item: ResolvedMenuItem, useAlt?: boolean) => void;
  onDismiss: () => void;
  /** MenuService — resolves submenu items. */
  menuSvc?: IMenuService;
  /** Args forwarded from the parent MenuActionContext (unused here — onSelect
   *  routes through MenuHost which already carries them). Kept for API compat. */
  ctxArgs?: unknown[];
}

function virtualAnchor(x: number, y: number) {
  return { getBoundingClientRect: () => new DOMRect(x, y, 0, 0) };
}

/** Leading check/radio glyph column (fixed width aligns labels). */
function CheckGlyph({ item }: { item: ResolvedMenuItem }) {
  const isRadio = Boolean(item.radioGroup);
  return (
    <span className="flex w-3.5 shrink-0 items-center justify-center" aria-hidden="true">
      {isRadio ? (
        item.checked ? (
          <Icon name="circle-dot" size={12} />
        ) : (
          <Icon name="circle-large-outline" size={12} />
        )
      ) : (
        item.checked && <Icon name="check" size={12} />
      )}
    </span>
  );
}

export default function ContextMenu({ items, x, y, onSelect, onDismiss, menuSvc }: Props) {
  // O424 — Alt key tracking swaps item title/command while held.
  const [altHeld, setAltHeld] = useState(false);
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Alt') setAltHeld(true);
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.key === 'Alt') setAltHeld(false);
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  function renderItem(item: ResolvedMenuItem, idx: number) {
    const displayTitle =
      altHeld && item.altCommand && item.altTitle ? item.altTitle : item.title;
    const separator = item.firstInGroup && idx !== 0 ? <DropdownMenuSeparator /> : null;

    // Submenu → Sub / SubTrigger / SubContent (Base UI handles hover-open + nav).
    if (item.submenuId && menuSvc) {
      const subItems = menuSvc.getMenuItems(item.submenuId);
      return (
        <Fragment key={`${item.command}-${idx}`}>
          {separator}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger disabled={item.disabled}>
              <CheckGlyph item={item} />
              <span className="flex-1 truncate">{displayTitle}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {subItems.map((sub, subIdx) => renderItem(sub, subIdx))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </Fragment>
      );
    }

    // Leaf item.
    return (
      <Fragment key={`${item.command}-${idx}`}>
        {separator}
        <DropdownMenuItem
          disabled={item.disabled}
          onClick={() => onSelect(item, altHeld)}
        >
          <CheckGlyph item={item} />
          <span className="flex-1 truncate">{displayTitle}</span>
        </DropdownMenuItem>
      </Fragment>
    );
  }

  return (
    <DropdownMenu
      open
      onOpenChange={(o) => {
        if (!o) onDismiss();
      }}
    >
      <DropdownMenuContent
        anchor={virtualAnchor(x, y)}
        align="start"
        side="bottom"
        sideOffset={0}
        className="min-w-52"
        aria-label="Context menu"
      >
        {items.map((item, idx) => renderItem(item, idx))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
