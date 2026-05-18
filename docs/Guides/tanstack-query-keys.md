# TanStack Query keys

How the renderer talks to capabilities, and how change events keep that cache honest.

Anchored in ADR-412 §"Pattern 2" and ADR-302's change-event surface (Phase 10a).

## Why a convention

Every capability call crosses at least one process boundary (renderer → Main, or renderer → Bundle Host). Without caching the renderer would re-fire `list` on every mount, deduplicate nothing, and miss the chance to invalidate stale reads when underlying data changes. TanStack Query gives us all three for free — but only if the keys are shaped predictably enough that invalidation can find them.

## Key shape

```
[capabilityNamespace, operation, ...keyArgs]
```

The **first segment is always the capability's top-level namespace** (the part before any dots in the capability id). This is what change events match against. The second segment is the operation name. Anything after that is whatever identifies *which slice* of the resource the query asks about — IDs, filters, etc.

Examples:

```ts
['prefs', 'list']
['prefs', 'get', key]
['patients', 'list', { entityId }]
['patients', 'get', patientId]
['audit', 'entry', entryId]
```

Filters / structured args go as plain objects; TanStack Query handles deep-equality matching.

## Where reads and writes go

- **Reads** go through `useQuery` / `useInfiniteQuery`. The `queryFn` body calls the bound capability proxy:

  ```ts
  const prefs = usePrefsCapability();
  const { data } = useQuery({
    queryKey: ['prefs', 'list'],
    queryFn: () => prefs!.list(),
    enabled: prefs !== null,
  });
  ```

- **Writes** go through `useMutation`. Do NOT call `queryClient.invalidateQueries` in `onSuccess` — let the change-event bridge do it (see below). Inline invalidation duplicates work and races the bridge.

- **Capability binding** uses `useCapability<T>(name, version)` (or the typed wrapper like `usePrefsCapability()`). The proxy is bound once per component and disposed on unmount.

## Invalidation via change events

The Local Store (ADR-302) emits a `store.changed` PlatformEvent after every write:

```ts
{ name: 'store.changed', payload: { table: 'prefs', op: 'set', keys: ['theme.accent'] } }
```

The renderer-side bridge (`src/platform/data/store-events-bridge.ts`) is mounted once at app boot in `App.tsx` and translates this into:

```ts
queryClient.invalidateQueries({ queryKey: [payload.table] });
```

TanStack's default behavior is **prefix match** — invalidating `['prefs']` invalidates every query whose key starts with `['prefs']`, which is exactly the set scoped to that capability namespace. This is why the first key segment must equal the table name the capability writes to.

A mutation flow therefore looks like:

```
renderer.useMutation → prefs.set(k, v)
   → Main: LocalStore.setPref → emitChange({ table: 'prefs', ... })
      → renderer: store-events-bridge invalidates ['prefs']
         → every useQuery(['prefs', ...]) refetches
```

No explicit `invalidateQueries` call in the renderer's mutation handler.

## Multi-table writes

A single capability call may touch more than one table. The store emits one `store.changed` per affected table; the bridge invalidates each independently. Capability authors do not need to widen the payload shape.

## What this guide does not commit

- Per-row granularity (`['prefs', 'get', key]` invalidated only when *that* key changed). Phase 10a invalidates the whole namespace on any write. Per-row matching can land if and when query volume warrants it — the change event already carries the affected keys.
- Optimistic updates. Not used in Phase 10a; mutations refetch on success.
- Suspense integration. Queries use the standard loading / error pattern, not React Suspense.
