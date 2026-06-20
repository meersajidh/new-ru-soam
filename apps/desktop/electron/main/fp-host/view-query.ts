/**
 * Platform-owned TanStack Query wrapper for bundle-view iframes.
 * Auto-injected inline by view-protocol.ts AFTER view-query-vendor.ts
 * (which sets window.__tanstackQueryCore) and AFTER view-bootstrap.ts.
 *
 * Exposes window.__viewQuery with:
 *
 *   client          — singleton QueryClient (staleTime supplied per observer)
 *
 *   observeQuery({ queryKey, queryFn, staleTime? })
 *     → { subscribe(cb), refetch(), getCurrent(), destroy() }
 *     queryFn: () => Promise<T>  (caller-supplied thunk; wraps existing cap proxy)
 *     subscribe cb: (result: { data, status, fetchStatus, dataUpdatedAt }) => void
 *
 *   runMutation({ run, optimistic?, invalidateKeys? })
 *     → Promise<T>
 *     run: () => Promise<T>          — the actual mutation
 *     optimistic?: (client) => any   — cache patch; return rollback fn or undefined
 *     invalidateKeys?: string[][]    — prefix-matched keys to invalidate on settle
 *
 *   invalidate(queryKey)
 *     → void  — prefix-match invalidate (e.g. ['schedule.calendar'] hits all)
 *
 * All cap proxies must be bound by the VIEW itself (soamView.bindQuery/bindCommand)
 * before passing queryFns here. This seam is cap-agnostic.
 *
 * If window.__tanstackQueryCore is missing (vendor failed to load), exposes
 * no-op stubs + console.error — never throws at module top to avoid aborting
 * the view IIFE (same lesson as the codicons gotcha).
 *
 * Source is verified free of any script-closing sequence (</script).
 * Hand-written IIFE — no ES imports, no backtick template literals with ${}.
 */

export const VIEW_QUERY_SOURCE = `(function () {
  'use strict';

  /* ── Guard: vendor must exist ─────────────────────────────────────── */
  var core = window.__tanstackQueryCore;
  if (!core || typeof core.QueryClient !== 'function') {
    console.error('[__viewQuery] __tanstackQueryCore not found — using no-op stubs');
    window.__viewQuery = {
      client: null,
      observeQuery: function () {
        return { subscribe: function () { return function () {}; }, refetch: function () {}, getCurrent: function () { return null; }, destroy: function () {} };
      },
      runMutation: function (opts) { return (opts && opts.run) ? opts.run() : Promise.resolve(null); },
      invalidate: function () {},
    };
    return;
  }

  /* ── Singleton QueryClient ─────────────────────────────────────────── */
  /* Defaults mirror apps/desktop/src/provider.ts:
   *   retry: 1, gcTime: 10 min
   * staleTime is supplied per-observer (not here). */
  var client = new core.QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        gcTime: 10 * 60 * 1000,
        refetchOnWindowFocus: false,
      },
    },
  });

  /* ── observeQuery ───────────────────────────────────────────────────── */
  /* Creates a QueryObserver for the given key + thunk.
   * Returns { subscribe(cb), refetch(), getCurrent(), destroy() }.
   * Caller owns lifecycle: call destroy() when done. */
  function observeQuery(opts) {
    var queryKey = opts.queryKey;
    var queryFn = opts.queryFn;
    var staleTime = typeof opts.staleTime === 'number' ? opts.staleTime : 30000;

    var observer = new core.QueryObserver(client, {
      queryKey: queryKey,
      queryFn: queryFn,
      staleTime: staleTime,
      retry: 1,
    });

    var unsubscribe = function () {};

    function subscribe(cb) {
      unsubscribe = observer.subscribe(function (result) {
        cb(result);
      });
      /* QueryObserver.subscribe does NOT replay current state to a new listener.
       * A cached-fresh query (within staleTime) triggers no mount fetch → no
       * state change → the listener would never fire and a revisit hangs on the
       * loading spinner forever. Emit the current result once on subscribe so
       * cached data paints immediately; a cold query emits 'pending' here (no-op
       * for the caller) then fires again on fetch settle. updateResult() first so
       * getCurrentResult() reflects mount-time fetch status. */
      observer.updateResult();
      cb(observer.getCurrentResult());
      return unsubscribe;
    }

    function refetch() {
      client.invalidateQueries({ queryKey: queryKey });
    }

    function getCurrent() {
      return observer.getCurrentResult();
    }

    function destroy() {
      unsubscribe();
      observer.destroy();
    }

    return { subscribe: subscribe, refetch: refetch, getCurrent: getCurrent, destroy: destroy };
  }

  /* ── runMutation ─────────────────────────────────────────────────────── */
  /* Thin optimistic-mutation helper (no MutationObserver — lighter weight
   * for fire-and-forget writes with optimistic cache updates).
   *
   *   run()          — the actual async mutation
   *   optimistic(c)  — optional; patches cache via client.setQueryData;
   *                    return a rollback fn (or undefined for no rollback)
   *   invalidateKeys — array of queryKey prefixes to invalidate on settle
   */
  function runMutation(opts) {
    var run = opts.run;
    var optimistic = opts.optimistic || null;
    var invalidateKeys = opts.invalidateKeys || [];

    var rollback = null;

    /* Apply optimistic update. */
    if (optimistic) {
      try {
        rollback = optimistic(client) || null;
      } catch (e) {
        console.warn('[__viewQuery] optimistic update threw', e);
      }
    }

    return run().then(
      function (result) {
        /* On success: invalidate specified keys (triggers refetch for observers). */
        for (var i = 0; i < invalidateKeys.length; i++) {
          client.invalidateQueries({ queryKey: invalidateKeys[i] });
        }
        return result;
      },
      function (err) {
        /* On error: rollback optimistic update if provided. */
        if (rollback && typeof rollback === 'function') {
          try { rollback(); } catch (e2) { console.warn('[__viewQuery] rollback threw', e2); }
        } else {
          /* No rollback fn but keys changed — still invalidate to resync. */
          for (var i = 0; i < invalidateKeys.length; i++) {
            client.invalidateQueries({ queryKey: invalidateKeys[i] });
          }
        }
        return Promise.reject(err);
      }
    );
  }

  /* ── invalidate convenience ──────────────────────────────────────────── */
  function invalidate(queryKey) {
    client.invalidateQueries({ queryKey: queryKey });
  }

  /* ── Expose ──────────────────────────────────────────────────────────── */
  window.__viewQuery = {
    client: client,
    observeQuery: observeQuery,
    runMutation: runMutation,
    invalidate: invalidate,
  };
})();
`;
