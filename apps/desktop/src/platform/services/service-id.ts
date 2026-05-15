export interface ServiceId<T> {
  readonly _t: T;
  readonly id: string;
}

export function serviceId<T>(id: string): ServiceId<T> {
  return { id } as unknown as ServiceId<T>;
}
