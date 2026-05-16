import { useEffect, useRef } from 'react';
import { mountRuEdit, type RuEditDoc, type RuEditHandle } from '@ru-soam/editor';

/**
 * Renderer chrome around a vanilla ProseMirror EditorView.
 *
 * React owns the host `<div>`; the editor's `contenteditable` content is
 * imperatively mounted into it and React never reaches inside (uncontrolled
 * with explicit replacement, per ADR-415). The handle is exposed via
 * `onHandle` for callers that need imperative access (setDoc, focus).
 */
interface Props {
  readonly instanceId: string;
  readonly initial?: RuEditDoc;
  readonly readOnly?: boolean;
  readonly onChange?: (doc: RuEditDoc) => void;
  readonly onHandle?: (handle: RuEditHandle | null) => void;
}

export default function RuEditView({ instanceId, initial, readOnly, onChange, onHandle }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const handle = mountRuEdit(host, { initial, readOnly, onChange });
    onHandle?.(handle);
    return () => {
      onHandle?.(null);
      handle.dispose();
    };
    // Instance identity drives remount; doc / callbacks intentionally not deps
    // to honor uncontrolled-with-explicit-replacement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceId]);

  return <div ref={hostRef} className="ru-edit-host" data-instance-id={instanceId} />;
}
