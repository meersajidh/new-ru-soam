import './ActivityBar.css';
import SettingsMenu from './SettingsMenu';
import UserAvatar from './UserAvatar';
// Activity items and view-container binding land in Phase 4/5.
export default function ActivityBar() {
  return (
    <div className="part-activitybar" role="navigation" aria-label="Activity Bar">
      <div className="activitybar-top" aria-hidden="true" />
      <div className="activitybar-bottom">
        <SettingsMenu />
        <UserAvatar />
      </div>
    </div>
  );
}
