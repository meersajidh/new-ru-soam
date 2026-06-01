export interface StatusBarEntry {
  readonly id: string;
  readonly region: 'left' | 'right';
  readonly priority: number;
  text: string;
  tooltip?: string;
  command?: string;
  visible: boolean;
  icon?: string;
  iconSize?: number;
  severity?: 'ok' | 'warning' | 'error';
  badge?: number;
  scope?: 'always' | 'workspace';
}

type EntryPatch = Partial<Pick<StatusBarEntry, 'text' | 'tooltip' | 'command' | 'visible' | 'icon' | 'iconSize' | 'severity' | 'badge'>>;

interface UpdateBuffer {
  patch: EntryPatch;
  timer: ReturnType<typeof setTimeout> | null;
  lastFlushed: number;
}

export interface IStatusBarService {
  register(entry: StatusBarEntry): void;
  update(id: string, patch: EntryPatch): void;
  getEntries(region: 'left' | 'right'): StatusBarEntry[];
  onDidChangeEntries(listener: () => void): () => void;
}

export class StatusBarService implements IStatusBarService {
  private readonly _entries = new Map<string, StatusBarEntry>();
  private readonly _listeners = new Set<() => void>();
  private readonly _buffers = new Map<string, UpdateBuffer>();
  // Per-region snapshot cache: getEntries returns a referentially-stable array
  // between mutations so it can back useSyncExternalStore (getSnapshot must be
  // stable or React loops). Invalidated in _emit, i.e. on every change.
  private readonly _snapshot = new Map<'left' | 'right', StatusBarEntry[]>();

  register(entry: StatusBarEntry): void {
    if (this._entries.has(entry.id)) {
      throw new Error(`StatusBar entry already registered: ${entry.id}`);
    }
    this._entries.set(entry.id, { ...entry });
    this._emit();
  }

  update(id: string, patch: EntryPatch): void {
    if (!this._entries.has(id)) return;
    let buf = this._buffers.get(id);
    if (!buf) {
      buf = { patch: {}, timer: null, lastFlushed: 0 };
      this._buffers.set(id, buf);
    }
    Object.assign(buf.patch, patch);
    const now = Date.now();
    if (now - buf.lastFlushed >= 250) {
      if (buf.timer !== null) {
        clearTimeout(buf.timer);
        buf.timer = null;
      }
      this._flush(id);
    } else if (buf.timer === null) {
      buf.timer = setTimeout(() => this._flush(id), 250 - (now - buf.lastFlushed));
    }
  }

  getEntries(region: 'left' | 'right'): StatusBarEntry[] {
    const cached = this._snapshot.get(region);
    if (cached) return cached;
    const next = [...this._entries.values()]
      .filter(e => e.region === region && e.visible)
      .sort((a, b) => b.priority - a.priority);
    this._snapshot.set(region, next);
    return next;
  }

  onDidChangeEntries(listener: () => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  private _flush(id: string): void {
    const buf = this._buffers.get(id);
    if (!buf || Object.keys(buf.patch).length === 0) return;
    const entry = this._entries.get(id);
    if (!entry) return;
    // Replace with a NEW object (don't mutate in place): consumers memoize on
    // entry identity (React Compiler memoizes renderIcon(entry) on the reference),
    // so an in-place Object.assign leaves memoized children stale — the dark-mode
    // glyph stuck while its sibling tooltip updated (O437). New identity = recompute.
    this._entries.set(id, { ...entry, ...buf.patch });
    buf.patch = {};
    buf.lastFlushed = Date.now();
    buf.timer = null;
    this._emit();
  }

  private _emit(): void {
    // Invalidate snapshots so the next getEntries rebuilds a fresh array
    // (new identity) — this is what makes useSyncExternalStore re-render.
    this._snapshot.clear();
    for (const l of this._listeners) l();
  }
}
