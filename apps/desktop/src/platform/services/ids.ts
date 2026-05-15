import { serviceId } from './service-id';
import type { ILayoutService } from '../layout/layout-service';
import type { IThemeService } from '../theme/theme-service';
import type { IStatusBarService } from '../statusbar/statusbar-service';
import type { IFontService } from '../font/font-service';

// Phase 2
export const LayoutServiceId    = serviceId<ILayoutService>('workbench.layout');
export const ThemeServiceId     = serviceId<IThemeService>('workbench.theme');
export const StatusBarServiceId = serviceId<IStatusBarService>('workbench.statusbar');
export const FontServiceId      = serviceId<IFontService>('workbench.font');

// Phase 3
export const CommandServiceId    = serviceId<unknown>('workbench.command');
export const ContextKeyServiceId = serviceId<unknown>('workbench.contextKey');
export const KeybindingServiceId = serviceId<unknown>('workbench.keybinding');

// Phase 4
export const WorkspaceServiceId = serviceId<unknown>('workbench.workspace');

// Phase 5
export const EditorServiceId = serviceId<unknown>('workbench.editor');

// Phase 6
export const BundleServiceId = serviceId<unknown>('workbench.bundle');

// Phase 9
export const NotificationServiceId = serviceId<unknown>('workbench.notification');

// Phase 11
export const RouterServiceId = serviceId<unknown>('workbench.router');
