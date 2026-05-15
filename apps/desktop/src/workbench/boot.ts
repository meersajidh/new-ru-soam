import { ServiceRegistry } from '../platform/services/registry';
import { FontServiceId, LayoutServiceId, StatusBarServiceId, ThemeServiceId } from '../platform/services/ids';
import { LayoutService } from '../platform/layout/layout-service';
import { ThemeService } from '../platform/theme/theme-service';
import { StatusBarService } from '../platform/statusbar/statusbar-service';
import { FontService } from '../platform/font/font-service';
import { BUILT_IN_THEMES } from '../platform/theme/themes/built-in';
import { BUILT_IN_FONT_SETS } from '../platform/font/font-sets/built-in';
import { ANCHORED_ENTRIES } from '../platform/statusbar/anchored-ids';
import { SlotId } from '../platform/layout/slots';

export function boot(): ServiceRegistry {
  const registry = new ServiceRegistry();

  // Layout — set non-default visibility before any component reads it
  const layout = new LayoutService();
  layout.setVisibility(SlotId.AuxSideBar, false);
  layout.setVisibility(SlotId.Panel, false);
  registry.register(LayoutServiceId, layout);

  // Theme — reads active state from DOM classes already applied by applyInitialTheme()
  const theme = new ThemeService(document.documentElement, BUILT_IN_THEMES);
  registry.register(ThemeServiceId, theme);

  // Font — reads active font-set class already applied by applyInitialTheme()
  const font = new FontService(document.documentElement, BUILT_IN_FONT_SETS);
  registry.register(FontServiceId, font);

  // StatusBar — seed six ADR-409 anchored entries
  const statusBar = new StatusBarService();
  for (const entry of ANCHORED_ENTRIES) statusBar.register(entry);
  registry.register(StatusBarServiceId, statusBar);

  return registry;
}
