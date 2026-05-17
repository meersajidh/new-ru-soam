# Services in renderer: registry + TanStack Query

**ID:** ADR-412
**Status:** Accepted
**Date:** 2026-05-13
**Supersedes:** —
**Superseded by:** —
**Related:** ADR-102, ADR-103, ADR-302, ADR-307, ADR-401, ADR-404, ADR-406, ADR-407, ADR-410, ADR-411

## Context

The renderer needs a way to access cross-cutting state and behaviour: the LayoutService (ADR-401), the ContextKeyService (ADR-407), the EditorService (ADR-404), the CommandService (ADR-406), and platform capability proxies for IPC-bound services (ADR-103). Without a deliberate pattern, components reach into singleton imports, prop-drill, or invent ad-hoc context providers — and the result is a renderer where "who owns this state" is impossible to answer.

VSCode's answer is **constructor-based DI with typed service identifiers** (`@IFileService` decorators wiring concrete implementations at boot via an InstantiationService). The pattern works in their stack — they own a custom TypeScript build with reflection-style metadata. Ru-soam's stack is **React + TypeScript, modern (2026)** without TS experimental decorators, with TanStack Query already in play for asynchronous data orchestration. The constraint shapes the choice: a model that gives the same outcomes (typed, singleton, registered at boot, testable, swappable) without the decorator machinery.

This ADR commits the renderer's service model: a typed **service registry** for renderer-internal singletons, and **TanStack Query** as the discipline for capability-backed asynchronous data. The two compose; they have different jobs.

## Decision

### Two layers, two patterns

The renderer has two distinct categories of "service-like" concerns:

1. **Renderer-internal services** — singletons owning renderer-only state and behaviour: layout, editors, commands, context keys, theme, notifications. These are state owners, not data fetchers. Pattern: **typed service registry + hooks**.
2. **Capability-backed data** — asynchronous reads and writes against platform capabilities (ADR-103) that resolve in Main or in a Bundle Host. Pattern: **TanStack Query wrapping capability calls**.

The same component can use both: it consumes the EditorService through `useService(EditorService)` and consumes the patient list through `useQuery(['patient', 'list'], () => patientsCapability.list())`.

### Pattern 1: Service registry

A **ServiceRegistry** is a typed map of `ServiceId<T>` → instance-of-T. It is created once at renderer boot and seeded with the platform's core services before the first React render.

Illustrative shape:

```ts
// platform/services/registry.ts
export interface ServiceId<T> {
  readonly id: string;
  readonly _type?: T; // type-only marker, never read at runtime
}

export function serviceId<T>(id: string): ServiceId<T> {
  return { id };
}

export class ServiceRegistry {
  private services = new Map<string, unknown>();
  register<T>(id: ServiceId<T>, impl: T): Disposable;
  get<T>(id: ServiceId<T>): T;        // throws if not registered
  has<T>(id: ServiceId<T>): boolean;
}

// service declarations (one per service)
export const LayoutService     = serviceId<ILayoutService>('LayoutService');
export const ContextKeyService = serviceId<IContextKeyService>('ContextKeyService');
export const EditorService     = serviceId<IEditorService>('EditorService');
export const CommandService    = serviceId<ICommandService>('CommandService');
export const ThemeService      = serviceId<IThemeService>('ThemeService');
export const NotificationService = serviceId<INotificationService>('NotificationService');
// ...

// boot
const registry = new ServiceRegistry();
registry.register(LayoutService, new LayoutServiceImpl());
registry.register(ContextKeyService, new ContextKeyServiceImpl());
// ...
```

Components consume services through a hook:

```ts
const layout = useService(LayoutService);
const ctxKeys = useService(ContextKeyService);
```

`useService` looks up the registry (provided via a single top-level React context) and returns the typed instance. The hook does not subscribe to anything — services manage their own change events. Components that need reactive state subscribe through the service's own `onDidChange*` events, typically wrapped in a small hook (`useLayoutVisible`, `useActiveEditor`, etc.).

This gives:

- Typed access without decorators.
- One source of truth per service.
- Swappable implementations (tests register stubs; alternative implementations register at boot).
- No prop drilling, no per-service context provider proliferation, no global imports.

### Pattern 2: TanStack Query for capability-backed data

Capability calls (ADR-103) are asynchronous and cross at least one process boundary. The renderer needs:

