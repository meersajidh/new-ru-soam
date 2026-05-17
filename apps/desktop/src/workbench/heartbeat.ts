/**
 * Heartbeat module — fires window.soam.lock.heartbeat() on UI activity.
 *
 * Listens to mousemove / keydown / focus on document and calls heartbeat()
 * at most once every 5 seconds (time-based gate, not a setTimeout debounce,
 * to avoid delaying the call).
 *
 * Returns an IDisposable so boot.ts can tear down cleanly on sign-out.
 */

const HEARTBEAT_INTERVAL_MS = 5_000;

export interface IDisposable {
  dispose(): void;
}

export function mountHeartbeat(): IDisposable {
  let lastFire = 0;

  function onActivity() {
    const now = Date.now();
    if (now - lastFire >= HEARTBEAT_INTERVAL_MS) {
      lastFire = now;
      window.soam.lock.heartbeat().catch(() => {
        // Non-fatal — heartbeat failure should not surface to the user.
        // The idle timer will fire naturally if the main process can't be reached.
      });
    }
  }

  document.addEventListener('mousemove', onActivity, { passive: true });
  document.addEventListener('keydown', onActivity, { passive: true });
  document.addEventListener('focus', onActivity, { capture: true, passive: true });

  return {
    dispose() {
      document.removeEventListener('mousemove', onActivity);
      document.removeEventListener('keydown', onActivity);
      document.removeEventListener('focus', onActivity, { capture: true });
    },
  };
}
