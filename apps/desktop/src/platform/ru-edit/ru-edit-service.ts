import type { RuEditHandle } from '@ru-soam/editor';

export interface RuEditRegistration {
  readonly resource: string;
  readonly instanceId: string;
  readonly handle: RuEditHandle;
}

export interface IRuEditService {
  register(reg: RuEditRegistration): void;
  unregister(instanceId: string): void;
  setActive(instanceId: string | null): void;
  getActive(): RuEditRegistration | undefined;
  forResource(resource: string): RuEditRegistration | undefined;
  forInstance(instanceId: string): RuEditRegistration | undefined;
  list(): ReadonlyArray<RuEditRegistration>;
}

export class RuEditService implements IRuEditService {
  private readonly _byInstance = new Map<string, RuEditRegistration>();
  private _activeInstanceId: string | null = null;

  register(reg: RuEditRegistration): void {
    this._byInstance.set(reg.instanceId, reg);
    // First registration with no active claims active focus.
    if (this._activeInstanceId === null) {
      this._activeInstanceId = reg.instanceId;
    }
  }

  unregister(instanceId: string): void {
    this._byInstance.delete(instanceId);
    if (this._activeInstanceId === instanceId) {
      const fallback = this._byInstance.keys().next();
      this._activeInstanceId = fallback.done ? null : fallback.value;
    }
  }

  setActive(instanceId: string | null): void {
    if (instanceId === null) {
      this._activeInstanceId = null;
      return;
    }
    if (this._byInstance.has(instanceId)) {
      this._activeInstanceId = instanceId;
    }
  }

  getActive(): RuEditRegistration | undefined {
    if (this._activeInstanceId === null) return undefined;
    return this._byInstance.get(this._activeInstanceId);
  }

  forResource(resource: string): RuEditRegistration | undefined {
    for (const reg of this._byInstance.values()) {
      if (reg.resource === resource) return reg;
    }
    return undefined;
  }

  forInstance(instanceId: string): RuEditRegistration | undefined {
    return this._byInstance.get(instanceId);
  }

  list(): ReadonlyArray<RuEditRegistration> {
    return Array.from(this._byInstance.values());
  }
}
