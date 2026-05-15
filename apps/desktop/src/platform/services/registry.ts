import type { ServiceId } from './service-id';

export class ServiceRegistry {
  private readonly _services = new Map<string, unknown>();

  register<T>(id: ServiceId<T>, instance: T): void {
    if (this._services.has(id.id)) {
      throw new Error(`Service already registered: ${id.id}`);
    }
    this._services.set(id.id, instance);
  }

  get<T>(id: ServiceId<T>): T {
    const svc = this._services.get(id.id);
    if (svc === undefined) throw new Error(`Service not found: ${id.id}`);
    return svc as T;
  }

  has<T>(id: ServiceId<T>): boolean {
    return this._services.has(id.id);
  }
}
