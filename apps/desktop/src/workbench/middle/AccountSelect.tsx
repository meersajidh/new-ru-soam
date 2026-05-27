/**
 * AccountSelect — themed listbox replacing a native <select> for the sign-in
 * account picker. Fully styled (native <select> option lists are OS-painted and
 * ignore our dark theme). Keyboard + ARIA listbox pattern: trigger button opens
 * a popover list; arrow keys move the active option, Enter/Space commits, Escape
 * or click-outside closes.
 */

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import type { WorkspaceMeta } from '../../../electron/shared/lock-protocol';
import './AccountSelect.css';

interface AccountSelectProps {
  id?: string;
  accounts: WorkspaceMeta[];
  /** Selected workspaceId. */
  value: string;
  onChange: (workspaceId: string) => void;
  /** Forwarded to the trigger button for programmatic focus. */
  triggerRef?: React.Ref<HTMLButtonElement>;
}

export default function AccountSelect({
  id,
  accounts,
  value,
  onChange,
  triggerRef,
}: AccountSelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selectedIndex = Math.max(
    0,
    accounts.findIndex((a) => a.workspaceId === value),
  );
  const selected = accounts[selectedIndex];

  // Click-outside closes the popover.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // On open, move focus to the list (DOM side-effect only — the active option is
  // synced at open time in openList(), not here, to avoid setState-in-effect).
  useEffect(() => {
    if (open) listRef.current?.focus();
  }, [open]);

  function openList() {
    setActiveIndex(selectedIndex);
    setOpen(true);
  }

  function commit(i: number) {
    const a = accounts[i];
    if (a) onChange(a.workspaceId);
    setOpen(false);
  }

  function onTriggerKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openList();
    }
  }

  function onListKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        break;
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((i) => Math.min(accounts.length - 1, i + 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
        break;
      case 'Home':
        e.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setActiveIndex(accounts.length - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        commit(activeIndex);
        break;
      default:
        break;
    }
  }

  return (
    <div className="account-select" ref={wrapRef}>
      <button
        type="button"
        id={id}
        ref={triggerRef}
        className="account-select__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="account-select__value">{selected?.nickname ?? ''}</span>
        <ChevronDown size={16} className="account-select__chevron" aria-hidden="true" />
      </button>

      {open && (
        <ul
          className="account-select__list"
          role="listbox"
          tabIndex={-1}
          ref={listRef}
          aria-activedescendant={`account-opt-${activeIndex}`}
          onKeyDown={onListKeyDown}
        >
          {accounts.map((a, i) => (
            <li
              key={a.workspaceId}
              id={`account-opt-${i}`}
              role="option"
              aria-selected={a.workspaceId === value}
              className="account-select__option"
              data-active={i === activeIndex}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => commit(i)}
            >
              <span className="account-select__option-label">{a.nickname}</span>
              {a.workspaceId === value && (
                <Check size={14} aria-hidden="true" className="account-select__check" />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
