import { ipcRenderer } from 'electron';
import {
  SOAM_CALL_CHANNEL,
  SOAM_EVENT_CHANNEL,
  type CapabilityCallRequest,
  type CapabilityCallResponse,
  type PlatformEvent,
} from '../shared/ipc-protocol';
import type {
  LockState,
  UnlockResult,
  RecoveryUnlockResult,
  SetupGenerateResult,
  SetupAcknowledgeResult,
  WorkspaceMeta,
  WorkspaceChangedEvent,
  WorkspaceCreateResult,
  WorkspaceSetActiveResult,
  DeleteWorkspaceResult,
} from '../shared/lock-protocol';
import type { UpdateState, UpdateStateChangedPayload } from '../shared/update';

/**
 * `window.soam` bridge per ADR-202.
 *
 * The renderer's entire IPC surface is one method (`bindCapability`) plus a
 * narrow events channel. New features acquire functionality through new
 * capabilities, never through new preload methods.
 *
 * Phase 9: `lock`, `setup`, and `workspace` namespaces are special-case
 * platform bedrock — they expose typed channels (e.g. `soam:lock:state`)
 * rather than going through `bindCapability`. All other capabilities
 * (e.g. `platform.window`, `platform.shell`) reach the renderer through
 * `bindCapability('<name>', '<version>')` and must not add preload surface.
 */

export interface SoamCapabilityProxy {
  readonly call: (method: string, ...args: ReadonlyArray<unknown>) => Promise<unknown>;
  readonly dispose: () => void;
}

export interface SoamEvents {
  readonly on: (listener: (event: PlatformEvent) => void) => () => void;
}

// ── Lock namespace ─────────────────────────────────────────────────────────────

export interface SoamLock {
  readonly state: () => Promise<LockState>;
  readonly unlock: (passphrase: string) => Promise<UnlockResult>;
  readonly unlockWithRecoveryCode: (words: string[]) => Promise<RecoveryUnlockResult>;
  readonly setPassphraseAfterRecovery: (passphrase: string) => Promise<UnlockResult>;
  readonly changePassphrase: (current: string, next: string) => Promise<UnlockResult>;
  readonly relock: () => Promise<void>;
  readonly heartbeat: () => Promise<void>;
  readonly onChange: (listener: (state: LockState) => void) => () => void;
}

// ── Setup namespace ────────────────────────────────────────────────────────────

export interface SoamSetup {
  readonly generate: (args: { passphrase: string }) => Promise<SetupGenerateResult>;
  readonly acknowledge: (args: { identity: { email: string; googleId?: string } }) => Promise<SetupAcknowledgeResult>;
}

// ── Workspace namespace ────────────────────────────────────────────────────────

export interface SoamWorkspace {
  readonly list: () => Promise<WorkspaceMeta[]>;
  readonly getActive: () => Promise<string | null>;
  readonly setActive: (workspaceId: string) => Promise<WorkspaceSetActiveResult>;
  readonly create: (args: { nickname: string; email: string }) => Promise<WorkspaceCreateResult>;
  readonly signOut: () => Promise<void>;
  readonly getIdentity: () => Promise<{ email: string; googleId?: string } | null>;
  readonly delete: (args: { nicknameConfirm: string }) => Promise<DeleteWorkspaceResult>;
  readonly onChange: (listener: (e: WorkspaceChangedEvent) => void) => () => void;
}

// ── App namespace ──────────────────────────────────────────────────────────────

/**
 * Thin bedrock surface for app-level metadata.
 * Renderer must never import `electron` (ADR-202) — version is read here only.
 */
export interface SoamApp {
  /** Returns the running app version (e.g. "0.1.1"). */
  readonly getVersion: () => Promise<string>;
}

// ── Update namespace ───────────────────────────────────────────────────────────

/**
 * Thin typed surface over the `platform.update@1.0` capability.
 * Renderer-side consumption is A.3 — this surface exists so the bridge
 * compiles and types are available for A.3 without further preload changes.
 */
export interface SoamUpdate {
  /** Get current update state from Main. */
  readonly getState: () => Promise<UpdateState>;
  /** Trigger an immediate update check. */
  readonly checkNow: () => Promise<void>;
  /** Start downloading the available update. */
  readonly downloadNow: () => Promise<void>;
  /** Windows only: quit and install. No-op on Linux (guided install). */
  readonly installAndRestart: () => Promise<void>;
  /** Linux only: returns the copyable `sudo apt install ...` command, or null. */
  readonly getCopyInstallCommand: () => Promise<string | null>;
  /** Subscribe to state-change events pushed from Main. */
  readonly onChange: (listener: (payload: UpdateStateChangedPayload) => void) => () => void;
}

export interface Soam {
  readonly bindCapability: (name: string, version: string) => Promise<SoamCapabilityProxy>;
  readonly events: SoamEvents;
  readonly lock: SoamLock;
  readonly setup: SoamSetup;
  readonly workspace: SoamWorkspace;
  readonly update: SoamUpdate;
  readonly app: SoamApp;
}

let nextId = 1;

