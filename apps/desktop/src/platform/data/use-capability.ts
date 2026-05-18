/**
 * Capability binding hooks for the renderer (Phase 10a).
 *
 * `useCapability(name, version)` binds a capability proxy via
 * `window.soam.bindCapability` and memoises it per (name, version, mounting
 * component). The proxy is disposed on unmount. Each method on a capability
 * routes through `proxy.call(method, ...args)` per ADR-202.
 *
 * `usePrefsCapability()` is the typed wrapper for `prefs@1.0` — preferred
 * over the generic hook for clarity since this phase has one consumer.
 *
 * Per ADR-412 §"Pattern 2", capability calls are wrapped in `useQuery` /
 * `useMutation`; this hook returns the proxy that those queries call into.
 */

import { useEffect, useRef, useState } from 'react';

interface PrefRow {
  readonly key: string;
  readonly value: string;
  readonly updatedAt: number;
}

export interface PrefsCapability {
  readonly get: (key: string) => Promise<{ value: string | null }>;
  readonly set: (key: string, value: string) => Promise<{ ok: true }>;
  readonly list: () => Promise<PrefRow[]>;
}

/**
 * Bind the typed `prefs@1.0` capability. The returned object is stable
 * across re-renders for the lifetime of the component; methods route through
 * the underlying soam proxy. Proxy is disposed on unmount.
 *
 * Returns `null` until the proxy has been bound (the bind handshake is
 * async even though Phase 1 makes it effectively synchronous).
 */
export function usePrefsCapability(): PrefsCapability | null {
  const [cap, setCap] = useState<PrefsCapability | null>(null);
  const disposeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    window.soam
      .bindCapability('prefs', '1.0')
      .then((proxy) => {
        if (cancelled) {
          proxy.dispose();
          return;
        }
        disposeRef.current = () => proxy.dispose();
        const wrapper: PrefsCapability = {
          get: (key) => proxy.call('get', key) as Promise<{ value: string | null }>,
          set: (key, value) => proxy.call('set', key, value) as Promise<{ ok: true }>,
          list: () => proxy.call('list') as Promise<PrefRow[]>,
        };
        setCap(wrapper);
      })
      .catch((err: unknown) => {
        // Surface in console; the dev panel will show "binding failed" via null state.
        console.error('[prefs] bindCapability failed:', err);
      });
    return () => {
      cancelled = true;
      disposeRef.current?.();
      disposeRef.current = null;
    };
  }, []);

  return cap;
}
