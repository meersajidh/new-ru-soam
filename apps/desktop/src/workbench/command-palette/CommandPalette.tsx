import './CommandPalette.css';
import { useState, useEffect, useRef } from 'react';
import { useService } from '../../platform/services/hooks';
import { CommandServiceId, ContextKeyServiceId } from '../../platform/services/ids';
import type { CommandContribution } from '../../platform/command/command-service';

export default function CommandPalette() {
  const ctxSvc  = useService(ContextKeyServiceId);
  const cmdSvc  = useService(CommandServiceId);

  const [isOpen, setIsOpen]     = useState(false);
  const [query,  setQuery]      = useState('');
  const [selIdx, setSelIdx]     = useState(0);

  function updateQuery(next: string): void {
    setQuery(next);
    setSelIdx(0);
  }
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef  = useRef<HTMLUListElement>(null);

  useEffect(() => {
    return ctxSvc.onDidChange(changed => {
      if (changed.has('commandPalette.open')) {
        const next = ctxSvc.get('commandPalette.open') === true;
        setIsOpen(next);
        if (next) { setQuery(''); setSelIdx(0); }
      }
    });
  }, [ctxSvc]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  const q = query.toLowerCase();
  const visible: CommandContribution[] = cmdSvc
    .getVisible(ctxSvc)
    .filter(cmd =>
      !q ||
      cmd.title.toLowerCase().includes(q) ||
      (cmd.category?.toLowerCase().includes(q) ?? false)
    );

  useEffect(() => {
    const item = listRef.current?.children[selIdx] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [selIdx]);

  function close(): void {
    ctxSvc.set('commandPalette.open', false);
  }

  function run(cmd: CommandContribution): void {
    close();
    void cmdSvc.execute(cmd.id).catch(() => {});
  }

  if (!isOpen) return null;

  return (
    <div className="cmd-palette-overlay" onClick={close} role="presentation">
      <div
        className="cmd-palette"
        role="dialog"
        aria-label="Command Palette"
        aria-modal="true"
        onClick={e => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="cmd-palette-input"
          type="text"
          placeholder="Type a command…"
          value={query}
          onChange={e => updateQuery(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Escape') { e.preventDefault(); close(); }
            if (e.key === 'ArrowDown') { e.preventDefault(); setSelIdx(i => Math.min(i + 1, visible.length - 1)); }
            if (e.key === 'ArrowUp')   { e.preventDefault(); setSelIdx(i => Math.max(i - 1, 0)); }
            if (e.key === 'Enter' && visible[selIdx]) { e.preventDefault(); run(visible[selIdx]); }
          }}
          aria-autocomplete="list"
          aria-controls="cmd-palette-list"
          aria-activedescendant={visible[selIdx] ? `cmd-item-${selIdx}` : undefined}
          role="combobox"
          aria-expanded="true"
        />
        <ul
          id="cmd-palette-list"
          ref={listRef}
          className="cmd-palette-list"
          role="listbox"
        >
          {visible.length === 0 ? (
            <li className="cmd-palette-empty">No commands found</li>
          ) : (
            visible.map((cmd, i) => (
              <li
                key={cmd.id}
                id={`cmd-item-${i}`}
                className={`cmd-palette-item${i === selIdx ? ' cmd-palette-item--selected' : ''}`}
                role="option"
                aria-selected={i === selIdx}
                onClick={() => run(cmd)}
                onMouseMove={() => setSelIdx(i)}
              >
                {cmd.category && (
                  <span className="cmd-palette-category">{cmd.category}: </span>
                )}
                <span className="cmd-palette-title">{cmd.title}</span>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
