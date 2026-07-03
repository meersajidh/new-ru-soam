import { createContext, useContext, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { BoundProxy, SoamView } from './bridge-types.js';

// ---------------------------------------------------------------------------
// View context (provided by <ViewRoot>, consumed by useViewContext)
// ---------------------------------------------------------------------------

export interface ViewContextValue {
  entityId: string | undefined;
}

/**
 * React context carrying the entity id pushed by the parent renderer via the
 * 'context' postMessage (see view-bridge.ts). ViewRoot provides the value;
 * do NOT use this context directly — use useViewContext().
 */
export const ViewContext = createContext<ViewContextValue>({ entityId: undefined });

// ---------------------------------------------------------------------------
// Public hooks
// ---------------------------------------------------------------------------

/**
 * Returns the live `window.soamView` bridge object.
 * Throws if called outside <ViewRoot> (before the bridge is initialised).
 */
export function useSoamView(): SoamView {
  const view = window.soamView;
  if (!view) {
    throw new Error(
      'useSoamView: window.soamView is not available. ' +
        'Call useSoamView() inside a component rendered under <ViewRoot>.',
    );
  }
  return view;
}

/**
 * Returns the parsed URL query params of the view as a key→value map.
 *
 * Entity id for pinned editor tabs arrives as `?id=` (+ optional `?title=`),
 * read here; context-following views use useViewContext() instead.
 *
 * Implemented via `window.__viewBoot.parseQuery(window.location.search)`.
 * Memoised once — a pinned editor tab's URL is static for the tab's lifetime.
 */
export function useViewQuery(): Record<string, string> {
  return useMemo(() => window.__viewBoot.parseQuery(window.location.search), []);
}

/**
 * Returns the current context entity id as pushed by the parent renderer.
 * Updates reactively when subsequent 'context' messages arrive.
 * Returns `{ entityId: undefined }` when no entity is active.
 */
export function useViewContext(): ViewContextValue {
  return useContext(ViewContext);
}

// ---------------------------------------------------------------------------
// Capability hooks
// ---------------------------------------------------------------------------

interface ProxyCacheEntry {
  /** `capId@version` key so we re-bind when either changes. */
  key: string;
  promise: Promise<BoundProxy>;
}

/**
 * Bind a query capability and execute a method via TanStack useQuery.
 *
 * @param capId   - capability namespace (e.g. `'sessions.meeting.query'`)
 * @param version - semver string (e.g. `'1.0'`)
 * @param method  - method name on the cap proxy
 * @param args    - positional args forwarded to proxy.call(method, ...args).
 *                  Defaults to []. queryKey = [capId, method, ...args].
 * @param options - optional query options:
 *   - `enabled`   (default `true`)  — when false the query does not fetch;
 *                  react-query keeps `isPending` with `fetchStatus:'idle'`.
 *                  Use to gate context-following views until entityId arrives.
 *   - `staleTime` (default 30 000)  — milliseconds before data is considered stale.
 *
 * The bound proxy is memoised per (capId, version) inside the hook instance.
 */
export function useCapQuery(
  capId: string,
  version: string,
  method: string,
  args: unknown[] = [],
  options?: { enabled?: boolean; staleTime?: number },
) {
  const proxyRef = useRef<ProxyCacheEntry | null>(null);
  const proxyKey = `${capId}@${version}`;

  return useQuery({
    queryKey: [capId, method, ...args],
    queryFn: async () => {
      if (!proxyRef.current || proxyRef.current.key !== proxyKey) {
        proxyRef.current = {
          key: proxyKey,
          promise: window.soamView.bindQuery(capId, version),
        };
      }
      const proxy = await proxyRef.current.promise;
      return proxy.call(method, ...args);
    },
    enabled: options?.enabled ?? true,
    staleTime: options?.staleTime ?? 30_000,
  });
}

// ---------------------------------------------------------------------------
// View channel context + hook (schedule channels and other parent-renderer
// push channels delivered on init/context messages or as dedicated messages)
// ---------------------------------------------------------------------------

/**
 * Named parent-renderer channels that can be subscribed to via useViewChannel.
 *
 * Channel values arrive in two ways:
 *   1. As named fields on 'init' and 'context' messages
 *      (e.g. `msg.scheduleViewState`).
 *   2. As dedicated messages `{ __soamView:true, kind:<name>, <payloadKey>: value }`.
 *      The payloadKey for each kind is defined in CHANNEL_KIND_PAYLOAD below.
 */
export type ViewChannelName =
  | 'scheduleViewState'
  | 'scheduleCounts'
  | 'activeEvent'
  | 'overviewViewMode'
  | 'scheduleRefreshSettings'
  | 'scheduleDisplaySettings'
  | 'auxVisible';

export type ChannelStore = Partial<Record<ViewChannelName, unknown>>;

/**
 * Map from dedicated message kind (= ViewChannelName) to its payload key on
 * the message object.
 *
 * e.g. `{ __soamView:true, kind:'scheduleViewState', state:{...} }` → store['scheduleViewState'] = state
 */
export const CHANNEL_KIND_PAYLOAD: Record<ViewChannelName, string> = {
  scheduleViewState: 'state',
  scheduleCounts: 'counts',
  activeEvent: 'event',
  overviewViewMode: 'mode',
  scheduleRefreshSettings: 'settings',
  scheduleDisplaySettings: 'settings',
  auxVisible: 'visible',
};

/** All channel names for iteration. */
export const CHANNEL_NAMES: ViewChannelName[] = Object.keys(
  CHANNEL_KIND_PAYLOAD,
) as ViewChannelName[];

/**
 * React context carrying the channel store. Provided by <ViewRoot>; do NOT
 * use this context directly — use useViewChannel().
 */
export const ChannelContext = createContext<ChannelStore>({});

/**
 * Returns the latest value pushed by the parent renderer on the named channel.
 * Returns `undefined` before the first push.
 *
 * Seeded on mount from:
 *   - The bridge's buffered 'init' payload (view.initPayload()) — for channel
 *     values injected at bridge init time (e.g. initial scheduleViewState).
 *   - The bridge's buffered 'context' payload (view.currentContext()) — for
 *     channel values co-delivered with the entity-id push.
 *
 * Updated reactively by subsequent dedicated channel messages:
 *   `{ __soamView:true, kind:<name>, <payloadKey>:<value> }`
 * and by 'context' updates that carry channel fields.
 *
 * @example
 *   const state = useViewChannel<ScheduleViewState>('scheduleViewState');
 */
export function useViewChannel<T = unknown>(name: ViewChannelName): T | undefined {
  const store = useContext(ChannelContext);
  return store[name] as T | undefined;
}

/**
 * Bind a command capability and return a TanStack useMutation.
 *
 * `mutation.mutate(args)` — pass positional args as an array:
 *   `mutation.mutate(['patientId', 'someValue'])`
 *
 * On success, all queries are invalidated (broad-invalidate; v1 behaviour).
 */
export function useCapMutation(capId: string, version: string, method: string) {
  const qc = useQueryClient();
  const proxyRef = useRef<ProxyCacheEntry | null>(null);
  const proxyKey = `${capId}@${version}`;

  return useMutation({
    mutationFn: async (args: unknown[]) => {
      if (!proxyRef.current || proxyRef.current.key !== proxyKey) {
        proxyRef.current = {
          key: proxyKey,
          promise: window.soamView.bindCommand(capId, version),
        };
      }
      const proxy = await proxyRef.current.promise;
      return proxy.call(method, ...args);
    },
    onSuccess: () => {
      void qc.invalidateQueries();
    },
  });
}