async function call(req: Omit<CapabilityCallRequest, 'id'>): Promise<unknown> {
  const id = nextId++;
  const payload: CapabilityCallRequest = { id, ...req };
  const res = (await ipcRenderer.invoke(SOAM_CALL_CHANNEL, payload)) as CapabilityCallResponse;
  if (res.ok) return res.data;
  const err = new Error(`[${res.error.code}] ${res.error.message}`);
  (err as Error & { code?: string }).code = res.error.code;
  throw err;
}

// ── Lock bridge helpers ────────────────────────────────────────────────────────

const lock: SoamLock = {
  async state() {
    return ipcRenderer.invoke('soam:lock:state') as Promise<LockState>;
  },
  async unlock(passphrase) {
    return ipcRenderer.invoke('soam:lock:unlock', passphrase) as Promise<UnlockResult>;
  },
  async unlockWithRecoveryCode(words) {
    return ipcRenderer.invoke('soam:lock:unlock-recovery', words) as Promise<RecoveryUnlockResult>;
  },
  async setPassphraseAfterRecovery(passphrase) {
    return ipcRenderer.invoke(
      'soam:lock:set-passphrase-after-recovery',
      passphrase,
    ) as Promise<UnlockResult>;
  },
  async changePassphrase(current, next) {
    return ipcRenderer.invoke(
      'soam:lock:change-passphrase',
      current,
      next,
    ) as Promise<UnlockResult>;
  },
  async relock() {
    await ipcRenderer.invoke('soam:lock:relock');
  },
  async heartbeat() {
    await ipcRenderer.invoke('soam:lock:heartbeat');
  },
  onChange(listener) {
    const handler = (_e: unknown, payload: PlatformEvent) => {
      if (payload.name === 'lock.changed') {
        listener(payload.payload as LockState);
      }
    };
    ipcRenderer.on(SOAM_EVENT_CHANNEL, handler);
    return () => ipcRenderer.removeListener(SOAM_EVENT_CHANNEL, handler);
  },
};

// ── Setup bridge helpers ───────────────────────────────────────────────────────

const setup: SoamSetup = {
  async generate(args) {
    return ipcRenderer.invoke('soam:setup:generate', args) as Promise<SetupGenerateResult>;
  },
  async acknowledge(args) {
    return ipcRenderer.invoke('soam:setup:acknowledge', args) as Promise<SetupAcknowledgeResult>;
  },
};

// ── Workspace bridge helpers ───────────────────────────────────────────────────

const workspace: SoamWorkspace = {
  async list() {
    return ipcRenderer.invoke('soam:workspace:list') as Promise<WorkspaceMeta[]>;
  },
  async getActive() {
    return ipcRenderer.invoke('soam:workspace:get-active') as Promise<string | null>;
  },
  async setActive(workspaceId) {
    return ipcRenderer.invoke(
      'soam:workspace:set-active',
      workspaceId,
    ) as Promise<WorkspaceSetActiveResult>;
  },
  async create(args) {
    return ipcRenderer.invoke('soam:workspace:create', args) as Promise<WorkspaceCreateResult>;
  },
  async signOut() {
    await ipcRenderer.invoke('soam:workspace:sign-out');
  },
  async getIdentity() {
    return ipcRenderer.invoke('soam:workspace:get-identity') as Promise<
      { email: string } | null
    >;
  },
  async delete(args) {
    return ipcRenderer.invoke('soam:workspace:delete', args) as Promise<DeleteWorkspaceResult>;
  },
  onChange(listener) {
    const handler = (_e: unknown, payload: PlatformEvent) => {
      if (payload.name === 'workspace.changed') {
        listener(payload.payload as WorkspaceChangedEvent);
      }
    };
    ipcRenderer.on(SOAM_EVENT_CHANNEL, handler);
    return () => ipcRenderer.removeListener(SOAM_EVENT_CHANNEL, handler);
  },
};

// ── Update bridge helpers ─────────────────────────────────────────────────────

const update: SoamUpdate = {
  async getState() {
    return call({ capability: 'platform.update', version: '1.0', method: 'getState', args: [] }) as Promise<UpdateState>;
  },
  async checkNow() {
    await call({ capability: 'platform.update', version: '1.0', method: 'checkNow', args: [] });
  },
  async downloadNow() {
    await call({ capability: 'platform.update', version: '1.0', method: 'downloadNow', args: [] });
  },
  async installAndRestart() {
    await call({ capability: 'platform.update', version: '1.0', method: 'installAndRestart', args: [] });
  },
  async getCopyInstallCommand() {
    return call({ capability: 'platform.update', version: '1.0', method: 'getCopyInstallCommand', args: [] }) as Promise<string | null>;
  },
  onChange(listener) {
    const handler = (_e: unknown, payload: PlatformEvent) => {
      if (payload.name === 'platform.update.state-changed') {
        listener(payload.payload as UpdateStateChangedPayload);
      }
    };
    ipcRenderer.on(SOAM_EVENT_CHANNEL, handler);
    return () => ipcRenderer.removeListener(SOAM_EVENT_CHANNEL, handler);
  },
};

// ── App bridge helpers ────────────────────────────────────────────────────────

const appBedrock: SoamApp = {
  async getVersion() {
    return ipcRenderer.invoke('soam:app:get-version') as Promise<string>;
  },
};

// ── Main export ────────────────────────────────────────────────────────────────

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
  lock,
  setup,
  workspace,
  update,
  app: appBedrock,
};
