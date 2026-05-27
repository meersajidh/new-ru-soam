import type { ILayoutService } from '../layout/layout-service';
import type { IContextKeyService } from '../context-key/context-key-service';
import type { SlotId } from '../layout/slots';

/**
 * Opaque entity-type string (ADR-106).
 * The base layer treats this as a plain string. Concrete values
 * ('individual' | 'clinic') are owned by src/domain/tenancy.ts.
 */
export type WorkspaceEntityType = string;

export interface WorkspaceState {
  entityId: string;
  entityType: WorkspaceEntityType;
}

export interface IWorkspaceService {
  open(entityId: string, entityType: WorkspaceEntityType): void;
  close(): void;
  isOpen(): boolean;
  getState(): WorkspaceState | undefined;
  onDidOpen(listener: (state: WorkspaceState) => void): () => void;
  onDidClose(listener: () => void): () => void;
}

const LAYOUT_KEY_PREFIX = 'soam.workspace.layout.';

interface PersistedLayout {
  visibility: Partial<Record<SlotId, boolean>>;
}

export class WorkspaceService implements IWorkspaceService {
  private readonly _layout: ILayoutService;
  private readonly _contextKeys: IContextKeyService;
  private readonly _openListeners = new Set<(state: WorkspaceState) => void>();
  private readonly _closeListeners = new Set<() => void>();
  private _state: WorkspaceState | undefined = undefined;
  private _layoutUnsub: (() => void) | undefined = undefined;

  constructor(layout: ILayoutService, contextKeys: IContextKeyService) {
    this._layout = layout;
    this._contextKeys = contextKeys;
  }

  open(entityId: string, entityType: WorkspaceEntityType): void {
    if (this._state) this._teardown();

    const saved = this._loadLayout(entityId);
    if (saved) this._layout.restoreVisibility(saved.visibility);

    this._layoutUnsub = this._layout.onDidChangeLayout(() => {
      this._saveLayout(entityId);
    });

    this._state = { entityId, entityType };
    this._contextKeys.set('workspace.entityId', entityId);
    this._contextKeys.set('workspace.entityType', entityType);
    this._contextKeys.set('workspace.isLocked', false);

    const state = this._state;
    for (const l of this._openListeners) l(state);
  }

  close(): void {
    if (!this._state) return;
    this._teardown();
    for (const l of this._closeListeners) l();
  }

  isOpen(): boolean { return this._state !== undefined; }

  getState(): WorkspaceState | undefined { return this._state; }

  onDidOpen(listener: (state: WorkspaceState) => void): () => void {
    this._openListeners.add(listener);
    return () => this._openListeners.delete(listener);
  }

  onDidClose(listener: () => void): () => void {
    this._closeListeners.add(listener);
    return () => this._closeListeners.delete(listener);
  }

  private _teardown(): void {
    this._layoutUnsub?.();
    this._layoutUnsub = undefined;
    this._state = undefined;
    this._contextKeys.delete('workspace.entityId');
    this._contextKeys.delete('workspace.entityType');
    this._contextKeys.delete('workspace.isLocked');
  }

  private _loadLayout(entityId: string): PersistedLayout | null {
    try {
      const raw = localStorage.getItem(LAYOUT_KEY_PREFIX + entityId);
      return raw ? (JSON.parse(raw) as PersistedLayout) : null;
    } catch {
      return null;
    }
  }

  private _saveLayout(entityId: string): void {
    const data: PersistedLayout = { visibility: this._layout.getVisibilitySnapshot() };
    localStorage.setItem(LAYOUT_KEY_PREFIX + entityId, JSON.stringify(data));
  }
}
