/**
 * net.brokeredFetch@1.0 — Main-brokered outbound HTTP (ADR-203, ADR-410, ADR-506 Am1.1).
 *
 * The single auditable egress chokepoint for FP-Host bundles.
 *
 * Security model:
 *   1. Resolve caller bundle's manifest `apiHosts` allowlist by bundleId.
 *      Reject with `cap.denied` if the target host is not listed.
 *   2. Call `getValidAccessToken(provider)` — access token used inside Main only,
 *      never returned to the bundle.
 *   3. Inject `Authorization: Bearer <accessToken>`; perform outbound fetch.
 *   4. On 401, clear stored credential.
 *   5. Return `{ status, ok, body }` — body is parsed JSON or raw text string.
 *
 * PHI note: response bodies may contain PHI (calendar event titles, attendees).
 * `phi: true` gates on first-party + workspace-unlocked — same as P0 calendar cap.
 *
 * Token/refresh URLs (accounts.google.com, oauth2.googleapis.com) are Main-internal
 * calls from credential-broker.ts — NOT subject to this allowlist (they never reach
 * a bundle). Only bundle-originated data API requests are gated here.
 */

import type { DiscoveredBundle } from '../fp-host/manifest.js';
import { registerCapability, type CallerIdentity } from './registry.js';
import { getValidAccessToken, clearToken } from './credential-broker.js';

/** Map from bundleId → allowlist of permitted API hosts. Populated at boot. */
const apiHostsRegistry = new Map<string, ReadonlyArray<string>>();

/**
 * Call once at boot with the discovered bundle list so that brokered-fetch
 * can resolve each caller's apiHosts allowlist by bundleId.
 */
export function registerApiHostsFromBundles(
  discovered: ReadonlyArray<DiscoveredBundle>,
): void {
  for (const bundle of discovered) {
    const hosts = bundle.manifest.apiHosts;
    if (hosts && hosts.length > 0) {
      apiHostsRegistry.set(bundle.manifest.id, hosts);
    }
  }
}

interface FetchArgs {
  provider: string;
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export function registerBrokeredFetchCapability(): void {
  registerCapability(
    'net.brokeredFetch',
    '1.0',
    async (method, args, caller?: CallerIdentity) => {
      if (method !== 'fetch') {
        throw Object.assign(new Error(`net.brokeredFetch: unknown method: ${method}`), {
          code: 'cap.method_not_found',
        });
      }

      const { provider, url, method: httpMethod = 'GET', headers = {}, body } =
        args[0] as FetchArgs;

      // 1. Resolve caller allowlist.
      const bundleId = caller?.bundleId;
      if (!bundleId) {
        throw Object.assign(new Error('net.brokeredFetch: caller identity required'), {
          code: 'cap.denied',
        });
      }

      const allowedHosts = apiHostsRegistry.get(bundleId) ?? [];
      let targetHost: string;
      try {
        targetHost = new URL(url).host;
      } catch {
        throw Object.assign(new Error(`net.brokeredFetch: invalid URL: ${url}`), {
          code: 'cap.denied',
        });
      }

      if (!allowedHosts.includes(targetHost)) {
        throw Object.assign(
          new Error(
            `net.brokeredFetch: host "${targetHost}" not in apiHosts allowlist for ${bundleId}`,
          ),
          { code: 'cap.denied' },
        );
      }

      // 2. Resolve access token — never returned to the bundle.
      const accessToken = await getValidAccessToken(provider);
      if (!accessToken) {
        throw Object.assign(
          new Error(`net.brokeredFetch: provider "${provider}" not connected`),
          { code: 'calendar.not_connected' },
        );
      }

      // 3. Perform outbound fetch with injected bearer token.
      const reqHeaders: Record<string, string> = {
        ...headers,
        Authorization: `Bearer ${accessToken}`,
      };

      const resp = await fetch(url, {
        method: httpMethod,
        headers: reqHeaders,
        ...(body !== undefined ? { body } : {}),
      });

      // 4. On 401, clear stored credential.
      if (resp.status === 401) {
        clearToken(provider);
      }

      // 5. Parse body — try JSON first, fall back to text.
      let responseBody: unknown;
      const contentType = resp.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        try {
          responseBody = await resp.json();
        } catch {
          responseBody = await resp.text();
        }
      } else {
        responseBody = await resp.text();
      }

      return { status: resp.status, ok: resp.ok, body: responseBody };
    },
    { phi: true }, // response may contain PHI (event titles, attendees) — lock-gated + first-party
  );
}
