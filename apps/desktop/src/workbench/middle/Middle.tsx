import './Middle.css';
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

  // Parts stay MOUNTED across visibility toggles; we hide via `display:none`
  // instead of unmounting (`&&`). A `display:contents` wrapper vanishes from
  // layout when visible (the Part's root stays the real flex item) and becomes
  // `display:none` when hidden — keeping each BundleViewIframe alive so toggling
  // a panel doesn't re-fetch its HTML / re-init its bridge / lose its state.
  return (
    <div className="part-middle">
      <ActivityBar />
      <div style={{ display: showPrimary ? 'contents' : 'none' }}>
        <PrimarySideBar />
      </div>
      <div className="middle-center">
        <EditorArea />
        <div style={{ display: showPanel ? 'contents' : 'none' }}>
          <Panel />
        </div>
      </div>
      <div style={{ display: showAux ? 'contents' : 'none' }}>
        <AuxSideBar />
      </div>
    </div>
  );
}
