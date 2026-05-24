/**
 * DB quiesce for update-time safety per ADR-308 §6.
 *
 * Before the installer relaunches:
 *   1. Assert no DB transaction open (trivially true under better-sqlite3 sync
 *      model, but asserted for future-proofing).
 *   2. Run PRAGMA wal_checkpoint(TRUNCATE) if WAL mode is active.
 *   3. Close the DB connection explicitly so the installer finds no open handle.
 *
 * Rather than importing LocalStore directly (which would couple the updater to
 * the store module and create circular-import risk), consumers inject a hook
 * via `registerQuiesceHook`. The store registers its own quiesce function at
 * boot via main/index.ts.
 */

type QuiesceHook = () => Promise<void>;

let _hook: QuiesceHook | null = null;

/**
 * Register the DB quiesce hook. Called once at boot by the store lifecycle owner.
 * If called more than once, the last registration wins (expected: only called once).
 */
export function registerQuiesceHook(hook: QuiesceHook): void {
  _hook = hook;
}

/**
 * Execute the quiesce sequence before an installer relaunch.
 * Safe to call when no hook is registered (no-op).
 */
export async function quiesceForUpdate(): Promise<void> {
  if (_hook) {
    await _hook();
  }
}
