import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import type { ResolvedMenuItem } from './menu-service';
import { usePopover } from '../popover/use-popover';
import './ContextMenu.css';

interface Props {
  items: ResolvedMenuItem[];
  x: number;
  y: number;
  onSelect: (item: ResolvedMenuItem) => void;
  onDismiss: () => void;
}

const MENU_WIDTH = 220;
const ITEM_HEIGHT = 28;
const SEPARATOR_HEIGHT = 9; // 1px rule + 0.25rem margin top/bottom (see ContextMenu.css)
const PADDING_V = 6;

export default function ContextMenu({ items, x, y, onSelect, onDismiss }: Props) {
  const menuRef = useRef<HTMLUListElement | null>(null);
  const [activeIdx, setActiveIdx] = useState<number>(-1);

  const separatorCount = items.filter((it, i) => it.firstInGroup && i !== 0).length;
  const menuH = items.length * ITEM_HEIGHT + separatorCount * SEPARATOR_HEIGHT + PADDING_V * 2;

  // Delegate shared mechanics (outside-click, Esc, focus capture/restore,
  // viewport clamp + edge-flip) to usePopover.
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

  // Open popover at coords once on mount
  useEffect(() => {
    popover.open({ x, y });
    // Only run on mount — coords don't change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Menu-specific keyboard nav: arrow-nav, type-ahead, Enter commit.
  // Esc is handled by usePopover (which calls onClose → onDismiss).
  useEffect(() => {
    if (!popover.isOpen) return;
    function handle(e: KeyboardEvent) {
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
      if (e.key === 'Enter') {
        e.preventDefault();
        if (activeIdx >= 0 && activeIdx < items.length) {
          onSelect(items[activeIdx]);
        }
        return;
      }
      // Type-ahead: jump to first item starting with typed char.
      // Skip when a modifier is held so chords (e.g. Ctrl+Shift+P) don't leak in.
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
  }, [popover.isOpen, items, activeIdx, onSelect]);

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
    >
      {items.map((item, idx) => (
        <li key={`${item.command}-${idx}`} role="none">
          {item.firstInGroup && idx !== 0 && (
            <div className="context-menu__separator" role="separator" aria-hidden="true" />
          )}
          <button
            className={[
              'context-menu__item',
              item.disabled ? 'context-menu__item--disabled' : '',
              idx === activeIdx ? 'context-menu__item--active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            role="menuitem"
            aria-checked={item.checked ? true : undefined}
            disabled={item.disabled}
            onClick={() => { if (!item.disabled) onSelect(item); }}
            onMouseEnter={() => setActiveIdx(idx)}
            onMouseLeave={() => setActiveIdx(-1)}
          >
            <span className="context-menu__check" aria-hidden="true">
              {item.checked && <Check size={12} strokeWidth={2.5} />}
            </span>
            <span className="context-menu__label">{item.title}</span>
          </button>
        </li>
      ))}
    </ul>
  );

  return createPortal(menu, document.body);
}
