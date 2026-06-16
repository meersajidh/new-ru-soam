/**
 * CloudSessionService (renderer) — source of truth for cloud session state.
 *
 * Holds { signedIn, configured } — never tokens (ADR-202/304).
 *
 * State sources:
 *   - Initial: platform.auth cap getCloudSessionStatus on construction.
 *   - Live: window.soam.cloud.onSessionChange events pushed from Main whenever
 *     proactive rotation succeeds or a token is found dead.
 *   - Workspace change: re-fetch from cap so state reflects the new account.
 *
 * Consumers: boot.ts (status-bar indicator + command) + SettingsMenu (live row).
 *
 * Pattern mirrors TelemetryModeService (event-backed rather than prefs-backed).
 */

export interface CloudSessionState {
  /** Whether the identity server is configured (IDENTITY_BASE_URL set). */
  configured: boolean;
  /** Whether a valid session credential exists for the active workspace. */
  signedIn: boolean;
}

export interface ICloudSessionService {
  getState(): CloudSessionState;
  onChange(listener: (s: CloudSessionState) => void): () => void;
  /** Trigger Google OAuth reconnect. Resolves { ok: true } on success or { ok: false, error }. */
  reconnect(): Promise<{ ok: true } | { ok: false; error: string }>;
}

export class CloudSessionService implements ICloudSessionService {
  private _state: CloudSessionState = { configured: false, signedIn: false };
  private readonly _listeners = new Set<(s: CloudSessionState) => void>();
  private _authProxy: { call: (method: string, ...args: ReadonlyArray<unknown>) => Promise<unknown>; dispose: () => void } | null = null;
  private _sessionUnsub: (() => void) | null = null;
  private _workspaceUnsub: (() => void) | null = null;

  constructor() {
    // Bind auth capability — fire-and-forget; reload once bound.
    window.soam
      .bindCapability('platform.auth', '1.0')
      .then((proxy) => {
        this._authProxy = proxy;
        void this._reload();
      })
      .catch((err: unknown) => {
        console.warn('[CloudSessionService] could not bind platform.auth cap:', err);
      });

    // Subscribe to live session-change events from Main (proactive rotation result).
    this._sessionUnsub = window.soam.cloud.onSessionChange((e) => {
      const next: CloudSessionState = { ...this._state, signedIn: e.signedIn };
      this._setState(next);
    });

    // Reload on workspace change so state reflects the new workspace's credential.
    this._workspaceUnsub = window.soam.workspace.onChange(() => {
      void this._reload();
    });
  }

  getState(): CloudSessionState {
    return this._state;
  }

  onChange(listener: (s: CloudSessionState) => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  /**
   * Trigger Google OAuth sign-in (reconnect path). Best-effort; resolves both
   * success and failure to avoid unhandled rejections at call sites.
   */
  async reconnect(): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!this._authProxy) {
      return { ok: false, error: 'Auth capability not available.' };
    }
    try {
      const result = (await this._authProxy.call('signInWithGoogle')) as
        | { ok: true; email: string; googleId: string }
        | { ok: false; code: string; message?: string };
      if (result.ok) {
        // Main emits cloud.session.changed when the token commits, which updates
        // _state.signedIn via the subscription above. Re-fetch to pick up any
        // edge cases (e.g. sign-in while cap was re-bound).
        void this._reload();
        return { ok: true };
      }
      return { ok: false, error: result.message ?? `Sign-in failed (${result.code}).` };
    } catch (err) {
      return {
        ok: false,
        error: `Unexpected error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  private async _reload(): Promise<void> {
    if (!this._authProxy) return;
    // Skip if no active workspace — avoids cap.not_found noise at boot.
    const active = await window.soam.workspace.getActive();
    if (!active) return;
    try {
      const res = (await this._authProxy.call('getCloudSessionStatus')) as
        | { ok: true; signedIn: boolean; configured: boolean }
        | { ok: false; code: string };
      if (res.ok) {
        this._setState({ configured: res.configured, signedIn: res.signedIn });
      }
    } catch (err) {
      console.warn('[CloudSessionService] could not read cloud session status:', err);
    }
  }

  private _setState(next: CloudSessionState): void {
    // Deduplicate — only emit if something changed.
    if (next.configured === this._state.configured && next.signedIn === this._state.signedIn) {
      return;
    }
    this._state = next;
    for (const l of this._listeners) l(this._state);
  }

  dispose(): void {
    this._sessionUnsub?.();
    this._sessionUnsub = null;
    this._workspaceUnsub?.();
    this._workspaceUnsub = null;
    this._authProxy?.dispose();
    this._authProxy = null;
    this._listeners.clear();
  }
}
