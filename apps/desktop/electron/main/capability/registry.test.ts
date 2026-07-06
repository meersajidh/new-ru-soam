import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { LockService } from '../lock/service';
import { CapErr } from '../../shared/ipc-protocol';
import {
  invokeCapability,
  registerCapability,
  setLockServiceGetter,
  type CallerIdentity,
} from './registry';

// Tier-1b (B2) invariant guards for the Main-side capability registry.
//
// These exercise the REAL `invokeCapability` gate (no mock) so a regression in
// the PHI-by-trustClass denial (ADR-418 Am1), the CQRS kind gate (ADR-506 §7),
// or the PHI lock gate (ADR-307) trips CI. The registry is a module-level
// singleton with no reset, so every test registers under a fresh unique
// capability name.

let seq = 0;
/** A capability name unused by any prior test in this file. */
const uniq = (): string => `test.cap.${seq++}`;

/** Minimal LockService stub — only `isLocked()` is consulted by the registry. */
function lockStub(locked: boolean): LockService {
  return { isLocked: () => locked } as unknown as LockService;
}

const firstParty: CallerIdentity = { bundleId: 'fp.bundle', trustClass: 'first-party' };
const thirdParty: CallerIdentity = { bundleId: 'tp.bundle', trustClass: 'third-party' };

beforeAll(() => {
  // Default the lock service to UNLOCKED so PHI caps clear the ADR-307 lock gate
  // and we can isolate the trustClass gate. Individual tests override as needed.
  setLockServiceGetter(() => lockStub(false));
});

afterEach(() => {
  // Restore the unlocked default after any test that swapped in a locked stub.
  setLockServiceGetter(() => lockStub(false));
});

describe('PHI-gate by trustClass (ADR-418 Am1)', () => {
  it('denies a PHI capability to a non-first-party caller', async () => {
    const name = uniq();
    registerCapability(name, '1.0', async () => 'phi-payload', { phi: true });

    const res = await invokeCapability(name, '1.0', 'm', [], { caller: thirdParty });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.value.code).toBe(CapErr.Denied);
      expect(res.value.message).toContain('third-party');
    }
  });

  it('allows a PHI capability for a first-party caller', async () => {
    const name = uniq();
    registerCapability(name, '1.0', async () => 'phi-payload', { phi: true });

    const res = await invokeCapability(name, '1.0', 'm', [], { caller: firstParty });

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.data).toBe('phi-payload');
  });

  it('leaves the gate dormant when no caller identity is supplied (renderer / internal Main)', async () => {
    const name = uniq();
    registerCapability(name, '1.0', async () => 'phi-payload', { phi: true });

    // No opts.caller → the trustClass gate must not fire (back-compat).
    const res = await invokeCapability(name, '1.0', 'm', []);

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.data).toBe('phi-payload');
  });

  it('does not gate a non-PHI capability by trustClass', async () => {
    const name = uniq();
    registerCapability(name, '1.0', async () => 'ok', { phi: false });

    const res = await invokeCapability(name, '1.0', 'm', [], { caller: thirdParty });

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.data).toBe('ok');
  });

  it('resolves trustClass from the supplied caller only — the value is never read from args', async () => {
    const name = uniq();
    registerCapability(name, '1.0', async () => 'phi-payload', { phi: true });

    // A third-party caller cannot smuggle a first-party claim through args; the
    // gate consults opts.caller.trustClass (set by Main from its own record).
    const res = await invokeCapability(name, '1.0', 'm', [{ trustClass: 'first-party' }], {
      caller: thirdParty,
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.value.code).toBe(CapErr.Denied);
  });
});

describe('PHI lock gate (ADR-307)', () => {
  it('rejects a PHI capability with cap.locked when the workspace is locked', async () => {
    const name = uniq();
    registerCapability(name, '1.0', async () => 'phi-payload', { phi: true });
    setLockServiceGetter(() => lockStub(true));

    const res = await invokeCapability(name, '1.0', 'm', [], { caller: firstParty });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.value.code).toBe(CapErr.Locked);
  });

  it('does not lock-gate a non-PHI capability', async () => {
    const name = uniq();
    registerCapability(name, '1.0', async () => 'ok', { phi: false });
    setLockServiceGetter(() => lockStub(true));

    const res = await invokeCapability(name, '1.0', 'm', []);

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.data).toBe('ok');
  });
});

describe('CQRS kind-mismatch gate (ADR-506 §7)', () => {
  it('rejects a query capability invoked as a command', async () => {
    const name = uniq();
    registerCapability(name, '1.0', async () => 'q', { kind: 'query' });

    const res = await invokeCapability(name, '1.0', 'm', [], { expectKind: 'command' });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.value.code).toBe(CapErr.KindMismatch);
  });

  it('passes when the declared kind matches the expected kind', async () => {
    const name = uniq();
    registerCapability(name, '1.0', async () => 'q', { kind: 'query' });

    const res = await invokeCapability(name, '1.0', 'm', [], { expectKind: 'query' });

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.data).toBe('q');
  });

  it('treats an unclassified capability as a mismatch under any expectKind', async () => {
    const name = uniq();
    registerCapability(name, '1.0', async () => 'x'); // no kind

    const res = await invokeCapability(name, '1.0', 'm', [], { expectKind: 'query' });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.value.code).toBe(CapErr.KindMismatch);
      expect(res.value.message).toContain('unclassified');
    }
  });
});

describe('dispatch outcomes', () => {
  it('returns cap.not_found for an unregistered capability', async () => {
    const res = await invokeCapability('nope.absent', '9.9', 'm', []);

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.value.code).toBe(CapErr.NotFound);
  });

  it('passes a recognised error code thrown by the handler straight through', async () => {
    const name = uniq();
    registerCapability(name, '1.0', async () => {
      const err = new Error('gone') as Error & { code: string };
      err.code = CapErr.NotFound;
      throw err;
    });

    const res = await invokeCapability(name, '1.0', 'm', []);

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.value.code).toBe(CapErr.NotFound);
  });

  it('wraps an unrecognised handler throw as cap.handler_threw', async () => {
    const name = uniq();
    registerCapability(name, '1.0', async () => {
      throw new Error('boom');
    });

    const res = await invokeCapability(name, '1.0', 'm', []);

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.value.code).toBe(CapErr.HandlerThrew);
      expect(res.value.message).toBe('boom');
    }
  });
});
