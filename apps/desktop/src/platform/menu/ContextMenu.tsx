import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../icons/Icon';
import type { IMenuService, ResolvedMenuItem } from './menu-service';
import { usePopover } from '../popover/use-popover';
import './ContextMenu.css';

interface Props {
  items: ResolvedMenuItem[];
  x: number;
  y: number;
  onSelect: (item: ResolvedMenuItem, useAlt?: boolean) => void;
  onDismiss: () => void;
  /** MenuService ref for resolving submenu items. */
  menuSvc?: IMenuService;
  /** Args forwarded from parent's MenuActionContext, for submenu item execution. */
  ctxArgs?: unknown[];
}

const MENU_WIDTH = 220;
const ITEM_HEIGHT = 28;
const SEPARATOR_HEIGHT = 9; // 1px rule + 0.25rem margin top/bottom (see ContextMenu.css)
const PADDING_V = 6;
/** Delay (ms) before opening a submenu on hover. */
const SUBMENU_OPEN_DELAY = 150;

export default function ContextMenu({
  items,
  x,
  y,
  onSelect,
  onDismiss,
  menuSvc,
  ctxArgs,
}: Props) {
  const menuRef = useRef<HTMLUListElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const [activeIdx, setActiveIdx] = useState<number>(-1);

  // ── O424: Alt key tracking ────────────────────────────────────────────────
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

  // ── O425: Submenu state ───────────────────────────────────────────────────
  /** Index of item whose submenu is currently open (-1 = none). */
  const [openSubmenuIdx, setOpenSubmenuIdx] = useState<number>(-1);
  const openSubmenuIdxRef = useRef<number>(-1);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    openSubmenuIdxRef.current = openSubmenuIdx;
  }, [openSubmenuIdx]);

  const clearHoverTimer = useCallback(() => {
    if (hoverTimerRef.current !== null) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);

  // Clean up hover timer on unmount (StrictMode-safe).
  useEffect(() => () => clearHoverTimer(), [clearHoverTimer]);

  const openSubmenuAt = useCallback((idx: number) => {
    clearHoverTimer();
    setOpenSubmenuIdx(idx);
  }, [clearHoverTimer]);

  const closeSubmenu = useCallback(() => {
    clearHoverTimer();
    setOpenSubmenuIdx(-1);
  }, [clearHoverTimer]);

  // ── Esc interception (must register BEFORE usePopover's Esc handler) ────
  // When a submenu flyout is open, Esc should close only the flyout.
  // usePopover registers its Esc handler in a useEffect, which fires in
  // declaration order — this effect is declared before usePopover(), so its
  // listener registers first at capture phase and fires first.
  // The handler always runs; it only acts when a submenu is actually open.
  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (openSubmenuIdxRef.current !== -1) {
        // Flyout is open — close only the flyout. usePopover's Esc handler is
        // registered on the SAME node (document) at the SAME phase (capture),
        // so stopPropagation() would NOT block it (only blocks other nodes).
        // stopImmediatePropagation() blocks later same-node listeners → the
        // whole menu stays open.
        e.preventDefault();
        e.stopImmediatePropagation();
        setOpenSubmenuIdx(-1);
      }
      // Otherwise, let usePopover handle Esc (closes the whole menu).
    }
    document.addEventListener('keydown', handleEsc, true);
    return () => document.removeEventListener('keydown', handleEsc, true);
  }, []);

  // ── Popover mechanics ─────────────────────────────────────────────────────
  const separatorCount = items.filter((it, i) => it.firstInGroup && i !== 0).length;
  const menuH = items.length * ITEM_HEIGHT + separatorCount * SEPARATOR_HEIGHT + PADDING_V * 2;

  const popover = usePopover({
    estimatedWidth: MENU_WIDTH,
    estimatedHeight: menuH,
    edgeMargin: 4,
    onClose: onDismiss,
  });

  // Wire menuRef into hook's element tracking via callback ref
  const setMenuRef = (el: HTMLUListElement | null) => {
    menuRef.current = el;
    popover.setPopoverElement(el);
  };

  // Open popover at coords once on mount; capture focus origin + move focus to menu.
  useEffect(() => {
    // Capture whatever has focus before the menu opens (may be the iframe element
    // in the parent document when raised from a sandboxed bundle view).
    restoreFocusRef.current = (document.activeElement as HTMLElement) ?? null;
    popover.open({ x, y });
    // Focus the menu root after the portal mounts + popover positions.
    // rAF ensures the element is laid out before focus().
    const raf = requestAnimationFrame(() => {
      menuRef.current?.focus();
    });
    return () => {
      cancelAnimationFrame(raf);
    };
    // Only run on mount — coords don't change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restore focus to the element that had it before the menu opened (e.g. the
  // sandboxed iframe, or a shell button). Runs on unmount regardless of dismiss
  // cause (Esc, outside-click, item select).
  useEffect(() => {
    return () => {
      try {
        restoreFocusRef.current?.focus?.();
      } catch {
        // Element may be gone (e.g. workspace switched). Safe to ignore.
      }
    };
  }, []);

  // ── Keyboard nav ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!popover.isOpen) return;
    function handle(e: KeyboardEvent) {
      // When a submenu is open, delegate navigation keys to the flyout's own
      // keydown handler. The flyout registers its listener after this one, so
      // we skip nav keys here — the flyout will handle them.
      const submenuActive = openSubmenuIdxRef.current !== -1;
      if (submenuActive && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter')) {
        return; // Let flyout handler run
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx((i) => (i + 1) % items.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx((i) => (i <= 0 ? items.length - 1 : i - 1));
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (activeIdx >= 0 && activeIdx < items.length) {
          const item = items[activeIdx];
          if (item.submenuId) {
            openSubmenuAt(activeIdx);
          }
        }
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        // Close any open submenu; focus returns to this menu
        closeSubmenu();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (activeIdx >= 0 && activeIdx < items.length) {
          const item = items[activeIdx];
          if (item.submenuId) {
            openSubmenuAt(activeIdx);
          } else {
            onSelect(item, altHeld);
          }
        }
        return;
      }
      // Type-ahead: skip when a modifier is held so chords don't leak in.
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const ch = e.key.toLowerCase();
        const start = activeIdx + 1;
        for (let offset = 0; offset < items.length; offset++) {
          const idx = (start + offset) % items.length;
          if (items[idx].title.toLowerCase().startsWith(ch)) {
            setActiveIdx(idx);
            return;
          }
        }
      }
    }
    document.addEventListener('keydown', handle, true);
    return () => document.removeEventListener('keydown', handle, true);
  }, [popover.isOpen, items, activeIdx, onSelect, altHeld, openSubmenuAt, closeSubmenu]);

  if (!popover.isOpen || !popover.position) return null;

  const { left, top } = popover.position;

  const menu = (
    <ul
      ref={setMenuRef}
      className="context-menu"
      role="menu"
      tabIndex={-1}
      style={{ left, top }}
      aria-label="Context menu"
      aria-activedescendant={activeIdx >= 0 ? `ctxmenu-item-${activeIdx}` : undefined}
    >
      {items.map((item, idx) => {
        // O424: while Alt held, show alt title if available
        const displayTitle = (altHeld && item.altCommand && item.altTitle) ? item.altTitle : item.title;
        const isSubmenuItem = Boolean(item.submenuId);
        const isRadio = Boolean(item.radioGroup);
        const submenuOpen = openSubmenuIdx === idx;

        // Determine role
        let role: 'menuitem' | 'menuitemcheckbox' | 'menuitemradio' = 'menuitem';
        if (isRadio) role = 'menuitemradio';
        else if (item.checked) role = 'menuitemcheckbox';

        return (
          <li
            key={`${item.command}-${idx}`}
            role="none"
            style={{ position: 'relative' }}
          >
            {item.firstInGroup && idx !== 0 && (
              <div className="context-menu__separator" role="separator" aria-hidden="true" />
            )}
            <button
              id={`ctxmenu-item-${idx}`}
              className={[
                'context-menu__item',
                item.disabled ? 'context-menu__item--disabled' : '',
                idx === activeIdx ? 'context-menu__item--active' : '',
                isSubmenuItem ? 'context-menu__item--has-submenu' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              role={role}
              aria-checked={
                (isRadio || role === 'menuitemcheckbox') ? item.checked : undefined
              }
              aria-haspopup={isSubmenuItem ? 'menu' : undefined}
              aria-expanded={isSubmenuItem ? submenuOpen : undefined}
              disabled={item.disabled}
              onClick={() => {
                if (item.disabled) return;
                if (isSubmenuItem) {
                  if (submenuOpen) {
                    closeSubmenu();
                  } else {
                    openSubmenuAt(idx);
                  }
                } else {
                  onSelect(item, altHeld);
                }
              }}
              onMouseEnter={() => {
                setActiveIdx(idx);
                if (isSubmenuItem) {
                  clearHoverTimer();
                  hoverTimerRef.current = setTimeout(() => {
                    openSubmenuAt(idx);
                  }, SUBMENU_OPEN_DELAY);
                } else {
                  // Close any open submenu when hovering a non-submenu item
                  if (openSubmenuIdxRef.current !== -1) {
                    clearHoverTimer();
                    setOpenSubmenuIdx(-1);
                  }
                }
              }}
              onMouseLeave={() => {
                if (isSubmenuItem && !submenuOpen) {
                  clearHoverTimer();
                }
                setActiveIdx(-1);
              }}
            >
              <span className="context-menu__check" aria-hidden="true">
                {isRadio ? (
                  item.checked
                    ? <Icon name="circle-dot" size={12} />
                    : <Icon name="circle-large-outline" size={12} />
                ) : (
                  item.checked && <Icon name="check" size={12} />
                )}
              </span>
              <span className="context-menu__label">{displayTitle}</span>
              {isSubmenuItem && (
                <span className="context-menu__chevron" aria-hidden="true">
                  <Icon name="chevron-right" size={12} />
                </span>
              )}
            </button>

            {/* Submenu flyout — rendered as a DOM descendant of the parent <li>
                so the parent's outside-click containment check
                (popoverElRef.current.contains(e.target)) treats flyout clicks
                as "inside" → parent stays open.
                The flyout is absolutely positioned; it does NOT use createPortal. */}
            {isSubmenuItem && submenuOpen && menuSvc && (
              <SubMenuFlyout
                submenuId={item.submenuId!}
                menuSvc={menuSvc}
                ctxArgs={ctxArgs}
                onSelect={onSelect}
                onClose={closeSubmenu}
                parentMenuRef={menuRef}
              />
            )}
          </li>
        );
      })}
    </ul>
  );

  return createPortal(menu, document.body);
}

// ── SubMenuFlyout ─────────────────────────────────────────────────────────────

interface SubMenuFlyoutProps {
  submenuId: string;
  menuSvc: IMenuService;
  ctxArgs?: unknown[];
  onSelect: (item: ResolvedMenuItem, useAlt?: boolean) => void;
  onClose: () => void;
  /** Ref to the parent menu root — focused when the flyout closes so keyboard
   *  nav returns to the parent menu. */
  parentMenuRef: RefObject<HTMLUListElement | null>;
}

/**
 * Renders a nested menu flyout as an absolutely-positioned sibling of the
 * parent item's <button>, inside the parent's <li>.
 *
 * DOM containment: the flyout <ul> is a descendant of the parent ContextMenu's
 * <ul> (tracked by usePopover as popoverElRef). The parent's outside-click
 * handler calls popoverElRef.contains(e.target) — flyout clicks are contained
 * → parent remains open. This is the critical invariant (see brief).
 *
 * Edge-flip: computed against viewport width. If there's insufficient space
 * to the right, the flyout flips left.
 *
 * Keyboard: Esc / Left-Arrow in the flyout closes it (handled by the parent
 * ContextMenu's own keydown listener via `closeSubmenu`).
 */
function SubMenuFlyout({
  submenuId,
  menuSvc,
  onSelect,
  onClose,
  parentMenuRef,
}: SubMenuFlyoutProps) {
  const subItems = menuSvc.getMenuItems(submenuId);
  const [activeIdx, setActiveIdx] = useState<number>(-1);
  const [altHeld, setAltHeld] = useState(false);
  const ulRef = useRef<HTMLUListElement | null>(null);

  // Focus the flyout root on mount so keyboard nav events land on the parent
  // document listener (same mechanism as main menu). rAF ensures element is
  // laid out (edge-flip effect also runs on mount).
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      ulRef.current?.focus();
    });
    return () => {
      cancelAnimationFrame(raf);
    };
  }, []);

  // On unmount (flyout closed via Esc / ArrowLeft / item select), return focus
  // to the parent menu root so Arrow nav continues from there.
  // Capture ref.current inside the effect (lint: ref value may change by cleanup time).
  useEffect(() => {
    const parentMenu = parentMenuRef.current;
    return () => {
      try {
        parentMenu?.focus?.();
      } catch {
        // Parent may be gone. Safe to ignore.
      }
    };
  }, [parentMenuRef]);

  // Alt tracking for sub-menu (mirror parent)
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

  // Keyboard nav for the flyout
  useEffect(() => {
    function handle(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setActiveIdx((i) => (i + 1) % subItems.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setActiveIdx((i) => (i <= 0 ? subItems.length - 1 : i - 1));
        return;
      }
      if (e.key === 'Escape' || e.key === 'ArrowLeft') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (activeIdx >= 0 && activeIdx < subItems.length) {
          onSelect(subItems[activeIdx], altHeld);
        }
        return;
      }
    }
    document.addEventListener('keydown', handle, true);
    return () => document.removeEventListener('keydown', handle, true);
  }, [subItems, activeIdx, onSelect, onClose, altHeld]);

  // Edge-flip: prefer right, fall back to left if no room.
  // Since we're inside a position:relative <li>, we compute based on the
  // flyout's desired left offset relative to the parent <li>.
  // We use a viewport-aware approach: check if space to the right is sufficient.
  const [flipLeft, setFlipLeft] = useState(false);

  useEffect(() => {
    if (!ulRef.current) return;
    const liEl = ulRef.current.parentElement;
    if (!liEl) return;
    const liRect = liEl.getBoundingClientRect();
    const flyoutW = MENU_WIDTH;
    const spaceRight = window.innerWidth - liRect.right - 4;
    setFlipLeft(spaceRight < flyoutW);
  }, []);

  if (subItems.length === 0) return null;

  const flyoutStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: flipLeft ? undefined : '100%',
    right: flipLeft ? '100%' : undefined,
    zIndex: 9001,
    // Slight negative top offset to align with the trigger item button
    marginTop: 0,
  };

  return (
    <ul
      ref={ulRef}
      className="context-menu context-menu--flyout"
      role="menu"
      tabIndex={-1}
      style={flyoutStyle}
      aria-label="Submenu"
      aria-activedescendant={activeIdx >= 0 ? `ctxmenu-sub-item-${activeIdx}` : undefined}
    >
      {subItems.map((item, idx) => {
        const displayTitle = (altHeld && item.altCommand && item.altTitle) ? item.altTitle : item.title;
        const isRadio = Boolean(item.radioGroup);

        let role: 'menuitem' | 'menuitemcheckbox' | 'menuitemradio' = 'menuitem';
        if (isRadio) role = 'menuitemradio';
        else if (item.checked) role = 'menuitemcheckbox';

        return (
          <li key={`${item.command}-${idx}`} role="none">
            {item.firstInGroup && idx !== 0 && (
              <div className="context-menu__separator" role="separator" aria-hidden="true" />
            )}
            <button
              id={`ctxmenu-sub-item-${idx}`}
              className={[
                'context-menu__item',
                item.disabled ? 'context-menu__item--disabled' : '',
                idx === activeIdx ? 'context-menu__item--active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              role={role}
              aria-checked={
                (isRadio || role === 'menuitemcheckbox') ? item.checked : undefined
              }
              disabled={item.disabled}
              onClick={() => {
                if (!item.disabled) onSelect(item, altHeld);
              }}
              onMouseEnter={() => setActiveIdx(idx)}
              onMouseLeave={() => setActiveIdx(-1)}
            >
              <span className="context-menu__check" aria-hidden="true">
                {isRadio ? (
                  item.checked
                    ? <Icon name="circle-dot" size={12} />
                    : <Icon name="circle-large-outline" size={12} />
                ) : (
                  item.checked && <Icon name="check" size={12} />
                )}
              </span>
              <span className="context-menu__label">{displayTitle}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
