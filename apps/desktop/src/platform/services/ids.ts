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
import type { IProductConfigService } from '../product-config/product-config-service';
import type { IContributionService } from '../contributions/contribution-service';
import type { IMenuService } from '../menu/menu-service';
import type { IActivityBarDensityService } from '../activity-bar/density-service';
import type { IMaturityHighlightService } from '../maturity/maturity-highlight';
import type { IOverviewViewModeService } from '../view-mode/overview-view-mode';
import type { IScheduleViewStateService } from '../view-mode/schedule-view-state';
import type { IScheduleCountsService } from '../view-mode/schedule-counts';
import type { IActiveEventService } from '../view-mode/active-event';
import type { ITelemetryModeService } from '../telemetry/telemetry-mode-service';
import type { ICloudSessionService } from '../cloud/cloud-session-service';
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

// ADR-106: base product-config seam (domain overrides via bootstrap)
export const ProductConfigServiceId = serviceId<IProductConfigService>('workbench.productConfig');

// Stage 2: contribution host (activity bar items + view containers)
export const ContributionServiceId = serviceId<IContributionService>('workbench.contributions');

// ADR-417: menu + context-menu primitive
export const MenuServiceId = serviceId<IMenuService>('workbench.menu');

// Activity bar density (appearance axis, mirrors FontServiceId pattern)
export const ActivityBarDensityServiceId = serviceId<IActivityBarDensityService>('workbench.activityBarDensity');

// Maturity-highlight toggle (Phase 0 build-legibility, mirrors density pattern)
export const MaturityHighlightServiceId = serviceId<IMaturityHighlightService>('workbench.maturityHighlight');

// Overview view-mode (dense/focused/timeline, O455)
export const OverviewViewModeServiceId = serviceId<IOverviewViewModeService>('workbench.overviewViewMode');

// Schedule view-state (agenda/day/week/month + calRev cross-iframe refresh signal)
export const ScheduleViewStateServiceId = serviceId<IScheduleViewStateService>('workbench.scheduleViewState');

// Schedule counts — non-persisted per-classification event counts relayed from schedule.html
export const ScheduleCountsServiceId = serviceId<IScheduleCountsService>('workbench.scheduleCounts');

// Active event — non-persisted currently-selected calendar event relayed from schedule.html
export const ActiveEventServiceId = serviceId<IActiveEventService>('workbench.activeEvent');

// Telemetry mode (off/online-only/on, prefs-backed, shared source of truth)
export const TelemetryModeServiceId = serviceId<ITelemetryModeService>('workbench.telemetryMode');

// Cloud session state (configured/signedIn, event-backed, live status-bar + reconnect)
export const CloudSessionServiceId = serviceId<ICloudSessionService>('workbench.cloudSession');

export const RegistryContext = createContext<ServiceRegistry | null>(null);
