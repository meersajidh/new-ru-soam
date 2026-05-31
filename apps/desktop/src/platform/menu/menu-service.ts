import type { ICommandService, CommandContribution } from '../command/command-service';
import type { IContextKeyService, CtxValue } from '../context-key/context-key-service';

// ── Types ────────────────────────────────────────────────────────────────────

export interface MenuItemContribution {
  /** Command id to invoke (ADR-406). Title/icon resolved from CommandService. */
  readonly command: string;
  /** ADR-407 when-clause filtering visibility in this slot. */
  readonly when?: string;
  /** Group name with optional @order suffix: `'1_close@1'`. */
  readonly group: string;
  /** Numeric position within the group; omitted = contribution order. */
  readonly order?: number;
  /** Optional slot-specific title override (rare). */
  readonly title?: string;
  /** Optional when-clause; when true renders a check/active glyph. */
  readonly toggled?: string;
}

export interface MenuActionContext {
  /** Per-invocation context-key overrides merged over global snapshot for `when` eval. */
  readonly contextOverrides?: Record<string, CtxValue>;
  /** Opaque args forwarded to the command handler on select. */
  readonly args?: unknown[];
}

export interface ResolvedMenuItem {
  readonly command: string;
  readonly title: string;
  readonly icon?: string;
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly firstInGroup: boolean;
  readonly group: string;
  readonly order: number;
}

export interface OpenMenuState {
  readonly menuId: string;
  readonly items: ResolvedMenuItem[];
  readonly x: number;
  readonly y: number;
  readonly args: unknown[];
}

export interface IDisposable {
  dispose(): void;
}

export interface IMenuService {
  register(menuId: string, items: MenuItemContribution[]): IDisposable;
  getMenuItems(menuId: string, ctx?: MenuActionContext): ResolvedMenuItem[];
  showContextMenu(opts: {
    menuId: string;
    anchor: { x: number; y: number } | HTMLElement;
    ctx?: MenuActionContext;
  }): IDisposable;
  getOpenMenu(): OpenMenuState | null;
  onDidChangeOpenMenu(listener: (state: OpenMenuState | null) => void): () => void;
  closeOpenMenu(): void;
  executeItem(item: ResolvedMenuItem, args?: unknown[]): Promise<void>;
}

// ── Implementation ────────────────────────────────────────────────────────────

const NO_OP_DISPOSABLE: IDisposable = { dispose() {} };

/** Parse `'1_close@2'` → `{ group: '1_close', order: 2 }` */
function parseGroup(raw: string): { group: string; order: number } {
  const at = raw.lastIndexOf('@');
  if (at === -1) return { group: raw, order: 0 };
  const order = parseInt(raw.slice(at + 1), 10);
  return { group: raw.slice(0, at), order: Number.isFinite(order) ? order : 0 };
}

export class MenuService implements IMenuService {
  private readonly _commands: ICommandService;
  private readonly _contextKeys: IContextKeyService;
  private readonly _slots = new Map<string, Array<{ reg: MenuItemContribution[]; id: number }>>();
  private _regCounter = 0;
  private _openMenu: OpenMenuState | null = null;
  private readonly _listeners = new Set<(state: OpenMenuState | null) => void>();

  constructor(commands: ICommandService, contextKeys: IContextKeyService) {
    this._commands = commands;
    this._contextKeys = contextKeys;
  }

  register(menuId: string, items: MenuItemContribution[]): IDisposable {
    if (!this._slots.has(menuId)) this._slots.set(menuId, []);
    const id = ++this._regCounter;
    this._slots.get(menuId)!.push({ reg: items, id });
    let disposed = false;
    return {
      dispose: () => {
        if (disposed) return;
        disposed = true;
        const slot = this._slots.get(menuId);
        if (slot) {
          const idx = slot.findIndex((e) => e.id === id);
          if (idx !== -1) slot.splice(idx, 1);
        }
      },
    };
  }

