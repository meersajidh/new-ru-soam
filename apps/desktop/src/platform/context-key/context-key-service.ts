import { parseWhenClause, evaluateWhenClause } from './when-clause';
import type { CtxValue, WhenClauseExpr } from './when-clause';

export type { CtxValue };

export interface IContextKeyService {
  get(key: string): CtxValue | undefined;
  set(key: string, value: CtxValue): void;
  delete(key: string): void;
  snapshot(): Record<string, CtxValue>;
  onDidChange(listener: (changedKeys: ReadonlySet<string>) => void): () => void;
  evaluate(expr: string): boolean;
}

export class ContextKeyService implements IContextKeyService {
  private readonly _ctx = new Map<string, CtxValue>();
  private readonly _listeners = new Set<(changed: ReadonlySet<string>) => void>();
  private readonly _exprCache = new Map<string, WhenClauseExpr>();
  private _pending: Set<string> | null = null;

  get(key: string): CtxValue | undefined { return this._ctx.get(key); }

  set(key: string, value: CtxValue): void {
    if (this._ctx.get(key) === value) return;
    this._ctx.set(key, value);
    this._queue(key);
  }

  delete(key: string): void {
    if (!this._ctx.has(key)) return;
    this._ctx.delete(key);
    this._queue(key);
  }

  snapshot(): Record<string, CtxValue> {
    return Object.fromEntries(this._ctx);
  }

  onDidChange(listener: (changed: ReadonlySet<string>) => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  evaluate(expr: string): boolean {
    let ast = this._exprCache.get(expr);
    if (!ast) {
      ast = parseWhenClause(expr);
      this._exprCache.set(expr, ast);
    }
    return evaluateWhenClause(ast, this._ctx);
  }

  private _queue(key: string): void {
    if (!this._pending) {
      this._pending = new Set();
      queueMicrotask(() => {
        const changed = this._pending!;
        this._pending = null;
        for (const l of this._listeners) l(changed);
      });
    }
    this._pending.add(key);
  }
}
