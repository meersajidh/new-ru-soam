/**
 * TelemetryService — Phase β / O468.
 *
 * Emits login/refresh/signout events to POST /v1/events, governed by a
 * 3-mode per-account operational pref (cloud.telemetryMode):
 *   off         — capture nothing; lazily clear any persisted queue.
 *   online-only — try when token available + online; on ANY failure DROP.
 *   on          — durable: on failure persist to queue and flush later.
 *
 * PHI safety: events carry only event_type (enum), device_id (install UUID),
 * app_version (string). NEVER PHI, NEVER email/sub/name.
 *
 * Default = 'off' (absent → off; DPDP opt-in).
 *
 * Must NOT import session-service.ts (import cycle risk).
 * emit() / flush() accept the token as a parameter.
 * Net-watcher uses an injected tokenProvider set at Main boot.
 */

import { app, net } from 'electron';
import { getDeviceId } from './device-id.js';
import { postEvents, CloudAuthError, CloudOfflineError } from './identity-client.js';
import type { TelemetryEvent } from './identity-client.js';
import { localStoreManager } from '../local-store/index.js';

export type TelemetryMode = 'off' | 'online-only' | 'on';

const TELEMETRY_MODE_KEY = 'cloud.telemetryMode';
const TELEMETRY_QUEUE_KEY = 'cloud.telemetryQueue';
const QUEUE_MAX = 200;
const WATCHER_INTERVAL_MS = 45_000;

class TelemetryService {
  private tokenProvider: (() => string | null) | null = null;
  private watcherTimer: NodeJS.Timeout | null = null;
  /** True while a flush POST is in flight — coalesces concurrent flushes. */
  private flushing = false;

  /**
   * Called once at Main boot to inject a live token getter.
   * Breaks the import cycle: session-service imports nothing here;
   * main/index.ts wires the arrow function.
   */
  init(tokenProvider: () => string | null): void {
    this.tokenProvider = tokenProvider;
  }

  /** Read current telemetry mode from operational prefs. Default off. */
  mode(): TelemetryMode {
    const raw = localStoreManager.current()?.getPref(TELEMETRY_MODE_KEY) ?? null;
    if (raw === 'off' || raw === 'online-only' || raw === 'on') return raw;
    return 'off';
  }

  /**
   * Emit a single telemetry event. Best-effort — never throws.
   *
   * - off: no-op.
   * - no token + on: enqueue for next flush.
   * - token present: fire detached; on failure handle per mode.
   */
  emit(eventType: TelemetryEvent['event_type'], token: string | null): void {
    try {
      const m = this.mode();
      if (m === 'off') return;

      const ev: TelemetryEvent = {
        event_type: eventType,
        device_id: getDeviceId(),
        app_version: app.getVersion(),
      };

      if (!token) {
        // No token to authenticate — queue if durable, else drop.
        if (m === 'on') this.enqueue(ev);
        return;
      }

      void postEvents(token, [ev])
        .then(() => {
          // Success: if durable, also flush any queued events now we know the token works.
          if (this.mode() === 'on') this.flush(token);
        })
        .catch((err: unknown) => {
          if (err instanceof CloudAuthError) {
            // Token dead — queue if durable (next refresh will mint a new token).
            if (this.mode() === 'on') this.enqueue(ev);
          } else if (err instanceof CloudOfflineError) {
            if (this.mode() === 'on') {
              this.enqueue(ev);
              this.startWatcher();
            }
            // online-only: drop
          } else {
            console.error('[TelemetryService] emit: unexpected error:', err);
          }
        });
    } catch (err) {
      // Belt-and-suspenders: emit must never propagate.
      console.error('[TelemetryService] emit: caught synchronous error:', err);
    }
  }

  /**
   * Flush the persisted queue to the server. Best-effort — never throws.
   * No-op when token null, mode off (also clears queue), or queue empty.
   */
  flush(token: string | null): void {
    try {
      if (!token) return;
      // In-flight guard: a single flush owns the queue at a time. Without this,
      // concurrent flushes (emit's success handler + the net-watcher tick, etc.)
      // each read the queue and POST it before either clears → duplicate sends.
      if (this.flushing) return;

      const m = this.mode();
      if (m === 'off') {
        this.clearQueue();
        return;
      }

      const q = this.readQueue();
      if (q.length === 0) return;

      this.flushing = true;
      void postEvents(token, q)
        .then(() => {
          this.clearQueue();
          // Queue drained — stop the watcher if running.
          this.stopWatcher();
        })
        .catch((err: unknown) => {
          if (err instanceof CloudOfflineError) {
            // Keep queue; start watcher to retry.
            this.startWatcher();
          }
          // CloudAuthError: keep queue; next refresh mints a new token.
          // Other: log but keep queue.
          if (!(err instanceof CloudOfflineError) && !(err instanceof CloudAuthError)) {
            console.error('[TelemetryService] flush: unexpected error:', err);
          }
        })
        .finally(() => {
          this.flushing = false;
        });
    } catch (err) {
      console.error('[TelemetryService] flush: caught synchronous error:', err);
    }
  }

  /** Append event to the durable queue pref (FIFO, capped at QUEUE_MAX). */
  private enqueue(ev: TelemetryEvent): void {
    try {
      const store = localStoreManager.current();
      if (!store) return;
      const q = this.readQueue();
      q.push(ev);
      // Drop oldest if over cap.
      while (q.length > QUEUE_MAX) q.shift();
      this.writeQueue(q);
    } catch (err) {
      console.error('[TelemetryService] enqueue: error:', err);
    }
  }

  private readQueue(): TelemetryEvent[] {
    try {
      const store = localStoreManager.current();
      if (!store) return [];
      const raw = store.getPref(TELEMETRY_QUEUE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed as TelemetryEvent[];
    } catch {
      return [];
    }
  }

  private clearQueue(): void {
    try {
      const store = localStoreManager.current();
      if (!store) return;
      store.setPref(TELEMETRY_QUEUE_KEY, '[]');
    } catch (err) {
      console.error('[TelemetryService] clearQueue: error:', err);
    }
  }

  private writeQueue(q: TelemetryEvent[]): void {
    try {
      const store = localStoreManager.current();
      if (!store) return;
      store.setPref(TELEMETRY_QUEUE_KEY, JSON.stringify(q));
    } catch (err) {
      console.error('[TelemetryService] writeQueue: error:', err);
    }
  }

  // ── Net-watcher (mid-session reconnect, mode 'on' only) ────────────────────

  /**
   * Start the net-watcher if not already running.
   * Polls every WATCHER_INTERVAL_MS; stops when queue empties or mode turns off.
   * Timer is unref'd so it never holds the process open.
   */
  private startWatcher(): void {
    if (this.watcherTimer !== null) return;
    const timer = setInterval(() => {
      this.watcherTick();
    }, WATCHER_INTERVAL_MS);
    timer.unref();
    this.watcherTimer = timer;
  }

  /** Stop the net-watcher. Public — called on relock/sign-out. */
  stopWatcher(): void {
    if (this.watcherTimer !== null) {
      clearInterval(this.watcherTimer);
      this.watcherTimer = null;
    }
  }

  private watcherTick(): void {
    const q = this.readQueue();
    if (q.length === 0) {
      this.stopWatcher();
      return;
    }
    if (this.mode() === 'off') {
      this.clearQueue();
      this.stopWatcher();
      return;
    }
    if (net.isOnline()) {
      const t = this.tokenProvider?.() ?? null;
      if (t) this.flush(t);
    }
  }
}

export const telemetryService = new TelemetryService();