- caching to avoid re-firing the same `list` capability for every component that asks,
- invalidation when underlying data changes (the Local Store, ADR-302, emits change events),
- request deduplication when the same query mounts in multiple components,
- optimistic updates with rollback on failure,
- loading / error / refresh state in components.

TanStack Query gives all of this out of the box. The discipline:

- **Every capability *read* call goes through `useQuery` or `useInfiniteQuery`.** Key convention: `[capabilityNamespace, operation, ...keyArgs]` — e.g., `['patients', 'list', { entityId }]`, `['audit', 'entry', entryId]`.
- **Every capability *write* call goes through `useMutation`** and invalidates the relevant queries on success.
- **Capability change events** (emitted by Main when a watched resource changes; ADR-302 §"change events" forthcoming) **invalidate the matching query keys**. A small bridge subscribes to the platform's change-event capability at boot and dispatches `queryClient.invalidateQueries(...)`.
- **Capability bindings are stable**: `useService` is not used for capability proxies. Instead, a `useCapability<T>(id, version)` hook returns the typed proxy (memoised); the proxy's method calls are invoked from within `queryFn` / `mutationFn`.

Illustrative:

```ts
function PatientList() {
  const patients = useCapability<PatientsCapability>('patients', '1.0');
  const { data, isLoading } = useQuery({
    queryKey: ['patients', 'list', { entityId }],
    queryFn: () => patients.list({ entityId }),
  });
  // ...
}
```

For local-first writes (ADR-302), mutations write to local first; the sync queue handles propagation. TanStack Query's `onMutate` / `onSuccess` lifecycle aligns naturally — optimistic update on `onMutate`, server-truth refetch on `onSuccess` if needed, rollback on `onError`.

### Service categories

**Core renderer services** (registered by the platform at boot):

- `LayoutService` — Parts, slots, visibility, sizing.
- `EditorService` — Editor groups, active editor, open/close.
- `CommandService` — Renderer-side mirror of the command metadata; dispatches via the `commands` capability.
- `ContextKeyService` — Live key dictionary, expression evaluator.
- `ThemeService` — Active theme tokens; emits change events.
- `NotificationService` — Banners (ADR-401) and toasts.
- `WorkspaceService` — Active workspace (Entity) identity, lifecycle events (open / close / lock / unlock / setup-complete). Mirrors the Main-side `LockService` (ADR-307) lock state to the renderer; emits `onDidWorkspaceLock` and `onDidWorkspaceUnlock`. Subscribes to capability-bridge events so auto-lock triggers (idle, suspend, screen-lock) surface uniformly.
- `BundleService` — Renderer-side mirror of installed bundle metadata (id, manifest summary, active state).
- `KeybindingService` — Compiled keybindings registry, dispatch logic.
- `RouterService` — Top-level routing within the shell (Settings, Recovery, Onboarding, workspace shell).

The exact set evolves as the shell grows; these are the load-bearing entries.

**Capability proxies** (not registered as services; consumed via `useCapability`):

- All capabilities declared by the platform or by bundles. They are typed contracts (ADR-103), bound on demand, and used via TanStack Query for data flow.

The split is firm: **internal renderer state → service registry. Cross-process data → capability + TanStack Query.** A consumer that mixes the two (a service that *itself* calls capabilities) is allowed but explicit — the service holds the proxy and exposes a renderer-friendly interface.

### Workspace lifecycle

Some services reset on workspace switch (per ADR-403 forward-compat for multi-Entity):

- `EditorService` — open editors close; new workspace's persisted editor descriptors re-open.
- `LayoutService` — layout state reloads from the new workspace's persisted layout.
- `ContextKeyService` — workspace-scoped keys (`workspace.entityId`, etc.) re-emit; layout keys re-emit; bundle-keys reset when bundles deactivate.

Other services persist across workspace switches:

- `ThemeService`, `NotificationService`, `RouterService`, `BundleService` (in MVP, the bundle list is global; in clinic-tenancy follow-ups O54 may scope it).

Lifecycle events: `WorkspaceService` emits `onDidWorkspaceClose`, `onDidWorkspaceOpen`, `onDidWorkspaceLock`, and `onDidWorkspaceUnlock`; each service subscribes if it needs to reset. _Lock / unlock events added 2026-05-17 per ADR-307._

