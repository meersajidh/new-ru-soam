export type Severity = 'error' | 'warning' | 'success' | 'info' | 'alarm';

export type NotificationAction = {
  label: string;
  onClick: () => void;
};

export type Notification = {
  id: string;
  severity: Severity;
  title: string;
  message?: string;
  timestamp: number;
  read: boolean;
  sticky: boolean;
  actions?: NotificationAction[];
};

type PushInput = Omit<Notification, 'id' | 'timestamp' | 'read'>;

export type NotificationState = {
  notifications: readonly Notification[];
  toastIds: readonly string[];
  panelOpen: boolean;
};

export interface INotificationService {
  /** Add a notification. Returns the new notification id. Toast auto-expires unless sticky. */
  push(input: PushInput): string;
  dismiss(id: string): void;
  markRead(id: string): void;
  markAllRead(): void;
  dismissAllRead(): void;
  removeFromToast(id: string): void;
  togglePanel(): void;
  closePanel(): void;

  getAll(): readonly Notification[];
  getToasts(): readonly Notification[];
  isPanelOpen(): boolean;
  getUnreadCount(): number;

  /** Subscribe to state changes. Returns a dispose function. */
  onDidChange(listener: () => void): () => void;
}

const TOAST_MAX = 3;
const TOAST_DURATION_MS = 4000;

export class NotificationService implements INotificationService {
  private _notifications: Notification[] = [];
  private _toastIds: string[] = [];
  private _panelOpen = false;

  private readonly _listeners = new Set<() => void>();
  /** Map from notification id → active setTimeout handle (for toast auto-expire). */
  private readonly _toastTimers = new Map<string, ReturnType<typeof setTimeout>>();

  push(input: PushInput): string {
    const id = crypto.randomUUID();
    const notification: Notification = {
      ...input,
      id,
      timestamp: Date.now(),
      read: false,
    };
    this._notifications = [notification, ...this._notifications];
    // Add to toast queue (capped at TOAST_MAX, newest first)
    this._toastIds = [id, ...this._toastIds].slice(0, TOAST_MAX);

    if (!input.sticky) {
      this._scheduleToastExpiry(id);
    }
    this._emit();
    return id;
  }

  dismiss(id: string): void {
    this._clearToastTimer(id);
    this._notifications = this._notifications.filter((n) => n.id !== id);
    this._toastIds = this._toastIds.filter((tid) => tid !== id);
    this._emit();
  }

  markRead(id: string): void {
    this._notifications = this._notifications.map((n) =>
      n.id === id ? { ...n, read: true } : n,
    );
    this._emit();
  }

  markAllRead(): void {
    this._notifications = this._notifications.map((n) => ({ ...n, read: true }));
    this._emit();
  }

  dismissAllRead(): void {
    const removed = this._notifications.filter((n) => n.read).map((n) => n.id);
    for (const id of removed) this._clearToastTimer(id);
    this._notifications = this._notifications.filter((n) => !n.read);
    this._toastIds = this._toastIds.filter((tid) => !removed.includes(tid));
    this._emit();
  }

  removeFromToast(id: string): void {
    this._clearToastTimer(id);
    this._toastIds = this._toastIds.filter((tid) => tid !== id);
    this._emit();
  }

  togglePanel(): void {
    this._panelOpen = !this._panelOpen;
    this._emit();
  }

  closePanel(): void {
    this._panelOpen = false;
    this._emit();
  }

  getAll(): readonly Notification[] {
    return this._notifications;
  }

  getToasts(): readonly Notification[] {
    return this._notifications.filter((n) => this._toastIds.includes(n.id));
  }

  isPanelOpen(): boolean {
    return this._panelOpen;
  }

  getUnreadCount(): number {
    return this._notifications.filter((n) => !n.read).length;
  }

  onDidChange(listener: () => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  private _scheduleToastExpiry(id: string): void {
    const handle = setTimeout(() => {
      this._toastTimers.delete(id);
      this.removeFromToast(id);
    }, TOAST_DURATION_MS);
    this._toastTimers.set(id, handle);
  }

  private _clearToastTimer(id: string): void {
    const handle = this._toastTimers.get(id);
    if (handle !== undefined) {
      clearTimeout(handle);
      this._toastTimers.delete(id);
    }
  }

  private _emit(): void {
    for (const l of this._listeners) l();
  }
}
