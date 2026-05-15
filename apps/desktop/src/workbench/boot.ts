import { ServiceRegistry } from '../platform/services/registry';
import { LayoutServiceId, ThemeServiceId, StatusBarServiceId } from '../platform/services/ids';
import { LayoutService } from '../platform/layout/layout-service';
import { ThemeService } from '../platform/theme/theme-service';
import { StatusBarService } from '../platform/statusbar/statusbar-service';
import { defaultDark } from '../platform/theme/themes/default-dark';
import { defaultLight } from '../platform/theme/themes/default-light';
import { ANCHORED_ENTRIES } from '../platform/statusbar/anchored-ids';
import { SlotId } from '../platform/layout/slots';

export function boot(): ServiceRegistry {
  const registry = new ServiceRegistry();

  // Layout — set non-default visibility before any component reads it
  const layout = new LayoutService();
  layout.setVisibility(SlotId.AuxSideBar, false);
  layout.setVisibility(SlotId.Panel, false);
  registry.register(LayoutServiceId, layout);

  // Theme — detect active theme same way as applyInitialTheme to stay in sync
  let stored: string | null = null;
  try { stored = localStorage.getItem('soam.theme'); } catch { /* ignore */ }
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const initialThemeId =
    stored === 'default-light' || stored === 'default-dark'
      ? stored
      : prefersDark ? 'default-dark' : 'default-light';
  const theme = new ThemeService(document.documentElement, [defaultDark, defaultLight], initialThemeId);
  registry.register(ThemeServiceId, theme);

  // StatusBar — seed six ADR-409 anchored entries
  const statusBar = new StatusBarService();
  for (const entry of ANCHORED_ENTRIES) statusBar.register(entry);
  registry.register(StatusBarServiceId, statusBar);

  return registry;
}
