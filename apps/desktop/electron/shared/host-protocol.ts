/**
 * Wire protocol between Main and the Bundle Host (`utilityProcess`).
 *
 * Per ADR-410, Main is the sole broker. The Renderer never speaks to the
 * Bundle Host directly; every bundle-resident capability call traverses
 * Renderer → Main → Bundle Host and the result returns the same way.
 *
 * ID namespaces (O449 rung-0):
 *  - Main-originated requests (host.ping / host.activate / host.deactivate /
 *    host.cap.invoke / host.command.invoke): ids allocated by manager.ts
 *    (`nextId` counter). Replies: HostToMainMessage kinds that carry an id.
 *  - Host-originated requests (host.consume.invoke): ids allocated by the
 *    host's own counter. Replies: host.consume.result / host.consume.error.
 *  Both counters are INDEPENDENT. manager.ts branches on kind BEFORE the
 *  existing pending-map lookup to avoid id-collision false matches.
 *
 * TrustClass (ADR-418 Am1, O449):
 *  - 'first-party'  — bundle shipped inside the signed app package
 *  - 'third-party'  — (future) external publisher-signed bundle
 *  Platform-assigned by provenance in loader.ts; NEVER self-declared.
 */

/**
 * Trust tier for a bundle, assigned by Main from provenance (ADR-418 Am1).
 * Never sent by the host; resolved from the activated-bundle record in
 * manager.ts.
 */
export type TrustClass = 'first-party' | 'third-party';

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
    }
  | {
      readonly kind: 'host.command.invoke';
      readonly id: number;
      readonly bundleId: string;
      readonly commandId: string;
      readonly args: ReadonlyArray<unknown>;
    }
  | {
      /**
       * Main → Host: reply to a host.consume.invoke request.
       * id echoes the host-allocated id from the originating request.
       */
      readonly kind: 'host.consume.result';
      readonly id: number;
      readonly data: unknown;
    }
  | {
      /**
       * Main → Host: error reply to a host.consume.invoke request.
       * id echoes the host-allocated id from the originating request.
       */
      readonly kind: 'host.consume.error';
      readonly id: number;
      readonly code: string;
      readonly message: string;
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
      readonly commandIds: ReadonlyArray<string>;
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
    }
  | {
      /**
       * Host → Main: consume request — host asks Main to invoke a Main-resident
       * capability on behalf of a bundle (O449 rung-0 consumer channel).
       *
       * id is host-allocated (separate namespace from Main-allocated ids).
       * bundleId is the calling bundle's own id — Main resolves trustClass
       * from its activated-bundle record; the host NEVER sends trustClass.
       */
      readonly kind: 'host.consume.invoke';
      readonly id: number;
      readonly bundleId: string;
      readonly capability: string;
      readonly version: string;
      readonly method: string;
      readonly args: ReadonlyArray<unknown>;
    };
