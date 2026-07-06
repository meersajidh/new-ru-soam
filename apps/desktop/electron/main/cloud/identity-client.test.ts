import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  postAccountDelete,
  postEvents,
  postRefresh,
  postRevoke,
  postSession,
  type TelemetryEvent,
} from './identity-client';

// Tier-1b (B2) invariant guards for the identity HTTP client.
//
// Two ADR invariants, asserted on the ACTUAL request the client puts on the
// wire (global fetch stubbed — no network):
//   1. account_id is NEVER client-asserted (ADR-311). Every request body is
//      derived from tokens the server itself minted; the account is resolved
//      server-side from the JWT / refresh token — never sent by us.
//   2. Telemetry events are PHI-free (ADR-312): only event_type / device_id /
//      app_version ever leave the process; the account is derived from the
//      Bearer JWT, not the body.

const BASE = 'https://identity.test.invalid';

interface Captured {
  url: string;
  init: RequestInit | undefined;
  body: unknown;
}

let calls: Captured[] = [];
let realFetch: typeof globalThis.fetch;
let realBaseUrl: string | undefined;

/** Build a minimal Response-like object for the client's success paths. */
function fakeResponse(url: string): Response {
  const isSession = url.endsWith('/v1/session') || url.endsWith('/v1/refresh');
  const payload = isSession
    ? { access_token: 'a.b.c', refresh_token: 'r.s.t', expires_in: 900 }
    : {};
  return {
    ok: true,
    status: isSession ? 200 : 204,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  } as unknown as Response;
}

beforeEach(() => {
  calls = [];
  realBaseUrl = process.env['IDENTITY_BASE_URL'];
  process.env['IDENTITY_BASE_URL'] = BASE;
  realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    let body: unknown;
    if (init && typeof init.body === 'string') body = JSON.parse(init.body);
    calls.push({ url, init, body });
    return fakeResponse(url);
  }) as unknown as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  if (realBaseUrl === undefined) delete process.env['IDENTITY_BASE_URL'];
  else process.env['IDENTITY_BASE_URL'] = realBaseUrl;
});

/** Serialize every captured request body — used to assert a field is absent. */
const allBodies = (): string => calls.map((c) => JSON.stringify(c.body)).join('|');

describe('account_id is never client-asserted (ADR-311)', () => {
  it('POST /v1/session sends only the Google id_token', async () => {
    await postSession('google-id-token');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${BASE}/v1/session`);
    expect(calls[0].body).toEqual({ id_token: 'google-id-token' });
    expect(Object.keys(calls[0].body as object)).toEqual(['id_token']);
  });

  it('POST /v1/refresh sends only the refresh_token', async () => {
    await postRefresh('refresh-token');
    expect(calls[0].url).toBe(`${BASE}/v1/refresh`);
    expect(calls[0].body).toEqual({ refresh_token: 'refresh-token' });
  });

  it('POST /v1/revoke and /v1/account/delete send only the refresh_token', async () => {
    await postRevoke('refresh-token');
    await postAccountDelete('refresh-token');
    expect(calls[0].body).toEqual({ refresh_token: 'refresh-token' });
    expect(calls[1].body).toEqual({ refresh_token: 'refresh-token' });
  });

  it('no request body across the whole client ever carries an account_id', async () => {
    await postSession('id');
    await postRefresh('r');
    await postRevoke('r');
    await postAccountDelete('r');
    await postEvents('access', [{ event_type: 'login' }]);
    expect(allBodies()).not.toContain('account_id');
  });
});

describe('telemetry events are PHI-free (ADR-312)', () => {
  const PHI_FREE_KEYS = new Set(['event_type', 'device_id', 'app_version']);

  it('POST /v1/events authenticates with the Bearer JWT (account derived server-side)', async () => {
    await postEvents('access-jwt', [{ event_type: 'login' }]);
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(calls[0].url).toBe(`${BASE}/v1/events`);
    expect(headers['Authorization']).toBe('Bearer access-jwt');
  });

  it('sends events wrapped as { events } with no envelope account field', async () => {
    await postEvents('access', [{ event_type: 'refresh' }]);
    expect(Object.keys(calls[0].body as object)).toEqual(['events']);
  });

  it('each event carries only PHI-free keys', async () => {
    const events: TelemetryEvent[] = [
      { event_type: 'login', device_id: 'dev-uuid', app_version: '0.1.10' },
      { event_type: 'signout' },
      { event_type: 'account_deleted', device_id: 'dev-uuid' },
    ];
    await postEvents('access', events);
    const sent = (calls[0].body as { events: Array<Record<string, unknown>> }).events;
    for (const ev of sent) {
      for (const key of Object.keys(ev)) {
        expect(PHI_FREE_KEYS.has(key)).toBe(true);
      }
    }
  });
});
