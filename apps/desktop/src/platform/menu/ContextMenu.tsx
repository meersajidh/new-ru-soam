import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import type { ResolvedMenuItem } from './menu-service';
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

function clampPosition(
  x: number,
  y: number,
  itemCount: number,
  separatorCount: number,
): { left: number; top: number } {
  const menuH = itemCount * ITEM_HEIGHT + separatorCount * SEPARATOR_HEIGHT + PADDING_V * 2;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = x + MENU_WIDTH > vw ? Math.max(0, vw - MENU_WIDTH - 4) : x;
  const top = y + menuH > vh ? Math.max(0, y - menuH) : y;
  return { left, top };
}

export default function ContextMenu({ items, x, y, onSelect, onDismiss }: Props) {
  const menuRef = useRef<HTMLUListElement>(null);
  const [activeIdx, setActiveIdx] = useState<number>(-1);
  const prevFocusRef = useRef<Element | null>(null);

  // Remember focused element so we can restore on close
  useEffect(() => {
    prevFocusRef.current = document.activeElement;
    menuRef.current?.focus();
    return () => {
      const el = prevFocusRef.current;
      if (el instanceof HTMLElement) el.focus();
    };
  }, []);

  // Outside-click dismiss
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onDismiss();
      }
    }
    document.addEventListener('mousedown', handle, true);
    return () => document.removeEventListener('mousedown', handle, true);
  }, [onDismiss]);

  // Keyboard navigation
  useEffect(() => {
    function handle(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); onDismiss(); return; }
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
  }, [items, activeIdx, onSelect, onDismiss]);

  const separatorCount = items.filter((it, i) => it.firstInGroup && i !== 0).length;
  const { left, top } = clampPosition(x, y, items.length, separatorCount);

  const menu = (
    <ul
      ref={menuRef}
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
