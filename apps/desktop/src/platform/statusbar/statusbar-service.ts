export interface StatusBarEntry {
  readonly id: string;
  readonly region: 'left' | 'right';
  readonly priority: number;
  text: string;
  tooltip?: string;
  command?: string;
  visible: boolean;
  icon?: string;
  severity?: 'ok' | 'warning' | 'error';
  badge?: number;
}

type EntryPatch = Partial<Pick<StatusBarEntry, 'text' | 'tooltip' | 'command' | 'visible' | 'icon' | 'severity' | 'badge'>>;

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
    return [...this._entries.values()]
      .filter(e => e.region === region && e.visible)
      .sort((a, b) => b.priority - a.priority);
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
    Object.assign(entry, buf.patch);
    buf.patch = {};
    buf.lastFlushed = Date.now();
    buf.timer = null;
    this._emit();
  }

  private _emit(): void {
    for (const l of this._listeners) l();
  }
}
