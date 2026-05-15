import { useState, useEffect } from 'react';
import { useService } from './context';
import { LayoutServiceId, StatusBarServiceId, ThemeServiceId } from './ids';
import type { SlotId } from '../layout/slots';
import type { ThemeContribution } from '../theme/tokens';
import type { StatusBarEntry } from '../statusbar/statusbar-service';

export function useLayoutVisible(slotId: SlotId): boolean {
  const layout = useService(LayoutServiceId);
  const [visible, setVisible] = useState(() => layout.isVisible(slotId));
  useEffect(
    () => layout.onDidChangePartVisibility((id, vis) => { if (id === slotId) setVisible(vis); }),
    [layout, slotId],
  );
  return visible;
}

export function useTheme(): ThemeContribution {
  const theme = useService(ThemeServiceId);
  const [current, setCurrent] = useState(() => theme.getActive());
  useEffect(() => theme.onThemeChange(setCurrent), [theme]);
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
