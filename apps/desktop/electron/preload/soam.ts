import { ipcRenderer } from 'electron';
import {
  SOAM_CALL_CHANNEL,
  SOAM_EVENT_CHANNEL,
  type CapabilityCallRequest,
  type CapabilityCallResponse,
  type PlatformEvent,
} from '../shared/ipc-protocol';

/**
 * `window.soam` bridge per ADR-202.
 *
 * The renderer's entire IPC surface is one method (`bindCapability`) plus a
 * narrow events channel. New features acquire functionality through new
 * capabilities, never through new preload methods.
 */

export interface SoamCapabilityProxy {
  readonly call: (method: string, ...args: ReadonlyArray<unknown>) => Promise<unknown>;
  readonly dispose: () => void;
}

export interface SoamEvents {
  readonly on: (listener: (event: PlatformEvent) => void) => () => void;
}

export interface Soam {
  readonly bindCapability: (name: string, version: string) => Promise<SoamCapabilityProxy>;
  readonly events: SoamEvents;
}

let nextId = 1;

function call(req: Omit<CapabilityCallRequest, 'id'>): Promise<unknown> {
  const id = nextId++;
  const payload: CapabilityCallRequest = { id, ...req };
  return ipcRenderer
    .invoke(SOAM_CALL_CHANNEL, payload)
    .then((res: CapabilityCallResponse) => {
      if (res.ok) return res.data;
      const err = new Error(`[${res.error.code}] ${res.error.message}`);
      (err as Error & { code?: string }).code = res.error.code;
      throw err;
    });
}

export const soam: Soam = {
  async bindCapability(name, version) {
    // Phase 1: bind is a typed-proxy handshake; no permission round-trip yet
    // (ADR-103 O4 — permission scope deferred). The proxy lazily routes each
    // method call through `soam:call`.
    let disposed = false;
    return {
      call(method, ...args) {
        if (disposed) {
          return Promise.reject(new Error(`Capability proxy disposed: ${name}@${version}`));
        }
        return call({ capability: name, version, method, args });
      },
      dispose() {
        disposed = true;
      },
    };
  },
  events: {
    on(listener) {
      const handler = (_e: unknown, payload: PlatformEvent) => listener(payload);
      ipcRenderer.on(SOAM_EVENT_CHANNEL, handler);
      return () => ipcRenderer.removeListener(SOAM_EVENT_CHANNEL, handler);
    },
  },
};
