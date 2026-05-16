import { useEffect, useRef } from 'react';
import { mountRuEdit, type RuEditDoc, type RuEditHandle } from '@ru-soam/editor';
import { useService } from '../services/hooks';
import { SnippetServiceId } from '../services/ids';

// React owns the host <div>; vanilla ProseMirror owns the content beneath it.
// Uncontrolled with explicit replacement per ADR-415.
// Snippet registry injected from ISnippetService (Phase 8): mutable — additions
// made after mount (e.g. developer.snippets.seed) are visible immediately.
interface Props {
  readonly instanceId: string;
  readonly initial?: RuEditDoc;
  readonly readOnly?: boolean;
  readonly onChange?: (doc: RuEditDoc) => void;
  readonly onHandle?: (handle: RuEditHandle | null) => void;
}

export default function RuEditView({ instanceId, initial, readOnly, onChange, onHandle }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const snippetSvc = useService(SnippetServiceId);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const handle = mountRuEdit(host, {
      initial,
      readOnly,
      onChange,
      snippets: snippetSvc.registry(),
    });
    onHandle?.(handle);
    return () => {
      onHandle?.(null);
      handle.dispose();
    };
    // Instance identity drives remount; other props intentionally not deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceId]);

  return <div ref={hostRef} className="ru-edit-host" data-instance-id={instanceId} />;
}