In MVP (one workspace per install per ADR-501) the practical reset surface is workspace-lock/unlock and KEK-relock, not multi-workspace switching. The discipline is committed now so the post-503 expansion is mechanical.

_Amended 2026-05-17 per ADR-307:_ on `onDidWorkspaceLock`, services holding PHI-derived state must discard it. The Phase 9 baseline (no real PHI surfaces yet) keeps the discipline narrow — services that consume PHI capabilities in Phase 10+ subscribe at registration time. The pattern is wired against the stub PHI capability in Phase 9 to prove the discipline before real consumers land.

### Bundle-side services

Bundles run in the Bundle Host (ADR-410) and have no access to the renderer ServiceRegistry. Bundle code that needs equivalent organisation can use its own internal service pattern — that is bundle-internal and not specified by this ADR.

Bundle views (iframes per ADR-411) similarly have no access to the renderer ServiceRegistry. They get a narrower surface through `window.soamView` (ADR-411) and capability proxies via `soamView.bindCapability`. The renderer's ServiceRegistry is firmly **renderer-trust** state; bundles cross the boundary explicitly.

### Tests

- Renderer services have an interface (`ILayoutService`, etc.) and a default implementation. Tests register stub implementations into a test-scoped registry.
- TanStack Query has a first-class test mode (test-scoped `QueryClient`). Capability proxies are mocked at the `useCapability` hook level for component tests, or at the capability registry for integration tests.

The split keeps each test surface manageable: a component test mocks services and capabilities at the hook layer; a service test exercises the impl directly without mounting React.

### What this ADR does not commit

- The exact interface of each service. Each service ADR / file owns its surface.
- TanStack Query version / configuration details (`QueryClient` defaults, retry policy, stale time). Engineering detail.
- The change-event capability shape (the bridge that feeds TanStack Query invalidations). Lands when the first capability watches the Local Store.
- The Bundle-Host-side service pattern (if any). Bundle-internal.

## Consequences

### Positive

- Typed service access without decorators or experimental TypeScript features. Stable across TS / React versions.
- One pattern (registry) for state owners; one pattern (TanStack Query) for cross-process data. Component code is consistent across the workbench.
- Swappable services: tests, alternative implementations, future migrations all flow through the same registration point.
- TanStack Query absorbs cache, dedup, invalidation, optimistic-update, loading-state — the workbench does not reinvent these.
- Bundle views are firmly outside the renderer's service surface; the bridge model from ADR-411 stays the only path.

### Negative

- Two patterns to learn instead of one. Mitigated by clear split: state vs data, registry vs query. Documentation must reinforce.
- TanStack Query's mental model (queries, mutations, invalidation, stale time) is a real learning curve for contributors new to it.
- A service that itself uses capabilities (rare but legal) needs to handle async / loading carefully; not every consumer goes through TanStack Query then.

### Neutral

- The shape resembles VSCode's IFooService pattern from the outside (typed singleton, registered at boot, consumed by identifier) without inheriting its decorator machinery.

## Considered Options

- **VSCode-style decorator DI (`@IFileService`)** — _Rejected_: TS experimental decorators unstable; coupling to a custom InstantiationService; awkward in React.
- **React Context per service** — _Rejected_: provider tree explodes; renames are painful; cross-service references awkward.
- **Global mutable singletons (module-level instances)** — _Rejected_: untestable, unswappable; hidden coupling.
- **No services; every component does its own state** — _Rejected_: cross-cutting state (layout, editor, commands) becomes prop-drilled or duplicated.
- **Service registry singleton + `useService` hook + TanStack Query for capability data** _(chosen)_ — Outcomes of decorator DI without the machinery; clean split between state ownership and async data; standard React ergonomics.

## Open Items

- **O96** — Service id mechanism: `Symbol` vs branded string vs class-as-key. Affects bundling, tree-shaking, and identifier collision behaviour.
- **O97** — TanStack Query key naming convention. Per-capability prefix, per-resource invalidation scope, key versioning when capability evolves.
- **O98** — Workspace lifecycle reset matrix. Definitive list of which services reset on workspace close, which persist, which partially reset.
- **O99** — Suspense and loading discipline. When to wrap service access in `<Suspense>`, when to render skeletons inline, default UX for slow capability calls.
- **O100** — Change-event capability shape. Watch primitives over the Local Store that drive TanStack Query invalidation.
