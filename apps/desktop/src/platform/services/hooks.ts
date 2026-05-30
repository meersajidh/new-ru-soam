import { useState, useEffect, useContext } from 'react';
import {
  ContributionServiceId,
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
import type { LayoutSizes } from '../layout/layout-service';
import type { ThemeDescriptor } from '../theme/tokens';
import type { FontSetDescriptor } from '../font/font-service';
import type { StatusBarEntry } from '../statusbar/statusbar-service';
import type { CtxValue } from '../context-key/context-key-service';
import type { ServiceId } from './service-id';
import type { EditorGroup, EditorLayoutNode } from '../editor/editor-service';
import type { Notification } from '../notification/notification-service';
import type { ActivityBarItem, ViewContainer, PanelView } from '../contributions/contribution-service';

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

/**
 * Increments on every context-key change (any key). Use as a `useMemo` dep
 * when the memo depends on `ctxSvc.evaluate(when)` over arbitrary keys —
 * the compiler tracks this React-state output, so the memo re-runs correctly.
 * This is the sanctioned exception to "don't pre-memoize" for `when`-clause
 * evaluation under React Compiler.
 */
export function useContextVersion(): number {
  const ctxSvc = useService(ContextKeyServiceId);
  const [v, setV] = useState(0);
  useEffect(() => ctxSvc.onDidChange(() => setV((n) => n + 1)), [ctxSvc]);
  return v;
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

export function useLayoutSizes(): LayoutSizes {
  const layout = useService(LayoutServiceId);
  const [sizes, setSizes] = useState(() => layout.getSizes());
  useEffect(() => layout.onDidChangeSizes(setSizes), [layout]);
  return sizes;
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

export function useActivityBarItems(): readonly ActivityBarItem[] {
  const svc = useService(ContributionServiceId);
  const [items, setItems] = useState(() => svc.getActivityBarItems());
  useEffect(() => svc.onDidChange(() => setItems(svc.getActivityBarItems())), [svc]);
  return items;
}

export function useActiveViewContainerId(): string | null {
  const svc = useService(ContributionServiceId);
  const [id, setId] = useState<string | null>(() => svc.getActiveContainerId());
  useEffect(
    () => svc.onDidChange(() => setId(svc.getActiveContainerId())),
    [svc],
  );
  return id;
}

export function useActiveViewContainer(): ViewContainer | undefined {
  const svc = useService(ContributionServiceId);
  const [container, setContainer] = useState<ViewContainer | undefined>(() => {
    const id = svc.getActiveContainerId();
    return id !== null ? svc.getViewContainer(id) : undefined;
  });
  useEffect(
    () =>
      svc.onDidChange(() => {
        const id = svc.getActiveContainerId();
        setContainer(id !== null ? svc.getViewContainer(id) : undefined);
      }),
    [svc],
  );
  return container;
}

export function useAuxViewContainers(): readonly ViewContainer[] {
  const svc = useService(ContributionServiceId);
  const [containers, setContainers] = useState<readonly ViewContainer[]>(() => svc.getAuxViewContainers());
  useEffect(() => svc.onDidChange(() => setContainers(svc.getAuxViewContainers())), [svc]);
  return containers;
}

export function usePanelViews(): readonly PanelView[] {
  const svc = useService(ContributionServiceId);
  const [views, setViews] = useState<readonly PanelView[]>(() => svc.getPanelViews());
  useEffect(() => svc.onDidChange(() => setViews(svc.getPanelViews())), [svc]);
  return views;
}

export function useActivePanelViewId(): string | null {
  const svc = useService(ContributionServiceId);
  const [id, setId] = useState<string | null>(() => svc.getActivePanelViewId());
  useEffect(() => svc.onDidChange(() => setId(svc.getActivePanelViewId())), [svc]);
  return id;
}
