import './KeyboardShortcuts.css';
import { useEffect, useRef, useState } from 'react';
import { Badge } from '@basebench/ui';
import { useService } from '../../platform/services/hooks';
import { ContextKeyServiceId, KeybindingServiceId } from '../../platform/services/ids';
import type { IKeybindingService, EffectiveBinding } from '../../platform/keybinding/keybinding-service';
import { chordFromEvent, isModifierEvent } from '../../platform/keybinding/keybinding-service';

/** Render a (possibly multi-stroke) chord as one chip per stroke. */
function ChordChips({ chord }: { chord: string }) {
  return (
    <>
      {chord.split(' ').map((stroke, i) => (
        <kbd key={i} className="kbs-chip">{stroke}</kbd>
      ))}
    </>
  );
}

/**
 * Inline chord recorder (O426). While focused it calls setCapturing(true) so
 * the global keybinding handler bails and pressing app shortcuts (ctrl+b …)
 * records instead of firing. Captures up to two strokes; Enter commits, Esc /
 * blur cancels. setCapturing(false) is guaranteed via the effect cleanup,
 * which runs on every unmount path (commit, cancel, or parent re-render).
 */
function ChordRecorder({
  kb,
  command,
  onDone,
}: {
  kb: IKeybindingService;
  command: string;
  onDone: () => void;
}) {
  const [strokes, setStrokes] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    kb.setCapturing(true);
    ref.current?.focus();
    return () => kb.setCapturing(false);
  }, [kb]);

  function onKeyDown(e: React.KeyboardEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') {
      onDone();
      return;
    }
    if (e.key === 'Enter') {
      if (strokes.length > 0) kb.setUserBinding(command, strokes.join(' '));
      onDone();
      return;
    }
    if (isModifierEvent(e.nativeEvent)) return; // lone modifier press
    const stroke = chordFromEvent(e.nativeEvent);
    setStrokes((prev) => (prev.length >= 2 ? [stroke] : [...prev, stroke]));
  }

  return (
    <div
      ref={ref}
      className="kbs-recorder"
      tabIndex={0}
      role="textbox"
      aria-label="Press desired key combination, then Enter"
      onKeyDown={onKeyDown}
      onBlur={onDone}
    >
      {strokes.length > 0 ? (
        <ChordChips chord={strokes.join(' ')} />
      ) : (
        <span className="kbs-recorder-hint">Press keys… Enter to save</span>
      )}
    </div>
  );
}

export default function KeyboardShortcuts() {
  const ctxSvc = useService(ContextKeyServiceId);
  const kb = useService(KeybindingServiceId);

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<EffectiveBinding[]>([]);
  const [recordingFor, setRecordingFor] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(
    () =>
      ctxSvc.onDidChange((changed) => {
        if (changed.has('keyboardShortcuts.open')) {
          const next = ctxSvc.get('keyboardShortcuts.open') === true;
          setIsOpen(next);
          if (next) {
            setQuery('');
            setRecordingFor(null);
          }
        }
      }),
    [ctxSvc],
  );

  // Load + live-refresh the effective bindings while open.
  useEffect(() => {
    if (!isOpen) return;
    const refresh = () => setRows(kb.getEffectiveBindings());
    refresh();
    return kb.onDidChangeBindings(refresh);
  }, [isOpen, kb]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  function close() {
    ctxSvc.set('keyboardShortcuts.open', false);
  }

  if (!isOpen) return null;

  const q = query.toLowerCase();
  const visible = rows.filter(
    (r) =>
      !q ||
      r.title.toLowerCase().includes(q) ||
      (r.category?.toLowerCase().includes(q) ?? false) ||
      (r.key?.toLowerCase().includes(q) ?? false),
  );

  return (
    <div className="kbs-overlay" onClick={close} role="presentation">
      <div
        className="kbs"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard Shortcuts"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          // Esc closes the editor unless a recorder is active (recorder stops
          // propagation, so this only fires for non-recording focus).
          if (e.key === 'Escape' && !recordingFor) {
            e.preventDefault();
            close();
          }
        }}
      >
        <input
          ref={inputRef}
          className="kbs-input"
          type="text"
          placeholder="Search keybindings…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search keybindings"
        />
        <ul className="kbs-list" role="list">
          {visible.length === 0 ? (
            <li className="kbs-empty">No commands found</li>
          ) : (
            visible.map((r) => (
              <li key={r.command} className="kbs-row">
                <span className="kbs-cmd">
                  {r.category && <span className="kbs-cat">{r.category}: </span>}
                  <span className="kbs-title">{r.title}</span>
                </span>
                <span className="kbs-key">
                  {recordingFor === r.command ? (
                    <ChordRecorder kb={kb} command={r.command} onDone={() => setRecordingFor(null)} />
                  ) : r.key ? (
                    <ChordChips chord={r.key} />
                  ) : (
                    <span className="kbs-unbound">Unbound</span>
                  )}
                </span>
                <span className="kbs-actions">
                  {r.source && (
                    <Badge
                      variant="outline"
                      size="sm"
                      className={r.source === 'user' ? 'border-primary text-primary' : ''}
                    >
                      {r.source === 'user' ? 'User' : r.source === 'bundle' ? 'Bundle' : 'Default'}
                    </Badge>
                  )}
                  {recordingFor !== r.command && (
                    <button
                      className="kbs-btn"
                      onClick={() => setRecordingFor(r.command)}
                      title="Change keybinding"
                    >
                      Edit
                    </button>
                  )}
                  {r.isUserDefined && (
                    <button
                      className="kbs-btn"
                      onClick={() => kb.resetCommand(r.command)}
                      title="Reset to default"
                    >
                      Reset
                    </button>
                  )}
                </span>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
