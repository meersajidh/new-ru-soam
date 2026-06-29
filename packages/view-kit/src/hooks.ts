import { createContext, useContext, useRef } from 'react';
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
