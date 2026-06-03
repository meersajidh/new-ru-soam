/**
 * store.query@1.0 — Generic declared-query-template executor (ADR-506 §3/§6 rung C / O446).
 *
 * Read-side counterpart to store.write@1.0. First-Party-Host bundles declare SELECT
 * templates at boot; Main executes them against the workspace DB. Bundles never ship
 * arbitrary SQL — only pre-registered template ids + named params reach this handler.
 *
 * PHI classification: `phi: true` (wholesale for this slice — all current readable
 * tables are PHI). Per-table / per-template PHI classification is a future refinement
 * (rung C+); for now the registry PHI-trustClass gate (first-party only when caller
 * present) is the access control layer.
 *
 * Queries are NOT owner-gated (many-consumer per ADR-506 §3). Any first-party bundle
 * can run any registered template — the PHI gate is the access control.
 *
 * Enforcement order per call:
 *   1. Registry PHI-trustClass gate (first-party only when caller present) — registry layer
 *   2. Registry lock-gate (rejects cap.locked when workspace locked)      — registry layer
 *   3. Handler: templateId lookup → unknown ⇒ cap.not_found
 *   4. Handler: requireStore / requireDb
 *   5. Handler: stmt.readonly === true assertion → false ⇒ cap.denied (registration bug)
 *   6. Handler: stmt.all(params) — better-sqlite3 binds @name from object keys
 *   7. Handler: optional audit emit (caller-supplied; not mandatory on reads)
 *
 * ADR-106 boundary: base code. MUST NOT import any domain module.
 */

import { registerCapability } from '../capability/registry.js';
import type { CallerIdentity } from '../capability/registry.js';
import { CapErr } from '../../shared/ipc-protocol.js';
import { localStoreManager } from './index.js';
import { auditService } from '../audit/index.js';
import type { AuditTag } from './store-write-cap.js';

// ── Query template registry ───────────────────────────────────────────────────

export interface QueryTemplate {
  readonly id: string;
  readonly sql: string;
}

const _templates = new Map<string, QueryTemplate>();

/**
 * Register a named SELECT/WITH query template.
 *
 * Rules (fail-fast; authoritative readonly guarantee is stmt.readonly at execution):
 *   - id must be unique (throw on duplicate).
 *   - trimmed SQL must begin with SELECT or WITH (case-insensitive).
 *   - must not contain a statement-separating `;` followed by more non-whitespace
 *     (guards against multi-statement injection).
 *
 * Called at boot by domain modules (practice-queries.ts etc.) before any
 * capability invocation — DB is not open at registration time.
 */
export function registerQueryTemplate(t: QueryTemplate): void {
  if (_templates.has(t.id)) {
    throw new Error(`store.query: duplicate template id: '${t.id}'`);
  }

  const trimmed = t.sql.trim();
  const upper = trimmed.toUpperCase();
  if (!upper.startsWith('SELECT') && !upper.startsWith('WITH')) {
    throw new Error(
      `store.query: template '${t.id}' SQL must begin with SELECT or WITH (got: '${trimmed.slice(0, 20)}...')`,
    );
  }

  // Guard against multi-statement: a `;` followed by non-whitespace content.
  if (/;[^\s]/.test(trimmed) || /;\s*\S/.test(trimmed.replace(/;(\s*)$/, ''))) {
    throw new Error(
      `store.query: template '${t.id}' SQL must be a single statement (contains ';' followed by content)`,
    );
  }

  _templates.set(t.id, t);
}

// ── Error factories ───────────────────────────────────────────────────────────

function denied(msg: string): Error {
  return Object.assign(new Error(msg), { code: CapErr.Denied });
}

function notFound(msg: string): Error {
  return Object.assign(new Error(msg), { code: CapErr.NotFound });
}

function validationErr(msg: string): Error {
  return Object.assign(new Error(msg), { code: CapErr.HandlerThrew });
}

// ── Store / DB helpers (mirror store-write-cap) ───────────────────────────────

