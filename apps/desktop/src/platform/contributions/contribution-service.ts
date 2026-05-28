export type ActivityBarItem = {
  readonly id: string;
  readonly label: string;
  readonly icon?: string;
  readonly viewContainer: string;
  readonly group: 'top' | 'bottom';
  readonly when?: string;
  readonly bundleId: string;
};

export type ViewContainer = {
  readonly id: string;
  readonly title: string;
  readonly viewUrl: string | undefined;
  readonly bundleId: string;
};

type Snapshot = {
  activityBarItems: readonly ActivityBarItem[];
  viewContainers: readonly ViewContainer[];
};

export interface IContributionService {
  seed(snapshot: Snapshot): void;
  getActivityBarItems(): readonly ActivityBarItem[];
  getViewContainers(): readonly ViewContainer[];
  getViewContainer(id: string): ViewContainer | undefined;
  getActiveContainerId(): string | null;
  setActiveContainerId(id: string | null): void;
  onDidChange(listener: () => void): () => void;
}

export class ContributionService implements IContributionService {
  private _items: readonly ActivityBarItem[] = [];
  private _containers: readonly ViewContainer[] = [];
  private _activeContainerId: string | null = null;

  private readonly _listeners = new Set<() => void>();

  seed(snapshot: Snapshot): void {
    this._items = snapshot.activityBarItems;
    this._containers = snapshot.viewContainers;
    this._emit();
  }

  getActivityBarItems(): readonly ActivityBarItem[] {
    return this._items;
  }

  getViewContainers(): readonly ViewContainer[] {
    return this._containers;
  }

  getViewContainer(id: string): ViewContainer | undefined {
    return this._containers.find((c) => c.id === id);
  }

  getActiveContainerId(): string | null {
    return this._activeContainerId;
  }

  setActiveContainerId(id: string | null): void {
    if (this._activeContainerId === id) return;
    this._activeContainerId = id;
    this._emit();
  }

  onDidChange(listener: () => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  private _emit(): void {
    for (const l of this._listeners) l();
  }
}
