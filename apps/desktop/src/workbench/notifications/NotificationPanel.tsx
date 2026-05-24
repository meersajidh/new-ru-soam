import { useEffect } from 'react';
import { useService, useNotifications } from '../../platform/services/hooks';
import { NotificationServiceId } from '../../platform/services/ids';
import { NotificationItem } from './NotificationItem';

export function NotificationPanel() {
  const svc = useService(NotificationServiceId);
  const { notifications, panelOpen } = useNotifications();

  const hasUnread = notifications.some((n) => !n.read);
  const hasRead = notifications.some((n) => n.read);

  useEffect(() => {
    if (!panelOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') svc.closePanel();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [svc, panelOpen]);

  if (!panelOpen) return null;

  return (
    <>
      <div className="notif-panel-overlay" onClick={() => svc.closePanel()} aria-hidden="true" />
      <div className="notif-panel" role="dialog" aria-label="Notifications" aria-modal="true">
        <div className="notif-panel__header">
          <span className="notif-panel__title">Notifications</span>
          <div className="notif-panel__header-actions">
            {hasUnread && (
              <button className="notif-panel__header-btn" onClick={() => svc.markAllRead()}>
                Mark all read
              </button>
            )}
            {hasRead && (
              <button className="notif-panel__header-btn" onClick={() => svc.dismissAllRead()}>
                Delete read
              </button>
            )}
          </div>
        </div>

        <div className="notif-panel__list">
          {notifications.length === 0 ? (
            <div className="notif-panel__empty">No notifications</div>
          ) : (
            notifications.map((n) => (
              <NotificationItem
                key={n.id}
                notification={n}
                onDismiss={() => svc.dismiss(n.id)}
                onMarkRead={() => svc.markRead(n.id)}
              />
            ))
          )}
        </div>
      </div>
    </>
  );
}
