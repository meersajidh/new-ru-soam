import type { ILayoutService } from '../platform/layout/layout-service';
import type { ICommandService } from '../platform/command/command-service';
import type { IContextKeyService } from '../platform/context-key/context-key-service';
import type { IKeybindingService } from '../platform/keybinding/keybinding-service';
import type { IThemeService } from '../platform/theme/theme-service';
import { SlotId } from '../platform/layout/slots';

export function registerPlatformCommands(
  layout: ILayoutService,
  contextKeys: IContextKeyService,
  commands: ICommandService,
  keybindings: IKeybindingService,
  theme: IThemeService,
): void {
  commands.register(
    'workbench.togglePrimarySideBar',
    'View: Toggle Primary Side Bar',
    () => layout.toggleVisibility(SlotId.PrimarySideBar),
    { category: 'View' },
  );
  commands.register(
    'workbench.togglePanel',
    'View: Toggle Panel',
    () => layout.toggleVisibility(SlotId.Panel),
    { category: 'View' },
  );
  commands.register(
    'workbench.toggleAuxSideBar',
    'View: Toggle Auxiliary Side Bar',
    () => layout.toggleVisibility(SlotId.AuxSideBar),
    { category: 'View' },
  );
  commands.register(
    'workbench.openCommandPalette',
    'Show All Commands',
    () => contextKeys.set('commandPalette.open', true),
    { category: 'View' },
  );
  commands.register(
    'workbench.openSettings',
    'Open Settings',
    () => { /* Phase 11 */ },
    { category: 'Preferences' },
  );
  commands.register(
    'workbench.developer.listContextKeys',
    'Developer: List Context Keys',
    () => console.log('[context-keys]', contextKeys.snapshot()),
    { category: 'Developer' },
  );

  commands.register(
    'workbench.theme.bamboo',
    'Color Theme: Bamboo',
    () => theme.setTheme('bamboo'),
    { category: 'Preferences' },
  );
  commands.register(
    'workbench.theme.stone',
    'Color Theme: Stone',
    () => theme.setTheme('stone'),
    { category: 'Preferences' },
  );
  commands.register(
    'workbench.theme.geist',
    'Color Theme: Geist',
    () => theme.setTheme('geist'),
    { category: 'Preferences' },
  );
  commands.register(
    'workbench.toggleDarkMode',
    'Toggle Dark Mode',
    () => theme.setDarkMode(!theme.isDark()),
    { category: 'Preferences' },
  );

  keybindings.registerKeybinding('ctrl+b',       'workbench.togglePrimarySideBar');
  keybindings.registerKeybinding('ctrl+j',       'workbench.togglePanel');
  keybindings.registerKeybinding('ctrl+alt+b',   'workbench.toggleAuxSideBar');
  keybindings.registerKeybinding('ctrl+shift+p', 'workbench.openCommandPalette');
  keybindings.registerKeybinding('ctrl+,',       'workbench.openSettings');
}
