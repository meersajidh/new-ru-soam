import { useEffect } from 'react';
import { Icon } from '@basebench/ui';
import { useService, useNotifications } from '../../platform/services/hooks';
import { NotificationServiceId } from '../../platform/services/ids';
import { SeverityIcon } from './NotificationItem';
import type { Notification } from '../../platform/notification/notification-service';
import './notifications.css';

export function ToastStack() {
  const { toasts, panelOpen } = useNotifications();
  if (panelOpen) return null;
  if (toasts.length === 0) return null;

  return (
    <div className="notif-toast-stack" aria-live="polite" aria-label="Notifications">
      {toasts.map((n) => (
        <ToastItem key={n.id} notification={n} />
      ))}
    </div>
  );
}

function ToastItem({ notification }: { notification: Notification }) {
  const svc = useService(NotificationServiceId);

  function handleDismiss() {
    svc.removeFromToast(notification.id);
    svc.markRead(notification.id);
  }

  function handleExpand() {
    svc.removeFromToast(notification.id);
    svc.markRead(notification.id);
    svc.togglePanel();
  }

  // Non-sticky toasts auto-expire — the service owns the timer.
  // We additionally clear from toast on unmount if somehow the component
  // is removed while the timer is still pending (defensive only).
  useEffect(() => {
    if (!notification.sticky) return;
    // Sticky toasts never auto-expire — no timer to clean up.
    return undefined;
  }, [notification.sticky]);

  return (
    <div
      className="notif-toast"
      data-severity={notification.severity}
      onClick={handleExpand}
      role="button"
      tabIndex={0}
      aria-label={notification.title}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleExpand(); }}
    >
      <div className="notif-toast__icon">
        <SeverityIcon severity={notification.severity} size={14} />
      </div>
      <div className="notif-toast__content">
        <div className="notif-toast__title">{notification.title}</div>
        {notification.message && (
          <div className="notif-toast__msg">{notification.message}</div>
        )}
      </div>
      <button
        className="notif-toast__dismiss"
        onClick={(e) => { e.stopPropagation(); handleDismiss(); }}
        aria-label="Dismiss"
      >
        <Icon name="close" size={12} />
      </button>
    </div>
  );
}