  getMenuItems(menuId: string, ctx?: MenuActionContext): ResolvedMenuItem[] {
    const slot = this._slots.get(menuId);
    if (!slot || slot.length === 0) return [];

    // Build merged context map (overrides on top of global snapshot)
    const globalSnap = this._contextKeys.snapshot();
    const ctxMap = new Map<string, CtxValue>(Object.entries(globalSnap));
    if (ctx?.contextOverrides) {
      for (const [k, v] of Object.entries(ctx.contextOverrides)) ctxMap.set(k, v);
    }

    // Resolve command map for fast lookup
    const cmdMap = new Map<string, CommandContribution>(
      this._commands.getAll().map((c) => [c.id, c]),
    );

    type Candidate = {
      item: MenuItemContribution;
      cmd: CommandContribution;
      group: string;
      order: number;
      contributionIdx: number;
    };

    const candidates: Candidate[] = [];
    let contribIdx = 0;

    for (const entry of slot) {
      for (const item of entry.reg) {
        const cmd = cmdMap.get(item.command);
        if (!cmd) { contribIdx++; continue; }

        // Both the item when AND the command's own when must pass
        if (item.when && !this._evaluateWithCtx(item.when, ctxMap)) { contribIdx++; continue; }
        if (cmd.when && !this._evaluateWithCtx(cmd.when, ctxMap)) { contribIdx++; continue; }

        const parsed = parseGroup(item.group);
        candidates.push({ item, cmd, group: parsed.group, order: parsed.order, contributionIdx: contribIdx });
        contribIdx++;
      }
    }

    if (candidates.length === 0) return [];

    // Sort: group lexicographic, then order asc, then contribution order
    candidates.sort((a, b) => {
      if (a.group < b.group) return -1;
      if (a.group > b.group) return 1;
      if (a.order !== b.order) return a.order - b.order;
      return a.contributionIdx - b.contributionIdx;
    });

    // Build resolved items with firstInGroup markers
    const resolved: ResolvedMenuItem[] = [];
    let prevGroup: string | undefined;
    for (const c of candidates) {
      const title = c.item.title ?? c.cmd.title;
      const checked = c.item.toggled ? this._evaluateWithCtx(c.item.toggled, ctxMap) : false;
      resolved.push({
        command: c.item.command,
        title,
        icon: c.cmd.icon,
        checked,
        disabled: false,
        firstInGroup: c.group !== prevGroup,
        group: c.group,
        order: c.order,
      });
      prevGroup = c.group;
    }

    return resolved;
  }

  showContextMenu(opts: {
    menuId: string;
    anchor: { x: number; y: number } | HTMLElement;
    ctx?: MenuActionContext;
  }): IDisposable {
    const items = this.getMenuItems(opts.menuId, opts.ctx);
    if (items.length === 0) return NO_OP_DISPOSABLE;

    const { x, y } = opts.anchor instanceof HTMLElement
      ? (() => {
          const r = (opts.anchor as HTMLElement).getBoundingClientRect();
          return { x: r.left, y: r.bottom };
        })()
      : opts.anchor;

    this._openMenu = {
      menuId: opts.menuId,
      items,
      x,
      y,
      args: opts.ctx?.args ?? [],
    };
    this._emit();

    let disposed = false;
    return {
      dispose: () => {
        if (disposed) return;
        disposed = true;
        this.closeOpenMenu();
      },
    };
  }

  getOpenMenu(): OpenMenuState | null { return this._openMenu; }

  onDidChangeOpenMenu(listener: (state: OpenMenuState | null) => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  closeOpenMenu(): void {
    if (this._openMenu === null) return;
    this._openMenu = null;
    this._emit();
  }

  async executeItem(item: ResolvedMenuItem, args?: unknown[]): Promise<void> {
    this.closeOpenMenu();
    await this._commands.execute(item.command, ...(args ?? []));
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private _evaluateWithCtx(expr: string, ctxMap: ReadonlyMap<string, CtxValue>): boolean {
    // Use the overrides-capable evaluate method we extend on IContextKeyService
    return this._contextKeys.evaluate(expr, ctxMap);
  }

  private _emit(): void {
    for (const l of this._listeners) l(this._openMenu);
  }
}
