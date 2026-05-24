import { X, AlertCircle, AlertTriangle, CheckCircle2, Info, BellRing } from 'lucide-react';
import type { Notification, Severity } from '../../platform/notification/notification-service';

export function SeverityIcon({ severity, size = 14 }: { severity: Severity; size?: number }) {
  const props = { size, strokeWidth: 2 } as const;
  switch (severity) {
    case 'error':   return <AlertCircle {...props} />;
    case 'warning': return <AlertTriangle {...props} />;
    case 'success': return <CheckCircle2 {...props} />;
    case 'info':    return <Info {...props} />;
    case 'alarm':   return <BellRing {...props} />;
  }
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

type Props = {
  notification: Notification;
  onDismiss: () => void;
  onMarkRead: () => void;
};

export function NotificationItem({ notification, onDismiss, onMarkRead }: Props) {
  return (
    <div
      className={`notif-item${notification.read ? ' notif-item--read' : ''}`}
      onClick={onMarkRead}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onMarkRead(); }}
      aria-label={notification.title}
    >
      {!notification.read && <span className="notif-item__unread-dot" aria-hidden="true" />}
      <div className="notif-item__icon" data-severity={notification.severity}>
        <SeverityIcon severity={notification.severity} />
      </div>

      <div className="notif-item__body">
        <div className="notif-item__title">{notification.title}</div>
        {notification.message && (
          <div className="notif-item__msg">{notification.message}</div>
        )}
        {notification.actions && notification.actions.length > 0 && (
          <div className="notif-item__actions">
            {notification.actions.map((a) => (
              <button
                key={a.label}
                className="notif-item__action-btn"
                onClick={(e) => { e.stopPropagation(); a.onClick(); }}
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
        <div className="notif-item__time">{relativeTime(notification.timestamp)}</div>
      </div>

      <button
        className="notif-item__dismiss"
        onClick={(e) => { e.stopPropagation(); onDismiss(); }}
        aria-label="Dismiss notification"
      >
        <X size={12} strokeWidth={2} />
      </button>
    </div>
  );
}
