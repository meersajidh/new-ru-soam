import './PrimarySideBar.css';
import { useActiveViewContainer, useService } from '../../platform/services/hooks';
import { ContributionServiceId } from '../../platform/services/ids';
import BundleViewIframe from './BundleViewIframe';

export default function PrimarySideBar() {
  const container = useActiveViewContainer();
  const contributions = useService(ContributionServiceId);

  if (container && container.viewUrl !== undefined) {
    return (
      <div className="part-sidebar part-sidebar-primary" aria-label="Primary Side Bar">
        <div className="sidebar-header">
          <span className="sidebar-header-title">{container.title}</span>
        </div>
        <div className="sidebar-view-host">
          <BundleViewIframe
            resource={container.viewUrl}
            instanceId={container.id}
            onRequestClose={() => contributions.setActiveContainerId(null)}
            onRequestFocus={() => { /* side bar has no tab focus concept */ }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="part-sidebar part-sidebar-primary" aria-label="Primary Side Bar">
      <p className="sidebar-empty-state">No views</p>
    </div>
  );
}
