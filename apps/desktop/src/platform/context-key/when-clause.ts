export type CtxValue = string | number | boolean;

type TokenType =
  | 'IDENT' | 'STRING' | 'NUMBER' | 'BOOL'
  | 'AND' | 'OR' | 'NOT'
  | 'EQ' | 'NEQ' | 'LT' | 'LTE' | 'GT' | 'GTE'
  | 'MATCH' | 'REGEX' | 'IN'
  | 'LPAREN' | 'RPAREN' | 'LBRACKET' | 'RBRACKET' | 'COMMA' | 'EOF';

interface Token { type: TokenType; value: string }

type Expr =
  | { kind: 'or';       left: Expr; right: Expr }
  | { kind: 'and';      left: Expr; right: Expr }
  | { kind: 'not';      expr: Expr }
  | { kind: 'truthy';   key: string }
  | { kind: 'cmp';      key: string; op: '==' | '!=' | '<' | '<=' | '>' | '>='; value: CtxValue }
  | { kind: 'in';       key: string; values: CtxValue[] }
  | { kind: 'regex';    key: string; pattern: RegExp }
  | { kind: 'lit_false' };

export type WhenClauseExpr = Expr;

function tokenize(input: string): Token[] {
  const out: Token[] = [];
  let i = 0;

  while (i < input.length) {
    if (/\s/.test(input[i])) { i++; continue; }

    if (input.startsWith('&&', i))  { out.push({ type: 'AND',   value: '&&' }); i += 2; continue; }
    if (input.startsWith('||', i))  { out.push({ type: 'OR',    value: '||' }); i += 2; continue; }
    if (input.startsWith('==', i))  { out.push({ type: 'EQ',    value: '==' }); i += 2; continue; }
    if (input.startsWith('!=', i))  { out.push({ type: 'NEQ',   value: '!=' }); i += 2; continue; }
    if (input.startsWith('<=', i))  { out.push({ type: 'LTE',   value: '<=' }); i += 2; continue; }
    if (input.startsWith('>=', i))  { out.push({ type: 'GTE',   value: '>=' }); i += 2; continue; }
    if (input.startsWith('=~', i))  { out.push({ type: 'MATCH', value: '=~' }); i += 2; continue; }

    const ch = input[i];
    if (ch === '<') { out.push({ type: 'LT',       value: ch }); i++; continue; }
    if (ch === '>') { out.push({ type: 'GT',       value: ch }); i++; continue; }
    if (ch === '!') { out.push({ type: 'NOT',      value: ch }); i++; continue; }
    if (ch === '(') { out.push({ type: 'LPAREN',   value: ch }); i++; continue; }
    if (ch === ')') { out.push({ type: 'RPAREN',   value: ch }); i++; continue; }
    if (ch === '[') { out.push({ type: 'LBRACKET', value: ch }); i++; continue; }
    if (ch === ']') { out.push({ type: 'RBRACKET', value: ch }); i++; continue; }
    if (ch === ',') { out.push({ type: 'COMMA',    value: ch }); i++; continue; }

    if (ch === "'" || ch === '"') {
      i++;
      let s = '';
      while (i < input.length && input[i] !== ch) {
        if (input[i] === '\\') { i++; s += input[i] ?? ''; }
        else s += input[i];
        i++;
      }
      i++;
      out.push({ type: 'STRING', value: s });
      continue;
    }

    if (ch === '/') {
      i++;
      let pat = '';
      while (i < input.length && input[i] !== '/') {
        if (input[i] === '\\') { pat += '\\' + (input[i + 1] ?? ''); i += 2; }
        else { pat += input[i]; i++; }
      }
      i++;
      let flags = '';
      while (i < input.length && /[gimsuy]/.test(input[i])) flags += input[i++];
      out.push({ type: 'REGEX', value: `/${pat}/${flags}` });
      continue;
    }

    if (/[0-9]/.test(ch)) {
      let n = '';
      while (i < input.length && /[0-9.]/.test(input[i])) n += input[i++];
      out.push({ type: 'NUMBER', value: n });
      continue;
    }

    if (/[a-zA-Z_$@]/.test(ch)) {
      let id = '';
      while (i < input.length && /[a-zA-Z0-9_.$@-]/.test(input[i])) id += input[i++];
      if (id === 'true' || id === 'false') out.push({ type: 'BOOL',  value: id });
      else if (id === 'in')               out.push({ type: 'IN',    value: id });
      else                                out.push({ type: 'IDENT', value: id });
      continue;
    }

    i++;
  }

  out.push({ type: 'EOF', value: '' });
  return out;
}

