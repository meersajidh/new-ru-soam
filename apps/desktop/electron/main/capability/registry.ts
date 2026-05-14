import { CapErr, type CapErrCode } from '../../shared/ipc-protocol';

/**
 * Main-side capability registry per ADR-103.
 *
 * Phase 1 scope: in-process registration + dispatch. Permission scope (O4),
 * versioning policy (O3), and Bundle-Host-resident capabilities (ADR-410)
 * land later phases.
 */

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
    return { ok: false, value: { code: CapErr.HandlerThrew, message } };
  }
}
