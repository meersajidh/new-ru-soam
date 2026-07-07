/**
 * @ru-soam/view-kit — React adapter for bundle-view bridge (ADR-419).
 *
 * Public surface:
 *   <ViewRoot>       — mandatory root; awaits bridge, provides QueryClient + entityId context
 *   useSoamView()    — returns typed window.soamView
 *   useViewContext() — returns { entityId } from parent renderer 'context' push
 *   useViewQuery()   — returns parsed URL query params (for pinned editor tabs with ?id=)
 *   useCapQuery()    — TanStack useQuery over a bound query capability
 *   useCapMutation() — TanStack useMutation over a bound command capability
 *
 * Rendering primitives (Icon, etc.) now come from `@basebench/ui` (ADR-421 F3c)
 * — not re-exported here.
 *
 * Types re-exported for consumer type-checking (bridge shapes are ambient; import
 * type only — they do not exist as runtime values):
 *   BoundProxy, IDisposable, SoamView, ViewBoot, ViewContextMessage, ViewContextValue
 */

export { ViewRoot } from './ViewRoot.js';

export {
  ViewContext,
  ChannelContext,
  useSoamView,
  useViewContext,
  useViewQuery,
  useCapQuery,
  useCapMutation,
  useViewChannel,
  CHANNEL_KIND_PAYLOAD,
  CHANNEL_NAMES,
  type ViewContextValue,
  type ViewChannelName,
  type ChannelStore,
} from './hooks.js';

export type {
  BoundProxy,
  IDisposable,
  SoamView,
  ViewBoot,
  ViewContextMessage,
  ViewInitMessage,
} from './bridge-types.js';