class Parser {
  private readonly _t: Token[];
  private _pos = 0;
  constructor(tokens: Token[]) { this._t = tokens; }

  private get _cur(): Token { return this._t[this._pos]; }
  private _advance(): Token { return this._t[this._pos++]; }
  private _check(type: TokenType): boolean { return this._cur.type === type; }
  private _eat(type: TokenType): boolean {
    if (this._cur.type === type) { this._pos++; return true; }
    return false;
  }

  parse(): Expr { return this._or(); }

  private _or(): Expr {
    let left = this._and();
    while (this._check('OR')) { this._pos++; left = { kind: 'or', left, right: this._and() }; }
    return left;
  }

  private _and(): Expr {
    let left = this._unary();
    while (this._check('AND')) { this._pos++; left = { kind: 'and', left, right: this._unary() }; }
    return left;
  }

  private _unary(): Expr {
    if (this._eat('NOT')) return { kind: 'not', expr: this._unary() };
    return this._primary();
  }

  private _primary(): Expr {
    if (this._eat('LPAREN')) { const e = this._or(); this._eat('RPAREN'); return e; }
    if (!this._check('IDENT')) return { kind: 'lit_false' };

    const key = this._advance().value;
    const op = this._cur.type;

    if (op === 'EQ' || op === 'NEQ' || op === 'LT' || op === 'LTE' || op === 'GT' || op === 'GTE') {
      const opStr = this._advance().value as '==' | '!=' | '<' | '<=' | '>' | '>=';
      return { kind: 'cmp', key, op: opStr, value: this._literal() };
    }
    if (this._eat('IN'))    return { kind: 'in', key, values: this._array() };
    if (this._eat('MATCH')) {
      if (this._check('REGEX')) {
        const raw = this._advance().value;
        const last = raw.lastIndexOf('/');
        try { return { kind: 'regex', key, pattern: new RegExp(raw.slice(1, last), raw.slice(last + 1)) }; }
        catch { return { kind: 'lit_false' }; }
      }
      return { kind: 'lit_false' };
    }
    return { kind: 'truthy', key };
  }

  private _literal(): CtxValue {
    const t = this._advance();
    if (t.type === 'STRING') return t.value;
    if (t.type === 'NUMBER') return parseFloat(t.value);
    if (t.type === 'BOOL')   return t.value === 'true';
    return t.value;
  }

  private _array(): CtxValue[] {
    this._eat('LBRACKET');
    const vals: CtxValue[] = [];
    while (!this._check('RBRACKET') && !this._check('EOF')) {
      vals.push(this._literal());
      this._eat('COMMA');
    }
    this._eat('RBRACKET');
    return vals;
  }
}

export function parseWhenClause(expr: string): WhenClauseExpr {
  try { return new Parser(tokenize(expr)).parse(); }
  catch { return { kind: 'lit_false' }; }
}

export function evaluateWhenClause(node: WhenClauseExpr, ctx: ReadonlyMap<string, CtxValue>): boolean {
  switch (node.kind) {
    case 'lit_false': return false;
    case 'or':        return evaluateWhenClause(node.left, ctx) || evaluateWhenClause(node.right, ctx);
    case 'and':       return evaluateWhenClause(node.left, ctx) && evaluateWhenClause(node.right, ctx);
    case 'not':       return !evaluateWhenClause(node.expr, ctx);
    case 'truthy': {
      const v = ctx.get(node.key);
      return v !== undefined && v !== false && v !== 0 && v !== '';
    }
    case 'cmp': {
      const v = ctx.get(node.key);
      const r = node.value;
      if (node.op === '==') return v === r;
      if (node.op === '!=') return v !== r;
      if (typeof v !== 'number' || typeof r !== 'number') return false;
      if (node.op === '<')  return v < r;
      if (node.op === '<=') return v <= r;
      if (node.op === '>')  return v > r;
      return v >= r;
    }
    case 'in': {
      const v = ctx.get(node.key);
      return v !== undefined && node.values.includes(v);
    }
    case 'regex': {
      const v = ctx.get(node.key);
      return typeof v === 'string' && node.pattern.test(v);
    }
  }
}

export function keysInWhenClause(node: WhenClauseExpr): Set<string> {
  const keys = new Set<string>();
  function walk(n: WhenClauseExpr): void {
    switch (n.kind) {
      case 'or':       walk(n.left); walk(n.right); break;
      case 'and':      walk(n.left); walk(n.right); break;
      case 'not':      walk(n.expr); break;
      case 'truthy':
      case 'cmp':
      case 'in':
      case 'regex':    keys.add(n.key); break;
      case 'lit_false': break;
    }
  }
  walk(node);
  return keys;
}
