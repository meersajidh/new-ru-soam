import { useState, useEffect, useContext } from 'react';
import {
  ContextKeyServiceId,
  EditorServiceId,
  FontServiceId,
  LayoutServiceId,
  NotificationServiceId,
  StatusBarServiceId,
  ThemeServiceId,
  RegistryContext,
} from './ids';
import type { SlotId } from '../layout/slots';
import type { ThemeDescriptor } from '../theme/tokens';
import type { FontSetDescriptor } from '../font/font-service';
import type { StatusBarEntry } from '../statusbar/statusbar-service';
import type { CtxValue } from '../context-key/context-key-service';
import type { ServiceId } from './service-id';
import type { EditorGroup, EditorLayoutNode } from '../editor/editor-service';
import type { Notification } from '../notification/notification-service';

export function useService<T>(id: ServiceId<T>): T {
  const registry = useContext(RegistryContext);
  if (!registry) throw new Error('useService used outside ServiceRegistryProvider');
  return registry.get(id);
}

export function useContextKey(key: string): CtxValue | undefined {
  const ctxSvc = useService(ContextKeyServiceId);
  const [value, setValue] = useState(() => ctxSvc.get(key));
  useEffect(
    () =>
      ctxSvc.onDidChange((changed) => {
        if (changed.has(key)) setValue(ctxSvc.get(key));
      }),
    [ctxSvc, key],
  );
  return value;
}

export function useLayoutVisible(slotId: SlotId): boolean {
  const layout = useService(LayoutServiceId);
  const [visible, setVisible] = useState(() => layout.isVisible(slotId));
  useEffect(
    () =>
      layout.onDidChangePartVisibility((id, vis) => {
        if (id === slotId) setVisible(vis);
      }),
    [layout, slotId],
  );
  return visible;
}

export function useTheme(): ThemeDescriptor {
  const theme = useService(ThemeServiceId);
  const [current, setCurrent] = useState(() => theme.getActive());
  useEffect(() => theme.onThemeChange(setCurrent), [theme]);
  return current;
}

export function useDarkMode(): [boolean, (dark: boolean) => void] {
  const theme = useService(ThemeServiceId);
  const [dark, setDark] = useState(() => theme.isDark());
  useEffect(() => theme.onDarkModeChange(setDark), [theme]);
  return [dark, (d) => theme.setDarkMode(d)];
}

export function useFontSet(): FontSetDescriptor {
  const font = useService(FontServiceId);
  const [current, setCurrent] = useState(() => font.getActive());
  useEffect(() => font.onFontSetChange(setCurrent), [font]);
  return current;
}

export function useStatusBarEntries(region: 'left' | 'right'): StatusBarEntry[] {
  const statusBar = useService(StatusBarServiceId);
  const [entries, setEntries] = useState(() => statusBar.getEntries(region));
  useEffect(
    () => statusBar.onDidChangeEntries(() => setEntries(statusBar.getEntries(region))),
    [statusBar, region],
  );
  return entries;
}

export function useEditorState(): { layout: EditorLayoutNode; focusedGroupId: string | null } {
  const editor = useService(EditorServiceId);
  const [state, setState] = useState(() => ({
    layout: editor.getLayout(),
    focusedGroupId: editor.getFocusedGroupId(),
  }));
  useEffect(
    () => editor.onDidChange(() => setState({
      layout: editor.getLayout(),
      focusedGroupId: editor.getFocusedGroupId(),
    })),
    [editor],
  );
  return state;
}

export function useEditorGroup(groupId: string): EditorGroup | undefined {
  const editor = useService(EditorServiceId);
  const [group, setGroup] = useState(() => editor.getGroup(groupId));
  useEffect(
    () => editor.onDidChange(() => setGroup(editor.getGroup(groupId))),
    [editor, groupId],
  );
  return group;
}

export type NotificationsState = {
  notifications: readonly Notification[];
  toasts: readonly Notification[];
  panelOpen: boolean;
  unreadCount: number;
};

export function useNotifications(): NotificationsState {
  const svc = useService(NotificationServiceId);
  const [state, setState] = useState<NotificationsState>(() => ({
    notifications: svc.getAll(),
    toasts: svc.getToasts(),
    panelOpen: svc.isPanelOpen(),
    unreadCount: svc.getUnreadCount(),
  }));
  useEffect(
    () =>
      svc.onDidChange(() =>
        setState({
          notifications: svc.getAll(),
          toasts: svc.getToasts(),
          panelOpen: svc.isPanelOpen(),
          unreadCount: svc.getUnreadCount(),
        }),
      ),
    [svc],
  );
  return state;
}

export function useUnreadCount(): number {
  const svc = useService(NotificationServiceId);
  const [count, setCount] = useState(() => svc.getUnreadCount());
  useEffect(() => svc.onDidChange(() => setCount(svc.getUnreadCount())), [svc]);
  return count;
}