function requireStore() {
  const store = localStoreManager.current();
  if (!store) throw notFound('store.query: no active workspace');
  return store;
}

function requireDb(store: ReturnType<typeof requireStore>) {
  const db = store.rawDb();
  if (!db) throw notFound('store.query: store not open');
  return db;
}

// ── Argument parsing ──────────────────────────────────────────────────────────

interface RunArgs {
  readonly templateId: string;
  readonly params: Record<string, unknown> | undefined;
  readonly audit: AuditTag | undefined;
}

function parseRunArgs(args: ReadonlyArray<unknown>): RunArgs {
  const [templateId, params, audit] = args;

  if (typeof templateId !== 'string') {
    throw validationErr('store.query.run: templateId must be a string');
  }

  if (params !== undefined && params !== null) {
    if (typeof params !== 'object' || Array.isArray(params)) {
      throw validationErr('store.query.run: params must be a plain object');
    }
  }

  if (audit !== undefined && audit !== null) {
    if (typeof audit !== 'object' || Array.isArray(audit)) {
      throw validationErr('store.query.run: audit must be a plain object');
    }
    const a = audit as Record<string, unknown>;
    if (typeof a['event'] !== 'string' || (a['event'] as string).trim().length === 0) {
      throw validationErr('store.query.run: audit.event must be a non-empty string');
    }
  }

  return {
    templateId,
    params: params as Record<string, unknown> | undefined,
    audit: audit as AuditTag | undefined,
  };
}

// ── Capability registration ───────────────────────────────────────────────────

/**
 * Register the `store.query@1.0` capability with the Main capability registry.
 * Call once at boot, after `setLockServiceGetter(...)`.
 * (ADR-506 §6 rung C / O446)
 */
export function registerStoreQueryCapability(): void {
  registerCapability(
    'store.query',
    '1.0',
    async (method, args, caller: CallerIdentity | undefined) => {
      switch (method) {
        case 'run': {
          const { templateId, params, audit } = parseRunArgs(args);

          // Template lookup — unknown id ⇒ cap.not_found.
          const template = _templates.get(templateId);
          if (!template) {
            throw notFound(`store.query: unknown template: ${templateId}`);
          }

          const store = requireStore();
          const db = requireDb(store);
          const workspaceId = store.workspaceId()!;

          // Prepare each call — no cached Statement. better-sqlite3 has an
          // internal cache so prepare-per-call is cheap, AND it is safe across
          // workspace switches (a cached stmt bound to a swapped/closed db would
          // error on next call). Do NOT cache statements here.
          const stmt = db.prepare(template.sql);

          // Authoritative readonly guarantee — stmt.readonly is set by
          // better-sqlite3 based on SQLite's sqlite3_stmt_readonly(). If a
          // template was registered with non-SELECT SQL that slipped the static
          // checks, this is the final gate.
          if (!stmt.readonly) {
            console.error(
              `[store.query] REGISTRATION BUG: template '${templateId}' is not read-only — refusing execution`,
            );
            throw denied(`store.query: template ${templateId} is not read-only`);
          }

          // Execute — better-sqlite3 binds @name from object keys.
          // Let better-sqlite3 throw on missing/extra named params; the outer
          // invokeCapability catch surfaces unknown throws as cap.handler_threw.
          const rows = stmt.all(params ?? {});

          // Optional audit emit — caller's choice for PHI reads (ADR-502).
          if (audit && typeof audit.event === 'string' && audit.event.trim().length > 0) {
            auditService.emit({
              event: audit.event as never,
              entityId: workspaceId,
              recordId: audit.recordId,
              recordType: audit.recordType,
              detail: audit.detail as Record<string, string | number | boolean> | undefined,
              principal: caller?.bundleId ?? 'system',
            });
          }

          return rows;
        }

        default:
          throw Object.assign(new Error(`store.query: unknown method: ${method}`), {
            code: CapErr.MethodNotFound,
          });
      }
    },
    { phi: true, kind: 'query' },
  );
}
