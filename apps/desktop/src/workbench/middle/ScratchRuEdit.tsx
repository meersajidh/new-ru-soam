import './ScratchRuEdit.css';
import { useEffect, useRef, useState } from 'react';
import RuEditView from '../../platform/ru-edit/RuEditView';
import RuEditToolbar from '../../platform/ru-edit/RuEditToolbar';
import type { RuEditActiveState, RuEditDoc, RuEditHandle, RuEditUnsubscribe } from '@ru-soam/editor';
import { getScratchDoc, setScratchDoc } from '../../platform/ru-edit/scratch-store';
import { useService } from '../../platform/services/hooks';
import { RuEditServiceId } from '../../platform/services/ids';

interface Props {
  readonly resource: string;
  readonly instanceId: string;
}

export default function ScratchRuEdit({ resource, instanceId }: Props) {
  const ruEdit = useService(RuEditServiceId);
  const handleRef = useRef<RuEditHandle | null>(null);
  const unsubRef = useRef<RuEditUnsubscribe | null>(null);
  const [active, setActive] = useState<RuEditActiveState | null>(null);
  const initial = getScratchDoc(resource);

  const onChange = (doc: RuEditDoc) => {
    setScratchDoc(resource, doc);
  };

  // Register handle once mounted; unregister on unmount.
  useEffect(() => {
    return () => {
      unsubRef.current?.();
      unsubRef.current = null;
      ruEdit.unregister(instanceId);
    };
  }, [ruEdit, instanceId]);

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
      <RuEditToolbar getHandle={() => handleRef.current} active={active} />
      <RuEditView
        instanceId={instanceId}
        initial={initial}
        onChange={onChange}
        onHandle={(h) => {
          handleRef.current = h;
          if (h) {
            ruEdit.register({ resource, instanceId, handle: h });
            ruEdit.setActive(instanceId);
            setActive(h.getActiveState());
            unsubRef.current?.();
            unsubRef.current = h.subscribe((s) => setActive(s));
          } else {
            unsubRef.current?.();
            unsubRef.current = null;
            setActive(null);
            ruEdit.unregister(instanceId);
          }
        }}
      />
    </div>
  );
}
