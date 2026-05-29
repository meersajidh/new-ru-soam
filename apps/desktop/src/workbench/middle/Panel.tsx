import './Panel.css';
import { useLayoutSizes } from '../../platform/services/hooks';
import ResizeHandle from './ResizeHandle';

const MIN_HEIGHT = 120;

export default function Panel() {
  const { panelHeight } = useLayoutSizes();

  // 60% of viewport height max — computed at drag time in ResizeHandle,
  // but we pass a generous static upper bound here; true dynamic max enforced
  // by the handle clamping against window.innerHeight * 0.6.
  const maxHeight = typeof window !== 'undefined' ? Math.floor(window.innerHeight * 0.6) : 600;

  return (
    <div
      className="part-panel"
      aria-label="Panel"
      style={{ height: panelHeight, flex: '0 0 auto' }}
    >
      <p className="panel-empty-state">No panel views</p>
      <ResizeHandle
        sizeKey="panelHeight"
        axis="vertical"
        sign={-1}
        min={MIN_HEIGHT}
        max={maxHeight}
        edge="top"
      />
    </div>
  );
}
