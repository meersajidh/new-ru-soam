import { useRef } from 'react';
import RuEditView from '../../platform/ru-edit/RuEditView';
import type { RuEditDoc, RuEditHandle } from '@ru-soam/editor';
import { getScratchDoc, setScratchDoc } from '../../platform/ru-edit/scratch-store';

interface Props {
  readonly resource: string;
  readonly instanceId: string;
}

export default function ScratchRuEdit({ resource, instanceId }: Props) {
  const handleRef = useRef<RuEditHandle | null>(null);
  const initial = getScratchDoc(resource);

  const onChange = (doc: RuEditDoc) => {
    setScratchDoc(resource, doc);
    // Phase 7.5a: dump JSON to devtools per plan.
    console.log('[ru-edit-scratch]', resource, doc);
  };

  return (
    <div className="ru-edit-scratch">
      <div className="ru-edit-scratch-toolbar">
        <span className="ru-edit-scratch-resource">{resource}</span>
        <button
          type="button"
          onClick={() => {
            const handle = handleRef.current;
            if (!handle) return;
            console.log('[ru-edit-scratch] toJSON', resource, handle.getDoc());
          }}
        >
          Log JSON
        </button>
      </div>
      <RuEditView
        instanceId={instanceId}
        initial={initial}
        onChange={onChange}
        onHandle={(h) => { handleRef.current = h; }}
      />
    </div>
  );
}
