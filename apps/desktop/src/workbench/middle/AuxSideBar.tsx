import './AuxSideBar.css';
import { useLayoutSizes } from '../../platform/services/hooks';
import ResizeHandle from './ResizeHandle';

const MIN_WIDTH = 180;
const MAX_WIDTH = 480;

export default function AuxSideBar() {
  const { auxSideBarWidth } = useLayoutSizes();

  return (
    <div
      className="part-sidebar part-sidebar-aux"
      aria-label="Auxiliary Side Bar"
      style={{ width: auxSideBarWidth, flex: '0 0 auto' }}
    >
      <p className="sidebar-empty-state">No views</p>
      <ResizeHandle
        sizeKey="auxSideBarWidth"
        axis="horizontal"
        sign={-1}
        min={MIN_WIDTH}
        max={MAX_WIDTH}
        edge="left"
      />
    </div>
  );
}
