import './PrimarySideBar.css';
import { useActiveViewContainer, useLayoutSizes, useService } from '../../platform/services/hooks';
import { ContributionServiceId } from '../../platform/services/ids';
import BundleViewIframe from './BundleViewIframe';
import LayoutResizeHandle from './LayoutResizeHandle';

const MIN_WIDTH = 180;
const MAX_WIDTH = 480;

export default function PrimarySideBar() {
  const container = useActiveViewContainer();
  const contributions = useService(ContributionServiceId);
  const { primarySideBarWidth } = useLayoutSizes();

  if (container && container.viewUrl !== undefined) {
    // In the iframe-per-container model the view owns its own header/title bar
    // (so bundles control header styling + actions); the shell no longer draws
    // a title for iframe containers.
    return (
      <div
        className="part-sidebar part-sidebar-primary"
        aria-label="Primary Side Bar"
        style={{ width: primarySideBarWidth, flex: '0 0 auto' }}
      >
        <div className="sidebar-view-host">
          <BundleViewIframe
            resource={container.viewUrl}
            instanceId={container.id}
            onRequestClose={() => contributions.setActiveContainerId(null)}
            onRequestFocus={() => { /* side bar has no tab focus concept */ }}
          />
        </div>
        <LayoutResizeHandle
          sizeKey="primarySideBarWidth"
          axis="horizontal"
          sign={1}
          min={MIN_WIDTH}
          max={MAX_WIDTH}
          edge="right"
        />
      </div>
    );
  }

  return (
    <div
      className="part-sidebar part-sidebar-primary"
      aria-label="Primary Side Bar"
      style={{ width: primarySideBarWidth, flex: '0 0 auto' }}
    >
      <p className="sidebar-empty-state">No views</p>
      <LayoutResizeHandle
        sizeKey="primarySideBarWidth"
        axis="horizontal"
        sign={1}
        min={MIN_WIDTH}
        max={MAX_WIDTH}
        edge="right"
      />
    </div>
  );
}
