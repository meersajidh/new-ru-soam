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
  readonly location: 'primary' | 'auxiliary';
  readonly when?: string;
};

export type PanelView = {
  readonly id: string;
  readonly title: string;
  readonly icon?: string;
  readonly viewUrl: string | undefined;
  readonly bundleId: string;
  readonly when?: string;
  readonly priority: number;
};

type Snapshot = {
  activityBarItems: readonly ActivityBarItem[];
  viewContainers: readonly ViewContainer[];
  panelViews?: readonly PanelView[];
};

export interface IContributionService {
  seed(snapshot: Snapshot): void;
  getActivityBarItems(): readonly ActivityBarItem[];
  getViewContainers(): readonly ViewContainer[];
  getViewContainer(id: string): ViewContainer | undefined;
  getAuxViewContainers(): readonly ViewContainer[];
  getPanelViews(): readonly PanelView[];
  getActiveContainerId(): string | null;
  setActiveContainerId(id: string | null): void;
  getActivePanelViewId(): string | null;
  setActivePanelViewId(id: string | null): void;
  onDidChange(listener: () => void): () => void;
}

export class ContributionService implements IContributionService {
  private _items: readonly ActivityBarItem[] = [];
  private _containers: readonly ViewContainer[] = [];
  private _panelViews: readonly PanelView[] = [];
  private _activeContainerId: string | null = null;
  private _activePanelViewId: string | null = null;

  private readonly _listeners = new Set<() => void>();

  seed(snapshot: Snapshot): void {
    this._items = snapshot.activityBarItems;
    this._containers = snapshot.viewContainers;
    this._panelViews = snapshot.panelViews ?? [];
    this._emit();
  }

  getActivityBarItems(): readonly ActivityBarItem[] {
    return this._items;
  }

  getViewContainers(): readonly ViewContainer[] {
    return this._containers.filter((c) => c.location === 'primary');
  }

  getViewContainer(id: string): ViewContainer | undefined {
    return this._containers.find((c) => c.id === id);
  }

  getAuxViewContainers(): readonly ViewContainer[] {
    return this._containers.filter((c) => c.location === 'auxiliary');
  }

  /** Sorted by priority desc (higher number = first). Same priority = insertion order. */
  getPanelViews(): readonly PanelView[] {
    return [...this._panelViews].sort((a, b) => b.priority - a.priority);
  }

  getActiveContainerId(): string | null {
    return this._activeContainerId;
  }

  setActiveContainerId(id: string | null): void {
    if (this._activeContainerId === id) return;
    this._activeContainerId = id;
    this._emit();
  }

  getActivePanelViewId(): string | null {
    return this._activePanelViewId;
  }

  setActivePanelViewId(id: string | null): void {
    if (this._activePanelViewId === id) return;
    this._activePanelViewId = id;
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
