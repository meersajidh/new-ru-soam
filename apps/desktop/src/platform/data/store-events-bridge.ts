/**
 * Renderer-side bridge: Local Store change events → TanStack Query invalidation.
 *
 * Phase 10a. Subscribes to `window.soam.events.on(...)` and, on every
 * `store.changed` PlatformEvent, invalidates the matching TanStack Query
 * keys. Key convention is `[capabilityNamespace, ...]` per ADR-412 §"Pattern 2"
 * and `docs/Guides/tanstack-query-keys.md` — a change to `table='prefs'`
 * invalidates every query whose key starts with `['prefs']` (TanStack's
 * default prefix-match behavior).
 *
 * `queryClient` is passed in (not imported at module scope) so the bridge
 * stays testable without standing up a Provider tree.
 *
 * Returns a disposer per `docs/Guides/disposable-pattern.md` — call it to
 * detach the subscription. The bridge is mounted once at app boot from
 * `App.tsx`.
 */

import type { QueryClient } from '@tanstack/react-query';
import type {
  PlatformEvent,
  StoreChangedPayload,
} from '../../../electron/shared/ipc-protocol';

function isStoreChangedPayload(p: unknown): p is StoreChangedPayload {
  if (!p || typeof p !== 'object') return false;
  const o = p as Record<string, unknown>;
  return typeof o['table'] === 'string' && typeof o['op'] === 'string';
}

/**
 * Subscribe to `store.changed` events and invalidate TanStack Query keys
 * scoped to the changed table. Returns a disposer.
 */
export function mountStoreEventsBridge(queryClient: QueryClient): () => void {
  return window.soam.events.on((event: PlatformEvent) => {
    if (event.name !== 'store.changed') return;
    if (!isStoreChangedPayload(event.payload)) return;
    const { table } = event.payload;
    // Prefix match: invalidates ['prefs'], ['prefs', 'list'],
    // ['prefs', 'get', key], etc.
    void queryClient.invalidateQueries({ queryKey: [table] });
  });
}
