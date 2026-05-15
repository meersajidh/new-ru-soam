import { useLayoutVisible } from '../../platform/services/hooks';
import { SlotId } from '../../platform/layout/slots';
import ActivityBar from './ActivityBar';
import PrimarySideBar from './PrimarySideBar';
import EditorArea from './EditorArea';
import AuxSideBar from './AuxSideBar';
import Panel from './Panel';

export default function Middle() {
  const showPrimary = useLayoutVisible(SlotId.PrimarySideBar);
  const showAux = useLayoutVisible(SlotId.AuxSideBar);
  const showPanel = useLayoutVisible(SlotId.Panel);

  return (
    <div className="part-middle">
      <ActivityBar />
      {showPrimary && <PrimarySideBar />}
      <div className="middle-center">
        <EditorArea />
        {showPanel && <Panel />}
      </div>
      {showAux && <AuxSideBar />}
    </div>
  );
}
