/**
 * Select — value-bound listbox built on usePopover.
 *
 * ARIA listbox pattern:
 *   - Trigger: role=combobox, aria-haspopup=listbox, aria-expanded, aria-controls
 *   - List: role=listbox, tabIndex=-1, aria-activedescendant
 *   - Options: role=option, aria-selected, check glyph on selected
 *
 * Keyboard:
 *   - Trigger: ArrowDown/Enter/Space → open
 *   - List: ArrowDown/Up, Home/End, Enter/Space → commit, Esc → close (via hook)
 *
 * Generic over item shape { id, label }.
 */

import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { usePopover } from './use-popover';
import Popover from './Popover';
import './Select.css';

export interface SelectItem {
  id: string;
  label: string;
  /** Optional extra description shown below the label. */
  description?: string;
  disabled?: boolean;
}

export interface SelectProps {
  items: SelectItem[];
  /** Currently selected item id. */
  value: string;
  onChange: (id: string) => void;
  /** Placeholder shown when no item matches value. */
  placeholder?: string;
  /** Forwarded ref to the trigger button. */
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
  id?: string;
  'aria-label'?: string;
  disabled?: boolean;
  /** Extra class on the trigger button. */
  className?: string;
}

const MAX_VISIBLE = 6;
const ITEM_HEIGHT = 36;
const PADDING_V = 8;

export default function Select({
  items,
  value,
  onChange,
  placeholder = '',
  triggerRef: externalTriggerRef,
  id,
  'aria-label': ariaLabel,
  disabled = false,
  className,
}: SelectProps) {
  const internalTriggerRef = useRef<HTMLButtonElement | null>(null);
  const triggerRef = externalTriggerRef ?? internalTriggerRef;

  const listboxId = useId();

  const selectedIdx = items.findIndex((it) => it.id === value);
  const selectedItem = selectedIdx >= 0 ? items[selectedIdx] : null;

  const [activeIdx, setActiveIdx] = useState<number>(Math.max(0, selectedIdx));
  const [triggerWidth, setTriggerWidth] = useState(0);

  const estimatedH = Math.min(items.length, MAX_VISIBLE) * ITEM_HEIGHT + PADDING_V * 2;

  const popover = usePopover({
    estimatedHeight: estimatedH,
    estimatedWidth: triggerWidth || 180,
    edgeMargin: 6,
  });

  // Set list ref for focus + outside-click in hook via setPopoverElement on the <ul>
  const listRef = useRef<HTMLUListElement | null>(null);
  const setListRef = (el: HTMLUListElement | null) => {
    listRef.current = el;
    popover.setPopoverElement(el);
  };

  function openList() {
    if (disabled || items.length === 0) return;
    const triggerEl = triggerRef.current;
    if (triggerEl) {
      const rect = triggerEl.getBoundingClientRect();
      setTriggerWidth(rect.width);
      setActiveIdx(Math.max(0, selectedIdx));
      popover.open(triggerEl);
    }
  }

  function commitItem(idx: number) {
    const item = items[idx];
    if (!item || item.disabled) return;
    onChange(item.id);
    popover.close();
  }

  function onTriggerKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openList();
    }
  }

  // Focus list when open
  useEffect(() => {
    if (popover.isOpen) {
      requestAnimationFrame(() => listRef.current?.focus());
    }
  }, [popover.isOpen]);

  // List keyboard nav
  useEffect(() => {
    if (!popover.isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setActiveIdx((i) => {
            let next = i + 1;
            while (next < items.length && items[next]?.disabled) next++;
            return next < items.length ? next : i;
          });
          break;
        case 'ArrowUp':
          e.preventDefault();
          setActiveIdx((i) => {
            let prev = i - 1;
            while (prev >= 0 && items[prev]?.disabled) prev--;
            return prev >= 0 ? prev : i;
          });
          break;
        case 'Home':
          e.preventDefault();
          setActiveIdx(0);
          break;
        case 'End':
          e.preventDefault();
          setActiveIdx(items.length - 1);
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          commitItem(activeIdx);
          break;
        // Esc handled by usePopover
      }
    }
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [popover.isOpen, items, activeIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll active option into view
  useEffect(() => {
    if (!popover.isOpen || !listRef.current) return;
    const opt = listRef.current.querySelector<HTMLElement>(
      `[data-select-idx="${activeIdx}"]`,
    );
    opt?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx, popover.isOpen]);

  const activeOptId = popover.isOpen ? `${listboxId}-opt-${activeIdx}` : undefined;

  return (
    <div className="select-root">
      <button
        ref={triggerRef as React.RefObject<HTMLButtonElement>}
        type="button"
        id={id}
        className={['select__trigger', className].filter(Boolean).join(' ')}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={popover.isOpen}
        aria-controls={listboxId}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (popover.isOpen ? popover.close() : openList())}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="select__trigger-value">
          {selectedItem?.label ?? placeholder}
        </span>
        <ChevronDown
          size={14}
          className="select__trigger-chevron"
          aria-hidden="true"
        />
      </button>

      <Popover
        isOpen={popover.isOpen}
        position={popover.position}
        setPopoverElement={popover.setPopoverElement}
        role="none"
      >
        <ul
          ref={setListRef}
          id={listboxId}
          className="select__list"
          role="listbox"
          tabIndex={-1}
          aria-label={ariaLabel}
          aria-activedescendant={activeOptId}
          style={{ minWidth: triggerWidth > 0 ? triggerWidth : undefined }}
        >
          {items.map((item, idx) => (
            <li
              key={item.id}
              id={`${listboxId}-opt-${idx}`}
              role="option"
              aria-selected={item.id === value}
              aria-disabled={item.disabled}
              data-select-idx={idx}
              className={[
                'select__option',
                item.id === value ? 'select__option--selected' : '',
                idx === activeIdx ? 'select__option--active' : '',
                item.disabled ? 'select__option--disabled' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onMouseEnter={() => !item.disabled && setActiveIdx(idx)}
              onClick={() => commitItem(idx)}
            >
              <span className="select__option-check" aria-hidden="true">
                {item.id === value && <Check size={12} strokeWidth={2.5} />}
              </span>
              <span className="select__option-body">
                <span className="select__option-label">{item.label}</span>
                {item.description && (
                  <span className="select__option-description">{item.description}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </Popover>
    </div>
  );
}
