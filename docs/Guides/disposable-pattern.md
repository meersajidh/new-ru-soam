# Disposable pattern

A platform-wide convention for "this thing needs cleanup".

Adopted as the standard teardown idiom (ADR-105 §"Disposable convention"). Used at every granularity: a single event listener, a registered contribution, a bound capability proxy, an entire bundle's activation result.

## Shape

```ts
interface Disposable {
  dispose(): void;
}
```

That is the whole contract. A value with a `dispose()` method. Calling it releases whatever the disposable holds.

A function returning `void` is also accepted in places where the lighter shape is enough; both shapes are interchangeable through a small helper.

## Conventions

### Returned from every registration

`register(...)`, `subscribe(...)`, `bind(...)`, `on(...)` all return a disposable. To undo any of them, call `dispose()`. There is no per-API `unregister`/`unsubscribe`/`removeListener` mirror method. One verb everywhere.

```ts
const d = events.on('user-edited-note', handler);
// later
d.dispose();
```

### Idempotent

Calling `dispose()` twice is safe. The second call is a no-op. Implementations guard against double-dispose internally; consumers do not need to track "have I disposed this yet".

### Composable

Many disposables can be aggregated into one:

```ts
const group = Disposable.from(d1, d2, d3);
group.dispose(); // disposes d1, d2, d3
```

A bundle's activation function accumulates disposables during setup and returns one aggregate to the platform:

```ts
export async function activate(ctx: BundleContext): Promise<Disposable> {
  const subs: Disposable[] = [];
  subs.push(ctx.commands.register('my-command', ...));
  subs.push(ctx.views.register('my-view', ...));
  subs.push(ctx.events.on('document-opened', ...));
  return Disposable.from(...subs);
}
```

The platform calls `dispose()` on the returned aggregate when the bundle deactivates. Everything the bundle registered is released in one call.

### Owned hierarchically

The owner of a disposable is responsible for calling it. The platform owns each bundle's top-level disposable. The bundle owns the inner ones it created during its own work.

If you accept a disposable from a sub-system, you accepted the obligation to dispose it (directly or by composing it into something disposed later).

## Why platform-wide

- **Uniform teardown idiom.** No `cleanup` flags, no mirror unregister methods, no per-API cleanup ceremony. One pattern, learned once.
- **Leak resistance.** Every registration returns a disposable. "I forgot to clean up" becomes "I forgot to keep the disposable", which is visible at the registration site rather than diffused across a teardown function.
- **Test ergonomics.** Activate a bundle, dispose it, repeat. No state leakage between tests.
- **Survives process moves.** Same idiom whether the disposable wraps an in-process listener, an IPC handler, or a capability proxy that crosses to Main.

## Authoring a disposable

Most code consumes disposables; some code creates them. When creating one:

```ts
function watchFile(path: string, handler: (event: FileEvent) => void): Disposable {
  const watcher = startWatching(path, handler);
  let disposed = false;
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      watcher.stop();
    }
  };
}
```

Three rules:

1. Guard against double-dispose with a flag (above).
2. Release everything the function captured: handles, timers, listeners, child disposables.
3. Do not throw from `dispose()`. Teardown paths cannot reliably handle errors; log if needed.

## Anti-patterns

- A custom `unregister`/`unsubscribe` method instead of returning a disposable. Use the convention.
- A `dispose()` that is not idempotent. Consumers will assume safety; do not break it.
- A `dispose()` that performs heavy or async work. If teardown is genuinely async, return a richer type (e.g. `AsyncDisposable` once we adopt one) rather than overloading `dispose()` to return a promise that nobody awaits.
- Holding a disposable without owning it (no plan for when to call `dispose()`). Every disposable has an owner.

## Reference

The idiom is taken from VSCode's `vscode.Disposable` and the broader IDisposable family. The shape is the same; the trust assumptions and platform context here are ours.
