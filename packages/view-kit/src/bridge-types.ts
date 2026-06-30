/**
 * Ambient types for the platform-injected bridge globals:
 *   window.soamView    — the in-iframe capability bridge (ADR-411)
 *   window.__viewBoot  — shared bootstrap helpers
 *
 * These are injected as plain JS objects by view-protocol.ts; they are NOT
 * importable. This file replicates their shapes as TypeScript interfaces so
 * view-kit (and React views built on it) can type-check without importing from
 * apps/desktop.
 */

/** A bound capability proxy returned by bindQuery / bindCommand / bindCapability. */
export interface BoundProxy {
  /**
   * Call a method on the capability.
   * Args are POSITIONAL — `.call(method, arg0, arg1)` NOT `.call(method, [arg0, arg1])`.
   */
  call(method: string, ...args: unknown[]): Promise<unknown>;
  /** Dispose the proxy; subsequent .call() will reject. */
  dispose(): void;
}

/** Disposable subscription handle returned by events.on*. */
export interface IDisposable {
  dispose(): void;
}

/** The frozen window.soamView bridge object (ADR-411). */
export interface SoamView {
  /** Bind a generic capability proxy (no CQRS kind-check). */
  bindCapability(name: string, version: string): Promise<BoundProxy>;
  /** Bind a query capability proxy (CQRS kind-checked as 'query'). */
  bindQuery(name: string, version: string): Promise<BoundProxy>;
  /** Bind a command capability proxy (CQRS kind-checked as 'command'). */
  bindCommand(name: string, version: string): Promise<BoundProxy>;

  events: {
    onActivate(fn: () => void): IDisposable;
    onDeactivate(fn: () => void): IDisposable;
    onStoreChange(fn: (payload?: unknown) => void): IDisposable;
  };

  /** Snapshot of current theme CSS custom property values. */
  readonly theme: Record<string, string>;

  /** Resolves once the bridge has received the 'init' message from the parent. */
  ready: Promise<void>;

  // View verbs — each posts a message to the parent renderer.
  requestClose(): void;
  requestFocus(): void;
  openInEditor(
    viewId: string,
    opts?: {
      query?: string;
      title?: string;
      entityId?: string;
      preview?: boolean;
      /** Cross-bundle open: resolve viewId against this bundle's contribution. */
      bundleId?: string;
    },
  ): void;
  setOverviewViewMode(mode: string): void;
  setScheduleViewState(state: unknown): void;
  setScheduleCounts(counts: unknown): void;
  bumpScheduleData(): void;
  setActiveEvent(ev: unknown): void;
  openExternal(url: string): void;
  openActivity(containerId: string): void;
  setTabDescription(text: string): void;
  focusAspect(sectionId: string): void;
  requestContextMenu(
    menuId: string,
    x: number,
    y: number,
    context: Record<string, unknown>,
    contextOverrides?: Record<string, unknown>,
  ): void;

  /**
   * The buffered last 'context' message (or null). Read on mount to seed the
   * entity id when the initial context arrived before a late-attaching listener
   * (e.g. ViewRoot's post-mount effect). Optional — guard with `?.` for bridges
   * predating it. Live updates still come through the 'context' window message.
   */
  currentContext?(): ViewContextMessage | null;

  /**
   * The buffered 'init' message (or null). Read on mount (inside awaitBridge()
   * .then) to seed channel values (scheduleViewState, scheduleCounts, etc.)
   * that the parent injects as init message fields. 'init' fires once and is
   * NOT replayed — reading it here is the only way to catch those seeds for a
   * late-attaching React view. Optional — guard with `?.`.
   */
  initPayload?(): ViewInitMessage | null;
}

/** The window.__viewBoot bootstrap helpers (view-bootstrap.ts). */
export interface ViewBoot {
  /** Polls until window.soamView is available and returns it. */
  awaitBridge(): Promise<SoamView>;
  isLockedError(err: unknown): boolean;
  isNotFoundError(err: unknown): boolean;
  /** Decode location.search params into a key→value map. */
  parseQuery(search: string): Record<string, string>;
  /**
   * Apply theme CSS vars from a bridge init/theme message payload.
   * Returns true when the payload was a theme-bearing message.
   */
  applyTheme(d: unknown): boolean;
  /** Hydrate [data-codicon] elements under root (default: document). */
  applyCodicons(root?: Document | Element): void;
}

/**
 * The 'init' postMessage payload delivered once when the bridge is initialised.
 * May carry channel seed values (scheduleViewState, scheduleCounts, etc.) as
 * extra fields. See @ru-soam/view-kit useViewChannel + ViewRoot.initPayload.
 */
export interface ViewInitMessage {
  __soamView: true;
  kind: 'init';
  [key: string]: unknown;
}

/**
 * The 'context' postMessage payload sent by the parent renderer to push the
 * active entity id into a contextual view. The bridge buffers and replays this
 * on DOMContentLoaded — see view-bridge.ts.
 */
export interface ViewContextMessage {
  __soamView: true;
  kind: 'context';
  /**
   * Active entity id for this view slot (e.g. patient id for Practice contextual
   * aspects). Undefined means no active entity (view shows empty state).
   */
  entityId?: string;
  [key: string]: unknown;
}

declare global {
  interface Window {
    soamView: SoamView;
    __viewBoot: ViewBoot;
  }
}
