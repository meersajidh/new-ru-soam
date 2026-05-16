/**
 * Wire protocol between Main and the Bundle Host (`utilityProcess`).
 *
 * Per ADR-410, Main is the sole broker. The Renderer never speaks to the
 * Bundle Host directly; every bundle-resident capability call traverses
 * Renderer → Main → Bundle Host and the result returns the same way.
 *
 * Every request carries a numeric `id`; the corresponding reply echoes
 * that id so Main can match pending promises. The id namespace is shared
 * across all request kinds — Main is the sole id allocator.
 */

export interface CapabilityDescriptor {
  readonly name: string;
  readonly version: string;
}

export type MainToHostMessage =
  | { readonly kind: 'host.ping'; readonly id: number; readonly message: string }
  | { readonly kind: 'host.shutdown' }
  | {
      readonly kind: 'host.activate';
      readonly id: number;
      readonly bundleId: string;
      readonly modulePath: string;
    }
  | {
      readonly kind: 'host.deactivate';
      readonly id: number;
      readonly bundleId: string;
    }
  | {
      readonly kind: 'host.cap.invoke';
      readonly id: number;
      readonly bundleId: string;
      readonly capability: string;
      readonly version: string;
      readonly method: string;
      readonly args: ReadonlyArray<unknown>;
    };

export type HostToMainMessage =
  | {
      readonly kind: 'host.pong';
      readonly id: number;
      readonly echo: string;
      readonly pid: number;
    }
  | {
      readonly kind: 'host.activated';
      readonly id: number;
      readonly bundleId: string;
      readonly capabilities: ReadonlyArray<CapabilityDescriptor>;
    }
  | {
      readonly kind: 'host.activate.failed';
      readonly id: number;
      readonly bundleId: string;
      readonly message: string;
    }
  | {
      readonly kind: 'host.deactivated';
      readonly id: number;
      readonly bundleId: string;
    }
  | {
      readonly kind: 'host.cap.result';
      readonly id: number;
      readonly data: unknown;
    }
  | {
      readonly kind: 'host.cap.error';
      readonly id: number;
      readonly code: string;
      readonly message: string;
    };
