import { serviceId } from './service-id';
import type { ILayoutService } from '../layout/layout-service';
import type { IThemeService } from '../theme/theme-service';
import type { IStatusBarService } from '../statusbar/statusbar-service';
import type { IFontService } from '../font/font-service';
import type { ICommandService } from '../command/command-service';
import type { IContextKeyService } from '../context-key/context-key-service';
import type { IKeybindingService } from '../keybinding/keybinding-service';
import type { IWorkspaceService } from '../workspace/workspace-service';
import type { IEditorService } from '../editor/editor-service';
import type { IRuEditService } from '../ru-edit/ru-edit-service';
import type { ISnippetService } from '../snippet/snippet-service';
import type { INotificationService } from '../notification/notification-service';
import { createContext } from 'react';
import type { ServiceRegistry } from './registry';

// Phase 2
export const LayoutServiceId = serviceId<ILayoutService>('workbench.layout');
export const ThemeServiceId = serviceId<IThemeService>('workbench.theme');
export const StatusBarServiceId = serviceId<IStatusBarService>('workbench.statusbar');
export const FontServiceId = serviceId<IFontService>('workbench.font');

// Phase 3
export const CommandServiceId = serviceId<ICommandService>('workbench.command');
export const ContextKeyServiceId = serviceId<IContextKeyService>('workbench.contextKey');
export const KeybindingServiceId = serviceId<IKeybindingService>('workbench.keybinding');

// Phase 4
export const WorkspaceServiceId = serviceId<IWorkspaceService>('workbench.workspace');

// Phase 5
export const EditorServiceId = serviceId<IEditorService>('workbench.editor');

// Phase 7.5b
export const RuEditServiceId = serviceId<IRuEditService>('workbench.ruEdit');

// Phase 8
export const SnippetServiceId = serviceId<ISnippetService>('workbench.snippet');

// Phase 6
export const BundleServiceId = serviceId<unknown>('workbench.bundle');

// Phase 9
export const NotificationServiceId = serviceId<INotificationService>('workbench.notification');

// Phase 11
export const RouterServiceId = serviceId<unknown>('workbench.router');

export const RegistryContext = createContext<ServiceRegistry | null>(null);
