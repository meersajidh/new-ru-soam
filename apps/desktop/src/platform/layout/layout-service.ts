import type { Part } from './part';
import type { SlotId } from './slots';

export interface ILayoutService {
  registerPart(part: Part): void;
  disposePart(id: string): void;
  isVisible(slotId: SlotId): boolean;
  setVisibility(slotId: SlotId, visible: boolean): void;
  toggleVisibility(slotId: SlotId): void;
  onDidChangeLayout(listener: () => void): () => void;
  onDidChangePartVisibility(listener: (slotId: SlotId, visible: boolean) => void): () => void;
}

export class LayoutService implements ILayoutService {
  private readonly _parts = new Map<string, Part>();
  private readonly _visibility = new Map<SlotId, boolean>();
  private readonly _layoutListeners = new Set<() => void>();
  private readonly _visibilityListeners = new Set<(slotId: SlotId, visible: boolean) => void>();

  registerPart(part: Part): void {
    this._parts.set(part.id, part);
    if (!this._visibility.has(part.slot)) {
      this._visibility.set(part.slot, true);
    }
    this._emitLayout();
  }

  disposePart(id: string): void {
    const part = this._parts.get(id);
    if (!part) return;
    part.dispose();
    this._parts.delete(id);
    this._emitLayout();
  }

  isVisible(slotId: SlotId): boolean {
    return this._visibility.get(slotId) ?? true;
  }

  setVisibility(slotId: SlotId, visible: boolean): void {
    if (this._visibility.get(slotId) === visible) return;
    this._visibility.set(slotId, visible);
    this._emitVisibility(slotId, visible);
  }

  toggleVisibility(slotId: SlotId): void {
    this.setVisibility(slotId, !this.isVisible(slotId));
  }

  onDidChangeLayout(listener: () => void): () => void {
    this._layoutListeners.add(listener);
    return () => this._layoutListeners.delete(listener);
  }

  onDidChangePartVisibility(listener: (slotId: SlotId, visible: boolean) => void): () => void {
    this._visibilityListeners.add(listener);
    return () => this._visibilityListeners.delete(listener);
  }

  private _emitLayout(): void {
    for (const l of this._layoutListeners) l();
  }

  private _emitVisibility(slotId: SlotId, visible: boolean): void {
    for (const l of this._visibilityListeners) l(slotId, visible);
  }
}
