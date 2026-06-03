import { CapErr, type CapErrCode } from '../../shared/ipc-protocol';
import type { TrustClass } from '../../shared/host-protocol';
import type { LockService } from '../lock/service';

/**
 * Main-side capability registry per ADR-103.
 *
 * Phase 1 scope: in-process registration + dispatch. Permission scope (O4),
 * versioning policy (O3), and Bundle-Host-resident capabilities (ADR-410)
 * land later phases.
 *
 * Phase 6.5: handlers that throw an Error with a recognised `.code` matching
 * a known CapErrCode have that code passed through to the response, so
 * Bundle-Host-resident handlers (routed via `loader.ts`) can surface
 * `cap.not_found` for an inactive bundle instead of seeing it re-wrapped as
 * `cap.handler_threw`.
 *
 * Phase 9b: `phi` flag on registration config — when true the registry checks
 * the active lock service before dispatching and rejects with `cap.locked` if
 * the workspace is locked. Pass `getActiveLockService` via `setLockServiceGetter`
 * before any PHI-flagged capability is invoked.
 *
 * O449 rung-0: `invokeCapability` accepts an optional `opts.caller` with
 * `{ bundleId, trustClass }`. When caller is present, phi-flagged capabilities
 * are additionally gated on `trustClass === 'first-party'`; any other class
 * is rejected with `cap.denied` (ADR-418 Am1 PHI-gate-by-trustClass).
 * Existing callers (Renderer via soam-channel, internal Main) pass no opts →
 * caller is undefined → gate is dormant → back-compat preserved.
 */

const KNOWN_CAP_ERR_CODES: ReadonlySet<string> = new Set(Object.values(CapErr));

function extractCapErrCode(err: unknown): CapErrCode | null {
  if (!err || typeof err !== 'object') return null;
  const code = (err as { code?: unknown }).code;
  if (typeof code !== 'string') return null;
  return KNOWN_CAP_ERR_CODES.has(code) ? (code as CapErrCode) : null;
}

export type CapabilityHandler = (
  method: string,
  args: ReadonlyArray<unknown>,
) => Promise<unknown>;

/**
 * Caller identity supplied by fp-host/manager.ts when dispatching a
 * Host→Main consume request (O449 rung-0). Main resolves trustClass from its
 * own activated-bundle record — the host never self-declares trustClass.
 */
export interface CallerIdentity {
  readonly bundleId: string;
  readonly trustClass: TrustClass;
}

/** Options accepted by `invokeCapability` (additive, back-compat). */
export interface InvokeCapabilityOpts {
  /** Present only when the call originates from the Bundle Host consumer channel. */
  readonly caller?: CallerIdentity;
}

/** Registration-time config for a capability. */
export interface CapabilityConfig {
  /**
   * When true, the capability is PHI-flagged per ADR-307.
   * Invocations are rejected with `cap.locked` whenever the active
   * workspace is locked. The lock check runs before the handler.
   */
  readonly phi?: boolean;
}

interface CapabilityEntry {
  readonly name: string;
  readonly version: string;
  readonly handler: CapabilityHandler;
  readonly phi: boolean;
}

const registry = new Map<string, CapabilityEntry>();

/** Getter supplied by main/index.ts — set once at boot. */
let _getLockService: (() => LockService | null) | null = null;

/**
 * Inject the active-lock-service getter.
 * Must be called before any PHI-flagged capability is invoked.
 */
export function setLockServiceGetter(getter: () => LockService | null): void {
  _getLockService = getter;
}

function key(name: string, version: string): string {
  return `${name}@${version}`;
}

export function registerCapability(
  name: string,
  version: string,
  handler: CapabilityHandler,
  config?: CapabilityConfig,
): void {
  const k = key(name, version);
  if (registry.has(k)) {
    throw new Error(`Capability already registered: ${k}`);
  }
  registry.set(k, { name, version, handler, phi: config?.phi ?? false });
}

export interface CapabilityInvokeFailure {
  readonly code: CapErrCode;
  readonly message: string;
}

export interface CapabilityInvokeSuccess {
  readonly data: unknown;
}

export type CapabilityInvokeResult =
  | { ok: true; value: CapabilityInvokeSuccess }
  | { ok: false; value: CapabilityInvokeFailure };

export async function invokeCapability(
  name: string,
  version: string,
  method: string,
  args: ReadonlyArray<unknown>,
  opts?: InvokeCapabilityOpts,
): Promise<CapabilityInvokeResult> {
  const entry = registry.get(key(name, version));
  if (!entry) {
    return {
      ok: false,
      value: { code: CapErr.NotFound, message: `Capability not registered: ${name}@${version}` },
    };
  }

  // PHI-gate-by-trustClass (O449 rung-0, ADR-418 Am1):
  // When a caller identity is present and the capability is PHI-flagged,
  // only first-party callers are allowed through. Renderer calls and internal
  // Main calls never supply caller → gate is dormant → back-compat.
  if (entry.phi && opts?.caller !== undefined && opts.caller.trustClass !== 'first-party') {
    return {
      ok: false,
      value: {
        code: CapErr.Denied,
        message: `PHI capability ${name}@${version} denied for trustClass=${opts.caller.trustClass} bundleId=${opts.caller.bundleId}`,
      },
    };
  }

  // PHI lock-gate check: if this capability is PHI-flagged and the workspace is
  // locked, reject immediately without invoking the handler (ADR-307).
  if (entry.phi && _getLockService !== null) {
    const lockSvc = _getLockService();
    if (!lockSvc || lockSvc.isLocked()) {
      return {
        ok: false,
        value: { code: CapErr.Locked, message: 'Workspace locked' },
      };
    }
  }

  try {
    const data = await entry.handler(method, args);
    return { ok: true, value: { data } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = extractCapErrCode(err) ?? CapErr.HandlerThrew;
    return { ok: false, value: { code, message } };
  }
}
