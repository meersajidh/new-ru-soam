import { CapErr, type CapErrCode } from '../../shared/ipc-protocol';

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

interface CapabilityEntry {
  readonly name: string;
  readonly version: string;
  readonly handler: CapabilityHandler;
}

const registry = new Map<string, CapabilityEntry>();

function key(name: string, version: string): string {
  return `${name}@${version}`;
}

export function registerCapability(
  name: string,
  version: string,
  handler: CapabilityHandler,
): void {
  const k = key(name, version);
  if (registry.has(k)) {
    throw new Error(`Capability already registered: ${k}`);
  }
  registry.set(k, { name, version, handler });
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
): Promise<CapabilityInvokeResult> {
  const entry = registry.get(key(name, version));
  if (!entry) {
    return {
      ok: false,
      value: { code: CapErr.NotFound, message: `Capability not registered: ${name}@${version}` },
    };
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
